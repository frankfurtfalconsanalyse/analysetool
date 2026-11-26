/* ==========================================================================
   Automatischer Abgleich über das Scoreboard im Video (Laptop: Chrome/Edge)
   - Der Coach gibt einmal den eigenen Tab frei (Bildschirmfreigabe „Diesen Tab“).
   - Der Player wird für den Scan über die ganze Seite vergrößert, die Spieluhr oben links
     im Video wird mit Texterkennung (Tesseract.js) gelesen.
   - Grobraster über das ganze Video, danach für jedes Tor/jede Strafe aus dem Saisonmanager
     die genaue Stelle suchen: frühester Moment, an dem die Uhr die Spielzeit des Ereignisses zeigt.
   Das YouTube-Bild selbst ist für Webseiten gesperrt – nur über die Tab-Freigabe sichtbar.
   ========================================================================== */

const ScoreboardScan = (() => {
    const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
        && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

    function loadScript(src) {
        if (window.Tesseract) return Promise.resolve();
        return new Promise((res, rej) => {
            const s = document.createElement('script'); s.src = src; s.onload = res;
            s.onerror = () => rej(new Error('Die Texterkennung konnte nicht geladen werden (Internetverbindung?).'));
            document.head.appendChild(s);
        });
    }

    /** Sichtbares Videobild (16:9, mittig im Element) in CSS-Pixeln */
    function contentRect(el) {
        const r = el.getBoundingClientRect(); let w = r.width, h = r.height;
        if (w / h > 16 / 9) w = h * 16 / 9; else h = w * 9 / 16;
        return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
    }

    class AbortError extends Error {}

    class Scanner {
        /**
         * player: FalconsPlayer · periodLen(p) → Sekunden · countdown: Uhr läuft rückwärts
         * onProgress({ text, done, total }) · onStatus(text)
         */
        constructor({ player, periodLen, countdown = false, onProgress = () => {} }) {
            Object.assign(this, { player, periodLen, countdown, onProgress });
            this.aborted = null; this.regions = null; this.reads = 0; this.misses = 0;
        }

        abort(reason = 'Abgebrochen') { if (!this.aborted) this.aborted = reason; }
        check() { if (this.aborted) throw new AbortError(this.aborted); }

        /* ------------------------------------------------ Freigabe + Texterkennung */
        async open() {
            // muss direkt im Klick passieren (Browser verlangt eine Nutzeraktion)
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 10 }, width: { ideal: 3840 }, height: { ideal: 2160 } },
                audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude'
            });
            const track = this.stream.getVideoTracks()[0];
            const surface = (track.getSettings && track.getSettings().displaySurface) || 'browser';
            if (surface !== 'browser') { this.close(); throw new Error('Bitte „Diesen Tab“ freigeben – nicht den ganzen Bildschirm oder ein Fenster.'); }
            track.addEventListener('ended', () => this.abort('Die Tab-Freigabe wurde beendet.'));
            this.video = document.createElement('video');
            this.video.muted = true; this.video.playsInline = true; this.video.srcObject = this.stream;
            await this.video.play();
            this.onProgress({ text: 'Texterkennung wird geladen …' });
            await loadScript(TESS_URL);
            this.worker = await Tesseract.createWorker('eng', 1, ScoreboardScan.tessOptions || {});
        }
        close() {
            if (this.stream) this.stream.getTracks().forEach(t => t.stop());
            if (this.worker) this.worker.terminate().catch(() => {});
            this.stream = this.worker = null;
        }

        /* ------------------------------------------------ Bild holen */
        /** Ausschnitt (Anteile des Videobilds) als Canvas; k = Vergrößerung */
        grab(fr, targetH = 0, binarize = false) {
            const v = this.video, vw = v.videoWidth, vh = v.videoHeight;
            if (!vw || !vh) return null;
            const sx = vw / window.innerWidth, sy = vh / window.innerHeight;
            const cr = contentRect(this.player.stage.querySelector('.fp-video'));
            const x = (cr.x + fr.x * cr.w) * sx, y = (cr.y + fr.y * cr.h) * sy, w = fr.w * cr.w * sx, h = fr.h * cr.h * sy;
            const k = targetH ? Math.max(1, Math.min(8, targetH / h)) : Math.max(1, Math.min(4, 2400 / w));
            const raw = document.createElement('canvas'); raw.width = Math.max(1, Math.round(w)); raw.height = Math.max(1, Math.round(h));
            raw.getContext('2d').drawImage(v, x, y, w, h, 0, 0, raw.width, raw.height);
            // helle Schrift auf dunklem Grund → umkehren (Texterkennung mag dunkle Schrift auf hell)
            const px = raw.getContext('2d').getImageData(0, 0, raw.width, raw.height).data;
            let sum = 0; for (let i = 0; i < px.length; i += 16) sum += .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2];
            const dark = sum / (px.length / 16) < 128;
            const c = document.createElement('canvas'); c.width = Math.round(raw.width * k); c.height = Math.round(raw.height * k);
            const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
            g.filter = `grayscale(1) ${dark ? 'invert(1) ' : ''}contrast(1.5)`;
            g.drawImage(raw, 0, 0, c.width, c.height);
            if (binarize) {
                // reines Schwarz/Weiß (Otsu-Schwelle) – hilft bei verwaschener Schrift
                const d = g.getImageData(0, 0, c.width, c.height), a = d.data, hist = new Array(256).fill(0);
                for (let i = 0; i < a.length; i += 4) hist[a[i]]++;
                const n = a.length / 4; let sum = 0; hist.forEach((v, i) => sum += v * i);
                let sB = 0, wB = 0, best = 0, th = 128;
                for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const m = wB * wF * (sB / wB - (sum - sB) / wF) ** 2; if (m > best) { best = m; th = i; } }
                for (let i = 0; i < a.length; i += 4) a[i] = a[i + 1] = a[i + 2] = a[i] > th ? 255 : 0;
                g.putImageData(d, 0, 0);
            }
            c.k = k; c.px = { x, y, w, h, sx, sy, cr };
            return c;
        }

        /* ------------------------------------------------ Scoreboard finden */
        /** Sucht Spieluhr (mm:ss) und Drittel-Anzeige oben links; merkt sich deren Lage */
        async locate() {
            const area = { x: 0, y: 0, w: .62, h: .24 };
            const ocr = async () => {
                const c = this.grab(area); if (!c) return null;
                await this.worker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '', user_defined_dpi: '300' });
                const { data } = await this.worker.recognize(c, {}, { blocks: true, text: true });
                const words = [];
                (data.blocks || []).forEach(b => b.paragraphs.forEach(p => p.lines.forEach(l => l.words.forEach(w => words.push(w)))));
                return { c, words };
            };
            const first = await ocr(); if (!first) return false;
            const { c, words } = first;
            // Anteile des Videobilds aus Pixeln des vergrößerten Ausschnitts
            const toFr = bb => ({ x: area.x + bb.x0 / c.width * area.w, y: area.y + bb.y0 / c.height * area.h,
                w: (bb.x1 - bb.x0) / c.width * area.w, h: (bb.y1 - bb.y0) / c.height * area.h });
            const isTime = w => /^\d{1,2}[:.]\d{2}$/.test(w.text.trim()) && w.confidence > 40;
            let cands = words.filter(isTime);
            if (!cands.length) return false;
            let clockW;
            const prev = this.regions && this.regions.clock;
            if (prev) {
                // erneut suchen: der Uhr-Position von vorher am nächsten (Spielstand „2:10“ nicht verwechseln)
                const pc = [prev.x + prev.w / 2, prev.y + prev.h / 2], d = w => { const f = toFr(w.bbox); return Math.hypot(f.x + f.w / 2 - pc[0], (f.y + f.h / 2 - pc[1]) * 2); };
                clockW = cands.sort((a, b) => d(a) - d(b))[0];
                if (d(clockW) > .12) return false;
            } else if (cands.length > 1) {
                // erstes Suchen mit mehreren Kandidaten: die Uhr läuft, der Spielstand nicht
                await sleep(2500);
                const again = await ocr();
                const val = w => w.text.trim();
                const moved = again && cands.filter(w => { const f = toFr(w.bbox); return !again.words.some(x => isTime(x) && val(x) === val(w) && Math.abs(toFr(x.bbox).x - f.x) < .01); });
                clockW = (moved && moved.length ? moved : cands).sort((a, b) => b.bbox.x0 - a.bbox.x0)[0];
            } else clockW = cands[0];
            const clock = toFr(clockW.bbox);
            const perW = words.find(w => /DRITTEL|VERL|PAUSE|PENAL|PERIOD|OVERTIME/i.test(w.text));
            let period = null;
            if (perW) {
                const pre = words.filter(w => w.bbox.x1 <= perW.bbox.x0 + 2 && perW.bbox.x0 - w.bbox.x1 < (perW.bbox.y1 - perW.bbox.y0) * 3
                    && Math.abs((w.bbox.y0 + w.bbox.y1) - (perW.bbox.y0 + perW.bbox.y1)) < (perW.bbox.y1 - perW.bbox.y0) * 1.5);
                const x0 = Math.min(perW.bbox.x0, ...pre.map(w => w.bbox.x0));
                period = toFr({ x0, y0: perW.bbox.y0, x1: perW.bbox.x1, y1: perW.bbox.y1 });
            }
            const pad = (r, l, rt, v) => ({ x: Math.max(0, r.x - r.w * l), y: Math.max(0, r.y - r.h * v), w: r.w * (1 + l + rt), h: r.h * (1 + 2 * v) });
            this.regions = { clock: pad(clock, .5, .9, .45), period: period ? pad(period, .3, 1.1, .5) : null };
            return true;
        }

        /* ------------------------------------------------ Uhr + Drittel lesen */
        async read() {
            this.reads++;
            await this.worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789:.', user_defined_dpi: '300' });
            let m = null;
            // mehrere Aufbereitungen desselben Bildes, bis die Uhr sauber gelesen ist
            for (const [h, bin] of [[64, false], [96, true], [48, false]]) {
                const c = this.grab(this.regions.clock, h, bin); if (!c) return null;
                const t1 = (await this.worker.recognize(c)).data.text.replace(/\s+/g, '');
                this.lastText = t1;
                m = t1.match(/(\d{1,2})[:.](\d{2})/) || t1.match(/^(\d{1,2})(\d{2})$/);
                if (m && +m[2] <= 59) break;
                m = null;
            }
            if (!m) return null;
            let clock = +m[1] * 60 + +m[2];
            let period = null, pause = false;
            if (this.regions.period) {
                const p = this.grab(this.regions.period, 56);
                await this.worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789. ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ', user_defined_dpi: '300' });
                const t2 = (await this.worker.recognize(p)).data.text.toUpperCase();
                const pm = t2.match(/([1-5])\s*\.?\s*(DR|PER)/);
                if (pm) period = +pm[1];
                else if (/VERL|OVERT/.test(t2)) period = 4;
                else if (/PENAL/.test(t2)) period = 5;
                if (/PAUSE/.test(t2)) pause = true;
            }
            if (period && clock > this.periodLen(period)) return null;
            if (this.countdown && period) clock = this.periodLen(period) - clock;
            return { clock, period, pause };
        }

        /** Video an Stelle t springen, warten bis Bilder laufen, Uhr lesen → Probe { t, period, clock } */
        async sampleAt(t) {
            this.check();
            const pl = this.player, dur = this.duration;
            t = Math.max(0, Math.min(dur - 2, t));
            pl.seek(t);
            const t0 = performance.now();
            while (performance.now() - t0 < 9000) {
                await sleep(90); this.check();
                const cur = pl.time();
                if (cur >= t + .35 && cur < t + 5) break;
            }
            await sleep(160);   // Bildschirmfreigabe hinkt ein paar Bilder hinterher
            const at = pl.time() - .15;
            let r = await this.read();
            // Uhr nicht lesbar: nach zwei Fehlversuchen neu suchen (Scoreboard kann sich verschieben, z. B. bei zweistelligem Spielstand)
            if (!r && ++this.misses >= 2 && await this.locate()) r = await this.read();
            if (r) this.misses = 0;
            if (!r || r.pause) return null;
            return { t: at, period: r.period, clock: r.clock };
        }

        /* ------------------------------------------------ Ablauf */
        /**
         * events: [{ id, period, clock }] (Spielzeit in Sekunden).
         * Ergebnis: { hits: { [id]: Videozeit }, samples: [{ t, period, clock }] }
         */
        async run(events, { step = 60 } = {}) {
            const pl = this.player;
            ScoreboardScan.trace = [];
            this.duration = (pl.yt && pl.yt.getDuration && pl.yt.getDuration()) || 0;
            if (!this.duration) throw new Error('Videolänge unbekannt – Video einmal kurz abspielen und erneut versuchen.');

            // 1) Scoreboard finden (an mehreren Stellen probieren)
            this.onProgress({ text: 'Suche das Scoreboard …' });
            pl.seek(this.duration * .2); await sleep(3500);   // YouTube-Titelleiste ausblenden lassen
            let found = false;
            for (const f of [.2, .35, .5, .12, .65]) {
                this.check();
                pl.seek(this.duration * f); await sleep(1600);
                if (await this.locate()) { found = true; break; }
            }
            if (!found) throw new Error('Kein Scoreboard mit Spieluhr oben links gefunden. Ist der richtige Tab freigegeben und ist die Uhr im Video zu sehen?');

            // 2) Grobraster über das ganze Video
            const raw = [], n = Math.floor(this.duration / step);
            for (let i = 0; i <= n; i++) {
                this.onProgress({ text: 'Lese die Spieluhr im ganzen Video …', done: i, total: n + 1 + events.length * 6 });
                const s = await this.sampleAt(i * step + 1);
                if (s) raw.push(s);
            }
            const samples = this.consistent(this.fillPeriods(raw));
            ScoreboardScan.last = { raw, samples, regions: this.regions };   // für die Fehlersuche
            if (samples.length < 3) throw new Error('Die Spieluhr ließ sich kaum lesen. Ist das Video scharf genug (Qualität/Vollbild)?');

            // 3) Jedes Ereignis genau suchen
            const hits = {};
            for (let i = 0; i < events.length; i++) {
                this.onProgress({ text: `Suche Tore und Strafen … (${i + 1}/${events.length})`, done: n + 1 + i * 6, total: n + 1 + events.length * 6 });
                // Die Hallenuhr bleibt beim Tor oft schon eine Sekunde vor der Saisonmanager-Zeit stehen und zeigt
                // dessen Zeit erst nach dem Anstoß. Deshalb den Moment suchen, in dem die Uhr eine Sekunde davor
                // erreicht – das Ereignis liegt direkt danach.
                const ev = events[i], before = ev.clock > 0 ? { ...ev, clock: ev.clock - 1 } : ev;
                let t = await this.refine(before, samples);
                if (t !== null && before !== ev) t += .8;
                if (t !== null) hits[ev.id] = Math.round(t * 10) / 10;
            }
            return { hits, samples };
        }

        /** Drittel ergänzen, falls die Anzeige nicht lesbar war: Uhr springt zurück → neues Drittel */
        fillPeriods(list) {
            let cur = null, last = null;
            return list.map(s => {
                let p = s.period;
                if (!p) p = cur === null ? 1 : (last !== null && s.clock + 120 < last ? cur + 1 : cur);
                cur = p; last = s.clock;
                return { ...s, period: p };
            });
        }

        /** Ausreißer (Lesefehler) entfernen: längste Kette, in der die Uhr nie schneller läuft als das Video */
        consistent(list) {
            const key = s => s.period * 1e4 + s.clock, ok = (a, b) => key(b) >= key(a) && (b.period > a.period || b.clock - a.clock <= (b.t - a.t) + 3);
            const best = list.map(() => 1), prev = list.map(() => -1);
            for (let j = 0; j < list.length; j++) for (let i = 0; i < j; i++)
                if (ok(list[i], list[j]) && best[i] + 1 > best[j]) { best[j] = best[i] + 1; prev[j] = i; }
            let j = best.indexOf(Math.max(...best)); const out = [];
            while (j >= 0) { out.unshift(list[j]); j = prev[j]; }
            return out;
        }

        /** Frühester Videomoment, an dem die Uhr (Drittel p) die Zeit c zeigt */
        async refine(ev, samples) {
            const key = s => s.period * 1e4 + s.clock, target = ev.period * 1e4 + ev.clock;
            let lo = null, hi = null;
            for (const s of samples) { if (key(s) < target) lo = s; else { hi = s; break; } }
            lo = lo || { t: 0, period: 0, clock: 0 };
            hi = hi || { t: this.duration - 2, period: 99, clock: 0 };
            let probes = 0, running = true;
            for (let k = 0; k < 18 && hi.t - lo.t > 1.4; k++) {
                let g;
                if (key(hi) === target) g = probes++ ? (lo.t + hi.t) / 2 : hi.t - 1.2;          // erst kurz davor prüfen, dann halbieren
                else if (running && lo.period === ev.period) g = lo.t + (ev.clock - lo.clock) + .3; // Uhr läuft durch → frühestens hier
                else g = (lo.t + hi.t) / 2;
                if (g <= lo.t + .4 || g >= hi.t - .4) g = (lo.t + hi.t) / 2;
                let s = null;
                for (const off of [0, 1.3, -2.1, 3.2]) {                                          // unlesbar → etwas daneben probieren
                    const gg = g + off;
                    if (gg <= lo.t || gg >= hi.t) continue;
                    s = await this.sampleAt(gg); if (s) break;
                }
                (ScoreboardScan.trace = ScoreboardScan.trace || []).push({ ev: ev.id, g: Math.round(g * 10) / 10, s, txt: this.lastText, reg: this.regions && this.regions.clock && +this.regions.clock.x.toFixed(3) });
                if (!s) break;
                // Drittel nicht lesbar → aus dem Suchintervall ableiten (Uhr springt beim neuen Drittel zurück)
                if (!s.period) s.period = lo.period && (lo.period === hi.period || s.clock >= lo.clock - 2) ? lo.period : hi.period;
                if (key(s) < target) {
                    // Uhr stand (Unterbrechung) → nicht mehr „durchlaufend“ schätzen, sondern halbieren
                    if (lo.period === s.period && s.clock - lo.clock < (s.t - lo.t) * .5) running = false;
                    lo = s;
                } else hi = s;
            }
            // Uhr zeigt die Ereigniszeit (±2 s Toleranz zwischen Saisonmanager und Hallenuhr)
            if (hi.period !== ev.period || Math.abs(hi.clock - ev.clock) > 2 || hi.t - lo.t > 4) return null;
            return Math.max(lo.t, hi.t - .5);
        }
    }

    return { supported, Scanner, AbortError, contentRect, tessOptions: null };
})();
