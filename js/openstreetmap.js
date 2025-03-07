class RouteManager {
    constructor() {
        this.map = null;
        this.drawnItems = new L.FeatureGroup();
        this.routeMarkers = { start: null, end: null };
        this.currentRoute = null;
        this.routingControl = null;
        this.geofences = [];
        this.savedPolylines = []; // <--- Añadir esta línea
        this.initMap();
        this.initEventListeners();
        this.setupDrawControls();
    }

    initMap() {
        this.map = L.map('map').setView([21.150385, -86.8619659], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        this.drawnItems.addTo(this.map);
    }

    setupDrawControls() {
        new L.Control.Draw({
            draw: {
                polygon: true,
                polyline: true,
                rectangle: true,
                circle: true,
                marker: false
            },
            edit: { featureGroup: this.drawnItems }
        }).addTo(this.map);

        this.map.on('draw:created', (e) => this.handleDrawCreated(e));
    }




    handleDrawCreated(e) {
        const layer = e.layer;
        this.drawnItems.addLayer(layer);
        if (layer instanceof L.Polygon) {
            layer.bindPopup('Geocerca - Guardar para persistir');
        }
    }

    initEventListeners() {
        const actions = {
            'btn-start-point': () => this.setMarker('start'),
            'btn-end-point': () => this.setMarker('end'),
            'btn-calculate-route': () => this.calculateRoute(),
            'btn-clear-route': () => this.clearRoute(),
            'btn-save-geofence': () => this.saveGeofence(),
            'btn-save-polyline': () => this.savePolyline(),
            'btn-clear-all': () => this.clearAll(),
            'btn-predefined-route': () => this.createPredefinedRoute(),
            'btn-animated-route': () => this.drawAnimatepolilina()
        };

        Object.entries(actions).forEach(([id, handler]) => {
            document.getElementById(id).addEventListener('click', handler);
        });

        this.map.on('click', (e) => this.handleMapClick(e));
    }

    setMarker(type) {
        this.showStatus(`Haz clic para establecer el punto ${type === 'start' ? 'inicial' : 'final'}`);
        this.activeMarkerType = type;
    }

    handleMapClick(e) {
        if (!this.activeMarkerType) return;

        const marker = L.marker(e.latlng, {
            draggable: true,
            icon: L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                iconSize: [32, 41],
                iconAnchor: [16, 41]
            })
        }).addTo(this.map);

        if (this.routeMarkers[this.activeMarkerType]) {
            this.map.removeLayer(this.routeMarkers[this.activeMarkerType]);
        }

        this.routeMarkers[this.activeMarkerType] = marker;
        marker.bindPopup(`Punto ${this.activeMarkerType === 'start' ? 'Inicial' : 'Final'}`);
        this.activeMarkerType = null;
    }

    async calculateRoute() {
        if (!this.routeMarkers.start || !this.routeMarkers.end) {
            this.showStatus('Debes establecer ambos puntos de la ruta', 'error');
            return;
        }

        try {
            if (this.routingControl) this.map.removeControl(this.routingControl);

            this.routingControl = L.Routing.control({
                waypoints: [
                    this.routeMarkers.start.getLatLng(),
                    this.routeMarkers.end.getLatLng()
                ],
                router: L.Routing.osrmv1(),
                routeWhileDragging: false,
                show: false,
                lineOptions: { styles: [{ color: '#2980b9', weight: 5 }] }
            }).addTo(this.map);

            this.routingControl.on('routesfound', (e) => {
                this.currentRoute = e.routes[0];
                this.checkGeofenceIntersections();
            });

        } catch (error) {
            this.showStatus(`Error al calcular ruta: ${error.message}`, 'error');
        }
    }

    checkGeofenceIntersections() {
        if (!this.currentRoute || this.geofences.length === 0) return;

        const routeCoords = this.currentRoute.coordinates.map(c => [c.lng, c.lat]);
        const routeLine = turf.lineString(routeCoords);

        this.geofences.forEach(geofence => {
            const polygon = turf.polygon(geofence.geometry.coordinates);
            if (turf.booleanIntersects(routeLine, polygon)) {
                this.showStatus(`¡Advertencia! Ruta atraviesa ${geofence.properties.name}`, 'warning');
            }
        });
    }

    saveGeofence() {

        try {
            const newGeofences = this.drawnItems.getLayers()
                .filter(layer => layer instanceof L.Polygon)
                .map(layer => ({
                    type: 'Feature',
                    properties: {
                        id: `geofence_${Date.now()}`,
                        name: `Geocerca ${this.geofences.length + 1}`
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [layer.getLatLngs()[0].map(ll => [ll.lng, ll.lat])]
                    }
                }));

            this.geofences.push(...newGeofences);
            this.showStatus(`${newGeofences.length} geocercas guardadas`, 'success');


        } catch {

        } finally {
            this.showJsonModal(this.geofences)
        }



    }
    savePolyline() {
        const polylines = this.drawnItems.getLayers()
            .filter(layer => layer instanceof L.Polyline)
            .map((layer, index) => {
                const coordinates = layer.getLatLngs().map(ll => [ll.lat, ll.lng]);
                const lineString = turf.lineString(coordinates);

                return {
                    type: 'Feature',
                    properties: {
                        id: `polyline_${Date.now()}_${index}`,
                        name: `Polilínea ${this.savedPolylines.length + index + 1}`, // Corregido
                        length: turf.length(lineString, { units: 'kilometers' }).toFixed(3) + ' km'
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    }
                };
            });

        if (polylines.length > 0) {
            this.savedPolylines.push(...polylines); // <--- Guardar en el array
            this.showJsonModal({
                type: 'FeatureCollection',
                features: polylines
            });
            this.showStatus(`${polylines.length} polilínea(s) guardada(s)`, 'success');

            this.drawnItems.getLayers()
                .filter(layer => layer instanceof L.Polyline)
                .forEach(layer => {
                    layer.setStyle({
                        color: '#8e44ad',
                        weight: 4,
                        dashArray: '5, 5'
                    });
                });
        } else {
            this.showStatus('No hay polilíneas para guardar', 'warning');
        }
    }

    createPredefinedRoute() {
        const encodedPolyline = 'kgg`CxvmqOxMiGvU|T`MgGqaEomKlaA}Jhs@jV';
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/polyline(${encodeURIComponent(encodedPolyline)})?overview=full&geometries=polyline`;

        if (this.currentRoute) this.map.removeLayer(this.currentRoute);

        fetch(osrmUrl)
            .then(response => response.json())
            .then(data => {
                if (data.code !== 'Ok') throw new Error(data.message || 'Error en la ruta');
                const coords = window.polyline.decode(data.routes[0].geometry);
                this.currentRoute = L.polyline(coords.map(c => [c[0], c[1]]), {
                    color: 'blue',
                    weight: 4,
                    opacity: 0.7,
                    dashArray: '10, 10'
                }).addTo(this.map);
                this.map.fitBounds(this.currentRoute.getBounds());
                this.checkGeofenceIntersections({ geometry: { coordinates: coords } });
            })
            .catch(error => alert('Error al crear la ruta: ' + error.message));
    }

clearRoute() {
    if (this.routingControl) this.map.removeControl(this.routingControl);
    if (this.currentRoute) this.map.removeLayer(this.currentRoute);
    this.currentRoute = null;
}

clearAll() {
    this.clearRoute();
    this.drawnItems.clearLayers();
    Object.values(this.routeMarkers).forEach(m => m && this.map.removeLayer(m));
    this.geofences = [];
    this.showStatus('Todos los elementos han sido eliminados', 'info');
}

showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    statusEl.className = `status-message ${type}`;
    setTimeout(() => statusEl.style.display = 'none', 3000);
}

showJsonModal(data) {
    const modal = document.getElementById('jsonModal');
    document.getElementById('jsonContent').textContent = JSON.stringify(data, null, 2);
    modal.style.display = 'flex';

    document.querySelector('.modal-close').onclick = () => modal.style.display = 'none';
    window.onclick = (e) => e.target === modal && (modal.style.display = 'none');
}


drawAnimatepolilina() {

    this.clearRoute();
    this.drawnItems.clearLayers();

    const coordinates = [
        [21.177715, -86.910599],
        [21.175245, -86.909178],
        [21.172372, -86.911133],
        [21.171535, -86.912774],
        [21.169465, -86.911486],
        [21.185800, -86.879650],
        [21.186574, -86.877757],
        [21.190384, -86.870091],
        [21.198214, -86.854723],
        [21.199660, -86.852914],
        [21.200436, -86.850354],
        [21.200478, -86.847734],
        [21.199558, -86.847748],
        [21.198431, -86.848345],
        [21.189983, -86.845794],
        [21.187195, -86.847017],
        [21.186907, -86.847512],
        [21.186483, -86.847457],
        [21.182631, -86.849194],
        [21.181542, -86.849614],
        [21.181444, -86.849367],
        [21.182220, -86.849008],
        [21.180774, -86.848197],
        [21.187521, -86.834395],
        [21.177167, -86.828548],
        [21.178088, -86.826415],
        [21.175232, -86.824812],
        [21.174201, -86.826766],
        [21.170467, -86.826543],
        [21.164268, -86.825999],
        [21.163572, -86.826234],
        [21.162968, -86.825874],
        [21.157527, -86.825503],
        [21.157463, -86.825333],
        [21.157919, -86.825287]
    ];

    // Referencia a la instancia de la clase
    const self = this;

    // Dibujar la polilínea completa (estática)
    const staticPolyline = L.polyline(coordinates, {
        color: 'blue',
        weight: 4,
        opacity: 0.5
    }).addTo(this.map);

    // Crear una polilínea animada
    let dashOffset = 0;
    const animatedPolyline = L.polyline(coordinates, {
        color: 'green',
        weight: 8,
        opacity: 0.8,
        dashArray: '20, 20',
        dashOffset: dashOffset
    }).addTo(this.map);

    // Función para animar la línea
    function animateDash() {
        dashOffset -= 1;
        animatedPolyline.setStyle({ dashOffset: dashOffset });
        requestAnimationFrame(animateDash);
    }

    // Iniciar la animación
    animateDash();

    // Configurar íconos
    const greenIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const blueIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    // Añadir marcadores
    L.marker(coordinates[0], { icon: greenIcon })
        .addTo(this.map)
        .bindPopup('Inicio');

    L.marker(coordinates[coordinates.length - 1], { icon: blueIcon })
        .addTo(this.map)
        .bindPopup('Fin');

    // Ajustar el mapa
    this.map.fitBounds(staticPolyline.getBounds());
}


}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    if (!window.L || !window.polyline || !window.turf) {
        alert('Error al cargar dependencias requeridas');
        return;
    }
    new RouteManager();
});