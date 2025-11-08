// Firebase Initialisierung
// 1) Ersetze die Platzhalter unten durch deine Firebase Web App-Konfiguration
// 2) Alternativ: Lege eine separate, nicht eingecheckte Datei an und importiere sie hier

window.FB_CONFIG = window.FB_CONFIG || {
    apiKey: "AIzaSyC0BcTqLTJF8f5Itl5tI29gTRZoMQMeWWE", // Aus Firebase Console: Project Settings -> Your apps -> Web App Config
    authDomain: "fahrtenbuch-9e718.firebaseapp.com", // Normalerweise: {projectId}.firebaseapp.com
    projectId: "fahrtenbuch-9e718",
    storageBucket: "fahrtenbuch-9e718.appspot.com", // Normalerweise: {projectId}.appspot.com
    messagingSenderId: "672057403089", // Aus Firebase Console
    appId: "1:672057403089:web:4b0b94559e08a9a69fc7f0" // Aus Firebase Console (lange Zeichenkette, NICHT gleich projectId!)
};

// App starten, wenn nicht bereits vorhanden
if (firebase.apps && firebase.apps.length === 0) {
    firebase.initializeApp(window.FB_CONFIG);
} else if (!firebase.apps) {
    firebase.initializeApp(window.FB_CONFIG);
}

// Firestore Instanz bereitstellen
window.firestoreDb = firebase.firestore();
// Safari benötigt häufig Long-Polling (ITP)
try {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
        window.firestoreDb.settings({
            experimentalAutoDetectLongPolling: true,
            useFetchStreams: false
        });
    }
} catch (e) {
    console.warn('Konnte Firestore Settings nicht setzen:', e);
}


