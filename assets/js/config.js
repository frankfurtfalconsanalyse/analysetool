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

    // Teams. Die erste ID ist das Haupt-Team (bisherige Daten). IDs nie ändern – sie stehen in der Datenbank
    // und in firestore.rules. driveScriptUrl = Google-Apps-Script, das die Drive-Clips des Teams liefert
    // (Antwort-Format: [{ title, link, category }, …]); ohne URL hat das Team nur YouTube-Clips.
    teams: [
        { id: "herren", name: "Herren", driveScriptUrl: "https://script.google.com/macros/s/AKfycbwQp7jJO8U-kj6HCKX-PvzNKGydl-_MDF0qcqEPIht4boBNGFvsVDoGpgpKufmKdlry/exec" },
        { id: "damen", name: "Damen" },
        { id: "regio", name: "Herren Regio" }
    ],

    // Login: technische E-Mail-Domain für Firebase Auth – nicht ändern, sonst kann sich niemand mehr anmelden.
    authDomain: "falcons-hub.app",

    // Auswahllisten für Clips
    categories: ["Offense", "Defense", "Powerplay", "Penalty Kill", "Setplays"],
    positions: ["Angriff", "Center", "Verteidigung", "Goalie"],

    // Kategorien für Taktik-Boards
    tacticCategories: ["Offense", "Defense", "Breakout", "Powerplay", "Penalty Kill", "Setplays", "Übungen", "Sonstiges"]
};

firebase.initializeApp(FALCONS_CONFIG.firebase);
const db = firebase.firestore();
const auth = firebase.auth();
