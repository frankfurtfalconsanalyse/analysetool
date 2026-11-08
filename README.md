# Falcons Analyse-Hub

Video-Analyse-Tool der **Frankfurt Falcons** (Floorball). Spieler sehen Sessions, Clips und Spiel-/Trainingsaufzeichnungen und bekommen persönliches Feedback. Trainer pflegen Inhalte, markieren Spieler und sehen, wer was angeschaut hat.

Reine statische Website (HTML/CSS/JS, kein Build-Schritt) – läuft z. B. direkt über GitHub Pages.
Daten liegen in **Firebase Firestore**, Drive-Clips kommen über ein **Google-Apps-Script**.

## Seiten

| Datei | Zweck | Wer |
|---|---|---|
| `index.html` | Login (Trikotnummer + PIN) und Dashboard: neueste Session, Markierungen, Sessions, Clip-Bibliothek | alle |
| `session_view.html?id=…` | Session-Player: Clips/Taktik-Boards der Reihe nach, mit Kommentaren | alle |
| `analyze.html?id=…&type=youtube\|drive` | Analyse-Modus für einen Clip: groß, mit Zeichnen und Kommentaren | alle |
| `recordings.html?type=games\|trainings` | Übersicht der Spiel- und Trainingsaufzeichnungen | alle |
| `recording_view.html?type=game\|training&id=…` | Aufzeichnung mit Ereignis-Timeline und privatem Feedback | alle (Eintragen: Admin) |
| `tactic.html?id=…` | Taktikboard: Figuren, Zeichenwerkzeuge, Phasen + Abspielen; Team-Boards und private „Meine Boards“ | alle (Team-Boards: Admin) |
| `admin.html` | Verwaltung: Status-Check, Sessions, Clips, Spiele, Trainings, Kader/Admins | Admin |
| `help.html` | Anleitung | alle |

## Gemeinsamer Code

```
assets/
  css/app.css     Design-System (Farben, Buttons, Karten, Layouts) – für alle Seiten
  js/config.js    Firebase-Konfiguration, Drive-Script-URL, Haupt-Admin, Kategorien/Positionen
  js/core.js      Login-Status, Admin-Prüfung, Navigation, Kommentar-Formatierung, Clip-Bibliothek
  js/tactic-board.js  Taktikboard-Engine (SVG-Feld, Figuren, Werkzeuge, Phasen, Animation)
  img/favicon.svg
```

Neue Kategorien/Positionen → nur `assets/js/config.js` ändern. Die Admin-Nummer steht zusätzlich in `firestore.rules`.

## Datenmodell (Firestore-Collections)

| Collection | Inhalt |
|---|---|
| `players/{nr}` | `name`, `nr`, `uid` (verknüpftes Login-Konto), `authVersion` – Dokument-ID = zweistellige Trikotnummer |
| `admins/{nr}` | existiert = Admin (zusätzlich zu `superAdminNr` aus der Config) |
| `youtube_clips` | `title`, `ytId`, `startTime`, `category`, `position` |
| `video_metadata/{driveId}` | `position` für Drive-Clips |
| `sessions` | `title`, `description`, `videoIds[]` (Clip- oder Taktik-IDs), `createdAt` |
| `comments` | Kommentare zu Clips: `videoId`, `text`, `author`, `authorNr`, `mentions[]`, `readBy[]` |
| `games` / `trainings` | `title`, `ytId`, `date` |
| `game_events` / `training_events` | Timeline: `gameId`/`trainingId`, `type` (nur Spiele), `time`, `sec`, `desc` |
| `game_comments` / `training_comments` | privates Feedback: `targetNr`, `text`, `author` |
| `tactics` | Taktik-Boards: `title`, `category`, `field`, `visibility` (`team`/`private`), `ownerNr`, `phases[]` (Figuren + Zeichnungen in Metern) |
| `progress/{nr}` | Session-Fortschritt `{ sessionId: angesehene Clips }` |
| `video_views` / `game_views` / `training_views` `/{nr}` | `{ id: true }` – gesehen (für den Status-Check) |

## Text-Konventionen in Kommentaren

- `@19` wird beim Senden zu `@19 | Name*` aufgelöst und blau dargestellt; `mentions` enthält `"19"`.
- `0:15:30` (H:MM:SS) wird zum klickbaren Zeitstempel.

## Login & Sicherheit

- Login über **Firebase Authentication**: Jeder Spieler hat ein Konto mit der technischen E-Mail
  `<nr>.<authVersion>@falcons-hub.app`, die PIN ist (mit Präfix) das Passwort. Die PIN steht nirgends in der Datenbank.
- `players/{nr}.uid` verknüpft Nummer und Konto. **PIN-Reset** (Verwaltung → Kader) löscht `uid` und erhöht `authVersion`
  → der Spieler legt beim nächsten Login ein neues Konto an.
- **`firestore.rules`** regelt, wer was lesen/schreiben darf: nur angemeldete Spieler sehen Inhalte, nur Trainer pflegen sie,
  privates Feedback sieht nur der betroffene Spieler, private Taktik-Boards nur ihr Ersteller.
- Bekannte Grenze: Eine Nummer, die sich noch nie angemeldet hat, kann von jedem beansprucht werden, der sie kennt
  (wie bisher). Fällt das auf, PIN im Kader zurücksetzen.

### Einrichtung (einmalig, in dieser Reihenfolge)

1. **Firebase-Konsole** → Projekt `falcons-video-tool` → *Authentication* → *Jetzt starten* → *Sign-in method* →
   **E-Mail/Passwort** aktivieren (nur die erste Option, ohne „E-Mail-Link“).
2. Die neue Version der Website veröffentlichen (Pull Request mergen).
3. **Alle melden sich einmal neu an** und wählen eine PIN (gern dieselbe wie vorher). Am besten zuerst #22.
4. Als Admin: *Verwaltung → Kader* → **„alte PINs aus der Datenbank löschen“** klicken.
   Einmal *Verwaltung* öffnen stellt außerdem alte Taktik-Boards auf das neue Format um.
5. **Firebase-Konsole** → *Firestore Database* → *Regeln* → Inhalt von `firestore.rules` einfügen → **Veröffentlichen**.

Die Regeln sind mit dem Firestore-Emulator getestet (45 Fälle: Login/Claim, Rollen, Kommentare,
privates Feedback, Fortschritt, Taktik-Boards).
