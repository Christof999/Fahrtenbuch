// Konfiguration für externe APIs

// Routing API Konfiguration
// OSRM (Open Source Routing Machine) - Kostenlos, Open Source, kein API-Key benötigt
window.ROUTING_CONFIG = window.ROUTING_CONFIG || {
    provider: 'osrm', // 'osrm' (kostenlos, kein API-Key), 'openrouteservice' (benötigt API-Key), 'graphhopper' (benötigt API-Key)
    enabled: true,
    // OSRM Public Server (kostenlos, kein API-Key benötigt)
    osrmEndpoint: 'https://router.project-osrm.org/route/v1/driving',
    // Optional: OpenRouteService API-Key (falls provider='openrouteservice')
    apiKey: '',
    // Optional: OpenRouteService Endpoint
    endpoint: 'https://api.openrouteservice.org/v2/directions/driving-car'
};

