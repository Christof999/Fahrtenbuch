// Konfiguration für externe APIs

// YellowMap SmartMaps API Konfiguration
// API-Key von YellowMap: https://www.yellowmap.de
// Kontakt: geosolutions@yellowmap.de oder +49 (0)721 9638-125
// Hinweis: Der API-Key kann URL-encodiert sein (z.B. %2F statt /) - das wird automatisch erkannt
window.YELLOWMAP_CONFIG = window.YELLOWMAP_CONFIG || {
    apiKey: 'siBdR0oeycx285equ5IzT%2FnHUmiG7QdS6HBsrlXFrYY0zm0J6oE7EJrNZBi%2F8BOW', // Hier den YellowMap API-Key eintragen
    enabled: true, // Auf true setzen, wenn API-Key vorhanden ist
    // Backend SOAP API Konfiguration
    systemPartner: '', // SystemPartner von YellowMap (wird benötigt für SOAP API)
    securityID: '', // SecurityID von YellowMap (wird benötigt für SOAP API)
    useBackendAPI: true // Verwende Backend SOAP API statt JavaScript API
};

