/* ==========================================================================
   Floorball-Spielfeld (Taktikboard + Anzeige in Sessions)
   Das Feld hat intern immer 960 × 560 px – so bleiben gespeicherte
   Positionen kompatibel. Für kleinere Bildschirme wird es per CSS skaliert.
   ========================================================================== */
const Rink = {
    W: 960,
    H: 560,

    /** Feldlinien als HTML */
    markup() {
        return `
            <div class="rink-line rink-center"></div>
            <div class="rink-circle"></div>
            <div class="rink-dot" style="left:50%;top:50%"></div>
            <div class="rink-crease" style="left:120px;border-left:none"></div>
            <div class="rink-goalarea" style="left:120px;border-left:none"></div>
            <div class="rink-goal" style="left:120px"></div>
            <div class="rink-crease" style="right:120px;border-right:none"></div>
            <div class="rink-goalarea" style="right:120px;border-right:none"></div>
            <div class="rink-goal" style="right:120px"></div>`;
    },

    /** Spielfigur erzeugen: type = 'falcons' | 'opponent' | 'ball' */
    createPiece(type, x, y) {
        const el = document.createElement('div');
        el.className = 'piece piece-' + type;
        el.dataset.type = type;
        el.textContent = type === 'ball' ? '' : (type === 'falcons' ? 'F' : 'G');
        el.style.left = x; el.style.top = y;
        return el;
    },

    /** Skaliert das Feld so, dass es in den Container passt. Gibt den Faktor zurück. */
    fit(container, rinkEl, padding = 16) {
        const s = Math.min((container.clientWidth - padding * 2) / this.W, (container.clientHeight - padding * 2) / this.H, 1.4);
        rinkEl.style.transform = `translate(-50%, -50%) scale(${Math.max(s, 0.1)})`;
        return Math.max(s, 0.1);
    },

    /** Gespeichertes Board (players + drawing) anzeigen */
    render(rinkEl, canvas, data) {
        if (!rinkEl.querySelector('.rink-center')) rinkEl.insertAdjacentHTML('afterbegin', this.markup());
        const layer = rinkEl.querySelector('.pieces');
        layer.innerHTML = '';
        (data.players || []).forEach(p => layer.appendChild(this.createPiece(p.type, p.x, p.y)));
        const ctx = canvas.getContext('2d');
        canvas.width = this.W; canvas.height = this.H;
        ctx.clearRect(0, 0, this.W, this.H);
        if (data.drawing) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = data.drawing; }
    }
};
