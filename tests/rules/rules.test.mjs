// Tests für firestore.rules – Ausführen: siehe tests/rules/README.md
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, deleteField, arrayUnion } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-falcons', firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, 'players/22'), { name: 'Coach', nr: '22', uid: 'u22' });
  await setDoc(doc(db, 'players/07'), { name: 'Max', nr: '07', uid: 'u07', authVersion: 1 });
  await setDoc(doc(db, 'players/19'), { name: 'Jonas', nr: '19', pin: '1234' });
  await setDoc(doc(db, 'players/31'), { name: 'Tim', nr: '31', uid: 'u31' });
  await setDoc(doc(db, 'admins/31'), { since: 1 });
  await setDoc(doc(db, 'sessions/s1'), { title: 'S', videoIds: [] });
  await setDoc(doc(db, 'comments/c1'), { videoId: 'v', text: 'x', authorNr: '22', mentions: ['07'], readBy: [] });
  await setDoc(doc(db, 'game_comments/g1'), { gameId: 'g', targetNr: '07', text: 'privat' });
  await setDoc(doc(db, 'game_comments/g2'), { gameId: 'g', targetNr: '19', text: 'privat' });
  await setDoc(doc(db, 'tactics/team1'), { title: 'T', visibility: 'team', ownerNr: '22' });
  await setDoc(doc(db, 'tactics/legacy'), { title: 'Alt' });
  await setDoc(doc(db, 'tactics/priv07'), { title: 'P', visibility: 'private', ownerNr: '07' });
  await setDoc(doc(db, 'progress/07'), { s1: 1 });
});
const as = (uid, email) => env.authenticatedContext(uid, { email }).firestore();
const anon = env.unauthenticatedContext().firestore();
const coach = as('u22', '22.0@falcons-hub.app');
const max = as('u07', '07.1@falcons-hub.app');
const maxOld = as('old07', '07.0@falcons-hub.app');      // altes Konto nach PIN-Reset
const fake = as('evil', '07.1@evil.com');                // fremdes Konto mit gleicher Nummer
const adm31 = as('u31', '31.0@falcons-hub.app');
const jonasNew = as('u19', '19.0@falcons-hub.app');      // erster Login von #19

let ok = 0, bad = 0;
async function t(name, p) { try { await p; ok++; } catch (e) { bad++; console.log('FAIL', name, e.message.split('\n')[0]); } }

// Login-Seite
await t('anon get player', assertSucceeds(getDoc(doc(anon, 'players/07'))));
await t('anon list players', assertFails(getDocs(collection(anon, 'players'))));
await t('anon read sessions', assertFails(getDocs(collection(anon, 'sessions'))));
// Erster Login / Claim
await t('claim own', assertSucceeds(updateDoc(doc(jonasNew, 'players/19'), { uid: 'u19', pin: deleteField() })));
await t('claim already claimed', assertFails(updateDoc(doc(as('x', '07.1@falcons-hub.app'), 'players/07'), { uid: 'x' })));
await t('claim other nr', assertFails(updateDoc(doc(as('y', '22.0@falcons-hub.app'), 'players/31'), { uid: 'y' })));
await t('member rename self', assertFails(updateDoc(doc(max, 'players/07'), { name: 'Hacker' })));
// Mitgliedschaft
await t('member list players', assertSucceeds(getDocs(collection(max, 'players'))));
await t('old account after reset', assertFails(getDocs(collection(maxOld, 'sessions'))));
await t('fake same number', assertFails(getDocs(collection(fake, 'sessions'))));
await t('member read sessions', assertSucceeds(getDocs(collection(max, 'sessions'))));
await t('member write session', assertFails(addDoc(collection(max, 'sessions'), { title: 'x' })));
await t('admin write session', assertSucceeds(addDoc(collection(coach, 'sessions'), { title: 'x' })));
await t('admin via admins coll', assertSucceeds(addDoc(collection(adm31, 'games'), { title: 'x' })));
await t('member make self admin', assertFails(setDoc(doc(max, 'admins/07'), { since: 1 })));
await t('admin reset pin', assertSucceeds(updateDoc(doc(coach, 'players/31'), { uid: deleteField(), authVersion: 1 })));
await setDoc(doc(coach, 'players/31'), { name: 'Tim', nr: '31', uid: 'u31' }).catch(() => {});
// Kommentare
await t('comment as self', assertSucceeds(addDoc(collection(max, 'comments'), { videoId: 'v', text: 'hi', authorNr: '07' })));
await t('comment as other', assertFails(addDoc(collection(max, 'comments'), { videoId: 'v', text: 'hi', authorNr: '22' })));
await t('mark read', assertSucceeds(updateDoc(doc(max, 'comments/c1'), { readBy: arrayUnion('07') })));
await t('edit others text', assertFails(updateDoc(doc(max, 'comments/c1'), { text: 'changed' })));
await t('delete others comment', assertFails(deleteDoc(doc(max, 'comments/c1'))));
// Privates Feedback
await t('own private feedback', assertSucceeds(getDocs(query(collection(max, 'game_comments'), where('gameId', '==', 'g'), where('targetNr', '==', '07')))));
await t('others private feedback', assertFails(getDocs(query(collection(max, 'game_comments'), where('gameId', '==', 'g'), where('targetNr', '==', '19')))));
await t('all feedback as player', assertFails(getDocs(collection(max, 'game_comments'))));
await t('admin all feedback', assertSucceeds(getDocs(collection(coach, 'game_comments'))));
// Fortschritt
await t('own progress write', assertSucceeds(setDoc(doc(max, 'progress/07'), { s1: 2 }, { merge: true })));
await t('other progress write', assertFails(setDoc(doc(max, 'progress/22'), { s1: 2 })));
await t('other progress read', assertFails(getDoc(doc(max, 'progress/22'))));
await t('admin list progress', assertSucceeds(getDocs(collection(coach, 'progress'))));
// Taktik
await t('player team query', assertSucceeds(getDocs(query(collection(max, 'tactics'), where('visibility', '==', 'team')))));
await t('player own query', assertSucceeds(getDocs(query(collection(max, 'tactics'), where('ownerNr', '==', '07')))));
await t('other player get private', assertFails(getDoc(doc(jonasNew, 'tactics/priv07'))));
await t('other player list all (contains private of 07)', assertFails(getDocs(collection(jonasNew, 'tactics'))));
await t('player read others private', assertFails(getDoc(doc(as('u31b', '19.0@falcons-hub.app'), 'tactics/priv07'))));
await t('player create private', assertSucceeds(addDoc(collection(max, 'tactics'), { title: 'x', ownerNr: '07', visibility: 'private' })));
await t('player create team', assertFails(addDoc(collection(max, 'tactics'), { title: 'x', ownerNr: '07', visibility: 'team' })));
await t('player edit team board', assertFails(updateDoc(doc(max, 'tactics/team1'), { title: 'y' })));
await t('player edit own', assertSucceeds(updateDoc(doc(max, 'tactics/priv07'), { title: 'neu' })));
await t('player publish own to team', assertFails(updateDoc(doc(max, 'tactics/priv07'), { visibility: 'team' })));
await t('admin list all tactics', assertSucceeds(getDocs(collection(coach, 'tactics'))));
await t('admin migrate legacy', assertSucceeds(updateDoc(doc(coach, 'tactics/legacy'), { visibility: 'team' })));
await t('admin edit team', assertSucceeds(updateDoc(doc(adm31, 'tactics/team1'), { title: 'z' })));
await t('admin create team', assertSucceeds(addDoc(collection(coach, 'tactics'), { title: 'x', ownerNr: '22', visibility: 'team' })));
await t('admin edit private of player', assertFails(updateDoc(doc(coach, 'tactics/priv07'), { title: 'x' })));
await t('player delete own', assertSucceeds(deleteDoc(doc(max, 'tactics/priv07'))));

console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen`);
await env.cleanup();
process.exit(bad ? 1 : 0);
