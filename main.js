// Haupt-Funktionalität für das Fahrtenbuch

let currentFahrt = null;
let watchId = null;
let routeCoordinates = [];
let fahrten = [];
let db = null;

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
    
    // Modal schließen bei Klick außerhalb
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('fahrtModal');
        if (event.target === modal) {
            closeModal();
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
            })
            .catch((err) => {
                console.warn('Firestore nicht verfügbar, nutze LocalStorage:', err);
                loadFahrten();
                renderLists();
            });
    } else {
        loadFahrten();
        renderLists();
    }

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
                        distance: 0
                    };

                    routeCoordinates = [[startLocation.lat, startLocation.lng]];

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
        distance: 0
    };

    routeCoordinates = [[location.lat, location.lng]];

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
    const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };

    if (currentFahrt) {
        // Neue Koordinate hinzufügen
        currentFahrt.routeCoordinates.push([newLocation.lat, newLocation.lng]);
        routeCoordinates.push([newLocation.lat, newLocation.lng]);

        // Distanz berechnen
        if (currentFahrt.routeCoordinates.length > 1) {
            const lastCoord = currentFahrt.routeCoordinates[currentFahrt.routeCoordinates.length - 2];
            const distance = calculateDistance(
                lastCoord[0], lastCoord[1],
                newLocation.lat, newLocation.lng
            );
            currentFahrt.distance += distance;
        }

        // Aktualisierte Fahrt speichern
        saveCurrentFahrt();
    }
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
            if (routeCoordinates.length > 0) {
                const lastCoord = routeCoordinates[routeCoordinates.length - 1];
                finishFahrt(
                    { lat: lastCoord[0], lng: lastCoord[1] },
                    'Unbekannte Adresse'
                );
            }
        }
    );
}

function finishFahrt(endLocation, endAddress) {
    currentFahrt.endTime = new Date();
    currentFahrt.endLocation = endLocation;
    currentFahrt.endAddress = endAddress;

    // Gesamtdistanz berechnen (falls noch nicht geschehen)
    if (currentFahrt.distance === 0 && currentFahrt.routeCoordinates.length > 1) {
        let totalDistance = 0;
        for (let i = 1; i < currentFahrt.routeCoordinates.length; i++) {
            const prev = currentFahrt.routeCoordinates[i - 1];
            const curr = currentFahrt.routeCoordinates[i];
            totalDistance += calculateDistance(prev[0], prev[1], curr[0], curr[1]);
        }
        currentFahrt.distance = totalDistance;
    }

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

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius der Erde in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
            routeCoordinates = currentFahrt.routeCoordinates || [];

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
        distance: data.distance || 0
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
        distance: fahrt.distance || 0
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

    // Karte anzeigen
    setTimeout(() => {
        showMap(fahrt);
    }, 100);

    // Modal anzeigen
    document.getElementById('fahrtModal').style.display = 'block';
}

function showMap(fahrt) {
    const mapContainer = document.getElementById('detailMap');
    mapContainer.innerHTML = ''; // Karte leeren

    if (!fahrt.routeCoordinates || fahrt.routeCoordinates.length === 0) {
        mapContainer.innerHTML = '<p>Keine Routendaten verfügbar</p>';
        return;
    }

    // Leaflet-Karte erstellen
    const map = L.map('detailMap').setView(
        [fahrt.startLocation.lat, fahrt.startLocation.lng],
        13
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Route als Polyline zeichnen
    if (fahrt.routeCoordinates.length > 1) {
        const polyline = L.polyline(fahrt.routeCoordinates, {
            color: '#667eea',
            weight: 5,
            opacity: 0.7
        }).addTo(map);

        // Karte an Route anpassen
        map.fitBounds(polyline.getBounds());
    }

    // Start-Marker
    const startMarker = L.marker([fahrt.startLocation.lat, fahrt.startLocation.lng])
        .addTo(map)
        .bindPopup(`Start: ${fahrt.startAddress || 'Unbekannt'}`);

    // End-Marker (falls vorhanden)
    if (fahrt.endLocation) {
        const endMarker = L.marker([fahrt.endLocation.lat, fahrt.endLocation.lng])
            .addTo(map)
            .bindPopup(`Ziel: ${fahrt.endAddress || 'Unbekannt'}`);
    }
}

function closeModal() {
    document.getElementById('fahrtModal').style.display = 'none';
    // Karte entfernen
    const mapContainer = document.getElementById('detailMap');
    mapContainer.innerHTML = '';
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

