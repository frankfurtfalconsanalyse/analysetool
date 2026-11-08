// Tests für firestore.rules – Ausführen: siehe tests/rules/README.md
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, deleteField, arrayUnion, writeBatch } from 'firebase/firestore';

const RULES = process.env.RULES_FILE || new URL('../../firestore.rules', import.meta.url);
const env = await initializeTestEnvironment({ projectId: 'demo-falcons', firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 } });
const as = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore();
const anon = env.unauthenticatedContext().firestore();

let ok = 0, bad = 0;
async function t(name, p) { try { await p; ok++; } catch (e) { bad++; console.log('FAIL', name, '–', e.message.split('\n')[0]); } }

/* ===================================================== 1. Umstellung (alte Daten) */
await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'players/22'), { name: 'Coach', nr: '22', uid: 'u22' });
    await setDoc(doc(db, 'players/07'), { name: 'Max', nr: '07', uid: 'u07' });
    await setDoc(doc(db, 'players/31'), { name: 'Tim', nr: '31', uid: 'u31' });
    await setDoc(doc(db, 'admins/31'), { since: 1 });
    await setDoc(doc(db, 'sessions/s1'), { title: 'Alt' });
});
const legacy22 = as('u22', '22.0@falcons-hub.app'), legacy07 = as('u07', '07.0@falcons-hub.app');
await t('legacy player cannot read old data', assertFails(getDocs(collection(legacy07, 'sessions'))));
await t('legacy player cannot migrate', assertFails(setDoc(doc(legacy07, 'teams/herren/sessions/s1'), { title: 'x' })));
await t('legacy admin reads old data', assertSucceeds(getDocs(collection(legacy22, 'sessions'))));
await t('legacy admin migrates (batch)', assertSucceeds((() => {
    const b = writeBatch(legacy22);
    b.set(doc(legacy22, 'teams/herren/players/22'), { name: 'Coach', nr: '22', uid: 'u22', login: '22.0', role: 'coach', clubAdmin: true });
    b.set(doc(legacy22, 'teams/herren/players/07'), { name: 'Max', nr: '07', uid: 'u07', login: '07.0', role: 'player' });
    b.set(doc(legacy22, 'teams/herren/players/31'), { name: 'Tim', nr: '31', uid: 'u31', login: '31.0', role: 'coach', clubAdmin: true });
    b.set(doc(legacy22, 'teams/herren/sessions/s1'), { title: 'Alt' });
    return b.commit();
})()));
await t('legacy admin finishes migration', assertSucceeds(setDoc(doc(legacy22, 'teams/herren'), { name: 'Herren' })));
await t('migration closed afterwards', assertFails(setDoc(doc(as('u31', '31.0@falcons-hub.app'), 'teams/herren/players/99'), { name: 'x', uid: 'evil' })));
// Damen/Regio-Teams anlegen (Vereins-Admin) + Testdaten
await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'teams/damen'), { name: 'Damen' });
    await setDoc(doc(db, 'teams/regio'), { name: 'Herren Regio' });
    await setDoc(doc(db, 'teams/regio/players/22'), { name: 'Anderer 22', nr: '22', uid: 'r22', login: 'regio.22.0', role: 'coach' });
    await setDoc(doc(db, 'teams/regio/players/07'), { name: 'Max (Regio)', nr: '07' }); // frei
    await setDoc(doc(db, 'teams/regio/players/10'), { name: 'Lea?', nr: '10' });
    await setDoc(doc(db, 'teams/damen/players/05'), { name: 'Lisa', nr: '05', uid: 'd05', login: 'damen.05.0', role: 'player' });
    await setDoc(doc(db, 'users/u22'), { teams: { herren: '22' } });
    await setDoc(doc(db, 'users/u07'), { teams: { herren: '07' } });
    await setDoc(doc(db, 'users/r22'), { teams: { regio: '22' } });
    await setDoc(doc(db, 'users/d05'), { teams: { damen: '05' } });
    await setDoc(doc(db, 'teams/herren/comments/c1'), { videoId: 'v', text: 'x', authorNr: '22', mentions: ['07'], readBy: [] });
    await setDoc(doc(db, 'teams/herren/game_comments/g1'), { gameId: 'g', targetNr: '07', text: 'privat' });
    await setDoc(doc(db, 'teams/herren/game_comments/g2'), { gameId: 'g', targetNr: '31', text: 'privat' });
    await setDoc(doc(db, 'teams/herren/tactics/team1'), { title: 'T', visibility: 'team', ownerNr: '22' });
    await setDoc(doc(db, 'teams/herren/tactics/priv07'), { title: 'P', visibility: 'private', ownerNr: '07' });
    await setDoc(doc(db, 'teams/regio/sessions/rs1'), { title: 'Regio-Session' });
    await setDoc(doc(db, 'club_tactics/ct1'), { title: 'Vereinssystem', ownerTeam: 'herren' });
});

const coach = as('u22'), max = as('u07'), regioCoach = as('r22'), lisa = as('d05'), stranger = as('xx');

/* ========================================================== 2. Login / Mitgliedschaft */
await t('anon get player', assertSucceeds(getDoc(doc(anon, 'teams/herren/players/07'))));
await t('anon list players', assertFails(getDocs(collection(anon, 'teams/herren/players'))));
await t('anon read sessions', assertFails(getDocs(collection(anon, 'teams/herren/sessions'))));
await t('stranger (no user doc) reads', assertFails(getDocs(collection(stranger, 'teams/herren/sessions'))));
await t('fake user doc does not help', (async () => {
    await setDoc(doc(stranger, 'users/xx'), { teams: { herren: '07' } });
    await assertFails(getDocs(collection(stranger, 'teams/herren/sessions')));
})());
await t('user doc of others not readable', assertFails(getDoc(doc(max, 'users/u22'))));
await t('member reads own team', assertSucceeds(getDocs(collection(max, 'teams/herren/sessions'))));
await t('member cannot read other team', assertFails(getDocs(collection(max, 'teams/regio/sessions'))));
await t('same number other team is other person', assertFails(getDocs(collection(regioCoach, 'teams/herren/sessions'))));
// Team hinzufügen: Max verknüpft freie #07 in Regio
await t('link free number in other team', assertSucceeds(updateDoc(doc(max, 'teams/regio/players/07'), { uid: 'u07', login: '07.0' })));
await t('cannot take claimed number', assertFails(updateDoc(doc(max, 'teams/regio/players/22'), { uid: 'u07' })));
await t('claim cannot change name', assertFails(updateDoc(doc(lisa, 'teams/regio/players/10'), { uid: 'd05', name: 'Hack' })));
await t('cannot claim for someone else', assertFails(updateDoc(doc(lisa, 'teams/regio/players/10'), { uid: 'u07' })));
await setDoc(doc(max, 'users/u07'), { teams: { herren: '07', regio: '07' } });
await t('now member of both teams', assertSucceeds(getDocs(collection(max, 'teams/regio/sessions'))));
await t('player cannot rename self', assertFails(updateDoc(doc(max, 'teams/herren/players/07'), { name: 'X' })));
await t('player cannot make self coach', assertFails(updateDoc(doc(max, 'teams/herren/players/07'), { role: 'coach' })));

/* ================================================================ 3. Rollen */
await t('coach writes own team', assertSucceeds(addDoc(collection(regioCoach, 'teams/regio/sessions'), { title: 'x' })));
await t('coach cannot write other team', assertFails(addDoc(collection(regioCoach, 'teams/herren/sessions'), { title: 'x' })));
await t('coach cannot read other team', assertFails(getDocs(collection(regioCoach, 'teams/herren/sessions'))));
await t('coach promotes player', assertSucceeds(updateDoc(doc(regioCoach, 'teams/regio/players/07'), { role: 'coach' })));
await t('coach cannot grant club admin', assertFails(updateDoc(doc(regioCoach, 'teams/regio/players/07'), { clubAdmin: true })));
await t('coach resets pin', assertSucceeds(updateDoc(doc(regioCoach, 'teams/regio/players/07'), { uid: deleteField(), login: deleteField(), role: 'player' })));
await t('club admin reads all teams', assertSucceeds(getDocs(collection(coach, 'teams/damen/players'))));
await t('club admin writes other team', assertSucceeds(addDoc(collection(coach, 'teams/damen/sessions'), { title: 'x' })));
await t('club admin grants club admin', assertSucceeds(updateDoc(doc(coach, 'teams/damen/players/05'), { clubAdmin: true })));
await t('new club admin works', assertSucceeds(addDoc(collection(lisa, 'teams/regio/games'), { title: 'x' })));
await t('club admin creates team', assertSucceeds(setDoc(doc(coach, 'teams/damen'), { name: 'Damen 1' })));
await t('player cannot create team', assertFails(setDoc(doc(max, 'teams/neu'), { name: 'x' })));

/* ============================================================ 4. Kommentare */
await t('comment as self', assertSucceeds(addDoc(collection(max, 'teams/herren/comments'), { videoId: 'v', text: 'hi', authorNr: '07' })));
await t('comment as other', assertFails(addDoc(collection(max, 'teams/herren/comments'), { videoId: 'v', text: 'hi', authorNr: '22' })));
await t('mark read', assertSucceeds(updateDoc(doc(max, 'teams/herren/comments/c1'), { readBy: arrayUnion('07') })));
await t('edit others text', assertFails(updateDoc(doc(max, 'teams/herren/comments/c1'), { text: 'geändert' })));
await t('coach deletes comment', assertSucceeds(deleteDoc(doc(coach, 'teams/herren/comments/c1'))));

/* ===================================================== 5. Privates Feedback */
await t('own feedback', assertSucceeds(getDocs(query(collection(max, 'teams/herren/game_comments'), where('gameId', '==', 'g'), where('targetNr', '==', '07')))));
await t('others feedback', assertFails(getDocs(query(collection(max, 'teams/herren/game_comments'), where('gameId', '==', 'g'), where('targetNr', '==', '31')))));
await t('coach all feedback', assertSucceeds(getDocs(collection(coach, 'teams/herren/game_comments'))));
await t('coach of other team no feedback', assertFails(getDocs(collection(regioCoach, 'teams/herren/game_comments'))));

await t('player replies to own feedback', assertSucceeds(addDoc(collection(max, 'teams/herren/game_comments'), { gameId: 'g', targetNr: '07', authorNr: '07', parentId: 'g1', text: 'Danke!' })));
await t('player reply without parent', assertFails(addDoc(collection(max, 'teams/herren/game_comments'), { gameId: 'g', targetNr: '07', authorNr: '07', text: 'eigenes Feedback' })));
await t('player replies to others feedback', assertFails(addDoc(collection(max, 'teams/herren/game_comments'), { gameId: 'g', targetNr: '31', authorNr: '07', parentId: 'g2', text: 'x' })));
await t('player cannot delete coach feedback', assertFails(deleteDoc(doc(max, 'teams/herren/game_comments/g1'))));
await t('comment with drawing', assertSucceeds(addDoc(collection(max, 'teams/herren/comments'), { videoId: 'v', text: '0:00:12 hier', authorNr: '07', drawing: { strokes: [{ color: '#e30613', points: [0.1, 0.2, 0.3, 0.4] }], aspect: 1.78 }, drawingTime: 12 })));
await t('reply to clip comment', assertSucceeds(addDoc(collection(max, 'teams/herren/comments'), { videoId: 'v', parentId: 'x', text: 'ok', authorNr: '07' })));

/* ============================================================ 6. Fortschritt */
await t('own progress', assertSucceeds(setDoc(doc(max, 'teams/herren/progress/07'), { s1: 1 }, { merge: true })));
await t('after pin reset no access to that team', assertFails(setDoc(doc(max, 'teams/regio/progress/07'), { s1: 1 }, { merge: true })));
await t('others progress', assertFails(setDoc(doc(max, 'teams/herren/progress/22'), { s1: 1 })));
await t('coach lists progress', assertSucceeds(getDocs(collection(coach, 'teams/herren/progress'))));

/* ============================================================ 7. Taktik-Boards */
await t('team query', assertSucceeds(getDocs(query(collection(max, 'teams/herren/tactics'), where('visibility', '==', 'team')))));
await t('own query', assertSucceeds(getDocs(query(collection(max, 'teams/herren/tactics'), where('ownerNr', '==', '07')))));
await t('other team cannot list boards', assertFails(getDocs(collection(regioCoach, 'teams/herren/tactics'))));
await t('create private', assertSucceeds(addDoc(collection(max, 'teams/herren/tactics'), { title: 'x', ownerNr: '07', visibility: 'private' })));
await t('player create team board', assertFails(addDoc(collection(max, 'teams/herren/tactics'), { title: 'x', ownerNr: '07', visibility: 'team' })));
await t('player edit team board', assertFails(updateDoc(doc(max, 'teams/herren/tactics/team1'), { title: 'y' })));
await t('player edit own', assertSucceeds(updateDoc(doc(max, 'teams/herren/tactics/priv07'), { title: 'neu' })));
await t('coach edit team board', assertSucceeds(updateDoc(doc(coach, 'teams/herren/tactics/team1'), { title: 'z' })));
await t('coach edit private of player', assertFails(updateDoc(doc(coach, 'teams/herren/tactics/priv07'), { title: 'x' })));

/* ============================================ 8. Für alle Teams freigegeben */
await t('any member reads club boards', assertSucceeds(getDocs(collection(lisa, 'club_tactics'))));
await t('stranger cannot read club', assertFails(getDocs(collection(stranger, 'club_tactics'))));
await t('coach shares for own team', assertSucceeds(addDoc(collection(regioCoach, 'club_clips'), { title: 'c', ownerTeam: 'regio' })));
await t('coach shares as other team', assertFails(addDoc(collection(regioCoach, 'club_clips'), { title: 'c', ownerTeam: 'herren' })));
await t('player cannot share', assertFails(addDoc(collection(max, 'club_tactics'), { title: 'c', ownerTeam: 'herren' })));
await t('other team coach cannot edit', assertFails(updateDoc(doc(regioCoach, 'club_tactics/ct1'), { title: 'x' })));
await t('owner team coach edits', assertSucceeds(updateDoc(doc(coach, 'club_tactics/ct1'), { title: 'y' })));
await t('owner team coach deletes', assertSucceeds(deleteDoc(doc(coach, 'club_tactics/ct1'))));

console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen`);
await env.cleanup();
process.exit(bad ? 1 : 0);
