/* ==========================================================================
   Falcons Core – gemeinsame Logik aller Seiten
   - Login-Status & Admin-Prüfung
   - Kopfzeile / Navigation
   - Text-Formatierung (Zeitstempel, @Mentions)
   - Clip-Bibliothek (Google Drive + YouTube + Taktik-Boards)
   - kleine UI-Helfer (Icons, Toasts)
   Benötigt: Firebase-SDK + assets/js/config.js
   ========================================================================== */

const Falcons = (() => {
    const CFG = FALCONS_CONFIG;
    const USER_KEY = 'falcons_user';

    /* ---------------------------------------------------------------- Icons */
    const ICONS = {
        home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
        video: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
        clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
        sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
        play: '<path d="M6 4l14 8-14 8z"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        chevronRight: '<path d="m9 18 6-6-6-6"/>',
        chevronLeft: '<path d="m15 18-6-6 6-6"/>',
        chevronDown: '<path d="m6 9 6 6 6-6"/>',
        arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
        pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
        move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
        send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
        minusCircle: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
        arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
        crosshair: '<circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/>',
        net: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 10h18M3 14h18M9 6v12M15 6v12"/>',
        flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
        repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
        alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
        eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
        at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
        external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
        key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
        message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        circle: '<circle cx="12" cy="12" r="9"/>'
    };
    function icon(name, cls = '') {
        const filled = name === 'play';
        return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"${filled ? ' style="fill:currentColor;stroke:none"' : ''}>${ICONS[name] || ''}</svg>`;
    }

    /* ---------------------------------------------------------- Login/User */
    function getUser() {
        try {
            const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
            return u && u.nr ? { nr: String(u.nr), name: u.name || '' } : null;
        } catch (e) { return null; }
    }
    function setUser(u) {
        // PIN wird bewusst NICHT im Browser gespeichert
        localStorage.setItem(USER_KEY, JSON.stringify({ nr: u.nr, name: u.name }));
    }
    function logout() {
        localStorage.removeItem(USER_KEY);
        location.href = 'index.html';
    }
    /** Leitet zur Login-Seite um, wenn niemand angemeldet ist. */
    function requireUser() {
        const u = getUser();
        if (!u) { location.replace('index.html'); throw new Error('not logged in'); }
        return u;
    }

    let adminPromise = null;
    /** true, wenn der angemeldete Spieler Trainer/Admin ist (Ergebnis wird gecacht). */
    function isAdmin() {
        if (adminPromise) return adminPromise;
        const u = getUser();
        if (!u) return Promise.resolve(false);
        if (u.nr === CFG.superAdminNr) return (adminPromise = Promise.resolve(true));
        adminPromise = db.collection('admins').doc(u.nr).get().then(d => d.exists).catch(() => false);
        return adminPromise;
    }

    /* ------------------------------------------------------------- Shell */
    const NAV = [
        { id: 'dashboard', href: 'index.html', label: 'Dashboard', icon: 'home' },
        { id: 'library', href: 'recordings.html', label: 'Spiele & Trainings', short: 'Videos', icon: 'video' },
        { id: 'tactic', href: 'tactic.html', label: 'Taktikboard', short: 'Taktik', icon: 'clipboard', admin: true },
        { id: 'admin', href: 'admin.html', label: 'Verwaltung', short: 'Admin', icon: 'sliders', admin: true },
        { id: 'help', href: 'help.html', label: 'Hilfe', icon: 'help' }
    ];

    /**
     * Baut Kopfzeile (+ mobile Navigation) in die Seite ein.
     * @param {string} active  id des aktiven Menüpunkts
     * @param {object} opts    { bottomNav: true }
     */
    function mountShell(active, opts = {}) {
        const u = getUser();
        const links = (cls) => NAV.map(n =>
            `<a href="${n.href}" class="${cls} ${n.id === active ? 'active' : ''} ${n.admin ? 'admin-only hidden' : ''}">${icon(n.icon)}<span>${cls === 'nav-link' ? n.label : (n.short || n.label)}</span></a>`
        ).join('');

        const header = document.createElement('header');
        header.className = 'app-header';
        header.innerHTML = `
            <a href="index.html" class="brand">
                <div class="brand-mark">FF</div>
                <div class="brand-text"><strong>Falcons</strong><span>Analyse-Hub</span></div>
            </a>
            <nav class="main-nav">${links('nav-link')}</nav>
            ${u ? `
            <div class="user-menu" id="user-menu">
                <button class="user-chip" type="button" onclick="this.parentElement.classList.toggle('open')">
                    <span class="avatar">${esc(u.nr)}</span>
                    <span class="name">${esc(u.name)}</span>
                    ${icon('chevronDown', 'icon-sm')}
                </button>
                <div class="user-dropdown">
                    <div class="meta"><strong>${esc(u.name)}</strong><small>Trikot #${esc(u.nr)} · <span id="role-label">Spieler</span></small></div>
                    <a class="dropdown-item" href="help.html">${icon('help')} Hilfe & Anleitung</a>
                    <button class="dropdown-item" type="button" onclick="Falcons.logout()">${icon('logout')} Abmelden</button>
                </div>
            </div>` : ''}`;
        document.body.prepend(header);

        if (opts.bottomNav !== false) {
            const bottom = document.createElement('nav');
            bottom.className = 'bottom-nav';
            bottom.innerHTML = links('');
            document.body.appendChild(bottom);
            document.body.classList.add('has-bottom-nav');
        }

        document.addEventListener('click', e => {
            const m = document.getElementById('user-menu');
            if (m && !m.contains(e.target)) m.classList.remove('open');
        });

        isAdmin().then(admin => {
            if (!admin) return;
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            const r = document.getElementById('role-label'); if (r) r.textContent = 'Trainer / Admin';
        });
    }

    /* ---------------------------------------------------------- Helfer */
    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const TS_RE = /(\d{1,2}):(\d{2}):(\d{2})/;
    /** "0:15:30" → 930 Sekunden (0, wenn kein Zeitstempel im Text) */
    function parseTime(t) {
        const m = String(t || '').match(TS_RE);
        return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
    }
    function hasTime(t) { return TS_RE.test(String(t || '')); }

    /**
     * Wandelt gespeicherten Kommentar-Text in HTML um:
     *  - Zeitstempel H:MM:SS → klickbarer Chip (ruft Falcons.onTimestamp(sec))
     *  - "@19 | Max Mustermann*" bzw. "@19*" → blaue Markierung
     */
    function formatText(text) {
        return esc(text)
            .replace(/(\d{1,2}:\d{2}:\d{2})/g, m => `<span class="ts" data-sec="${parseTime(m)}">${m}</span>`)
            .replace(/(@\d+ \| [^*]+|@\d+)\*/g, '<span class="mention">$1</span>');
    }

    /** "@19 gut gemacht" → { text: "@19 | Max Mustermann* gut gemacht", mentions: ["19"] } */
    function resolveMentions(text, playerMap) {
        const mentions = [];
        const out = text.replace(/@(\d+)/g, (match, nr) => {
            const key = nr.length === 1 ? '0' + nr : nr;
            if (!mentions.includes(key)) mentions.push(key);
            return playerMap[key] ? `@${key} | ${playerMap[key]}*` : `${match}*`;
        });
        return { text: out, mentions };
    }

    /** Klicks auf Zeitstempel zentral abfangen; Seiten setzen Falcons.onTimestamp */
    document.addEventListener('click', e => {
        const ts = e.target.closest('.ts');
        if (ts && typeof api.onTimestamp === 'function') { e.stopPropagation(); api.onTimestamp(+ts.dataset.sec); }
    });

    /** YouTube-Link → { id, start } */
    function parseYouTube(url) {
        url = String(url || '').trim();
        const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?(?:.*&)?v=|live\/|shorts\/))([\w-]{11})/);
        const id = m ? m[1] : (/^[\w-]{11}$/.test(url) ? url : null);
        const t = url.match(/[?&](?:t|start)=(\d+)/);
        return { id, start: t ? +t[1] : 0 };
    }
    function ytThumb(id) { return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null; }

    function fmtDate(d) {
        if (!d) return '';
        const date = d.toDate ? d.toDate() : new Date(d);
        return isNaN(date) ? '' : date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function playerMap(snap) {
        const map = {};
        snap.forEach(d => map[d.id] = d.data().name);
        return map;
    }

    /* ----------------------------------------------------- Clip-Bibliothek */
    /**
     * Lädt alle Einzelclips (Google Drive + YouTube) und optional Taktik-Boards.
     * Fällt das Drive-Skript aus, werden trotzdem die YouTube-Clips geliefert.
     */
    async function loadMedia({ tactics = false } = {}) {
        const [driveRes, ytSnap, metaSnap, tacSnap] = await Promise.all([
            fetch(CFG.driveScriptUrl).then(r => r.json()).catch(err => { console.warn('Drive-Clips nicht ladbar', err); return []; }),
            db.collection('youtube_clips').get(),
            db.collection('video_metadata').get().catch(() => null),
            tactics ? db.collection('tactics').get() : null
        ]);
        const meta = {};
        if (metaSnap) metaSnap.forEach(d => meta[d.id] = d.data().position);

        const drive = (Array.isArray(driveRes) ? driveRes : []).map(v => {
            const id = (String(v.link || '').split('/d/')[1] || '').split('/')[0];
            if (!id) return null;
            return {
                id, type: 'drive', title: v.title, category: v.category,
                position: meta[id] || 'Alle',
                embedUrl: `https://drive.google.com/file/d/${id}/preview`, thumb: null
            };
        }).filter(Boolean);

        const yt = ytSnap.docs.map(d => {
            const c = d.data();
            const start = parseInt(c.startTime) || 0;
            return {
                id: d.id, type: 'youtube', title: c.title, category: c.category,
                position: c.position || meta[d.id] || 'Alle',
                ytId: c.ytId, startTime: start,
                embedUrl: `https://www.youtube.com/embed/${c.ytId}?start=${start}&autoplay=1&rel=0`,
                thumb: ytThumb(c.ytId)
            };
        });

        const tac = tacSnap ? tacSnap.docs.map(d => ({ id: d.id, type: 'tactic', title: d.data().title, tacticData: d.data(), thumb: null })) : [];
        return [...drive, ...yt, ...tac];
    }

    const SOURCE_LABEL = { drive: 'Drive', youtube: 'YouTube', tactic: 'Taktik' };

    /** Karte für einen Clip (Dashboard-Raster) */
    function mediaCard(v, { label, onclick } = {}) {
        const thumb = v.thumb
            ? `<div class="media-thumb" style="background-image:url('${esc(v.thumb)}')">`
            : `<div class="media-thumb placeholder"><span class="ph-mark">FALCONS</span>`;
        return `<article class="media-card" onclick="${onclick || `Falcons.openClip('${esc(v.id)}')`}">
            ${thumb}<div class="play">${icon('play')}</div><div class="corner"><span class="badge">${SOURCE_LABEL[v.type] || ''}</span></div></div>
            <div class="media-body">
                <div class="meta">${label ? `<span class="badge badge-brand">${esc(label)}</span>` : `<span>${esc(v.category || 'Clip')}</span>`}${v.position && v.position !== 'Alle' ? `<span>· ${esc(v.position)}</span>` : ''}</div>
                <h3>${esc(v.title)}</h3>
            </div>
        </article>`;
    }

    /** Merkt, dass der Spieler etwas angesehen hat (für den Status-Check im Admin-Bereich) */
    function markViewed(collection, itemId, value = true) {
        const u = getUser();
        if (!u || !itemId) return Promise.resolve();
        return db.collection(collection).doc(u.nr).set({ [itemId]: value }, { merge: true }).catch(() => {});
    }

    /* -------------------------------------------------------------- UI */
    function toast(msg, type = 'success') {
        let stack = document.querySelector('.toast-stack');
        if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; document.body.appendChild(stack); }
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
        stack.appendChild(el);
        setTimeout(() => el.remove(), 2800);
    }

    async function deleteDoc(col, id, question = 'Wirklich löschen?') {
        if (!confirm(question)) return false;
        await db.collection(col).doc(id).delete();
        toast('Gelöscht');
        return true;
    }

    function empty(title, text = '', iconName = 'circle') {
        return `<div class="empty">${icon(iconName)}<strong>${esc(title)}</strong>${esc(text)}</div>`;
    }
    const loading = (text = 'Wird geladen …') => `<div class="loading"><div class="spinner"></div>${esc(text)}</div>`;

    /** Kommentar-Element (Clips & Sessions) */
    function commentHtml(c, { me, admin, onRead, onDelete }) {
        const isRead = (c.readBy || []).includes(me);
        const mentioned = (c.mentions || []).includes(me);
        const ts = c.createdAt && c.createdAt.toDate ? fmtDate(c.createdAt) : '';
        return `<div class="comment ${mentioned && isRead ? 'is-read' : ''}">
            <div class="comment-head">
                <strong>${esc(c.author || 'Unbekannt')}</strong>${c.authorNr ? `<span class="mono">#${esc(c.authorNr)}</span>` : ''}
                ${ts ? `<span>· ${ts}</span>` : ''}
                <span class="spacer"></span>
                ${mentioned ? `<button class="check-btn ${isRead ? 'done' : ''}" onclick="${onRead}('${c.id}', ${isRead})">${isRead ? icon('undo', 'icon-sm') + 'Erledigt' : icon('check', 'icon-sm') + 'Abhaken'}</button>` : ''}
                ${admin ? `<button class="btn btn-ghost btn-icon btn-sm btn-danger del" title="Löschen" onclick="${onDelete}('${c.id}')">${icon('trash', 'icon-sm')}</button>` : ''}
            </div>
            <div class="comment-text">${formatText(c.text)}</div>
        </div>`;
    }

    async function toggleRead(commentId, isRead) {
        const u = getUser();
        const FV = firebase.firestore.FieldValue;
        await db.collection('comments').doc(commentId).update({ readBy: isRead ? FV.arrayRemove(u.nr) : FV.arrayUnion(u.nr) });
    }

    /** Enter = senden, Shift+Enter = neue Zeile */
    function submitOnEnter(textarea, fn) {
        textarea.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fn(); } });
    }

    const api = {
        CFG, icon, getUser, setUser, logout, requireUser, isAdmin, mountShell,
        esc, parseTime, hasTime, formatText, resolveMentions, parseYouTube, ytThumb, fmtDate, playerMap,
        loadMedia, mediaCard, markViewed, toast, deleteDoc, empty, loading, commentHtml, toggleRead, submitOnEnter,
        onTimestamp: null, openClip: null
    };
    return api;
})();
