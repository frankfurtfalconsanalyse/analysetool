/* ==========================================================================
   Taktikboard-Engine (SVG)
   - Maßstabsgetreues Floorball-Feld (40 × 20 m), ganzes oder halbes Feld
   - Figuren: Falcons, Gegner, Torhüter, Ball, Hütchen (mit Beschriftung)
   - Werkzeuge: Bewegen, Stift, Laufweg, Pass, Dribbling, Linie, Radierer
   - Mehrere Phasen + Abspielen (Figuren laufen ihre Laufwege/Pässe ab)
   - Maus, Finger und Apple Pencil (Pointer Events)
   Alle Koordinaten sind in Metern → unabhängig von der Bildschirmgröße.

   Datenformat (Firestore „tactics“):
   { title, category, field: 'full'|'half', visibility: 'team'|'private', ownerNr, ownerName,
     phases: [{ note, pieces: [{id,type,label,x,y}], drawings: [{id,tool,color,points:[x1,y1,x2,y2,…]}] }],
     legacyImage? }   // legacyImage = Zeichnung aus dem alten Board (Bild)
   ========================================================================== */

const TacticBoard = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    const W = 40, H = 20;
    const VIEW = { full: '-1.2 -1.2 42.4 22.4', half: '18.8 -1.2 22.4 22.4' };
    const LINE = '#2a2f38', BRAND = '#e30613', DARK = '#26303d';

    const PIECES = {
        falcons:     { name: 'Falcons',    prefix: '' },
        opponent:    { name: 'Gegner',     prefix: '' },
        falcons_gk:  { name: 'TW Falcons', label: 'TW' },
        opponent_gk: { name: 'TW Gegner',  label: 'TW' },
        ball:        { name: 'Ball' },
        cone:        { name: 'Hütchen' }
    };
    const TOOLS = {
        move:    { name: 'Bewegen' },
        pen:     { name: 'Stift', free: true },
        run:     { name: 'Laufweg', free: true, arrow: true },
        dribble: { name: 'Dribbling', free: true, arrow: true },
        pass:    { name: 'Pass', straight: true, arrow: true, dash: true },
        line:    { name: 'Linie', straight: true },
        eraser:  { name: 'Radierer' }
    };

    /* ---------------------------------------------------------- Helfer */
    const el = (tag, attrs = {}, parent) => {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    };
    const uid = () => Math.random().toString(36).slice(2, 9);
    const r2 = n => Math.round(n * 100) / 100;
    const clone = o => JSON.parse(JSON.stringify(o));
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const pairs = flat => { const p = []; for (let i = 0; i + 1 < flat.length; i += 2) p.push([flat[i], flat[i + 1]]); return p; };
    const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /** Catmull-Rom → Bézier: aus Fingerpunkten wird eine weiche Kurve */
    function smoothPath(p) {
        if (p.length < 2) return '';
        if (p.length === 2) return `M${p[0]}L${p[1]}`;
        let d = `M${p[0][0]},${p[0][1]}`;
        for (let i = 0; i < p.length - 1; i++) {
            const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
            d += `C${r2(p1[0] + (p2[0] - p0[0]) / 6)},${r2(p1[1] + (p2[1] - p0[1]) / 6)} ${r2(p2[0] - (p3[0] - p1[0]) / 6)},${r2(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]},${p2[1]}`;
        }
        return d;
    }

    /** Polyline gleichmäßig neu abtasten (für Dribbling-Welle & Animation) */
    function resample(p, step) {
        if (p.length < 2) return p.slice();
        const out = [p[0]];
        let carry = 0;
        for (let i = 1; i < p.length; i++) {
            const a = p[i - 1], b = p[i], len = dist(a, b);
            let pos = step - carry;
            while (pos <= len) { const t = pos / len; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); pos += step; }
            carry = len - (pos - step);
        }
        if (dist(out[out.length - 1], p[p.length - 1]) > step * 0.3) out.push(p[p.length - 1]);
        return out;
    }
    /** Zeichnung nur bis zum Anteil t (0…1) – für mitwachsende Pfeile beim Abspielen */
    function partialDrawing(d, t) {
        if (t >= 1) return d;
        const pts = pairs(d.points);
        if (t <= 0.02 || pts.length < 2) return null;
        let cut;
        if (TOOLS[d.tool] && TOOLS[d.tool].straight) {
            const a = pts[0], b = pts[pts.length - 1];
            cut = [a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]];
        } else {
            const total = pathLength(pts); let target = total * t; cut = [pts[0]];
            for (let i = 1; i < pts.length; i++) {
                const seg = dist(pts[i - 1], pts[i]);
                if (target <= seg) { const k = seg ? target / seg : 1; cut.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]); break; }
                cut.push(pts[i]); target -= seg;
            }
        }
        return { ...d, points: cut.flat() };
    }
    function pathLength(p) { let l = 0; for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]); return l; }
    function pointAt(p, t) {
        const total = pathLength(p); let target = total * t;
        for (let i = 1; i < p.length; i++) {
            const seg = dist(p[i - 1], p[i]);
            if (target <= seg || i === p.length - 1) { const k = seg ? Math.min(target / seg, 1) : 1; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k]; }
            target -= seg;
        }
        return p[p.length - 1];
    }

    /* ------------------------------------------------------- Spielfeld */
    function fieldMarkup() {
        // Maße nach IFF-Regeln: Torlinie 3,5 m vor der Bande, Torraum 4 × 5 m (2,85 m vor der Bande),
        // Torhüterraum 1 × 2,5 m, Tor 1,6 m breit / 0,65 m tief, Bullypunkte 1,5 m vor der Längsbande.
        const side = flip => {
            const X = x => flip ? W - x : x;
            const rect = (x1, x2, y1, y2, extra = '') => { const a = Math.min(X(x1), X(x2)); return `<rect x="${a}" y="${y1}" width="${Math.abs(X(x2) - X(x1))}" height="${y2 - y1}" ${extra}/>`; };
            return `
                ${rect(2.85, 6.85, 7.5, 12.5, `fill="rgba(42,47,56,.045)" stroke="${LINE}" stroke-width=".08"`)}
                ${rect(2.85, 3.85, 8.75, 11.25, `fill="rgba(227,6,19,.06)" stroke="${LINE}" stroke-width=".08"`)}
                <line x1="${X(3.5)}" y1="9.2" x2="${X(3.5)}" y2="10.8" stroke="${LINE}" stroke-width=".06"/>
                <path d="M${X(3.5)},9.2 L${X(2.85)},9.2 L${X(2.85)},10.8 L${X(3.5)},10.8" fill="rgba(227,6,19,.12)" stroke="${BRAND}" stroke-width=".14" stroke-linejoin="round"/>
                ${cross(X(3.5), 1.5)}${cross(X(3.5), 18.5)}`;
        };
        const cross = (x, y) => `<path d="M${x - .22},${y}h.44M${x},${y - .22}v.44" stroke="${LINE}" stroke-width=".08" stroke-linecap="round"/>`;
        return `
            <defs>
                <linearGradient id="tb-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f8fa"/><stop offset="1" stop-color="#eceff3"/></linearGradient>
                <pattern id="tb-planks" width="40" height=".9" patternUnits="userSpaceOnUse"><rect width="40" height=".9" fill="none"/><line x1="0" y1=".9" x2="40" y2=".9" stroke="rgba(30,40,55,.035)" stroke-width=".04"/></pattern>
            </defs>
            <rect x="-.6" y="-.6" width="${W + 1.2}" height="${H + 1.2}" rx="2.8" fill="#1b1e24"/>
            <rect x="0" y="0" width="${W}" height="${H}" rx="2.2" fill="url(#tb-floor)"/>
            <rect x="0" y="0" width="${W}" height="${H}" rx="2.2" fill="url(#tb-planks)"/>
            <rect x="0" y="0" width="${W / 2}" height="${H}" fill="rgba(227,6,19,.025)"/>
            <image href="assets/img/logo.png" x="${W / 2 - 3}" y="${H / 2 - 3}" width="6" height="6" opacity=".07"/>
            <line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="${LINE}" stroke-width=".08"/>
            <circle cx="${W / 2}" cy="${H / 2}" r=".15" fill="${LINE}"/>
            <circle cx="${W / 2}" cy="${H / 2}" r="1" fill="none" stroke="${LINE}" stroke-width=".05" stroke-dasharray=".18 .18" opacity=".35"/>
            ${cross(W / 2, 1.5)}${cross(W / 2, 18.5)}
            ${side(false)}${side(true)}
            <rect x="0" y="0" width="${W}" height="${H}" rx="2.2" fill="none" stroke="#ffffff" stroke-width=".12" opacity=".9"/>`;
    }

    /* ------------------------------------------------------- Formate */
    function empty() { return { field: 'full', phases: [{ note: '', pieces: [], drawings: [] }] }; }

    /** Altes Board (Pixel auf 960×560 + Bild) oder neues Format → neues Format */
    function normalize(doc) {
        const d = clone(doc || {});
        if (Array.isArray(d.phases) && d.phases.length) {
            d.phases.forEach(p => { p.pieces = p.pieces || []; p.drawings = p.drawings || []; p.note = p.note || ''; });
            d.field = d.field === 'half' ? 'half' : 'full';
            return d;
        }
        const px = v => parseFloat(v) || 0;
        const conv = (v, total, size, meters) => String(v).includes('%') ? meters * px(v) / 100 : (px(v) + size / 2) / total * meters;
        const pieces = (d.players || []).map(p => {
            const size = p.type === 'ball' ? 18 : 36;
            return { id: uid(), type: p.type === 'falcons' ? 'falcons' : p.type === 'ball' ? 'ball' : 'opponent', label: p.type === 'ball' ? '' : (p.type === 'falcons' ? 'F' : 'G'), x: r2(conv(p.x, 960, size, W)), y: r2(conv(p.y, 560, size, H)) };
        });
        return { ...d, field: 'full', legacyImage: d.drawing || d.legacyImage || null, phases: [{ note: '', pieces, drawings: [] }], players: undefined, drawing: undefined };
    }

    /** Für Firestore aufbereiten (gerundete Zahlen, keine undefined-Felder) */
    function serialize(b) {
        const out = {
            field: b.field,
            phases: b.phases.map(p => ({
                note: p.note || '',
                pieces: p.pieces.map(x => ({ id: x.id, type: x.type, label: x.label || '', x: r2(x.x), y: r2(x.y) })),
                drawings: p.drawings.map(x => ({ id: x.id, tool: x.tool, color: x.color, points: x.points.map(r2) }))
            }))
        };
        if (b.legacyImage) out.legacyImage = b.legacyImage;
        return out;
    }

    /* ============================================================ Board */
    class Board {
        constructor(host, { editable = true, trash = null, onChange = () => {} } = {}) {
            this.host = host; this.editable = editable; this.trash = trash; this.onChange = onChange;
            this.board = empty(); this.phase = 0;
            this.tool = 'move'; this.color = '#1b1e24';
            this.undoStack = []; this.redoStack = [];
            this.selected = null; this.action = null; this.playing = null; this.lastTap = { id: null, t: 0 };

            this.svg = el('svg', { class: 'tboard', viewBox: VIEW.full, preserveAspectRatio: 'xMidYMid meet' });
            this.fieldLayer = el('g', {}, this.svg);
            this.fieldLayer.innerHTML = fieldMarkup();
            this.legacyLayer = el('g', {}, this.svg);
            this.drawLayer = el('g', { class: 'tb-drawings' }, this.svg);
            this.ghostLayer = el('g', { class: 'tb-ghosts' }, this.svg);
            this.pieceLayer = el('g', { class: 'tb-pieces' }, this.svg);
            this.tempLayer = el('g', {}, this.svg);
            host.appendChild(this.svg);

            if (editable) {
                this.svg.addEventListener('pointerdown', e => this.down(e));
                window.addEventListener('pointermove', e => this.move(e));
                window.addEventListener('pointerup', e => this.up(e));
                window.addEventListener('pointercancel', e => this.up(e));
                window.addEventListener('keydown', e => this.key(e));
            }
            this.setTool('move');
            this.render();
        }

        /* ---------------------------------------------------- Zustand */
        get current() { return this.board.phases[this.phase]; }
        load(doc) { this.stop(); this.board = normalize(doc); this.phase = 0; this.undoStack = []; this.redoStack = []; this.selected = null; this.render(); }
        reset() { this.load(empty()); }
        data() { return serialize(this.board); }
        isEmpty() { return this.board.phases.every(p => !p.pieces.length && !p.drawings.length) && !this.board.legacyImage; }

        checkpoint() { this.undoStack.push(JSON.stringify({ b: this.board, p: this.phase })); if (this.undoStack.length > 80) this.undoStack.shift(); }
        commit() { this.redoStack = []; this.render(); }
        discard() { this.undoStack.pop(); }
        restore(stack, other) {
            const s = stack.pop(); if (!s) return;
            other.push(JSON.stringify({ b: this.board, p: this.phase }));
            const o = JSON.parse(s); this.board = o.b; this.phase = Math.min(o.p, this.board.phases.length - 1);
            this.selected = null; this.render();
        }
        undo() { this.stop(); this.restore(this.undoStack, this.redoStack); }
        redo() { this.stop(); this.restore(this.redoStack, this.undoStack); }

        setTool(t) {
            this.tool = t;
            this.svg.dataset.tool = t;
            if (t !== 'move') { this.selected = null; this.renderPieces(); }
            this.onChange('tool');
        }
        setColor(c) { this.color = c; if (this.tool === 'move' || this.tool === 'eraser') this.setTool('run'); this.onChange('tool'); }
        setField(f) { this.checkpoint(); this.board.field = f === 'half' ? 'half' : 'full'; this.commit(); }

        /* ------------------------------------------------------ Phasen */
        setPhase(i) { this.stop(); this.phase = Math.max(0, Math.min(i, this.board.phases.length - 1)); this.selected = null; this.render(); }
        addPhase() {
            this.stop(); this.checkpoint();
            const next = { note: '', pieces: clone(this.current.pieces), drawings: [] };
            this.board.phases.splice(this.phase + 1, 0, next);
            this.phase++; this.commit();
        }
        removePhase() {
            if (this.board.phases.length < 2) return this.clearPhase();
            this.stop(); this.checkpoint();
            this.board.phases.splice(this.phase, 1);
            this.phase = Math.max(0, this.phase - 1); this.commit();
        }
        clearPhase() {
            this.checkpoint();
            this.current.pieces = []; this.current.drawings = [];
            if (this.phase === 0) this.board.legacyImage = null;
            this.commit();
        }
        clearDrawings() { this.checkpoint(); this.current.drawings = []; if (this.phase === 0) this.board.legacyImage = null; this.commit(); }
        setNote(text) { this.current.note = text; }

        /* ------------------------------------------------------ Figuren */
        nextLabel(type) {
            if (PIECES[type].label) return PIECES[type].label;
            if (type !== 'falcons' && type !== 'opponent') return '';
            const used = new Set(this.current.pieces.filter(p => p.type === type).map(p => p.label));
            let n = 1; while (used.has(String(n))) n++;
            return String(n);
        }
        addPiece(type, x, y) {
            const p = { id: uid(), type, label: this.nextLabel(type), x, y };
            // Figur in dieser und allen folgenden Phasen anlegen
            for (let i = this.phase; i < this.board.phases.length; i++) this.board.phases[i].pieces.push(clone(p));
            return p;
        }
        removePiece(id) { for (let i = this.phase; i < this.board.phases.length; i++) { const ph = this.board.phases[i]; ph.pieces = ph.pieces.filter(p => p.id !== id); } }
        renamePiece(id) {
            const p = this.current.pieces.find(x => x.id === id); if (!p || p.type === 'ball' || p.type === 'cone') return;
            const label = prompt('Beschriftung (Nummer oder Position, z. B. 7, C, LV):', p.label || '');
            if (label === null) return;
            this.checkpoint();
            const clean = label.trim().slice(0, 3).toUpperCase();
            this.board.phases.forEach(ph => ph.pieces.forEach(x => { if (x.id === id) x.label = clean; }));
            this.commit();
        }

        /** Figur aus der Seitenleiste aufs Feld ziehen bzw. antippen */
        beginExternalDrag(type, e) {
            if (!this.editable) return;
            this.stop(); e.preventDefault();
            if (this.tool !== 'move') this.setTool('move');
            this.checkpoint();
            const pt = this.toField(e);
            const p = this.addPiece(type, pt.x, pt.y);
            this.action = { kind: 'drag', id: p.id, dx: 0, dy: 0, external: true, sx: e.clientX, sy: e.clientY };
            this.render();
        }

        /* --------------------------------------------------- Eingabe */
        toField(e) {
            const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(this.svg.getScreenCTM().inverse());
            return { x: pt.x, y: pt.y };
        }
        overTrash(e) {
            if (!this.trash) return false;
            const r = this.trash.getBoundingClientRect();
            return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
        }
        overBoard(e) { const r = this.svg.getBoundingClientRect(); return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom; }

        down(e) {
            if (e.button > 0) return;
            this.stop(); e.preventDefault();
            const pt = this.toField(e);
            if (this.tool === 'move') {
                const pe = e.target.closest('.tb-piece');
                if (!pe) { this.selected = null; this.renderPieces(); return; }
                const id = pe.dataset.id, now = Date.now();
                if (this.lastTap.id === id && now - this.lastTap.t < 380) { this.lastTap = { id: null, t: 0 }; return this.renamePiece(id); }
                this.lastTap = { id, t: now };
                const p = this.current.pieces.find(x => x.id === id);
                this.checkpoint();
                this.selected = id;
                this.action = { kind: 'drag', id, dx: pt.x - p.x, dy: pt.y - p.y, moved: false };
                this.renderPieces();
            } else if (this.tool === 'eraser') {
                this.checkpoint();
                this.action = { kind: 'erase', changed: false };
                this.eraseAt(e);
            } else {
                this.checkpoint();
                this.action = { kind: 'stroke', d: { id: uid(), tool: this.tool, color: this.color, points: [pt.x, pt.y] } };
            }
        }

        move(e) {
            const a = this.action; if (!a) return;
            if (a.kind === 'drag') {
                const pt = this.toField(e), p = this.current.pieces.find(x => x.id === a.id); if (!p) return;
                p.x = Math.max(-0.8, Math.min(W + 0.8, pt.x - a.dx));
                p.y = Math.max(-0.8, Math.min(H + 0.8, pt.y - a.dy));
                a.moved = true;
                const g = this.pieceLayer.querySelector(`[data-id="${a.id}"]`);
                if (g) g.setAttribute('transform', `translate(${p.x} ${p.y})`);
                if (this.trash) this.trash.classList.toggle('hover', this.overTrash(e));
            } else if (a.kind === 'stroke') {
                const pt = this.toField(e), pts = a.d.points, tool = TOOLS[a.d.tool];
                if (tool.straight) { a.d.points = [pts[0], pts[1], pt.x, pt.y]; }
                else {
                    const last = [pts[pts.length - 2], pts[pts.length - 1]];
                    if (dist(last, [pt.x, pt.y]) >= 0.18) pts.push(pt.x, pt.y);
                    a.tail = [pt.x, pt.y];
                }
                const preview = clone(a.d); if (a.tail && !tool.straight) preview.points.push(...a.tail);
                this.tempLayer.innerHTML = ''; this.tempLayer.appendChild(this.drawingEl(preview));
            } else if (a.kind === 'erase') this.eraseAt(e);
        }

        up(e) {
            const a = this.action; if (!a) return;
            this.action = null;
            if (a.kind === 'drag') {
                if (this.trash) this.trash.classList.remove('hover');
                const p = this.current.pieces.find(x => x.id === a.id);
                if (a.external) {
                    const tap = Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 8;
                    if (tap) { const c = this.board.field === 'half' ? [30, 10] : [20, 10]; this.syncNew(a.id, c[0] + (Math.random() - .5) * 4, c[1] + (Math.random() - .5) * 4); }
                    else if (!this.overBoard(e) || this.overTrash(e)) { this.removePiece(a.id); this.discard(); this.render(); return; }
                    else this.syncNew(a.id, p.x, p.y);
                    this.selected = a.id;
                    return this.commit();
                }
                if (this.overTrash(e)) { this.removePiece(a.id); this.selected = null; return this.commit(); }
                if (!a.moved) { this.discard(); return; }
                return this.commit();
            }
            if (a.kind === 'stroke') {
                this.tempLayer.innerHTML = '';
                if (a.tail) a.d.points.push(...a.tail);
                const pts = pairs(a.d.points);
                if (pts.length < 2 || pathLength(pts) < 0.4) { this.discard(); return; }
                this.current.drawings.push(a.d);
                return this.commit();
            }
            if (a.kind === 'erase') { if (!a.changed) this.discard(); else this.commit(); }
        }

        /** Neue Figur: Position auch in den folgenden Phasen setzen */
        syncNew(id, x, y) { for (let i = this.phase; i < this.board.phases.length; i++) this.board.phases[i].pieces.forEach(p => { if (p.id === id) { p.x = x; p.y = y; } }); }

        eraseAt(e) {
            const hit = document.elementFromPoint(e.clientX, e.clientY);
            const target = hit && hit.closest && hit.closest('.tb-drawing, .tb-piece');
            if (!target || !this.svg.contains(target)) return;
            const id = target.dataset.id;
            if (target.classList.contains('tb-drawing')) this.current.drawings = this.current.drawings.filter(d => d.id !== id);
            else this.removePiece(id);
            this.action.changed = true;
            target.remove();
        }

        key(e) {
            if (e.target.matches('input, textarea, select')) return;
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
            else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) { this.checkpoint(); this.removePiece(this.selected); this.selected = null; this.commit(); }
        }

        /* ---------------------------------------------------- Rendern */
        render() {
            this.svg.setAttribute('viewBox', VIEW[this.board.field] || VIEW.full);
            this.legacyLayer.innerHTML = '';
            if (this.board.legacyImage && this.phase === 0) el('image', { href: this.board.legacyImage, x: -0.15, y: -0.15, width: W + .3, height: H + .3, preserveAspectRatio: 'none' }, this.legacyLayer);
            this.renderDrawings(this.current.drawings, this.drawProgress);
            this.renderGhosts();
            this.renderPieces();
            this.onChange('render');
        }

        /** progress = null → vollständig; 0…1 → Pfeile nur bis zu diesem Anteil (Abspielen) */
        renderDrawings(list, progress = null) {
            this.drawLayer.innerHTML = '';
            list.forEach(d => {
                const part = progress === null || progress === undefined ? d : partialDrawing(d, progress);
                if (part) this.drawLayer.appendChild(this.drawingEl(part));
            });
        }

        renderGhosts() {
            this.ghostLayer.innerHTML = '';
            if (!this.editable || this.phase === 0 || this.playing) return;
            const prev = this.board.phases[this.phase - 1].pieces;
            this.current.pieces.forEach(p => {
                const o = prev.find(x => x.id === p.id);
                if (!o || dist([o.x, o.y], [p.x, p.y]) < 0.3) return;
                el('line', { x1: o.x, y1: o.y, x2: p.x, y2: p.y, stroke: '#8a919c', 'stroke-width': .06, 'stroke-dasharray': '.2 .2' }, this.ghostLayer);
                const g = this.pieceEl(o); g.setAttribute('opacity', .22); g.classList.remove('tb-piece'); this.ghostLayer.appendChild(g);
            });
        }

        renderPieces(list = this.current.pieces) {
            this.pieceLayer.innerHTML = '';
            list.forEach(p => this.pieceLayer.appendChild(this.pieceEl(p)));
        }

        pieceEl(p) {
            const g = el('g', { class: 'tb-piece', 'data-id': p.id, transform: `translate(${p.x} ${p.y})` });
            const sel = this.selected === p.id;
            if (sel) el('circle', { r: 1.2, fill: 'none', stroke: '#1d6fe0', 'stroke-width': .1, 'stroke-dasharray': '.25 .15' }, g);
            const label = (fill, color = '#fff') => {
                if (!p.label) return;
                el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', y: .03, fill: color, 'font-size': p.label.length > 2 ? .6 : .78, 'font-weight': 800, 'font-family': 'Inter, system-ui, sans-serif' }, g).textContent = p.label;
            };
            switch (p.type) {
                case 'falcons': el('circle', { r: .85, fill: BRAND, stroke: '#111', 'stroke-width': .09 }, g); label(); break;
                case 'opponent': el('circle', { r: .85, fill: DARK, stroke: '#111', 'stroke-width': .09 }, g); label(); break;
                case 'falcons_gk': el('rect', { x: -.9, y: -.9, width: 1.8, height: 1.8, rx: .4, fill: BRAND, stroke: '#111', 'stroke-width': .09 }, g); label(); break;
                case 'opponent_gk': el('rect', { x: -.9, y: -.9, width: 1.8, height: 1.8, rx: .4, fill: DARK, stroke: '#111', 'stroke-width': .09 }, g); label(); break;
                case 'ball': el('circle', { r: .34, fill: '#ff9f1a', stroke: '#111', 'stroke-width': .07 }, g); break;
                case 'cone': el('path', { d: 'M0,-.62 L.56,.45 L-.56,.45 Z', fill: '#ff7a00', stroke: '#111', 'stroke-width': .07, 'stroke-linejoin': 'round' }, g); break;
            }
            // größere unsichtbare Trefferfläche für Finger
            el('circle', { r: p.type === 'ball' ? .5 : p.type === 'cone' ? .75 : 1.05, fill: 'transparent', class: 'tb-pad' }, g);
            return g;
        }

        drawingEl(d) {
            const tool = TOOLS[d.tool] || TOOLS.pen;
            let pts = pairs(d.points);
            const g = el('g', { class: 'tb-drawing', 'data-id': d.id });
            if (pts.length < 2) return g;
            const sw = d.tool === 'pen' ? .12 : .13;
            const common = { fill: 'none', stroke: d.color, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
            let dPath;
            if (tool.straight) { pts = [pts[0], pts[pts.length - 1]]; dPath = `M${pts[0]}L${pts[1]}`; }
            else if (d.tool === 'dribble') {
                // Welle entlang des Weges, letzte 0,7 m gerade für die Pfeilspitze
                const base = resample(pts, .08), out = []; let s = 0;
                const total = pathLength(base);
                for (let i = 0; i < base.length; i++) {
                    if (i) s += dist(base[i - 1], base[i]);
                    const a = base[Math.max(0, i - 1)], b = base[Math.min(base.length - 1, i + 1)];
                    const len = dist(a, b) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
                    const amp = total - s < .7 ? 0 : .2 * Math.sin(s * 2 * Math.PI / .8);
                    out.push([r2(base[i][0] + nx * amp), r2(base[i][1] + ny * amp)]);
                }
                dPath = 'M' + out.map(p => p.join(',')).join('L');
            } else dPath = smoothPath(pts);

            el('path', { d: dPath, ...common, ...(tool.dash ? { 'stroke-dasharray': '.45 .3' } : {}) }, g);
            if (tool.arrow) {
                const end = pts[pts.length - 1];
                let i = pts.length - 2; while (i > 0 && dist(pts[i], end) < .5) i--;
                const from = pts[i], len = dist(from, end) || 1, ux = (end[0] - from[0]) / len, uy = (end[1] - from[1]) / len;
                const L = .55, Wd = .3;
                el('path', { d: `M${end[0] + ux * .1},${end[1] + uy * .1} L${end[0] - ux * L - uy * Wd},${end[1] - uy * L + ux * Wd} L${end[0] - ux * L + uy * Wd},${end[1] - uy * L - ux * Wd}Z`, fill: d.color, stroke: d.color, 'stroke-width': .05, 'stroke-linejoin': 'round' }, g);
            }
            // breite unsichtbare Fläche → Radierer trifft auch dünne Linien
            el('path', { d: dPath, fill: 'none', stroke: 'transparent', 'stroke-width': .9, class: 'tb-hit' }, g);
            return g;
        }

        /* ---------------------------------------------------- Abspielen */
        stop() { if (this.playing) { this.playing.cancel = true; this.playing = null; this.drawProgress = null; this.render(); } }

        async play({ speed = 1 } = {}) {
            this.stop();
            const run = this.playing = { cancel: false };
            const phases = this.board.phases;
            let start = this.phase >= phases.length - 1 ? 0 : this.phase;
            this.selected = null;
            // Jede Phase: Aufstellung zeigen, dann wachsen die Pfeile gleichzeitig mit den laufenden Spielern
            for (let i = start; i < phases.length; i++) {
                if (run.cancel) return;
                this.phase = i; this.drawProgress = 0; this.render();
                await sleep(700 / speed);
                if (run.cancel) return;
                if (i < phases.length - 1) await this.tween(phases[i], phases[i + 1], 1500 / speed, run);
                else await this.tween(phases[i], phases[i], 1200 / speed, run); // letzte Phase: nur Pfeile ziehen
                if (run.cancel) return;
                this.drawProgress = null; this.renderDrawings(phases[i].drawings);
                await sleep(500 / speed);
            }
            if (this.playing === run) { this.playing = null; this.drawProgress = null; this.render(); }
        }

        /** Figuren von Phase a nach Phase b bewegen – entlang passender Laufwege/Pässe */
        tween(a, b, ms, run) {
            const routes = b.pieces.map(p => {
                const o = a.pieces.find(x => x.id === p.id);
                if (!o) return { p, route: null };
                const s = [o.x, o.y], t = [p.x, p.y];
                if (dist(s, t) < 0.05) return { p, route: [s] };
                // passende Zeichnung suchen: Ball bevorzugt Pässe, Spieler Laufwege/Dribblings
                let near = null, best = Infinity;
                a.drawings.forEach(d => {
                    if (!['run', 'dribble', 'pass'].includes(d.tool)) return;
                    const q = pairs(d.points), d1 = dist(q[0], s), d2 = dist(q[q.length - 1], t);
                    if (d1 > 1.8 || d2 > 1.8) return;
                    const fits = (p.type === 'ball') === (d.tool === 'pass');
                    const score = d1 + d2 + (fits ? 0 : 3);
                    if (score < best) { best = score; near = d; }
                });
                let route = near ? [s, ...(TOOLS[near.tool].straight ? [] : resample(pairs(near.points), .3)), t] : [s, t];
                return { p, route };
            });
            const gone = a.pieces.filter(o => !b.pieces.some(p => p.id === o.id));
            this.ghostLayer.innerHTML = '';
            return new Promise(resolve => {
                const t0 = performance.now();
                const frame = now => {
                    if (run.cancel) return resolve();
                    const k = Math.min((now - t0) / ms, 1), e = ease(k);
                    this.renderDrawings(a.drawings, e);
                    const list = routes.map(({ p, route }) => {
                        if (!route) return { ...p, _op: e };
                        const [x, y] = route.length === 1 ? route[0] : pointAt(route, e);
                        return { ...p, x, y };
                    }).concat(gone.map(o => ({ ...o, _op: 1 - e })));
                    this.pieceLayer.innerHTML = '';
                    list.forEach(p => { const g = this.pieceEl(p); if (p._op !== undefined) g.setAttribute('opacity', p._op); this.pieceLayer.appendChild(g); });
                    k < 1 ? requestAnimationFrame(frame) : resolve();
                };
                requestAnimationFrame(frame);
            });
        }
    }

    return { Board, PIECES, TOOLS, normalize, empty, W, H };
})();
