# Fahrtenbuch

Ein modernes Fahrtenbuch-Webapp mit HTML, JavaScript und CSS zur Dokumentation von Fahrten.

## Features

- 🔐 **Login-System**: Einfache Authentifizierung
- 🚗 **Fahrt-Tracking**: Automatisches Erfassen von Fahrten mit GPS
- 🗺️ **Karten-Integration**: Visualisierung der gefahrenen Strecke mit OpenStreetMap/Leaflet
- 📊 **Fahrt-Details**: Anzeige von Distanz, Zeit und Route
- 💾 **LocalStorage**: Persistente Speicherung der Fahrten-Daten

## Verwendung

1. Öffnen Sie `index.html` in einem modernen Webbrowser
2. Melden Sie sich mit folgenden Credentials an:
   - Benutzer: `Thomas`
   - Passwort: `1971`
3. Starten Sie eine neue Fahrt über den Button "Neue Fahrt starten"
4. Beenden Sie die Fahrt über den Button "Fahrt beenden"
5. Klicken Sie auf eine Fahrt in der Liste, um Details und Karte anzuzeigen

## Technologien

- HTML5
- CSS3 (mit modernen Gradienten und Animationen)
- Vanilla JavaScript
- Leaflet.js für Karten
- OpenStreetMap für Karten-Tiles
- Nominatim API für Reverse Geocoding
- YellowMap SmartMaps API für präzise Routenberechnung (optional)

## Browser-Anforderungen

- Moderne Browser mit Geolocation-API Unterstützung
- Internet-Verbindung für Karten und Geocoding

## Hinweise

- Die Fahrten werden im LocalStorage des Browsers gespeichert
- Für die Verwendung der Geolocation-API ist eine Berechtigung erforderlich
- Die Karten-Daten werden von OpenStreetMap geladen

## Firebase Anbindung

Diese App kann Fahrten zusätzlich in Firebase Firestore speichern.

1. Firebase-Projekt anlegen (bereits vorhanden laut Nutzer)
2. Firestore aktivieren (bereits vorhanden) und Sicherheitsregeln setzen (siehe unten)
3. Web-App in Firebase Console erstellen und die Konfiguration in `firebase.js` eintragen:

```js
window.FB_CONFIG = {
  apiKey: "...",
  authDomain: "<projekt>.firebaseapp.com",
  projectId: "<projekt>",
  storageBucket: "<projekt>.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

4. Datenstruktur:
   - Pfad: `users/{username}/fahrten`
   - Dokumentfelder: `id, startTime, endTime, startLocation, endLocation, startAddress, endAddress, routeCoordinates[], distance`

5. Sicherheitsregeln (Beispiel – anpassen je nach Auth-Strategie):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/fahrten/{fahrtId} {
      allow read, write: if true; // Für Entwicklung – in Produktion restringieren!
    }
  }
}
```

Hinweis: Derzeit wird als Benutzername der im Login verwendete Name (z. B. `Thomas`) genutzt, um die Fahrten unter `users/Thomas/fahrten` zu speichern.

## YellowMap SmartMaps Integration (Optional)

Für präzise Routenberechnung statt Luftlinie kann die YellowMap SmartMaps API verwendet werden.

### Einrichtung

1. API-Key bei YellowMap beantragen:
   - Website: https://www.yellowmap.de
   - Kontakt: geosolutions@yellowmap.de oder +49 (0)721 9638-125
   - Tarife: Free (limitierte Requests) oder Enterprise (kostenpflichtig)

2. API-Key in `config.js` eintragen:

```js
window.YELLOWMAP_CONFIG = {
    apiKey: 'DEIN_API_KEY_HIER',
    enabled: true, // Auf true setzen, um YellowMap zu aktivieren
    library: 'free-3' // Oder 'enterprise-3' für Enterprise-Tarif
};
```

### Funktionsweise

- **Mit YellowMap**: Berechnet die tatsächliche Straßenroute zwischen Start und Ende
- **Ohne YellowMap**: Berechnet die Luftlinie zwischen gesammelten GPS-Punkten (Fallback)

Die App verwendet automatisch YellowMap, wenn konfiguriert, und fällt sonst auf die GPS-Punkt-Berechnung zurück.

