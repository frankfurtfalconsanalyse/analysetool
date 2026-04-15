// falcons-init.js
const firebaseConfig = { 
    apiKey: "AIzaSyBeH17b81pzmeS0NzdkG8QwwusfH1EyHzU", 
    authDomain: "falcons-video-tool.firebaseapp.com", 
    projectId: "falcons-video-tool", 
    storageBucket: "falcons-video-tool.firebasestorage.app", 
    messagingSenderId: "306689889088", 
    appId: "1:306689889088:web:ad525fecd0682069c6e0a5" 
};

// Initialisierung verhindern, falls bereits geladen
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Globaler User-Speicher
const currentUser = JSON.parse(localStorage.getItem('falcons_user') || '{}');

// Zentrales Error Handling
window.onerror = function(msg, url, line) {
    console.error("Falcons System Error:", msg, "at", url, ":", line);
    return false;
};

// Admin Check Helper
async function checkAdminStatus(nr) {
    if(!nr) return false;
    if(nr === "22") return true;
    const doc = await db.collection("admins").doc(nr).get();
    return doc.exists;
}