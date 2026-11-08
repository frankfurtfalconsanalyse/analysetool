# Falcons Analyse-Hub

Video-Analyse-Tool der **Frankfurt Falcons** (Floorball). Spieler sehen Sessions, Clips und Spiel-/Trainingsaufzeichnungen und bekommen persönliches Feedback. Trainer pflegen Inhalte, markieren Spieler und sehen, wer was angeschaut hat.

Reine statische Website (HTML/CSS/JS, kein Build-Schritt) – läuft z. B. direkt über GitHub Pages.
Daten liegen in **Firebase Firestore**, Drive-Clips kommen über ein **Google-Apps-Script**.
Mehrere Teams (Herren, Damen, Herren Regio) mit eigenem Kader und eigenen Inhalten – siehe [Teams](#teams).

## Seiten

| Datei | Zweck | Wer |
|---|---|---|
| `index.html` | Login (Trikotnummer + PIN) und Dashboard: neueste Session, Markierungen, Sessions, Clip-Bibliothek | alle |
| `session_view.html?id=…` | Session-Player: Clips/Taktik-Boards der Reihe nach, mit Kommentaren | alle |
| `analyze.html?id=…&type=youtube\|drive` | Analyse-Modus für einen Clip: groß, mit Zeichnen und Kommentaren | alle |
| `recordings.html?type=games\|trainings` | Übersicht der Spiel- und Trainingsaufzeichnungen | alle |
| `recording_view.html?type=game\|training&id=…` | Aufzeichnung mit Ereignis-Timeline und privatem Feedback | alle (Eintragen: Admin) |
| `tactic.html?id=…` | Taktikboard: Figuren, Zeichenwerkzeuge, Phasen + Abspielen; Team-Boards und private „Meine Boards“ | alle (Team-Boards: Admin) |
| `opponents.html?id=…` | Gegner-Scouting: Bericht, Spiele + Bilanz, Boards und Clips je Gegner | alle (Pflege: Coach) |
| `stats.html` | Meine Szenen (markierte Ereignisse/Clips) und Team-Statistik pro Saison | alle |
| `admin.html` | Verwaltung des aktuellen Teams: Status-Check, Sessions, Clips, Spiele, Trainings, Kader/Rollen | Coach |
| `help.html` | Anleitung | alle |

## Gemeinsamer Code

```
assets/
  css/app.css     Design-System (Farben, Buttons, Karten, Layouts) – für alle Seiten
  js/config.js    Firebase-Konfiguration, Teams (inkl. Drive-Script-URL je Team), Kategorien/Positionen
  js/core.js      Login, Teams/Rollen, Navigation, Kommentar-Formatierung, Clip-Bibliothek
  js/migrate.js   Einmalige Umstellung der alten Daten auf Teams
  js/player.js   Video-Player (Zeitlupe, Bild für Bild, A–B-Schleife, Tastenkürzel)
  js/tactic-board.js  Taktikboard-Engine (SVG-Feld, Figuren, Werkzeuge, Phasen, Animation)
  img/favicon.svg
```

Neue Kategorien/Positionen → nur `assets/js/config.js` ändern.

## Teams

Der Hub ist in Teams aufgeteilt: **Herren**, **Damen**, **Herren Regio** (Liste in `assets/js/config.js`).
Jedes Team hat einen eigenen Kader, eigene Sessions, Clips, Spiele, Trainings, Kommentare und Taktik-Boards.
Trikotnummern gelten nur innerhalb eines Teams – #22 bei den Herren ist nicht #22 in der Regio.

- **Login:** Team wählen → Trikotnummer → PIN.
- **Mehrere Teams:** Wer in zwei Teams spielt, verknüpft das zweite Team im Menü → *Weiteres Team verknüpfen*
  (Team + eigene Nummer dort). Danach gilt überall dieselbe PIN, gewechselt wird über den Team-Umschalter oben.
- **Rollen:** *Spieler* · *Coach* (verwaltet sein Team, Rolle im Kader einstellbar) ·
  *Vereins-Admin* (sieht und verwaltet alle Teams, kann weitere Vereins-Admins ernennen).
- **Für alle Teams freigeben:** YouTube-Clips (Verwaltung → Clips) und Taktik-Boards (Sichtbar für → *Alle Teams*).
  Bearbeiten dürfen das nur die Coaches des Teams, das es freigegeben hat.
- **Neues Team:** in `assets/js/config.js` (Liste `teams`) **und** in `firestore.rules` (`isClubAdmin`, `isAnyMember`, `isAnyCoach`) ergänzen.

## Datenmodell (Firestore)

| Pfad | Inhalt |
|---|---|
| `teams/{team}` | Team-Infos (`name`) |
| `teams/{team}/players/{nr}` | `name`, `nr`, `role` (`player`/`coach`), `clubAdmin`, `uid` + `login` (verknüpftes Login-Konto), `authVersion` |
| `users/{uid}` | `teams: { herren: '22', regio: '07' }` – Nummer des Kontos je Team |
| `teams/{team}/youtube_clips` | `title`, `ytId`, `startTime`, `endTime`, `category`, `position`, `players[]`, `source` (Spiel/Training), `opponentId` |
| `teams/{team}/video_metadata/{driveId}` | `position` für Drive-Clips |
| `teams/{team}/sessions` | `title`, `description`, `videoIds[]` (Clip- oder Taktik-IDs), `dueDate`, `createdAt` |
| `teams/{team}/comments` | Kommentare zu Clips: `videoId`, `text`, `author`, `authorNr`, `mentions[]`, `readBy[]`, `parentId` (Antwort), `drawing` + `drawingTime` |
| `teams/{team}/games` · `trainings` | `title`, `ytId`, `date`; Spiele zusätzlich `opponentId`, `scoreFor`, `scoreAgainst` |
| `teams/{team}/opponents` | Gegner: `name`, `strengths`, `weaknesses`, `keyPlayers`, `plan` |
| `teams/{team}/game_events` · `training_events` | Timeline: `gameId`/`trainingId`, `type` (nur Spiele), `time`, `sec`, `desc`, `scorer`, `assist`, `onIce[]`, `players[]` |
| `teams/{team}/game_comments` · `training_comments` | privates Feedback: `targetNr`, `text`, `author` |
| `teams/{team}/tactics` | Taktik-Boards: `title`, `category`, `field`, `visibility` (`team`/`private`), `ownerNr`, `phases[]` |
| `teams/{team}/progress/{nr}` | Session-Fortschritt `{ sessionId: angesehene Clips }` |
| `teams/{team}/video_views` · `game_views` · `training_views` `/{nr}` | `{ id: true }` – gesehen (Status-Check) |
| `club_clips` · `club_tactics` | für alle Teams freigegebene Clips/Boards, `ownerTeam` = freigebendes Team |

Die alten Collections ohne Team (`players`, `sessions`, …) bleiben nach der Umstellung als Sicherung erhalten
und werden von der App nicht mehr benutzt.

## Text-Konventionen in Kommentaren

- `@19` wird beim Senden zu `@19 | Name*` aufgelöst und blau dargestellt; `mentions` enthält `"19"` (Nummer im Team).
- `0:15:30` (H:MM:SS) wird zum klickbaren Zeitstempel.

## Login & Sicherheit

- Login über **Firebase Authentication**: Ein Konto hat die technische E-Mail `<login>@falcons-hub.app`
  (`login` steht im Kader-Eintrag), die PIN ist (mit Präfix) das Passwort. Die PIN steht nirgends in der Datenbank.
- Mitglied eines Teams ist, wessen Konto-ID in `teams/{team}/players/{nr}.uid` steht.
- **PIN-Reset** (Verwaltung → Kader) löst die Verknüpfung in *diesem* Team; der Spieler legt beim nächsten Login dort
  eine neue PIN fest. Andere Teams bleiben unverändert.
- **`firestore.rules`**: Nur Mitglieder sehen ihr Team, nur Coaches pflegen es, Vereins-Admins dürfen alles.
  Privates Feedback sieht nur der betroffene Spieler, private Boards nur ihr Ersteller.
- Bekannte Grenze: Eine Nummer, die sich noch nie angemeldet hat, kann von jedem beansprucht werden, der sie kennt.
  Fällt das auf, PIN im Kader zurücksetzen.
- Die Regeln sind mit dem Firestore-Emulator getestet (`tests/rules`, 75 Fälle).

### Umstellung auf Teams (einmalig)

1. In der Firebase-Konsole → *Firestore Database* → *Regeln* den Inhalt von `firestore.rules` einfügen → **Veröffentlichen**.
2. Die neue Version der Website veröffentlichen (auf `main` pushen).
3. Ein bisheriger Admin (z. B. #22) meldet sich an und klickt **„Umstellung starten“**. Alle Daten werden nach
   *Herren* kopiert, alle behalten ihre PIN, bisherige Admins werden Vereins-Admins.
4. Coaches für Damen/Regio: Ein Vereins-Admin wechselt oben ins Team, legt dort den Kader an und setzt die Rolle *Coach*.
