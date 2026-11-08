/* ==========================================================================
   Falcons Video-Player (YouTube)
   - Zeitlupe (0,25× – 2×), Bild-für-Bild, ±5 s / ±1 s
   - A–B-Schleife (Szene in Dauerschleife), Clip-Ende (Clips aus Aufzeichnungen)
   - Tastenkürzel: Leertaste, ← →, Shift+← →, , . , 1–4, A, B, X
   Nutzung:
     const p = new FalconsPlayer(hostElement, { onError, onTime });
     p.load(ytId, { start: 30, end: 45 });
     p.seek(90); p.time(); p.pause();
   Overlays (z. B. Zeichnen) kommen in p.stage.
   ========================================================================== */

const FalconsPlayer = (() => {
    let apiPromise = null;
    function loadApi() {
        if (window.YT && YT.Player) return Promise.resolve();
        if (apiPromise) return apiPromise;
        apiPromise = new Promise(resolve => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(s);
        });
        return apiPromise;
    }

    const RATES = [0.25, 0.5, 1, 2];
    const FPS = 25;
    const fmt = s => {
        s = Math.max(0, Math.floor(s || 0));
        return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    const ICON = n => (typeof Falcons !== 'undefined' ? Falcons.icon(n, 'icon-sm') : '');
    let active = null; // Player, der Tastenkürzel erhält

    document.addEventListener('keydown', e => {
        const p = active;
        if (!p || !p.ready || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
        if (!document.body.contains(p.root) || p.root.offsetParent === null) return;
        const k = e.key;
        const map = {
            ' ': () => p.toggle(), 'k': () => p.toggle(),
            'ArrowLeft': () => p.skip(e.shiftKey ? -1 : -5), 'ArrowRight': () => p.skip(e.shiftKey ? 1 : 5),
            ',': () => p.step(-1), '.': () => p.step(1),
            '1': () => p.setRate(0.25), '2': () => p.setRate(0.5), '3': () => p.setRate(1), '4': () => p.setRate(2),
            'a': () => p.setA(), 'b': () => p.setB(), 'x': () => p.clearLoop()
        };
        const fn = map[k.length === 1 ? k.toLowerCase() : k];
        if (fn) { e.preventDefault(); fn(); }
    });

    class Player {
        constructor(host, { onError = null, onTime = null, onReady = null } = {}) {
            this.host = host; this.onError = onError; this.onTime = onTime; this.onReady = onReady;
            this.ready = false; this.yt = null; this.ytId = ''; this.end = null; this.loopA = null; this.loopB = null; this.rate = 1;
            this.root = document.createElement('div');
            this.root.className = 'fp';
            this.root.innerHTML = `
                <div class="fp-stage"><div class="fp-video"></div></div>
                <div class="fp-bar">
                    <button class="fp-btn fp-play" title="Abspielen / Pause (Leertaste)">${ICON('play')}</button>
                    <button class="fp-btn" data-act="skip-5" title="5 s zurück (←)">−5s</button>
                    <button class="fp-btn" data-act="step-1" title="Ein Bild zurück (,)">${ICON('chevronLeft')}</button>
                    <button class="fp-btn" data-act="step1" title="Ein Bild vor (.)">${ICON('chevronRight')}</button>
                    <button class="fp-btn" data-act="skip5" title="5 s vor (→)">+5s</button>
                    <span class="fp-time">0:00:00</span>
                    <span class="fp-sep"></span>
                    <div class="fp-rates">${RATES.map((r, i) => `<button class="fp-rate ${r === 1 ? 'active' : ''}" data-rate="${r}" title="Tempo ${r}× (${i + 1})">${r === 0.25 ? '¼' : r === 0.5 ? '½' : r}×</button>`).join('')}</div>
                    <span class="fp-sep"></span>
                    <button class="fp-btn" data-act="a" title="Schleife: Start setzen (A)">A</button>
                    <button class="fp-btn" data-act="b" title="Schleife: Ende setzen (B)">B</button>
                    <span class="fp-loop hidden"></span>
                    <button class="fp-btn fp-clear hidden" data-act="x" title="Schleife beenden (X)">${ICON('x')}</button>
                    <span class="fp-help" title="Tastenkürzel: Leertaste = Play/Pause · ← → = 5 s · Shift+← → = 1 s · , . = Bild für Bild · 1–4 = Tempo · A/B = Schleife · X = Schleife beenden">?</span>
                </div>`;
            host.appendChild(this.root);
            this.stage = this.root.querySelector('.fp-stage');
            this.mount = document.createElement('div');
            this.root.querySelector('.fp-video').appendChild(this.mount);
            this.root.addEventListener('click', e => {
                const b = e.target.closest('button'); if (!b) return;
                active = this;
                if (b.classList.contains('fp-play')) return this.toggle();
                if (b.dataset.rate) return this.setRate(+b.dataset.rate);
                const a = b.dataset.act;
                if (a === 'skip-5') this.skip(-5); else if (a === 'skip5') this.skip(5);
                else if (a === 'step-1') this.step(-1); else if (a === 'step1') this.step(1);
                else if (a === 'a') this.setA(); else if (a === 'b') this.setB(); else if (a === 'x') this.clearLoop();
            });
            this.root.addEventListener('pointerdown', () => active = this);
            active = this;
        }

        /** Video laden. start/end in Sekunden (end = Clip-Ende, danach Pause) */
        async load(ytId, { start = 0, end = null, autoplay = true } = {}) {
            this.ytId = ytId; this.end = end || null; this.clearLoop(true);
            await loadApi();
            const vars = { start: Math.floor(start), rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1, origin: location.origin, autoplay: autoplay ? 1 : 0 };
            if (this.yt && this.ready) {
                const opts = { videoId: ytId, startSeconds: start };
                autoplay ? this.yt.loadVideoById(opts) : this.yt.cueVideoById(opts);
                this.setRate(this.rate);
                return;
            }
            await new Promise(resolve => {
                this.yt = new YT.Player(this.mount, {
                    videoId: ytId, playerVars: vars,
                    events: {
                        onReady: () => { this.ready = true; this.startTicker(); if (this.onReady) this.onReady(this); resolve(); },
                        onStateChange: e => this.syncPlay(e.data),
                        onError: e => { if (this.onError) this.onError(e.data); resolve(); }
                    }
                });
            });
        }

        startTicker() {
            clearInterval(this.ticker);
            this.ticker = setInterval(() => {
                if (!this.ready || !this.yt.getCurrentTime) return;
                const t = this.yt.getCurrentTime();
                if (this.loopA !== null && this.loopB !== null && t >= this.loopB) this.yt.seekTo(this.loopA, true);
                else if (this.end && t >= this.end && this.playing()) { this.yt.pauseVideo(); this.yt.seekTo(this.end, true); }
                const dur = this.yt.getDuration ? this.yt.getDuration() : 0;
                this.root.querySelector('.fp-time').textContent = `${fmt(t)}${dur ? ' / ' + fmt(this.end || dur) : ''}`;
                if (this.onTime) this.onTime(t);
            }, 120);
        }

        syncPlay(state) {
            const playing = state === 1 || state === 3;
            this.root.querySelector('.fp-play').innerHTML = ICON(playing ? 'pause' : 'play');
        }

        playing() { return this.ready && [1, 3].includes(this.yt.getPlayerState()); }
        time() { return this.ready && this.yt.getCurrentTime ? this.yt.getCurrentTime() : 0; }
        duration() { return this.ready && this.yt.getDuration ? this.yt.getDuration() : 0; }
        play() { if (this.ready) this.yt.playVideo(); }
        pause() { if (this.ready) this.yt.pauseVideo(); }
        toggle() {
            if (!this.ready) return;
            if (this.playing()) return this.pause();
            // am Clip-Ende → von vorn
            if (this.end && this.time() >= this.end - 0.2 && this.loopA === null) this.yt.seekTo(this.clipStart || 0, true);
            this.play();
        }
        seek(sec, { play = true } = {}) { if (!this.ready) return; this.yt.seekTo(Math.max(0, sec), true); if (play) this.play(); }
        skip(d) { this.seek(this.time() + d, { play: this.playing() }); }
        step(dir) { if (!this.ready) return; this.pause(); this.yt.seekTo(Math.max(0, this.time() + dir / FPS), true); }
        setRate(r) {
            this.rate = r;
            if (this.ready && this.yt.setPlaybackRate) this.yt.setPlaybackRate(r);
            this.root.querySelectorAll('.fp-rate').forEach(b => b.classList.toggle('active', +b.dataset.rate === r));
        }
        setA() { this.loopA = this.time(); if (this.loopB !== null && this.loopB <= this.loopA) this.loopB = null; this.renderLoop(); }
        setB() {
            const t = this.time();
            if (this.loopA === null) this.loopA = Math.max(0, t - 5);
            if (t <= this.loopA) return;
            this.loopB = t; this.renderLoop(); this.seek(this.loopA);
        }
        clearLoop(silent) { this.loopA = this.loopB = null; if (!silent || this.root) this.renderLoop(); }
        renderLoop() {
            const l = this.root.querySelector('.fp-loop'), x = this.root.querySelector('.fp-clear');
            const on = this.loopA !== null;
            l.classList.toggle('hidden', !on); x.classList.toggle('hidden', !on);
            l.innerHTML = on ? `${ICON('repeat')} ${fmt(this.loopA)} – ${this.loopB !== null ? fmt(this.loopB) : '…'}` : '';
            this.root.querySelectorAll('[data-act="a"], [data-act="b"]').forEach(b => b.classList.toggle('on', on && (b.dataset.act === 'a' || this.loopB !== null)));
        }
        destroy() { clearInterval(this.ticker); if (this.yt && this.yt.destroy) this.yt.destroy(); this.root.remove(); if (active === this) active = null; }
    }

    /**
     * Zeigt einen Clip an: YouTube → Falcons-Player, Google Drive → einfacher Drive-Player.
     * media.show(clip), media.seek(sec), media.time(), media.overlay (Element für Zeichnungen)
     */
    class Media {
        constructor(host, opts = {}) {
            this.host = host; this.opts = opts; this.player = null; this.clip = null;
            this.frameWrap = document.createElement('div');
            this.frameWrap.className = 'fp-frame hidden';
            this.frameWrap.innerHTML = '<iframe allow="autoplay; fullscreen" allowfullscreen></iframe>';
            host.appendChild(this.frameWrap);
        }
        get isYouTube() { return !!(this.clip && this.clip.type === 'youtube'); }
        get overlay() { return this.isYouTube ? this.player.stage : this.frameWrap; }
        show(clip) {
            this.clip = clip;
            if (clip.type === 'youtube') {
                this.frameWrap.classList.add('hidden'); this.frameWrap.querySelector('iframe').src = '';
                if (!this.player) this.player = new Player(this.host, this.opts);
                this.player.root.classList.remove('hidden');
                this.player.clipStart = clip.startTime || 0;
                return this.player.load(clip.ytId, { start: clip.startTime || 0, end: clip.endTime || null, autoplay: this.opts.autoplay !== false });
            }
            if (this.player) { this.player.pause(); this.player.root.classList.add('hidden'); }
            this.frameWrap.classList.remove('hidden');
            this.frameWrap.querySelector('iframe').src = clip.embedUrl || '';
            return Promise.resolve();
        }
        hide() {
            if (this.player) { this.player.pause(); this.player.root.classList.add('hidden'); }
            this.frameWrap.classList.add('hidden'); this.frameWrap.querySelector('iframe').src = '';
            this.clip = null;
        }
        seek(sec) {
            if (this.isYouTube && this.player.ready) { this.player.seek(sec); return true; }
            return false;
        }
        time() { return this.isYouTube ? this.player.time() : 0; }
        pause() { if (this.isYouTube) this.player.pause(); }
    }

    Player.fmt = fmt;
    Player.Media = Media;
    return Player;
})();
