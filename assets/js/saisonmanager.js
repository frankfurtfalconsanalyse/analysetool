/* ==========================================================================
   Saisonmanager-Anbindung
   - lädt Spieldaten über den eigenen Google-Apps-Script-Dienst (tools/saisonmanager-proxy.gs)
   - gleicht Spielzeit (Drittel + Spieluhr) mit der Videozeit ab
   - erzeugt aus Toren und Strafen Ereignisse für die Spielanalyse
   Abgleichspunkte („Anker“): { period, clock, video }  – clock/video in Sekunden.
   Zwischen zwei Ankern eines Drittels wird linear umgerechnet; so werden
   auch Unterbrechungen (gestoppte Spielzeit) ausgeglichen.
   ========================================================================== */

const Saisonmanager = (() => {
    const PERIOD_SEC = 20 * 60;

    /** Spiel-ID aus Link („…/spiel/58691“) oder Zahl */
    function gameId(link) {
        const s = String(link || '').trim();
        const m = s.match(/spiel\/(\d+)/) || s.match(/games\/(\d+)/) || s.match(/^(\d{3,})$/);
        return m ? m[1] : null;
    }

    let proxyCache = null;
    /** URL des Apps-Script-Dienstes: config.js oder (vom Vereins-Admin hinterlegt) im ersten Team */
    async function proxyUrl() {
        if (FALCONS_CONFIG.saisonmanagerProxyUrl) return FALCONS_CONFIG.saisonmanagerProxyUrl;
        if (proxyCache !== null) return proxyCache;
        try {
            const d = await db.collection('teams').doc(FALCONS_CONFIG.teams[0].id).get();
            proxyCache = (d.exists && d.data().smProxyUrl) || '';
        } catch (e) { proxyCache = ''; }
        return proxyCache;
    }
    async function setProxyUrl(url, { save = true } = {}) {
        if (save) await db.collection('teams').doc(FALCONS_CONFIG.teams[0].id).set({ smProxyUrl: url.trim() }, { merge: true });
        proxyCache = url.trim();
    }

    /** Spieldaten laden. Wirft verständliche Fehler. */
    async function load(link) {
        const id = gameId(link);
        if (!id) throw new Error('Kein gültiger Saisonmanager-Link (…/spiel/12345).');
        const url = await proxyUrl();
        if (!url) throw new Error('Die Saisonmanager-Verbindung ist noch nicht eingerichtet – ein Vereins-Admin richtet sie einmalig ein: Verwaltung → Spiele → ganz unten „Saisonmanager-Verbindung“.');
        let res;
        try { res = await fetch(url + (url.includes('?') ? '&' : '?') + 'game=' + id); }
        catch (e) { throw new Error('Saisonmanager-Dienst nicht erreichbar. Ist die Web-App mit Zugriff „Jeder“ bereitgestellt?'); }
        const data = await res.json().catch(() => { throw new Error('Unerwartete Antwort vom Saisonmanager-Dienst.'); });
        if (data.error) throw new Error(data.error);
        data.link = String(link).trim().startsWith('http') ? String(link).trim() : `https://saisonmanager.de/spiel/${id}`;
        return data;
    }

    /** Sind wir Heim oder Gast? (Name enthält „Falcons“ oder „Frankfurt“) */
    function weAre(game) {
        const re = /falcons|frankfurt/i;
        if (re.test(game.guest && game.guest.name) && !re.test(game.home && game.home.name)) return 'guest';
        return 'home';
    }

    const clockSec = t => { const m = String(t || '').match(/(\d+):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
    const fmtClock = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    function periodLabel(p) { return p <= 3 ? `${p}. Drittel` : p === 4 ? 'Verlängerung' : 'Penaltyschießen'; }

    function playerName(game, side, nr) {
        if (!nr) return '';
        const p = ((game.players || {})[side] || []).find(x => +x.nr === +nr);
        return p ? `${p.first} ${p.last}`.trim() : '';
    }

    /* ---------------------------------------------------------- Abgleich
       Floorball wird mit gestoppter Zeit gespielt: 20 Minuten Spielzeit dauern im Video meist 30+ Minuten.
       Modell: Videodauer bis Spieluhr c = Grundtempo · c + Unterbrechungen nach Toren/Strafen vor c.
       Dieses Modell wird über die Abgleichspunkte (Anker) skaliert – zwischen zwei Ankern exakt durch beide,
       Unterbrechungen landen dort, wo Tore und Strafen passiert sind. */
    const BASE_RATE = 1.35;                       // kleine Unterbrechungen (Freischläge, Bandenbälle …)
    const STOP = { goal: 40, penalty: 30 };       // typische Unterbrechung nach Tor / Strafe (Sekunden)
    const PAUSE_SEC = 10 * 60;                    // Drittelpause (nur für die Grobschätzung ohne Drittelende)
    const periodLen = p => p === 4 ? 10 * 60 : PERIOD_SEC;

    /** Unterbrechungen aus dem Spielbericht: [{ p, c, d }] (Drittel, Spieluhr in s, Dauer in s) */
    function stopsFromGame(game) {
        return ((game && game.events) || []).filter(e => STOP[e.type])
            .map(e => ({ p: e.period, c: clockSec(e.time), d: STOP[e.type] }));
    }
    /** Modell-Videodauer vom Drittelbeginn bis Spieluhr c */
    function model(stops, p, c) {
        let v = BASE_RATE * c;
        (stops || []).forEach(s => { if (s.p === p && s.c < c) v += s.d; });
        return v;
    }

    const sortA = list => list.slice().sort((a, b) => a.clock - b.clock || a.video - b.video);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const scaleOf = (stops, p, a1, a2) => {
        const dm = model(stops, p, a2.clock) - model(stops, p, a1.clock);
        return dm > 0 && a2.video > a1.video ? (a2.video - a1.video) / dm : null;
    };

    /** Skalierung des Modells aus den anderen Dritteln (für Drittel mit nur einem Anker) */
    function typicalScale(anchors, stops) {
        const found = [];
        const periods = [...new Set(anchors.map(x => x.period))];
        periods.forEach(p => {
            const a = sortA(anchors.filter(x => x.period === p));
            if (a.length >= 2 && a[a.length - 1].clock - a[0].clock >= 60) {
                const s = scaleOf(stops, p, a[0], a[a.length - 1]);
                if (s) found.push(clamp(s, 0.6, 3));
            }
        });
        if (!found.length) {
            // Grobschätzung: Anpfiff des nächsten Drittels minus Drittelpause = Ende dieses Drittels
            periods.forEach(p => {
                const st = anchors.find(x => x.period === p && x.clock === 0), nx = anchors.find(x => x.period === p + 1 && x.clock === 0);
                if (!st || !nx || p >= 3) return;
                const end = { clock: periodLen(p), video: nx.video - PAUSE_SEC };
                const s = end.video - st.video >= periodLen(p) ? scaleOf(stops, p, st, end) : null;
                if (s) found.push(clamp(s, 0.6, 3));
            });
        }
        if (!found.length) return 1;
        found.sort((x, y) => x - y);
        return found[Math.floor(found.length / 2)];
    }

    /** Spielzeit (Drittel, Sekunden) → Videozeit in Sekunden, oder null ohne Anker in diesem Drittel */
    function estimate(anchors, period, clock, stops = []) {
        const a = sortA(anchors.filter(x => x.period === period));
        if (!a.length) return null;
        const m = model(stops, period, clock);
        const at = (x, s) => Math.max(0, x.video + (m - model(stops, period, x.clock)) * s);
        // zwischen zwei Ankern: exakt durch beide
        const i = a.findIndex(x => x.clock >= clock);
        if (i > 0) { const s = scaleOf(stops, period, a[i - 1], a[i]); if (s) return at(a[i - 1], s); }
        if (i === 0 && a[0].clock === clock) return a[0].video;
        // davor/danach: Skalierung des ganzen Drittels (wenn aussagekräftig), sonst die typische
        let s = null;
        if (a.length >= 2 && a[a.length - 1].clock - a[0].clock >= 60) s = scaleOf(stops, period, a[0], a[a.length - 1]);
        s = clamp(s || typicalScale(anchors, stops), 0.6, 3);
        return at(i === -1 ? a[a.length - 1] : a[0], s);
    }

    /** Videozeit → { period, clock, pause } (für die Spielstand-Anzeige) */
    function inverse(anchors, t, stops = []) {
        const periods = [...new Set(anchors.map(x => x.period))].sort((x, y) => x - y);
        let best = null;
        for (const p of periods) {
            const len = periodLen(p), start = estimate(anchors, p, 0, stops), end = estimate(anchors, p, len, stops);
            if (start === null) continue;
            if (t < start - 5) continue;
            if (t <= end + 5) {
                // innerhalb des Drittels: Spielzeit zurückrechnen (binäre Suche über die stückweise Funktion)
                let lo = 0, hi = len;
                for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; (estimate(anchors, p, mid, stops) < t ? lo = mid : hi = mid); }
                best = { period: p, clock: clamp(lo, 0, len), pause: false };
            } else best = { period: p, clock: len, pause: true };
        }
        return best;
    }

    /**
     * Ereignisse für die Spielanalyse bauen.
     * roster: Kader-IDs unseres Teams ('07', '22' …) zum Markieren von Torschütze/Vorlage.
     */
    function buildEvents(game, anchors, side, roster, { penalties = true, leadIn = 10 } = {}) {
        const other = side === 'home' ? 'guest' : 'home';
        const sh = (game.home && game.home.short) || 'Heim', sg = (game.guest && game.guest.short) || 'Gast';
        const out = [], missing = [], stops = stopsFromGame(game);
        (game.events || []).forEach(e => {
            if (e.type !== 'goal' && !(penalties && e.type === 'penalty')) return;
            const clock = clockSec(e.time), goalSec = estimate(anchors, e.period, clock, stops);
            if (goalSec === null) { missing.push(e); return; }
            const ours = e.team === side;
            const team = e.team === 'home' ? 'home' : 'guest';
            const who = (nr, s) => nr ? `#${nr}${playerName(game, s, nr) ? ' ' + playerName(game, s, nr) : ''}` : '';
            const when = `${periodLabel(e.period)} ${e.time}`;
            const pad = nr => nr ? String(nr).padStart(2, '0') : '';
            const inRoster = nr => nr && roster.includes(pad(nr)) ? pad(nr) : '';
            let type, desc, scorer = '', assist = '';
            if (e.type === 'goal') {
                type = ours ? 'goal' : 'conceded';
                desc = `${sh} ${e.home}:${e.guest} ${sg} · ${who(e.number, team) || 'Tor'}${e.assist ? ', Vorlage ' + who(e.assist, team) : ''}${e.goalType && e.goalType !== 'Tor' ? ' (' + e.goalType + ')' : ''} · ${when}`;
                if (ours) { scorer = inRoster(e.number); assist = inRoster(e.assist); }
            } else {
                type = ours ? 'pk' : 'pp';
                desc = `${e.penalty || 'Strafe'} gegen ${who(e.number, team) || (ours ? 'uns' : 'Gegner')}${e.reason ? ' (' + e.reason + ')' : ''} · ${when}`;
            }
            const sec = Math.max(0, Math.round(goalSec - leadIn));
            out.push({
                smEventId: e.id, type, sec, desc, scorer, assist,
                players: [scorer, assist].filter(Boolean), onIce: [],
                smGoalSec: Math.round(goalSec), smScore: `${e.home}:${e.guest}`, smPeriod: e.period, smClock: clock
            });
        });
        return { events: out, missing };
    }

    return { gameId, proxyUrl, setProxyUrl, load, weAre, clockSec, fmtClock, periodLabel, playerName, stopsFromGame, periodLen, estimate, inverse, buildEvents, PERIOD_SEC };
})();
