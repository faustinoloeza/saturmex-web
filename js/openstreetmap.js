class RouteManager {
    constructor() {
        this.map = null;
        this.drawnItems = new L.FeatureGroup();
        this.routeMarkers = { start: null, end: null };
        this.currentRoute = null;
        this.routingControl = null;
        this.geofences = [];
        this.savedPolylines = [];
        this.externalRoutes = [];
        this.activeRoutePolyline = null;
        this.editingPolyline = null; // Track the polyline being edited
        this.vertexMarkers = []; // Track markers for polyline vertices
        this.polylineLayer = null; // Track the polyline layer
        this.initMap();
        this.loadExternalRoutes();
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

    async loadExternalRoutes() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/floezahs/satur/refs/heads/main/rautes.json');
            if (!response.ok) throw new Error('Error al cargar las rutas');
            
            const data = await response.json();
            
            this.externalRoutes = [];
            
            data.forEach(collection => {
                if (collection.type === 'FeatureCollection' && Array.isArray(collection.features)) {
                    collection.features.forEach(feature => {
                        this.externalRoutes.push(feature);
                    });
                }
            });
            
            this.renderRoutesList();
        } catch (error) {
            this.showStatus(`Error al cargar rutas: ${error.message}`, 'error');
            document.getElementById('routes-list').innerHTML = '<p>Error al cargar rutas</p>';
        }
    }

    renderRoutesList() {
        const routesList = document.getElementById('routes-list');
        
        if (!this.externalRoutes || this.externalRoutes.length === 0) {
            routesList.innerHTML = '<p>No hay rutas disponibles</p>';
            return;
        }

        let html = '';
        this.externalRoutes.forEach((route, index) => {
            const routeName = route.properties?.name || `Ruta ${index + 1}`;
            html += `<div class="route-item" data-route-index="${index}">${routeName}</div>`;
        });

        routesList.innerHTML = html;

        document.querySelectorAll('.route-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const routeIndex = parseInt(e.target.getAttribute('data-route-index'));
                this.displayRouteOnMap(routeIndex);
                
                document.querySelectorAll('.route-item').forEach(el => el.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    }

    displayRouteOnMap(routeIndex) {
        if (this.activeRoutePolyline) {
            if (this.activeRoutePolyline instanceof L.LayerGroup) {
                this.activeRoutePolyline.eachLayer(layer => {
                    this.map.removeLayer(layer);
                });
            } else {
                this.map.removeLayer(this.activeRoutePolyline);
            }
            this.activeRoutePolyline = null;
        }

        // Limpiar marcadores de ruta anteriores
        if (this.routeMarkers.start) {
            this.map.removeLayer(this.routeMarkers.start);
            this.routeMarkers.start = null;
        }
        if (this.routeMarkers.end) {
            this.map.removeLayer(this.routeMarkers.end);
            this.routeMarkers.end = null;
        }

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        const route = this.externalRoutes[routeIndex];
        if (!route || !route.geometry || !route.geometry.coordinates) {
            this.showStatus('Formato de ruta inválido', 'error');
            return;
        }

        const coordinates = route.geometry.coordinates;

        if (coordinates.length < 2) {
            this.showStatus('La ruta no tiene suficientes coordenadas válidas', 'error');
            return;
        }

        const staticPolyline = L.polyline(coordinates, {
            color: 'blue',
            weight: 4,
            opacity: 0.5
        });

        let dashOffset = 0;
        const animatedPolyline = L.polyline(coordinates, {
            color: 'green',
            weight: 8,
            opacity: 0.8,
            dashArray: '20, 20',
            dashOffset: dashOffset
        });

        // Crear marcadores para inicio y final de la ruta
        const startCoord = coordinates[0];
        const endCoord = coordinates[coordinates.length - 1];

        // Marcador de inicio (verde)
        this.routeMarkers.start = L.marker([startCoord[0], startCoord[1]], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(this.map);

        // Marcador de final (rojo)
        this.routeMarkers.end = L.marker([endCoord[0], endCoord[1]], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(this.map);

    // Agregar popups a los marcadores
    const routeName = route.properties?.name || 'Ruta seleccionada';
    // Add a button in the popup that opens Street View for the start and end coordinates
    this.routeMarkers.start.bindPopup(`<b>Inicio:</b> ${routeName}<br><button onclick="document.routeManager.openStreetView(${startCoord[0]}, ${startCoord[1]})">Ver Street View (Inicio)</button>`);
    this.routeMarkers.end.bindPopup(`<b>Final:</b> ${routeName}<br><button onclick="document.routeManager.openStreetView(${endCoord[0]}, ${endCoord[1]})">Ver Street View (Final)</button>`);

        this.activeRoutePolyline = L.layerGroup([staticPolyline, animatedPolyline]);
        this.activeRoutePolyline.addTo(this.map);

        const self = this;
        function animateDash() {
            dashOffset -= 1;
            animatedPolyline.setStyle({ dashOffset: dashOffset });
            self.animationFrameId = requestAnimationFrame(animateDash);
        }

        animateDash();

        this.map.fitBounds(staticPolyline.getBounds());

        const routeLength = route.properties?.length || '';
        this.showStatus(`Mostrando: ${routeName} (${routeLength})`, 'info');

        // Remove any previous route action button
        const prevAction = document.getElementById('routeAction');
        if (prevAction) prevAction.remove();

        // Create a small action area below the status message with Street View buttons for start and end
        const actionDiv = document.createElement('div');
        actionDiv.id = 'routeAction';
        actionDiv.style.marginTop = '8px';
        actionDiv.innerHTML = `
            <button class="btn-info" id="btn-streetview-start">Ver Street View (Inicio)</button>
            <button class="btn-info" id="btn-streetview-end">Ver Street View (Final)</button>
        `;
        const statusEl = document.getElementById('statusMessage');
        if (statusEl && statusEl.parentNode) {
            statusEl.parentNode.insertBefore(actionDiv, statusEl.nextSibling);
            document.getElementById('btn-streetview-start').addEventListener('click', () => {
                this.openStreetView(startCoord[0], startCoord[1]);
            });
            document.getElementById('btn-streetview-end').addEventListener('click', () => {
                this.openStreetView(endCoord[0], endCoord[1]);
            });
        }
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
        } else if (layer instanceof L.Polyline) {
            layer.bindPopup('Polilínea - Guardar para persistir');
        }
    }

    initEventListeners() {
        const actions = {

            'btn-save-geofence': () => this.saveGeofence(),
            'btn-save-polyline': () => this.savePolyline(),
            'btn-paste-edit-polyline': () => this.pasteAndEditPolyline(),
            'btn-clear-all': () => this.clearAll()
        };

        Object.entries(actions).forEach(([id, handler]) => {
            document.getElementById(id).addEventListener('click', handler);
        });

        document.getElementById('btn-load-pasted-json').addEventListener('click', () => this.loadPastedJson());
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
            this.showStatus('Error al guardar geocercas', 'error');
        } finally {
            this.showJsonModal(this.geofences);
        }
    }

    savePolyline() {
        let polylineToSave = null;
        let coordinates = [];
        let polylineName = '';

        // Caso 1: Polilínea editada desde JSON pegado
        if (this.editingPolyline && this.polylineLayer) {
            coordinates = this.vertexMarkers.map(marker => {
                const latlng = marker.getLatLng();
                return [latlng.lat, latlng.lng];
            });
            polylineName = this.editingPolyline.properties.name || 'Polilínea editada';
        } 
        // Caso 2: Polilíneas dibujadas con las herramientas del mapa
        else {
            const drawnPolylines = this.drawnItems.getLayers()
                .filter(layer => layer instanceof L.Polyline && !(layer instanceof L.Polygon));

            if (drawnPolylines.length === 0) {
                this.showStatus('No hay polilíneas para guardar', 'warning');
                return;
            }

            // Tomar la última polilínea dibujada
            const polylineLayer = drawnPolylines[drawnPolylines.length - 1];
            coordinates = polylineLayer.getLatLngs().map(latlng => [latlng.lat, latlng.lng]);
            polylineName = `Polilínea ${this.savedPolylines.length + 1}`;
        }

        if (coordinates.length < 2) {
            this.showStatus('La polilínea debe tener al menos 2 puntos', 'error');
            return;
        }

        try {
            const lineString = turf.lineString(coordinates);
            const savedPolyline = {
                type: 'Feature',
                properties: {
                    id: `polyline_${Date.now()}`,
                    name: polylineName,
                    length: turf.length(lineString, { units: 'kilometers' }).toFixed(3) + ' km'
                },
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                }
            };

            this.savedPolylines.push(savedPolyline);
            this.showJsonModal({
                type: 'FeatureCollection',
                features: [savedPolyline]
            });
            this.showStatus(`Polilínea ${savedPolyline.properties.name} guardada`, 'success');

            // Solo limpiar estado de edición si era una polilínea editada
            if (this.editingPolyline) {
                this.clearEditingState();
            }

        } catch (error) {
            this.showStatus(`Error al guardar polilínea: ${error.message}`, 'error');
        }
    }

    pasteAndEditPolyline() {
        const modal = document.getElementById('pasteJsonModal');
        modal.style.display = 'flex';

        document.querySelector('#pasteJsonModal .modal-close').onclick = () => {
            modal.style.display = 'none';
            document.getElementById('pasteJsonInput').value = '';
        };

        window.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.getElementById('pasteJsonInput').value = '';
            }
        };
    }

    loadPastedJson() {
        const jsonInput = document.getElementById('pasteJsonInput').value;
        try {
            const geojson = JSON.parse(jsonInput);
            if (geojson.type !== 'FeatureCollection' || !geojson.features || geojson.features.length === 0) {
                throw new Error('GeoJSON inválido: debe ser un FeatureCollection con al menos un Feature');
            }

            const feature = geojson.features[0];
            if (feature.geometry.type !== 'LineString' || !feature.geometry.coordinates) {
                throw new Error('El Feature debe ser un LineString con coordenadas válidas');
            }

            this.clearEditingState();
            this.editingPolyline = feature;
            const coordinates = feature.geometry.coordinates.map(coord => [coord[0], coord[1]]);

            // Create polyline
            this.polylineLayer = L.polyline(coordinates, {
                color: '#ff0000',
                weight: 4,
                opacity: 0.7
            }).addTo(this.drawnItems);
            this.drawnItems.addTo(this.map);
            // Add double-click event to add new vertices
            this.polylineLayer.on('dblclick', (e) => this.addVertex(e));

            // Create draggable markers for each vertex
            this.vertexMarkers = coordinates.map((coord, index) => {
                const marker = L.marker([coord[0], coord[1]], {
                    draggable: true,
                    icon: L.icon({
                        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41]
                    })
                }).addTo(this.map);

                // Update popup with delete button
                this.updateMarkerPopup(marker, index);

                // Handle marker drag
                marker.on('drag', () => {
                    this.updatePolylineFromMarkers();
                });

                return marker;
            });

            this.map.fitBounds(this.polylineLayer.getBounds());
            document.getElementById('pasteJsonModal').style.display = 'none';
            document.getElementById('pasteJsonInput').value = '';
            this.showStatus(`Polilínea ${feature.properties.name || 'cargada'} lista para editar. Arrastra puntos, haz doble clic en la polilínea para agregar puntos, o usa el botón Eliminar en los marcadores.`, 'info');
        } catch (error) {
            this.showStatus(`Error al cargar GeoJSON: ${error.message}`, 'error');
        }
    }

    updateMarkerPopup(marker, index) {
        marker.bindPopup(`
            Punto ${index + 1}
            <br>
            <button onclick="document.routeManager.deleteVertexMarker(${index})">Eliminar</button>
        `);
    }

    addVertex(e) {
        L.DomEvent.stopPropagation(e);
        const latlng = e.latlng;
        const coordinates = this.vertexMarkers.map(marker => marker.getLatLng());
        let closestSegmentIndex = -1;
        let minDistance = Infinity;

        // Find the closest segment to the click point
        for (let i = 0; i < coordinates.length - 1; i++) {
            const segment = turf.lineString([
                [coordinates[i].lat, coordinates[i].lng],
                [coordinates[i + 1].lat, coordinates[i + 1].lng]
            ]);
            const point = turf.point([latlng.lat, latlng.lng]);
            const distance = turf.pointToLineDistance(point, segment, { units: 'kilometers' });
            if (distance < minDistance) {
                minDistance = distance;
                closestSegmentIndex = i;
            }
        }

        if (closestSegmentIndex === -1) return;

        // Add new marker at the clicked position
        const newMarker = L.marker(latlng, {
            draggable: true,
            icon: L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(this.map);

        newMarker.on('drag', () => {
            this.updatePolylineFromMarkers();
        });

        // Insert marker at the correct position
        this.vertexMarkers.splice(closestSegmentIndex + 1, 0, newMarker);
        this.updateMarkerPopups();
        this.updatePolylineFromMarkers();
    }

    updateMarkerPopups() {
        this.vertexMarkers.forEach((marker, index) => {
            this.updateMarkerPopup(marker, index);
        });
    }

    deleteVertexMarker(index) {
        if (this.vertexMarkers.length < 2) {
            this.showStatus('La polilínea debe tener al menos 2 puntos', 'error');
            return;
        }

        const marker = this.vertexMarkers[index];
        this.map.removeLayer(marker);
        this.vertexMarkers.splice(index, 1);
        this.updatePolylineFromMarkers();
        this.updateMarkerPopups();
    }

    updatePolylineFromMarkers() {
        const coordinates = this.vertexMarkers.map(marker => {
            const latlng = marker.getLatLng();
            return [latlng.lat, latlng.lng];
        });
        if (this.polylineLayer) {
            this.polylineLayer.setLatLngs(coordinates);
        }
    }

    clearEditingState() {
        this.drawnItems.clearLayers();
        this.vertexMarkers.forEach(marker => this.map.removeLayer(marker));
        this.vertexMarkers = [];
        this.polylineLayer = null;
        this.editingPolyline = null;
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
        this.clearEditingState();
        Object.values(this.routeMarkers).forEach(m => m && this.map.removeLayer(m));
        this.geofences = [];
        
        if (this.activeRoutePolyline) {
            if (this.activeRoutePolyline instanceof L.LayerGroup) {
                this.activeRoutePolyline.eachLayer(layer => {
                    this.map.removeLayer(layer);
                });
            } else {
                this.map.removeLayer(this.activeRoutePolyline);
            }
            this.activeRoutePolyline = null;
        }
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        document.querySelectorAll('.route-item').forEach(el => el.classList.remove('active'));
        
        this.showStatus('Todos los elementos han sido eliminados', 'info');

        // Remove any route-specific action button
        const action = document.getElementById('routeAction');
        if (action && action.parentNode) action.parentNode.removeChild(action);
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

    // Open Google Street View for a given latitude and longitude
    openStreetView(lat, lng) {
        // Ensure numbers
        if (isNaN(lat) || isNaN(lng)) {
            alert('⚠️ Por favor ingresa coordenadas válidas');
            return;
        }

        // URL de Google Maps con Street View a nivel de calle
        // Formato aproximado con parameters for 3D/StreetView
        const streetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s!2e0!7i16384!8i8192`;

        // Abrir en nueva pestaña
        window.open(streetViewUrl, '_blank');
    }

    
}

// Expose RouteManager to global scope for popup button
document.routeManager = new RouteManager();

document.addEventListener('DOMContentLoaded', () => {
    if (!window.L || !window.polyline || !window.turf) {
        alert('Error al cargar dependencias requeridas');
        return;
    }
    document.routeManager = new RouteManager();
});