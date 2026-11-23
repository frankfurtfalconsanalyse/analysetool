/**
 * Falcons Analyse-Hub – Saisonmanager-Dienst (Google Apps Script)
 * ----------------------------------------------------------------
 * Holt die Spieldaten (Tore, Strafen, Spielstand, Kader, Livestream-Link) eines Spiels
 * aus dem Floorball-Saisonmanager und gibt sie als JSON an den Analyse-Hub weiter.
 * Nötig, weil der Saisonmanager keine direkten Abrufe von anderen Webseiten erlaubt.
 *
 * Einrichtung (einmalig, ca. 3 Minuten):
 *  1. https://script.google.com → „Neues Projekt“ → diesen Code komplett einfügen → Speichern
 *  2. „Bereitstellen“ → „Neue Bereitstellung“ → Typ „Web-App“
 *     - Ausführen als: Ich
 *     - Zugriff: Jeder
 *  3. „Bereitstellen“ → Zugriff erlauben → die Web-App-URL (…/exec) kopieren
 *  4. Im Analyse-Hub als Vereins-Admin: Verwaltung → Spiele → „Saisonmanager-Verbindung“ → URL einfügen → Speichern
 *
 * Test im Browser: <Web-App-URL>?game=58691
 */

function doGet(e) {
  var id = String((e && e.parameter && (e.parameter.game || e.parameter.id)) || '').replace(/\D/g, '');
  if (!id) return json_({ error: 'Parameter game fehlt (Spiel-ID aus dem Saisonmanager-Link).' });

  var cache = CacheService.getScriptCache();
  var cached = cache.get('game-' + id);
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

  try {
    var game = fetchGame_(id);
    var body = JSON.stringify(trimGame_(game));
    // laufende Spiele kurz, beendete länger zwischenspeichern
    cache.put('game-' + id, body, game.ended ? 3600 : 60);
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

/** Öffentliche Sitzung anlegen (wie die Saisonmanager-Webseite) und Spiel laden */
function fetchGame_(id) {
  var base = 'https://saisonmanager.de/api/v2/';
  var session = UrlFetchApp.fetch(base + 'public_session', {
    method: 'post', contentType: 'application/json', payload: '{}', muteHttpExceptions: true
  });
  var setCookie = session.getAllHeaders()['Set-Cookie'] || [];
  if (typeof setCookie === 'string') setCookie = [setCookie];
  var cookie = setCookie.map(function (c) { return String(c).split(';')[0]; }).join('; ');

  var res = UrlFetchApp.fetch(base + 'games/' + id + '.json', {
    headers: { Cookie: cookie, Accept: 'application/json' }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Saisonmanager antwortet mit ' + res.getResponseCode() + ' für Spiel ' + id);
  return JSON.parse(res.getContentText());
}

/** Nur die Felder, die der Analyse-Hub braucht */
function trimGame_(g) {
  var players = function (list) {
    return (list || []).map(function (p) {
      return { nr: p.trikot_number, first: p.player_firstname || '', last: p.player_name || '', position: p.position || '' };
    });
  };
  var r = g.result || {};
  return {
    id: g.id,
    date: g.date,
    startTime: g.start_time,
    actualStartTime: g.actual_start_time,
    league: g.league_name,
    status: g.game_status,
    ended: !!g.ended,
    home: { name: g.home_team_name, short: g.home_team_short_name },
    guest: { name: g.guest_team_name, short: g.guest_team_short_name },
    result: {
      home: r.home_goals, guest: r.guest_goals,
      homePeriods: r.home_goals_period || [], guestPeriods: r.guest_goals_period || [],
      overtime: !!r.overtime, postfix: (r.postfix && r.postfix.short) || ''
    },
    video: g.vod_link || g.live_stream_link || '',
    periods: (g.period_titles || []).filter(function (p) { return p.period === Math.floor(p.period); })
      .map(function (p) { return { period: p.period, title: p.title }; }),
    events: (g.events || []).map(function (e) {
      return {
        id: e.event_id, type: e.event_type, team: e.event_team, period: e.period, time: e.time,
        home: e.home_goals, guest: e.guest_goals,
        number: e.number || null, assist: e.assist || null,
        goalType: e.goal_type_string || '', penalty: e.penalty_type_string || '', reason: e.penalty_reason_string || ''
      };
    }),
    players: { home: players(g.players && g.players.home), guest: players(g.players && g.players.guest) }
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
