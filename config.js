// Konfiguration für externe APIs

// OpenRouteService API Konfiguration
// Kostenlos und Open Source: https://openrouteservice.org/
// Kein API-Key benötigt für normale Nutzung (optional für höhere Limits)
window.ROUTING_CONFIG = window.ROUTING_CONFIG || {
    provider: 'openrouteservice', // 'openrouteservice' oder 'graphhopper'
    enabled: true,
    // Optional: API-Key für höhere Limits (kostenlos erhältlich auf openrouteservice.org)
    apiKey: '', // Leer lassen für kostenlose Nutzung ohne Limits
    // OpenRouteService Endpoint (Standard: kostenloser Public API)
    endpoint: 'https://api.openrouteservice.org/v2/directions/driving-car'
};

