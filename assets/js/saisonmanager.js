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
        if (!url) throw new Error('Die Saisonmanager-Verbindung ist noch nicht eingerichtet (Verwaltung → Spiele, nur Vereins-Admins).');
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

    /* ---------------------------------------------------------- Abgleich */
    const sortA = list => list.slice().sort((a, b) => a.clock - b.clock || a.video - b.video);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    /** Verhältnis Videozeit / Spielzeit aus anderen Dritteln (für Drittel mit nur einem Anker) */
    function typicalSlope(anchors) {
        const slopes = [];
        [1, 2, 3, 4].forEach(p => {
            const a = sortA(anchors.filter(x => x.period === p));
            if (a.length >= 2) { const s = (a[a.length - 1].video - a[0].video) / Math.max(1, a[a.length - 1].clock - a[0].clock); slopes.push(clamp(s, 1, 4)); }
        });
        if (!slopes.length) return 1;
        slopes.sort((x, y) => x - y);
        return slopes[Math.floor(slopes.length / 2)];
    }

    /** Spielzeit (Drittel, Sekunden) → Videozeit in Sekunden, oder null ohne passenden Anker */
    function estimate(anchors, period, clock) {
        const a = sortA(anchors.filter(x => x.period === period));
        if (!a.length) return null;
        if (a.length === 1) return Math.max(0, a[0].video + (clock - a[0].clock) * typicalSlope(anchors));
        // umgebendes Anker-Paar suchen (außerhalb: die beiden nächsten)
        const i = a.findIndex(x => x.clock >= clock);
        let p1, p2;
        if (i === -1) { p1 = a[a.length - 2]; p2 = a[a.length - 1]; }
        else if (i === 0) { p1 = a[0]; p2 = a[1]; }
        else { p1 = a[i - 1]; p2 = a[i]; }
        const slope = clamp((p2.video - p1.video) / Math.max(1, p2.clock - p1.clock), 1, 6);
        return Math.max(0, p1.video + (clock - p1.clock) * slope);
    }

    /** Videozeit → { period, clock, pause } (für die Spielstand-Anzeige) */
    function inverse(anchors, t) {
        const periods = [...new Set(anchors.map(x => x.period))].sort((x, y) => x - y);
        let best = null;
        for (const p of periods) {
            const start = estimate(anchors, p, 0), end = estimate(anchors, p, PERIOD_SEC);
            if (start === null) continue;
            if (t < start - 5) continue;
            if (t <= end + 5) {
                // innerhalb des Drittels: Spielzeit zurückrechnen (binäre Suche über die stückweise Funktion)
                let lo = 0, hi = PERIOD_SEC;
                for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; (estimate(anchors, p, mid) < t ? lo = mid : hi = mid); }
                best = { period: p, clock: clamp(lo, 0, PERIOD_SEC), pause: false };
            } else best = { period: p, clock: PERIOD_SEC, pause: true };
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
        const out = [], missing = [];
        (game.events || []).forEach(e => {
            if (e.type !== 'goal' && !(penalties && e.type === 'penalty')) return;
            const clock = clockSec(e.time), goalSec = estimate(anchors, e.period, clock);
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

    return { gameId, proxyUrl, setProxyUrl, load, weAre, clockSec, fmtClock, periodLabel, playerName, estimate, inverse, buildEvents, PERIOD_SEC };
})();
