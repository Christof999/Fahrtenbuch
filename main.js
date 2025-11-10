// Haupt-Funktionalität für das Fahrtenbuch

let currentFahrt = null;
let watchId = null;
let routeCoordinates = [];
let fahrten = [];
let db = null;

const ODOMETER_STORAGE_KEY = 'odometerState';
let odometerState = getDefaultOdometerState();

const GEO_ACCURACY_THRESHOLD_METERS = 75;
const GEO_MIN_DISTANCE_DELTA_KM = 0.01; // ~10 Meter

// Beim Laden der Seite
document.addEventListener('DOMContentLoaded', function() {
    // Prüfen ob eingeloggt
    if (sessionStorage.getItem('loggedIn') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    // Benutzername anzeigen
    const username = sessionStorage.getItem('username') || 'Thomas';
    document.getElementById('usernameDisplay').textContent = username;
    updateGreeting(username);

    // Firestore Referenz
    db = window.firestoreDb || null;

    // Event Listener
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('startFahrtBtn').addEventListener('click', startFahrt);
    document.getElementById('stopFahrtBtn').addEventListener('click', stopFahrt);
    document.querySelector('.close').addEventListener('click', closeModal);

    const saveOdometerBtn = document.getElementById('saveOdometerBtn');
    if (saveOdometerBtn) {
        saveOdometerBtn.addEventListener('click', () => handleOdometerSave(username));
    }

    const odometerInput = document.getElementById('odometerInput');
    if (odometerInput) {
        odometerInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleOdometerSave(username);
            }
        });
    }

    const endOfDayBtn = document.getElementById('endOfDayBtn');
    if (endOfDayBtn) {
        endOfDayBtn.addEventListener('click', () => handleEndOfDay(username));
    }

    const confirmDaySummaryBtn = document.getElementById('confirmDaySummaryBtn');
    if (confirmDaySummaryBtn) {
        confirmDaySummaryBtn.addEventListener('click', () => confirmDaySummary(username));
    }

    const cancelDaySummaryBtn = document.getElementById('cancelDaySummaryBtn');
    if (cancelDaySummaryBtn) {
        cancelDaySummaryBtn.addEventListener('click', closeDaySummaryModal);
    }

    const daySummaryClose = document.querySelector('.day-summary-close');
    if (daySummaryClose) {
        daySummaryClose.addEventListener('click', closeDaySummaryModal);
    }
    
    // Modal schließen bei Klick außerhalb
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('fahrtModal');
        if (event.target === modal) {
            closeModal();
        }
        const dayModal = document.getElementById('daySummaryModal');
        if (event.target === dayModal) {
            closeDaySummaryModal();
        }
    });

    // Tabs initialisieren
    initTabs();

    // Filter-Buttons
    const filterLastWeekBtn = document.getElementById('filterLastWeek');
    const filterLastMonthBtn = document.getElementById('filterLastMonth');
    const filterClearBtn = document.getElementById('filterClear');

    if (filterLastWeekBtn) filterLastWeekBtn.addEventListener('click', () => applyPastFilter('lastWeek'));
    if (filterLastMonthBtn) filterLastMonthBtn.addEventListener('click', () => applyPastFilter('lastMonth'));
    if (filterClearBtn) filterClearBtn.addEventListener('click', () => applyPastFilter(null));

    // Geladene Fahrten anzeigen (aus Firestore, Fallback LocalStorage)
    if (db) {
        loadFahrtenFromFirestore(username)
            .then(list => {
                fahrten = list;
                renderLists();
                return recomputeStoredDistances(fahrten, username);
            })
            .then(hasChanges => {
                if (hasChanges) renderLists();
                // Nach GPS-Neuberechnung: YellowMap-Routen berechnen
                return recomputeWithYellowMap(fahrten, username);
            })
            .then(hasChanges => {
                if (hasChanges) renderLists();
            })
            .catch((err) => {
                console.warn('Firestore nicht verfügbar, nutze LocalStorage:', err);
                loadFahrten();
                renderLists();
                recomputeStoredDistances(fahrten, username)
                    .then(hasChanges => {
                        if (hasChanges) renderLists();
                        return recomputeWithYellowMap(fahrten, username);
                    })
                    .then(hasChanges => {
                        if (hasChanges) renderLists();
                    })
                    .catch(migrationErr => console.error('Fehler beim Neuberechnen der Distanzen:', migrationErr));
            });
    } else {
        loadFahrten();
        renderLists();
        recomputeStoredDistances(fahrten, username)
            .then(hasChanges => {
                if (hasChanges) renderLists();
                return recomputeWithYellowMap(fahrten, username);
            })
            .then(hasChanges => {
                if (hasChanges) renderLists();
            })
            .catch(err => console.error('Fehler beim Neuberechnen der Distanzen:', err));
    }

    initializeOdometerState(username)
        .catch(err => {
            console.error('Fehler beim Laden des Kilometerstands:', err);
        });

    // Prüfen ob eine aktive Fahrt existiert
    checkActiveFahrt();
});

function logout() {
    sessionStorage.removeItem('loggedIn');
    sessionStorage.removeItem('username');
    window.location.href = 'index.html';
}

function updateGreeting(username) {
    const h = new Date().getHours();
    let message = '';
    if (h === 12) {
        message = `Mahlzeit ${username}`;
    } else if (h >= 5 && h < 12) {
        message = `Guten Morgen ${username}`;
    } else if (h >= 13 && h < 18) {
        message = `Schönen Nachmittag ${username}`;
    } else {
        message = `Guten Abend ${username}`;
    }
    const titleEl = document.getElementById('greetingTitle');
    if (titleEl) titleEl.textContent = message;
}

function startFahrt() {
    if (!navigator.geolocation) {
        alert('Geolocation wird von Ihrem Browser nicht unterstützt.');
        return;
    }

    // Start-Location abfragen
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const startLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            // Reverse Geocoding für Adresse
            getAddressFromCoordinates(startLocation.lat, startLocation.lng)
                .then(startAddress => {
                    currentFahrt = {
                        id: Date.now(),
                        startTime: new Date(),
                        startLocation: startLocation,
                        startAddress: startAddress,
                        routeCoordinates: [[startLocation.lat, startLocation.lng]],
                        distance: 0,
                        pendingDistance: 0,
                        lastRecordedLocation: { lat: startLocation.lat, lng: startLocation.lng }
                    };

                    routeCoordinates = currentFahrt.routeCoordinates;

                    // Position überwachen
                    watchId = navigator.geolocation.watchPosition(
                        updatePosition,
                        handlePositionError,
                        {
                            enableHighAccuracy: true,
                            maximumAge: 1000,
                            timeout: 5000
                        }
                    );

                    // UI aktualisieren
                    document.getElementById('fahrtStatus').textContent = 'Fahrt läuft...';
                    document.getElementById('startFahrtBtn').style.display = 'none';
                    document.getElementById('stopFahrtBtn').style.display = 'inline-block';

                    // Fahrt in localStorage speichern
                    saveCurrentFahrt();
                })
                .catch(err => {
                    console.error('Fehler beim Abrufen der Adresse:', err);
                    startFahrtWithLocation(startLocation, 'Unbekannte Adresse');
                });
        },
        handlePositionError
    );
}

function startFahrtWithLocation(location, address) {
    currentFahrt = {
        id: Date.now(),
        startTime: new Date(),
        startLocation: location,
        startAddress: address,
        routeCoordinates: [[location.lat, location.lng]],
        distance: 0,
        pendingDistance: 0,
        lastRecordedLocation: { lat: location.lat, lng: location.lng }
    };

    routeCoordinates = currentFahrt.routeCoordinates;

    watchId = navigator.geolocation.watchPosition(
        updatePosition,
        handlePositionError,
        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 5000
        }
    );

    document.getElementById('fahrtStatus').textContent = 'Fahrt läuft...';
    document.getElementById('startFahrtBtn').style.display = 'none';
    document.getElementById('stopFahrtBtn').style.display = 'inline-block';

    saveCurrentFahrt();
}

function updatePosition(position) {
    if (!currentFahrt || !position || !position.coords) return;

    const accuracy = getPositionAccuracy(position);
    if (accuracy !== null && accuracy > GEO_ACCURACY_THRESHOLD_METERS) {
        console.debug('Geoposition verworfen (niedrige Genauigkeit):', accuracy);
        return;
    }

    const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };

    const previousLocation = currentFahrt.lastRecordedLocation || currentFahrt.startLocation;
    if (!previousLocation) return;

    const segmentDistance = calculateDistance(
        previousLocation.lat, previousLocation.lng,
        newLocation.lat, newLocation.lng
    );

    currentFahrt.lastRecordedLocation = newLocation;

    if (!Number.isFinite(segmentDistance) || segmentDistance === 0) {
        saveCurrentFahrt();
        return;
    }

    const pending = currentFahrt.pendingDistance || 0;
    const aggregatedDistance = pending + segmentDistance;

    if (aggregatedDistance >= GEO_MIN_DISTANCE_DELTA_KM) {
        currentFahrt.distance += aggregatedDistance;
        currentFahrt.pendingDistance = 0;
        currentFahrt.routeCoordinates.push([newLocation.lat, newLocation.lng]);
        routeCoordinates = currentFahrt.routeCoordinates;
    } else {
        currentFahrt.pendingDistance = aggregatedDistance;
    }

    saveCurrentFahrt();
}

function stopFahrt() {
    if (!currentFahrt) return;

    // Geolocation-Watch stoppen
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    // End-Location abfragen
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const endLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            // Reverse Geocoding für End-Adresse
            getAddressFromCoordinates(endLocation.lat, endLocation.lng)
                .then(endAddress => {
                    finishFahrt(endLocation, endAddress);
                })
                .catch(err => {
                    console.error('Fehler beim Abrufen der Adresse:', err);
                    finishFahrt(endLocation, 'Unbekannte Adresse');
                });
        },
        function(error) {
            // Falls Geolocation fehlschlägt, letzte bekannte Position verwenden
            const fallbackLocation = currentFahrt && currentFahrt.lastRecordedLocation
                ? currentFahrt.lastRecordedLocation
                : (routeCoordinates.length > 0
                    ? { lat: routeCoordinates[routeCoordinates.length - 1][0], lng: routeCoordinates[routeCoordinates.length - 1][1] }
                    : null);

            if (fallbackLocation) {
                finishFahrt(
                    { lat: fallbackLocation.lat, lng: fallbackLocation.lng },
                    'Unbekannte Adresse'
                );
            }
        }
    );
}

async function finishFahrt(endLocation, endAddress) {
    currentFahrt.endTime = new Date();
    currentFahrt.endLocation = endLocation;
    currentFahrt.endAddress = endAddress;

    const finalCoord = [endLocation.lat, endLocation.lng];
    if (!Array.isArray(currentFahrt.routeCoordinates)) {
        currentFahrt.routeCoordinates = [finalCoord];
    } else {
        const lastCoord = currentFahrt.routeCoordinates[currentFahrt.routeCoordinates.length - 1];
        if (
            !lastCoord ||
            !Number.isFinite(lastCoord[0]) ||
            !Number.isFinite(lastCoord[1]) ||
            calculateDistance(lastCoord[0], lastCoord[1], finalCoord[0], finalCoord[1]) > 0
        ) {
            currentFahrt.routeCoordinates.push(finalCoord);
        } else {
            currentFahrt.routeCoordinates[currentFahrt.routeCoordinates.length - 1] = finalCoord;
        }
    }

    currentFahrt.lastRecordedLocation = endLocation;
    currentFahrt.pendingDistance = 0;

    // Versuche zuerst YellowMap Route zu berechnen, sonst Fallback auf GPS-Punkte
    try {
        const routeDistance = await calculateYellowMapRoute(
            currentFahrt.startLocation,
            endLocation
        );
        if (routeDistance !== null && Number.isFinite(routeDistance) && routeDistance > 0) {
            currentFahrt.distance = routeDistance;
            currentFahrt.routeCalculatedWithYellowMap = true;
            console.log('Route mit YellowMap berechnet:', routeDistance.toFixed(3), 'km');
        } else {
            // Fallback auf GPS-Punkte
            currentFahrt.distance = computeRouteDistance(currentFahrt.routeCoordinates);
            currentFahrt.routeCalculatedWithYellowMap = false;
            console.log('Route mit GPS-Punkten berechnet:', currentFahrt.distance.toFixed(3), 'km');
        }
    } catch (error) {
        console.warn('YellowMap Route-Berechnung fehlgeschlagen, nutze GPS-Punkte:', error);
        currentFahrt.distance = computeRouteDistance(currentFahrt.routeCoordinates);
        currentFahrt.routeCalculatedWithYellowMap = false;
    }

    delete currentFahrt.pendingDistance;
    delete currentFahrt.lastRecordedLocation;

    // Fahrt zur Liste hinzufügen
    fahrten.push(currentFahrt);

    // In Firestore speichern (mit Fallback)
    const username = sessionStorage.getItem('username') || 'Thomas';
    if (db) {
        saveFahrtToFirestore(username, currentFahrt)
            .then(() => {
                // Nach erfolgreichem Save optional lokalen Cache aktualisieren
                saveFahrten();
                // Listen neu laden (aus Firestore)
                return loadFahrtenFromFirestore(username);
            })
            .then(list => {
                fahrten = list;
                renderLists();
            })
            .catch((err) => {
                console.error('Fehler beim Speichern in Firestore:', err);
                alert('Fehler beim Speichern in Firestore. Die Fahrt wurde lokal gespeichert.');
                // Fallback: lokal speichern
                saveFahrten();
                renderLists();
            });
    } else {
        saveFahrten();
        renderLists();
    }
    localStorage.removeItem('currentFahrt');

    // UI zurücksetzen
    currentFahrt = null;
    routeCoordinates = [];
    document.getElementById('fahrtStatus').textContent = 'Neue Fahrt starten';
    document.getElementById('startFahrtBtn').style.display = 'inline-block';
    document.getElementById('stopFahrtBtn').style.display = 'none';

    // Listen aktualisieren
    renderLists();
}

function handlePositionError(error) {
    console.error('Geolocation-Fehler:', error);
    let message = 'Fehler beim Abrufen der Position: ';
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message += 'Berechtigung verweigert';
            break;
        case error.POSITION_UNAVAILABLE:
            message += 'Position nicht verfügbar';
            break;
        case error.TIMEOUT:
            message += 'Timeout';
            break;
        default:
            message += 'Unbekannter Fehler';
    }
    alert(message);
}

// ========== YellowMap Route-Berechnung ==========
async function calculateYellowMapRoute(startLocation, endLocation) {
    // Prüfe ob YellowMap konfiguriert und verfügbar ist
    if (!window.YELLOWMAP_CONFIG || !window.YELLOWMAP_CONFIG.enabled || !window.YELLOWMAP_CONFIG.apiKey) {
        return null;
    }

    // Warte bis YellowMap API geladen ist (max. 10 Sekunden)
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 20; // 20 * 500ms = 10 Sekunden

        const checkYellowMap = () => {
            if (typeof ym !== 'undefined' && typeof ym.ready === 'function') {
                ym.ready(function(modules) {
                    try {
                        // Debug: Zeige verfügbare Module
                        console.log('YellowMap modules:', modules);
                        console.log('YellowMap modules keys:', modules ? Object.keys(modules) : 'keine');
                        
                        // Prüfe ob Routing-Modul verfügbar ist
                        if (!modules) {
                            console.warn('YellowMap modules nicht verfügbar');
                            resolve(null);
                            return;
                        }

                        // Das Routing-Modul ist eine Funktion, die direkt aufgerufen werden kann
                        const routing = modules.routing;
                        if (!routing || typeof routing !== 'function') {
                            console.warn('YellowMap routing Funktion nicht verfügbar. Verfügbare Module:', Object.keys(modules));
                            resolve(null);
                            return;
                        }

                        // Provider für LatLng etc. ist in modules.provider
                        const provider = modules.provider;
                        if (!provider) {
                            console.warn('YellowMap provider nicht verfügbar');
                            resolve(null);
                            return;
                        }

                        // Erstelle LatLng-Objekte für Start und Ende
                        const LatLng = provider.LatLng;
                        if (!LatLng || typeof LatLng !== 'function') {
                            console.warn('YellowMap LatLng nicht verfügbar');
                            resolve(null);
                            return;
                        }

                        const start = LatLng(startLocation.lat, startLocation.lng);
                        const end = LatLng(endLocation.lat, endLocation.lng);

                        console.log('YellowMap Route-Berechnung startet:', { start, end, startType: typeof start, endType: typeof end });

                        // Versuche verschiedene Parameter-Strukturen
                        // Variante 1: routing(waypoints, options, callback)
                        // Variante 2: routing(waypoints, callback) - ohne options
                        // Variante 3: routing(origin, destination, options, callback)
                        
                        try {
                            // Versuche zuerst mit options
                            routing([start, end], {
                                travelMode: 'driving'
                            }, function(result) {
                                handleRoutingResult(result, resolve);
                            });
                        } catch (error1) {
                            console.log('Variant 1 fehlgeschlagen, versuche Variante 2:', error1);
                            try {
                                // Versuche ohne options
                                routing([start, end], function(result) {
                                    handleRoutingResult(result, resolve);
                                });
                            } catch (error2) {
                                console.log('Variant 2 fehlgeschlagen, versuche Variante 3:', error2);
                                try {
                                    // Versuche mit separaten origin/destination
                                    routing(start, end, {
                                        travelMode: 'driving'
                                    }, function(result) {
                                        handleRoutingResult(result, resolve);
                                    });
                                } catch (error3) {
                                    console.error('Alle Varianten fehlgeschlagen:', error3);
                                    resolve(null);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Fehler bei YellowMap Route-Berechnung:', error);
                        resolve(null);
                    }
                });
            } else {
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(checkYellowMap, 500);
                } else {
                    console.warn('YellowMap API konnte nicht geladen werden (Timeout)');
                    resolve(null);
                }
            }
        };

        checkYellowMap();
    });
}

function handleRoutingResult(result, resolve) {
    console.log('YellowMap Route-Ergebnis:', result);
    
    if (!result) {
        console.warn('YellowMap Route-Berechnung: Kein Ergebnis');
        resolve(null);
        return;
    }

    // Versuche verschiedene mögliche Ergebnis-Strukturen
    let distance = null;
    
    // Struktur 1: result.distance (in Metern)
    if (result.distance && typeof result.distance === 'number') {
        distance = result.distance / 1000; // in km
    }
    // Struktur 2: result.routes[0].legs[].distance
    else if (result.routes && Array.isArray(result.routes) && result.routes.length > 0) {
        const route = result.routes[0];
        if (route.legs && Array.isArray(route.legs)) {
            let totalDistance = 0;
            route.legs.forEach(leg => {
                if (leg.distance) {
                    const dist = typeof leg.distance === 'number' ? leg.distance : (leg.distance.value || 0);
                    totalDistance += dist;
                }
            });
            distance = totalDistance / 1000; // in km
        }
    }
    // Struktur 3: result.totalDistance
    else if (result.totalDistance) {
        distance = typeof result.totalDistance === 'number' 
            ? result.totalDistance / 1000 
            : (result.totalDistance.value || 0) / 1000;
    }
    // Struktur 4: result.length (falls direkt in Metern)
    else if (result.length && typeof result.length === 'number') {
        distance = result.length / 1000;
    }

    if (distance !== null && Number.isFinite(distance) && distance > 0) {
        console.log('YellowMap Route-Distanz berechnet:', distance.toFixed(3), 'km');
        resolve(distance);
    } else {
        console.warn('YellowMap Route-Berechnung: Keine gültige Distanz gefunden. Ergebnis-Struktur:', Object.keys(result));
        resolve(null);
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(value => typeof value !== 'number' || !Number.isFinite(value))) {
        return NaN;
    }

    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distanceMeters = 6371008.8 * c; // mittlerer Erdradius in Metern
    return distanceMeters / 1000;
}

function toRadians(value) {
    return value * Math.PI / 180;
}

function computeRouteDistance(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return 0;

    let total = 0;
    let pending = 0;
    for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i - 1];
        const curr = coordinates[i];
        if (!Array.isArray(prev) || !Array.isArray(curr) || prev.length < 2 || curr.length < 2) continue;

        const segment = calculateDistance(prev[0], prev[1], curr[0], curr[1]);
        if (!Number.isFinite(segment)) continue;

        pending += segment;
        const isLastSegment = i === coordinates.length - 1;
        if (pending >= GEO_MIN_DISTANCE_DELTA_KM || isLastSegment) {
            total += pending;
            pending = 0;
        }
    }
    return total;
}

function getPositionAccuracy(position) {
    if (!position || !position.coords) return null;
    const accuracy = position.coords.accuracy;
    return typeof accuracy === 'number' && Number.isFinite(accuracy)
        ? accuracy
        : null;
}

async function recomputeStoredDistances(list, username) {
    if (!Array.isArray(list) || list.length === 0) return false;

    let hasChanges = false;
    let batch = null;
    let batchHasUpdates = false;

    if (db && username) {
        batch = db.batch();
    }

    for (const fahrt of list) {
        if (!fahrt) continue;
        const coordinates = Array.isArray(fahrt.routeCoordinates)
            ? fahrt.routeCoordinates
            : [];

        const normalizedCoords = [];
        for (const point of coordinates) {
            if (Array.isArray(point) && point.length >= 2) {
                const lat = Number(point[0]);
                const lng = Number(point[1]);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    normalizedCoords.push([lat, lng]);
                }
            } else if (point && typeof point === 'object' && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
                normalizedCoords.push([Number(point.lat), Number(point.lng)]);
            }
        }

        // Auch Fahrten mit nur Start- und Endpunkt berechnen
        if (normalizedCoords.length === 0 && fahrt.startLocation && fahrt.endLocation) {
            const startLat = Number(fahrt.startLocation.lat);
            const startLng = Number(fahrt.startLocation.lng);
            const endLat = Number(fahrt.endLocation.lat);
            const endLng = Number(fahrt.endLocation.lng);
            if (Number.isFinite(startLat) && Number.isFinite(startLng) &&
                Number.isFinite(endLat) && Number.isFinite(endLng)) {
                normalizedCoords.push([startLat, startLng]);
                normalizedCoords.push([endLat, endLng]);
            }
        }

        if (normalizedCoords.length < 2) {
            console.debug('Fahrt übersprungen (zu wenige Koordinaten):', fahrt.id);
            continue;
        }

        const recalculated = computeRouteDistance(normalizedCoords);
        if (!Number.isFinite(recalculated)) {
            console.debug('Fahrt übersprungen (ungültige Berechnung):', fahrt.id);
            continue;
        }

        const currentDistance = Number(fahrt.distance) || 0;
        const diff = Math.abs(currentDistance - recalculated);
        
        // Immer neuberechnen, wenn Unterschied größer als 0.001 km (1 Meter)
        if (diff <= 0.001) {
            console.debug('Fahrt übersprungen (Distanz bereits korrekt):', fahrt.id, 'aktuell:', currentDistance, 'berechnet:', recalculated);
            continue;
        }

        const roundedDistance = Number(recalculated.toFixed(3));
        console.log(`Fahrt ${fahrt.id}: ${currentDistance.toFixed(3)} km → ${roundedDistance.toFixed(3)} km (Diff: ${diff.toFixed(3)} km)`);
        
        fahrt.distance = roundedDistance;
        fahrt.routeCoordinates = normalizedCoords;
        hasChanges = true;

        if (batch && fahrt.docId) {
            try {
                const docRef = db
                    .collection('users')
                    .doc(username)
                    .collection('fahrten')
                    .doc(fahrt.docId);
                batch.set(docRef, { distance: roundedDistance, routeCoordinates: normalizedCoords }, { merge: true });
                batchHasUpdates = true;
            } catch (err) {
                console.error('Fehler beim Vorbereiten der Distanz-Aktualisierung für', fahrt.docId, err);
            }
        }
    }

    if (batch && batchHasUpdates) {
        try {
            await batch.commit();
            console.log('Aktualisiert: Fahrten in Firestore');
        } catch (err) {
            console.error('Fehler beim Aktualisieren der Distanzen in Firestore:', err);
        }
    }

    if (hasChanges) {
        try {
            saveFahrten();
            console.log('Aktualisierte Fahrten im LocalStorage gespeichert');
        } catch (err) {
            console.error('Fehler beim Aktualisieren der lokalen Distanzen:', err);
        }
    }

    return hasChanges;
}

async function recomputeWithYellowMap(list, username) {
    // Prüfe ob YellowMap konfiguriert ist
    if (!window.YELLOWMAP_CONFIG || !window.YELLOWMAP_CONFIG.enabled || !window.YELLOWMAP_CONFIG.apiKey) {
        console.log('YellowMap nicht aktiviert, überspringe Neuberechnung');
        return false;
    }

    if (!Array.isArray(list) || list.length === 0) {
        return false;
    }

    console.log(`Starte YellowMap Neuberechnung für ${list.length} Fahrten...`);

    // Warte bis YellowMap API geladen ist
    let yellowMapReady = false;
    let attempts = 0;
    const maxAttempts = 40; // 40 * 500ms = 20 Sekunden

    while (!yellowMapReady && attempts < maxAttempts) {
        if (typeof ym !== 'undefined' && typeof ym.ready === 'function') {
            yellowMapReady = true;
        } else {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
    }

    if (!yellowMapReady) {
        console.warn('YellowMap API konnte nicht geladen werden (Timeout)');
        return false;
    }

    let hasChanges = false;
    let batch = null;
    let batchHasUpdates = false;
    const batchSizeLimit = 500;
    let currentBatchSize = 0;

    if (db && username) {
        batch = db.batch();
    }

    const commitBatch = async () => {
        if (batch && batchHasUpdates && currentBatchSize > 0) {
            try {
                await batch.commit();
                console.log(`Aktualisiert: ${currentBatchSize} Fahrten in Firestore (YellowMap)`);
            } catch (err) {
                console.error('Fehler beim Aktualisieren der YellowMap-Distanzen in Firestore:', err);
            }
            batch = db.batch();
            batchHasUpdates = false;
            currentBatchSize = 0;
        }
    };

    // Verarbeite Fahrten sequenziell (um API-Limits zu respektieren)
    for (let i = 0; i < list.length; i++) {
        const fahrt = list[i];
        if (!fahrt) continue;

        // Nur Fahrten mit Start- und Endpunkt berechnen
        if (!fahrt.startLocation || !fahrt.endLocation) {
            console.debug(`Fahrt ${fahrt.id} übersprungen (kein Start/Ende)`);
            continue;
        }

        const startLat = Number(fahrt.startLocation.lat);
        const startLng = Number(fahrt.startLocation.lng);
        const endLat = Number(fahrt.endLocation.lat);
        const endLng = Number(fahrt.endLocation.lng);

        if (!Number.isFinite(startLat) || !Number.isFinite(startLng) ||
            !Number.isFinite(endLat) || !Number.isFinite(endLng)) {
            console.debug(`Fahrt ${fahrt.id} übersprungen (ungültige Koordinaten)`);
            continue;
        }

        // Berechne Route mit YellowMap
        try {
            const routeDistance = await calculateYellowMapRoute(
                { lat: startLat, lng: startLng },
                { lat: endLat, lng: endLng }
            );

            if (routeDistance === null || !Number.isFinite(routeDistance) || routeDistance <= 0) {
                console.debug(`Fahrt ${fahrt.id}: YellowMap Route-Berechnung fehlgeschlagen`);
                continue;
            }

            const currentDistance = Number(fahrt.distance) || 0;
            const roundedDistance = Number(routeDistance.toFixed(3));
            const diff = Math.abs(currentDistance - roundedDistance);

            console.log(`Fahrt ${fahrt.id}: ${currentDistance.toFixed(3)} km → ${roundedDistance.toFixed(3)} km (YellowMap, Diff: ${diff.toFixed(3)} km)`);

            fahrt.distance = roundedDistance;
            fahrt.routeCalculatedWithYellowMap = true;
            hasChanges = true;

            // Batch-Limit prüfen
            if (batch && fahrt.docId) {
                if (currentBatchSize >= batchSizeLimit) {
                    await commitBatch();
                }

                try {
                    const docRef = db
                        .collection('users')
                        .doc(username)
                        .collection('fahrten')
                        .doc(fahrt.docId);
                    batch.set(docRef, {
                        distance: roundedDistance,
                        routeCalculatedWithYellowMap: true
                    }, { merge: true });
                    batchHasUpdates = true;
                    currentBatchSize++;
                } catch (err) {
                    console.error('Fehler beim Vorbereiten der YellowMap-Aktualisierung für', fahrt.docId, err);
                }
            }

            // Kleine Pause zwischen Requests (um API-Limits zu respektieren)
            if (i < list.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error(`Fehler bei YellowMap-Berechnung für Fahrt ${fahrt.id}:`, error);
        }
    }

    // Restliche Batches committen
    await commitBatch();

    if (hasChanges) {
        try {
            saveFahrten();
            console.log('Aktualisierte Fahrten im LocalStorage gespeichert (YellowMap)');
        } catch (err) {
            console.error('Fehler beim Speichern der YellowMap-aktualisierten Fahrten:', err);
        }
    }

    console.log(`YellowMap Neuberechnung abgeschlossen. ${hasChanges ? 'Änderungen wurden gespeichert.' : 'Keine Änderungen.'}`);
    return hasChanges;
}

function getAddressFromCoordinates(lat, lng) {
    return fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(response => response.json())
        .then(data => {
            if (data.display_name) {
                return data.display_name;
            }
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        })
        .catch(() => {
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        });
}

function loadFahrten() {
    const savedFahrten = localStorage.getItem('fahrten');
    if (savedFahrten) {
        fahrten = JSON.parse(savedFahrten);
        // Daten deserialisieren
        fahrten.forEach(fahrt => {
            fahrt.startTime = new Date(fahrt.startTime);
            if (fahrt.endTime) {
                fahrt.endTime = new Date(fahrt.endTime);
            }
        });
    }
}

function saveFahrten() {
    localStorage.setItem('fahrten', JSON.stringify(fahrten));
}

function saveCurrentFahrt() {
    if (currentFahrt) {
        localStorage.setItem('currentFahrt', JSON.stringify(currentFahrt));
    }
}

function checkActiveFahrt() {
    const savedFahrt = localStorage.getItem('currentFahrt');
    if (savedFahrt) {
        try {
            currentFahrt = JSON.parse(savedFahrt);
            currentFahrt.startTime = new Date(currentFahrt.startTime);
            routeCoordinates = Array.isArray(currentFahrt.routeCoordinates)
                ? currentFahrt.routeCoordinates
                : [];
            currentFahrt.routeCoordinates = routeCoordinates;
            currentFahrt.distance = Number(currentFahrt.distance) || 0;
            currentFahrt.pendingDistance = Number(currentFahrt.pendingDistance) || 0;

            if (
                !currentFahrt.lastRecordedLocation ||
                typeof currentFahrt.lastRecordedLocation.lat !== 'number' ||
                typeof currentFahrt.lastRecordedLocation.lng !== 'number'
            ) {
                if (routeCoordinates.length > 0) {
                    const last = routeCoordinates[routeCoordinates.length - 1];
                    currentFahrt.lastRecordedLocation = {
                        lat: Number(last[0]),
                        lng: Number(last[1])
                    };
                } else if (currentFahrt.startLocation) {
                    currentFahrt.lastRecordedLocation = {
                        lat: Number(currentFahrt.startLocation.lat),
                        lng: Number(currentFahrt.startLocation.lng)
                    };
                } else {
                    currentFahrt.lastRecordedLocation = null;
                }
            }

            // Watch wieder starten
            watchId = navigator.geolocation.watchPosition(
                updatePosition,
                handlePositionError,
                {
                    enableHighAccuracy: true,
                    maximumAge: 1000,
                    timeout: 5000
                }
            );

            document.getElementById('fahrtStatus').textContent = 'Fahrt läuft...';
            document.getElementById('startFahrtBtn').style.display = 'none';
            document.getElementById('stopFahrtBtn').style.display = 'inline-block';
        } catch (e) {
            console.error('Fehler beim Laden der aktiven Fahrt:', e);
            localStorage.removeItem('currentFahrt');
        }
    }
}

function renderLists() {
    const { currentWeek, past } = partitionFahrtenByWeek(fahrten);

    renderFahrtenList('fahrtenContainerCurrent', currentWeek);

    // Past Filter anwenden
    const activeFilter = sessionStorage.getItem('pastFilter');
    let pastFiltered = past;
    if (activeFilter === 'lastWeek') pastFiltered = filterLastWeek(past);
    if (activeFilter === 'lastMonth') pastFiltered = filterLastMonth(past);
    renderFahrtenList('fahrtenContainerPast', pastFiltered);

    updateDayStats();
}

function renderFahrtenList(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="no-fahrten">Keine Fahrten vorhanden</div>';
        return;
    }

    const sorted = [...items].sort((a, b) => b.startTime - a.startTime);
    container.innerHTML = sorted.map(fahrt => renderFahrtItem(fahrt)).join('');

    container.querySelectorAll('.fahrt-item').forEach(item => {
        item.addEventListener('click', function() {
            const fahrtId = parseInt(this.dataset.fahrtId);
            showFahrtDetails(fahrtId);
        });
    });
}

function renderFahrtItem(fahrt) {
    const duration = fahrt.endTime 
        ? formatDuration(fahrt.endTime - fahrt.startTime)
        : 'Läuft noch...';
    const distance = fahrt.distance.toFixed(2);
    const date = formatDate(fahrt.startTime);
    return `
        <div class="fahrt-item" data-fahrt-id="${fahrt.id}">
            <div class="fahrt-item-header">
                <span class="fahrt-item-date">${date}</span>
            </div>
            <div class="fahrt-item-info">
                <span class="info-badge">📍 ${distance} km</span>
                <span class="info-badge">⏱️ ${duration}</span>
            </div>
        </div>
    `;
}

function partitionFahrtenByWeek(list) {
    const startOfWeek = getStartOfISOWeek(new Date());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const currentWeek = [];
    const past = [];
    for (const f of list) {
        if (f.startTime >= startOfWeek && f.startTime < endOfWeek) {
            currentWeek.push(f);
        } else {
            past.push(f);
        }
    }
    return { currentWeek, past };
}

function getStartOfISOWeek(date) {
    const d = new Date(date);
    const day = (d.getDay() + 6) % 7; // Montag = 0
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
}

function filterLastWeek(list) {
    const startOfThisWeek = getStartOfISOWeek(new Date());
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    return list.filter(f => f.startTime >= startOfLastWeek && f.startTime < startOfThisWeek);
}

function filterLastMonth(list) {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return list.filter(f => f.startTime >= startOfLastMonth && f.startTime < startOfThisMonth);
}

function applyPastFilter(type) {
    if (type) {
        sessionStorage.setItem('pastFilter', type);
    } else {
        sessionStorage.removeItem('pastFilter');
    }
    renderLists();
}

function initTabs() {
    const buttons = document.querySelectorAll('.tab-button');
    const panels = document.querySelectorAll('.tab-panel');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            buttons.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById(target);
            if (panel) panel.classList.add('active');
        });
    });

    // Standard: Aktuelle Woche aktiv
    const defaultPanel = document.getElementById('tab-week');
    if (defaultPanel) defaultPanel.classList.add('active');
}

// ========== Kilometerstand ==========
async function initializeOdometerState(username) {
    let loadedState = getDefaultOdometerState();

    try {
        loadedState = await loadOdometerState(username);
    } catch (err) {
        console.warn('Kilometerstand konnte nicht geladen werden, nutze Standardwerte:', err);
    }

    odometerState = {
        ...getDefaultOdometerState(),
        ...loadedState
    };

    const changed = ensureOdometerDayStamp();
    updateOdometerDisplay();

    if (changed) {
        try {
            await persistOdometerState(username, odometerState);
        } catch (err) {
            console.error('Aktualisierter Kilometerstand konnte nicht gespeichert werden:', err);
        }
    }
}

async function loadOdometerState(username) {
    let state = null;

    if (db) {
        try {
            const docRef = db.collection('users').doc(username);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                const data = docSnap.data();
                if (data && data.odometer) {
                    state = normalizeOdometerState(data.odometer);
                }
            }
        } catch (err) {
            console.warn('Kilometerstand aus Firestore konnte nicht geladen werden:', err);
        }
    }

    if (!state) {
        const localValue = localStorage.getItem(ODOMETER_STORAGE_KEY);
        if (localValue) {
            try {
                state = normalizeOdometerState(JSON.parse(localValue));
            } catch (err) {
                console.warn('Kilometerstand aus LocalStorage konnte nicht geparst werden:', err);
            }
        }
    }

    return state || getDefaultOdometerState();
}

function normalizeOdometerState(raw) {
    if (!raw || typeof raw !== 'object') {
        return getDefaultOdometerState();
    }
    return {
        currentOdometer: toFiniteNumber(raw.currentOdometer),
        startOfDay: toFiniteNumber(raw.startOfDay),
        initialStartOfDay: toFiniteNumber(raw.initialStartOfDay),
        dayStamp: typeof raw.dayStamp === 'string' ? raw.dayStamp : null,
        lastUpdated: typeof raw.lastUpdated === 'string' ? raw.lastUpdated : null
    };
}

async function persistOdometerState(username, state) {
    const serializable = serializeOdometerState(state);
    try {
        localStorage.setItem(ODOMETER_STORAGE_KEY, JSON.stringify(serializable));
    } catch (err) {
        console.warn('Kilometerstand konnte nicht im LocalStorage gespeichert werden:', err);
    }

    if (db) {
        try {
            await db.collection('users').doc(username).set({ odometer: serializable }, { merge: true });
        } catch (err) {
            console.error('Kilometerstand konnte nicht in Firestore gespeichert werden:', err);
            throw err;
        }
    }
}

function serializeOdometerState(state) {
    return {
        currentOdometer: toFiniteNumber(state.currentOdometer),
        startOfDay: toFiniteNumber(state.startOfDay),
        initialStartOfDay: toFiniteNumber(state.initialStartOfDay),
        dayStamp: state.dayStamp || null,
        lastUpdated: state.lastUpdated || null
    };
}

function ensureOdometerDayStamp() {
    const todayStamp = getTodayDateString();
    let changed = false;

    if (odometerState.dayStamp !== todayStamp) {
        const baseline = isFiniteNumber(odometerState.currentOdometer)
            ? odometerState.currentOdometer
            : null;
        odometerState.dayStamp = todayStamp;
        odometerState.startOfDay = baseline;
        odometerState.initialStartOfDay = baseline;
        changed = true;
    }

    if (odometerState.initialStartOfDay === null && isFiniteNumber(odometerState.startOfDay)) {
        odometerState.initialStartOfDay = odometerState.startOfDay;
        changed = true;
    }

    if (changed) {
        odometerState.lastUpdated = new Date().toISOString();
    }

    return changed;
}

function handleOdometerSave(username) {
    const input = document.getElementById('odometerInput');
    if (!input) return;
    const parsed = parseNumberInput(input.value);
    if (parsed === null) {
        alert('Bitte gib einen gültigen Kilometerstand ein.');
        return;
    }

    odometerState.currentOdometer = parsed;
    odometerState.startOfDay = parsed;
    odometerState.initialStartOfDay = parsed;
    odometerState.dayStamp = getTodayDateString();
    odometerState.lastUpdated = new Date().toISOString();

    updateOdometerDisplay();
    persistOdometerState(username, odometerState)
        .catch(err => console.error('Fehler beim Speichern des Kilometerstands:', err));
}

function handleEndOfDay(username) {
    if (!isFiniteNumber(odometerState.initialStartOfDay) && !isFiniteNumber(odometerState.startOfDay)) {
        alert('Bitte gib zuerst deinen aktuellen Kilometerstand ein.');
        return;
    }

    const startValue = isFiniteNumber(odometerState.initialStartOfDay)
        ? odometerState.initialStartOfDay
        : odometerState.startOfDay;

    if (!isFiniteNumber(startValue)) {
        alert('Bitte gib zuerst deinen aktuellen Kilometerstand ein.');
        return;
    }

    const dayDistance = updateDayStats();
    const computed = startValue + dayDistance;

    showDaySummaryModal(startValue, dayDistance, computed);
}

function confirmDaySummary(username) {
    const input = document.getElementById('finalOdometerInput');
    if (!input) return;

    const parsed = parseNumberInput(input.value);
    if (parsed === null) {
        alert('Bitte gib einen gültigen Kilometerstand ein.');
        return;
    }

    odometerState.currentOdometer = parsed;
    odometerState.startOfDay = parsed;
    if (!isFiniteNumber(odometerState.initialStartOfDay)) {
        odometerState.initialStartOfDay = parsed;
    }
    odometerState.dayStamp = getTodayDateString();
    odometerState.lastUpdated = new Date().toISOString();

    persistOdometerState(username, odometerState)
        .catch(err => console.error('Fehler beim Speichern des Kilometerstands:', err))
        .finally(() => {
            updateOdometerDisplay();
            closeDaySummaryModal();
        });
}

function showDaySummaryModal(startValue, dayDistance, computedValue) {
    const modal = document.getElementById('daySummaryModal');
    if (!modal) return;

    const startEl = document.getElementById('summaryStartValue');
    if (startEl) startEl.textContent = formatOdometerLabel(startValue);

    const distanceEl = document.getElementById('summaryDayDistance');
    if (distanceEl) distanceEl.textContent = formatDistance(dayDistance);

    const input = document.getElementById('finalOdometerInput');
    if (input) {
        input.value = isFiniteNumber(computedValue) ? formatOdometerInputValue(computedValue) : '';
        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);
    }

    modal.style.display = 'block';
}

function closeDaySummaryModal() {
    const modal = document.getElementById('daySummaryModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function updateOdometerDisplay() {
    const input = document.getElementById('odometerInput');
    if (input && document.activeElement !== input) {
        if (isFiniteNumber(odometerState.currentOdometer)) {
            input.value = formatOdometerInputValue(odometerState.currentOdometer);
        } else {
            input.value = '';
        }
    }

    const startValueEl = document.getElementById('odometerStartValue');
    const startValue = isFiniteNumber(odometerState.initialStartOfDay)
        ? odometerState.initialStartOfDay
        : odometerState.startOfDay;
    if (startValueEl) {
        startValueEl.textContent = isFiniteNumber(startValue)
            ? formatOdometerLabel(startValue)
            : '–';
    }

    updateDayStats();
}

function updateDayStats() {
    const todayDistance = calculateTodayDistance(fahrten);
    const dayDistanceEl = document.getElementById('odometerDayDistance');
    if (dayDistanceEl) {
        dayDistanceEl.textContent = formatDistance(todayDistance);
    }

    const summaryDistanceEl = document.getElementById('summaryDayDistance');
    if (summaryDistanceEl) {
        summaryDistanceEl.textContent = formatDistance(todayDistance);
    }

    return todayDistance;
}

function calculateTodayDistance(list) {
    if (!Array.isArray(list) || list.length === 0) return 0;
    const todayStamp = getTodayDateString();
    return list.reduce((sum, fahrt) => {
        if (!fahrt || !fahrt.startTime) return sum;
        const startTime = fahrt.startTime instanceof Date ? fahrt.startTime : new Date(fahrt.startTime);
        if (getDateStamp(startTime) === todayStamp) {
            const distance = Number(fahrt.distance) || 0;
            return sum + distance;
        }
        return sum;
    }, 0);
}

function parseNumberInput(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().replace(/,/g, '.');
    if (normalized === '') return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatOdometerLabel(value) {
    if (!isFiniteNumber(value)) return '–';
    return Number(value).toLocaleString('de-DE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
    });
}

function formatOdometerInputValue(value) {
    if (!isFiniteNumber(value)) return '';
    return String(Number(value));
}

function formatDistance(value) {
    const numeric = Number(value) || 0;
    return `${numeric.toFixed(2)} km`;
}

function getDefaultOdometerState() {
    return {
        currentOdometer: null,
        startOfDay: null,
        initialStartOfDay: null,
        dayStamp: null,
        lastUpdated: null
    };
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function toFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getTodayDateString(date = new Date()) {
    return getDateStamp(date);
}

function getDateStamp(date) {
    const d = new Date(date);
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
    ].join('-');
}

// ========== Firestore Helpers ==========
async function loadFahrtenFromFirestore(username) {
    const snapshot = await db
        .collection('users')
        .doc(username)
        .collection('fahrten')
        .orderBy('startTime', 'desc')
        .get();
    const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return normalizeFahrtFromFirestore(doc.id, data);
    });
    // lokalen Cache aktualisieren
    localStorage.setItem('fahrten', JSON.stringify(list));
    return list;
}

function normalizeFahrtFromFirestore(id, data) {
    const startTime = toDate(data.startTime);
    const endTime = data.endTime ? toDate(data.endTime) : null;
    return {
        id: data.id || id,
        docId: id,
        startTime,
        endTime,
        startLocation: data.startLocation,
        startAddress: data.startAddress,
        endLocation: data.endLocation || null,
        endAddress: data.endAddress || null,
        // routeCoordinates können als Array von Objekten ({lat,lng}) gespeichert sein → zurück in [lat,lng]
        routeCoordinates: Array.isArray(data.routeCoordinates)
            ? data.routeCoordinates.map(pt => {
                if (Array.isArray(pt) && pt.length >= 2) return [pt[0], pt[1]];
                if (pt && typeof pt.lat === 'number' && typeof pt.lng === 'number') return [pt.lat, pt.lng];
                return null;
            }).filter(Boolean)
            : [],
        distance: data.distance || 0,
        routeCalculatedWithYellowMap: data.routeCalculatedWithYellowMap || false
    };
}

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value.toDate) return value.toDate();
    return new Date(value);
}

async function saveFahrtToFirestore(username, fahrt) {
    const docRef = db
        .collection('users')
        .doc(username)
        .collection('fahrten');
    const payload = {
        id: fahrt.id,
        startTime: fahrt.startTime,
        endTime: fahrt.endTime,
        startLocation: fahrt.startLocation,
        startAddress: fahrt.startAddress || null,
        endLocation: fahrt.endLocation || null,
        endAddress: fahrt.endAddress || null,
        // Firestore unterstützt keine verschachtelten Arrays → als Objekte speichern
        routeCoordinates: Array.isArray(fahrt.routeCoordinates)
            ? fahrt.routeCoordinates.map(pt => {
                if (Array.isArray(pt) && pt.length >= 2) return { lat: pt[0], lng: pt[1] };
                if (pt && typeof pt.lat === 'number' && typeof pt.lng === 'number') return { lat: pt.lat, lng: pt.lng };
                return null;
            }).filter(Boolean)
            : [],
        distance: fahrt.distance || 0,
        routeCalculatedWithYellowMap: fahrt.routeCalculatedWithYellowMap || false
    };
    await docRef.add(payload);
}

function showFahrtDetails(fahrtId) {
    const fahrt = fahrten.find(f => f.id === fahrtId);
    if (!fahrt) return;

    // Details ausfüllen
    document.getElementById('detailStartTime').textContent = formatDateTime(fahrt.startTime);
    document.getElementById('detailEndTime').textContent = fahrt.endTime 
        ? formatDateTime(fahrt.endTime)
        : 'Noch nicht beendet';
    
    const duration = fahrt.endTime 
        ? formatDuration(fahrt.endTime - fahrt.startTime)
        : formatDuration(new Date() - fahrt.startTime);
    document.getElementById('detailDuration').textContent = duration;
    
    document.getElementById('detailDistance').textContent = fahrt.distance.toFixed(2);
    document.getElementById('detailStartLocation').textContent = fahrt.startAddress || 'Unbekannt';
    document.getElementById('detailEndLocation').textContent = fahrt.endAddress || (fahrt.endTime ? 'Unbekannt' : 'Noch nicht beendet');

    // Modal anzeigen
    const modal = document.getElementById('fahrtModal');
    modal.style.display = 'block';

    // Karte anzeigen - warten bis Modal sichtbar ist
    requestAnimationFrame(() => {
        setTimeout(() => {
            showMap(fahrt);
        }, 200);
    });
}

let currentMapInstance = null;

function showMap(fahrt) {
    const mapContainer = document.getElementById('detailMap');
    if (!mapContainer) {
        console.error('Karten-Container nicht gefunden');
        return;
    }

    // Alte Karte entfernen
    if (currentMapInstance) {
        try {
            currentMapInstance.remove();
        } catch (e) {
            console.warn('Fehler beim Entfernen der alten Karte:', e);
        }
        currentMapInstance = null;
    }

    mapContainer.innerHTML = ''; // Karte leeren

    // Prüfen ob Leaflet geladen ist
    if (typeof L === 'undefined') {
        mapContainer.innerHTML = '<p>Karten-Bibliothek wird geladen...</p>';
        setTimeout(() => showMap(fahrt), 500);
        return;
    }

    if (!fahrt.startLocation || !Number.isFinite(fahrt.startLocation.lat) || !Number.isFinite(fahrt.startLocation.lng)) {
        mapContainer.innerHTML = '<p>Keine Startposition verfügbar</p>';
        return;
    }

    const hasRoute = Array.isArray(fahrt.routeCoordinates) && fahrt.routeCoordinates.length > 0;
    if (!hasRoute && !fahrt.endLocation) {
        mapContainer.innerHTML = '<p>Keine Routendaten verfügbar</p>';
        return;
    }

    try {
        // Leaflet-Karte erstellen
        const map = L.map('detailMap', {
            preferCanvas: true
        }).setView(
            [fahrt.startLocation.lat, fahrt.startLocation.lng],
            13
        );

        currentMapInstance = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        // Route als Polyline zeichnen
        if (hasRoute && fahrt.routeCoordinates.length > 1) {
            const polyline = L.polyline(fahrt.routeCoordinates, {
                color: '#667eea',
                weight: 5,
                opacity: 0.7
            }).addTo(map);

            // Karte an Route anpassen
            try {
                map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
            } catch (e) {
                console.warn('Fehler beim Anpassen der Karte:', e);
            }
        } else if (fahrt.endLocation) {
            // Nur Start- und Endpunkt vorhanden
            const bounds = L.latLngBounds(
                [fahrt.startLocation.lat, fahrt.startLocation.lng],
                [fahrt.endLocation.lat, fahrt.endLocation.lng]
            );
            map.fitBounds(bounds, { padding: [20, 20] });
        }

        // Start-Marker
        const startMarker = L.marker([fahrt.startLocation.lat, fahrt.startLocation.lng])
            .addTo(map)
            .bindPopup(`Start: ${fahrt.startAddress || 'Unbekannt'}`);

        // End-Marker (falls vorhanden)
        if (fahrt.endLocation && Number.isFinite(fahrt.endLocation.lat) && Number.isFinite(fahrt.endLocation.lng)) {
            const endMarker = L.marker([fahrt.endLocation.lat, fahrt.endLocation.lng])
                .addTo(map)
                .bindPopup(`Ziel: ${fahrt.endAddress || 'Unbekannt'}`);
        }

        // Karte invalidieren, damit sie richtig gerendert wird
        setTimeout(() => {
            if (currentMapInstance) {
                currentMapInstance.invalidateSize();
            }
        }, 300);
    } catch (error) {
        console.error('Fehler beim Erstellen der Karte:', error);
        mapContainer.innerHTML = '<p>Fehler beim Laden der Karte. Bitte Seite neu laden.</p>';
    }
}

function closeModal() {
    document.getElementById('fahrtModal').style.display = 'none';
    
    // Karte entfernen
    if (currentMapInstance) {
        try {
            currentMapInstance.remove();
        } catch (e) {
            console.warn('Fehler beim Entfernen der Karte:', e);
        }
        currentMapInstance = null;
    }
    
    const mapContainer = document.getElementById('detailMap');
    if (mapContainer) {
        mapContainer.innerHTML = '';
    }
}

function formatDate(date) {
    return new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function formatDateTime(date) {
    return new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

