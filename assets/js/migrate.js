/* ==========================================================================
   Einmalige Umstellung auf Teams
   Kopiert alle bisherigen Daten (alte Collections ohne Team) nach teams/herren/…
   Die alten Daten bleiben unverändert als Sicherung bestehen.
   Darf nur ein bisheriger Admin ausführen (siehe firestore.rules → migrating()).
   ========================================================================== */
const FalconsMigration = (() => {
    const COLLECTIONS = ['players', 'youtube_clips', 'video_metadata', 'sessions', 'games', 'trainings',
        'game_events', 'training_events', 'comments', 'game_comments', 'training_comments',
        'progress', 'video_views', 'game_views', 'training_views', 'tactics'];

    /** Ist der angemeldete Nutzer ein Admin der alten Struktur? */
    async function isLegacyAdmin(fbUser) {
        const nr = String(fbUser.email || '').split('@')[0].split('.')[0];
        try {
            const p = await db.collection('players').doc(nr).get();
            if (!p.exists || p.data().uid !== fbUser.uid) return false;
            if (nr === '22') return true;
            return (await db.collection('admins').doc(nr).get()).exists;
        } catch (e) { return false; }
    }

    async function run(fbUser, onProgress = () => {}) {
        const team = FALCONS_CONFIG.teams[0].id;
        const myNr = String(fbUser.email || '').split('@')[0].split('.')[0];
        const adminNrs = new Set(['22', ...(await db.collection('admins').get()).docs.map(d => d.id)]);

        // alles lesen
        const data = {};
        for (const col of COLLECTIONS) {
            onProgress(`Lese ${col} …`);
            data[col] = (await db.collection(col).get()).docs.map(d => ({ id: d.id, data: d.data() }));
        }

        // Kader umbauen: Login-Konto bleibt erhalten, alte PINs fallen weg, Admins → Coach + Vereins-Admin
        data.players = data.players.map(({ id, data: p }) => {
            const out = { name: p.name || '', nr: id, role: adminNrs.has(id) ? 'coach' : 'player' };
            if (adminNrs.has(id)) out.clubAdmin = true;
            if (p.uid) { out.uid = p.uid; out.login = `${id}.${p.authVersion || 0}`; }
            if (p.authVersion) out.authVersion = p.authVersion;
            return { id, data: out };
        });
        // alte Taktik-Boards ohne Sichtbarkeit → Team-Board
        data.tactics = data.tactics.map(({ id, data: t }) => ({ id, data: { ...t, visibility: t.visibility || 'team' } }));

        // schreiben (Batches à 400)
        const writes = [];
        COLLECTIONS.forEach(col => data[col].forEach(d => writes.push([db.collection('teams').doc(team).collection(col).doc(d.id), d.data])));
        for (let i = 0; i < writes.length; i += 400) {
            onProgress(`Schreibe ${Math.min(i + 400, writes.length)} von ${writes.length} …`);
            const b = db.batch();
            writes.slice(i, i + 400).forEach(([ref, d]) => b.set(ref, d));
            await b.commit();
        }

        // eigenes Konto zuordnen, dann Teams anlegen (Herren zuletzt → schließt die Umstellung ab)
        await db.collection('users').doc(fbUser.uid).set({ teams: { [team]: myNr } }, { merge: true });
        for (const t of FALCONS_CONFIG.teams.slice(1)) await db.collection('teams').doc(t.id).set({ name: t.name, createdAt: new Date() });
        await db.collection('teams').doc(team).set({ name: FALCONS_CONFIG.teams[0].name, migratedAt: new Date() });
        localStorage.setItem('falcons_user', JSON.stringify({ uid: fbUser.uid, team, nr: myNr, name: '' }));
        onProgress('Fertig.');
        return writes.length;
    }

    return { isLegacyAdmin, run };
})();
