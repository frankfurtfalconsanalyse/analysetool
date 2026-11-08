/* ==========================================================================
   Zentrale Konfiguration – nur HIER ändern, gilt für alle Seiten.
   ========================================================================== */

const FALCONS_CONFIG = {
    // Firebase-Projekt (Firestore = Datenbank für Spieler, Kommentare, Spiele …)
    firebase: {
        apiKey: "AIzaSyBeH17b81pzmeS0NzdkG8QwwusfH1EyHzU",
        authDomain: "falcons-video-tool.firebaseapp.com",
        projectId: "falcons-video-tool",
        storageBucket: "falcons-video-tool.firebasestorage.app",
        messagingSenderId: "306689889088",
        appId: "1:306689889088:web:ad525fecd0682069c6e0a5"
    },

    // Google-Apps-Script, das die Clips aus dem Google-Drive-Ordner als JSON liefert
    // Antwort-Format: [{ title, link, category }, …]
    driveScriptUrl: "https://script.google.com/macros/s/AKfycbwQp7jJO8U-kj6HCKX-PvzNKGydl-_MDF0qcqEPIht4boBNGFvsVDoGpgpKufmKdlry/exec",

    // Trikotnummer mit festen Admin-Rechten (weitere Admins über Collection "admins")
    superAdminNr: "22",

    // Auswahllisten für Clips
    categories: ["Offense", "Defense", "Powerplay", "Penalty Kill", "Setplays"],
    positions: ["Angriff", "Center", "Verteidigung", "Goalie"],

    // Kategorien für Taktik-Boards
    tacticCategories: ["Offense", "Defense", "Breakout", "Powerplay", "Penalty Kill", "Setplays", "Übungen", "Sonstiges"]
};

firebase.initializeApp(FALCONS_CONFIG.firebase);
const db = firebase.firestore();
