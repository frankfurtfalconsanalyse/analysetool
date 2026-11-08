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
| `tactic.html` | Taktikboard (Figuren + Zeichnen), Boards lassen sich in Sessions einbauen | Admin |
| `admin.html` | Verwaltung: Status-Check, Sessions, Clips, Spiele, Trainings, Kader/Admins | Admin |
| `help.html` | Anleitung | alle |

## Gemeinsamer Code

```
assets/
  css/app.css     Design-System (Farben, Buttons, Karten, Layouts) – für alle Seiten
  js/config.js    Firebase-Konfiguration, Drive-Script-URL, Haupt-Admin, Kategorien/Positionen
  js/core.js      Login-Status, Admin-Prüfung, Navigation, Kommentar-Formatierung, Clip-Bibliothek
  js/rink.js      Floorball-Spielfeld (Taktikboard + Anzeige in Sessions)
  img/favicon.svg
```

Neue Kategorien/Positionen oder eine andere Admin-Nummer → nur `assets/js/config.js` ändern.

## Datenmodell (Firestore-Collections)

| Collection | Inhalt |
|---|---|
| `players/{nr}` | `name`, `nr`, `pin` – Dokument-ID = zweistellige Trikotnummer |
| `admins/{nr}` | existiert = Admin (zusätzlich zu `superAdminNr` aus der Config) |
| `youtube_clips` | `title`, `ytId`, `startTime`, `category`, `position` |
| `video_metadata/{driveId}` | `position` für Drive-Clips |
| `sessions` | `title`, `description`, `videoIds[]` (Clip- oder Taktik-IDs), `createdAt` |
| `comments` | Kommentare zu Clips: `videoId`, `text`, `author`, `authorNr`, `mentions[]`, `readBy[]` |
| `games` / `trainings` | `title`, `ytId`, `date` |
| `game_events` / `training_events` | Timeline: `gameId`/`trainingId`, `type` (nur Spiele), `time`, `sec`, `desc` |
| `game_comments` / `training_comments` | privates Feedback: `targetNr`, `text`, `author` |
| `tactics` | Taktik-Boards: `title`, `players[]`, `drawing` (Bild) |
| `progress/{nr}` | Session-Fortschritt `{ sessionId: angesehene Clips }` |
| `video_views` / `game_views` / `training_views` `/{nr}` | `{ id: true }` – gesehen (für den Status-Check) |

## Text-Konventionen in Kommentaren

- `@19` wird beim Senden zu `@19 | Name*` aufgelöst und blau dargestellt; `mentions` enthält `"19"`.
- `0:15:30` (H:MM:SS) wird zum klickbaren Zeitstempel.
