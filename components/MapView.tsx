import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Coordinates, TransportMode, MapBounds } from '../types';
import { 
  TILE_LAYER_URL, TILE_ATTRIBUTION, 
  SATELLITE_LAYER_URL, SATELLITE_ATTRIBUTION,
  TERRAIN_LAYER_URL, TERRAIN_ATTRIBUTION,
  GPS_ACTIVE_COLOR, DR_COLOR, CACHE_NAME 
} from '../constants';
import { calculateNewPosition } from '../services/navigationService';

// Fix for default Leaflet icon not finding images in webpack/react environments
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons using DivIcon for Tailwind styling
const createCustomMarker = (colorClass: string, isPin: boolean = false) => {
  return L.divIcon({
    className: 'bg-transparent',
    html: isPin 
      ? `<div class="relative">
           <div class="w-8 h-8 ${colorClass} rounded-full border-2 border-white shadow-xl flex items-center justify-center transform -translate-x-1/2 -translate-y-full">
             <div class="w-2 h-2 bg-white rounded-full"></div>
           </div>
           <div class="w-0 h-0 border-l-[6px] border-l-transparent border-t-[8px] border-t-${colorClass.replace('bg-', '')} border-r-[6px] border-r-transparent absolute top-[-2px] left-[-6px]"></div>
         </div>`
      : `<div class="w-4 h-4 ${colorClass} rounded-full border-2 border-white shadow-md"></div>`,
    iconSize: isPin ? [0, 0] : [16, 16],
    iconAnchor: isPin ? [0, 0] : [8, 8] // Center the dot
  });
};

const DestinationIcon = createCustomMarker('bg-red-600', true);
const WaypointIcon = createCustomMarker('bg-amber-500', false);

// --- Custom Offline Tile Layer ---
const OfflineTileLayer = L.TileLayer.extend({
  createTile: function (coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('img');

    L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
    L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));

    if (this.options.crossOrigin || this.options.referrerPolicy) {
      tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
    }

    tile.alt = '';
    tile.setAttribute('role', 'presentation');

    const url = this.getTileUrl(coords);
    
    // Intercept with Cache API
    caches.open(CACHE_NAME).then((cache) => {
      cache.match(url).then((response) => {
        if (response) {
          response.blob().then((blob) => {
            tile.src = URL.createObjectURL(blob);
          });
        } else {
          tile.src = url;
        }
      });
    }).catch((e) => {
      tile.src = url;
    });

    return tile;
  }
});

interface MapViewProps {
  location: Coordinates;
  heading: number;
  speed: number;
  isGpsActive: boolean;
  targetLocation: Coordinates | null;
  waypoints?: Coordinates[];
  routeCoordinates?: Coordinates[];
  recordedTrack?: Coordinates[]; // OsmAnd feature: Breadcrumb trail
  mode: TransportMode;
  onBoundsChange?: (bounds: MapBounds) => void;
  onMapClick?: (coords: Coordinates) => void;
  onMapLongPress?: (coords: Coordinates) => void;
}

export const MapView: React.FC<MapViewProps> = ({ 
  location, heading, speed, isGpsActive, targetLocation, waypoints = [], routeCoordinates, recordedTrack = [], mode, onBoundsChange, onMapClick, onMapLongPress 
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const targetMarkerRef = useRef<L.Marker | null>(null);
  const waypointMarkersRef = useRef<L.Marker[]>([]);
  const circleRef = useRef<L.Circle | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const trackLineRef = useRef<L.Polyline | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // Accumulated rotation to prevent spinner-effect when crossing 0/360 boundary
  const visualHeadingRef = useRef(heading);

  // Layer Groups for Controls
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const trackLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const waypointsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const accuracyLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Track previous location to calculate smooth interpolation/bearing if needed
  const prevLocRef = useRef<Coordinates>(location);
  // Auto-follow state: disabled if user pans manually
  const [isAutoFollow, setIsAutoFollow] = useState(true);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      contextmenu: true
    } as any).setView([location.lat, location.lng], 16);
    
    // Base Layers
    const standardLayer = new (OfflineTileLayer as any)(TILE_LAYER_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 });
    const satelliteLayer = new (OfflineTileLayer as any)(SATELLITE_LAYER_URL, { attribution: SATELLITE_ATTRIBUTION, maxZoom: 19 });
    const terrainLayer = new (OfflineTileLayer as any)(TERRAIN_LAYER_URL, { attribution: TERRAIN_ATTRIBUTION, maxZoom: 19 });

    standardLayer.addTo(map);

    // Initialize Overlay Groups
    const routeGroup = L.layerGroup().addTo(map);
    const trackGroup = L.layerGroup().addTo(map);
    const waypointsGroup = L.layerGroup().addTo(map);
    const accuracyGroup = L.layerGroup().addTo(map);

    routeLayerGroupRef.current = routeGroup;
    trackLayerGroupRef.current = trackGroup;
    waypointsLayerGroupRef.current = waypointsGroup;
    accuracyLayerGroupRef.current = accuracyGroup;

    // Add Layer Control
    L.control.layers(
      { "Standard": standardLayer, "Satellite": satelliteLayer, "Terrain": terrainLayer }, 
      { 
        "Route Path": routeGroup, 
        "Recorded Track": trackGroup,
        "Waypoints": waypointsGroup, 
        "GPS Accuracy": accuracyGroup 
      }, 
      { position: 'topleft' }
    ).addTo(map);

    // Event Handlers
    map.on('click', (e: L.LeafletMouseEvent) => onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.on('contextmenu', (e: L.LeafletMouseEvent) => onMapLongPress?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    
    // Disable auto-follow on user drag
    map.on('dragstart', () => setIsAutoFollow(false));

    map.on('moveend', () => {
      if (onBoundsChange) {
        const bounds = map.getBounds();
        onBoundsChange({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
          zoom: map.getZoom()
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // Smooth View Update Logic with Look-Ahead
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // --- 1. Update User Marker Position & Rotation ---
    
    // Smart Rotation Wrapping (Shortest Path)
    let diff = heading - (visualHeadingRef.current % 360);
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    visualHeadingRef.current += diff;

    // Visual State: Green for GPS, Amber/Orange for Dead Reckoning
    const markerColor = isGpsActive ? 'border-b-blue-600' : 'border-b-amber-500';

    if (!userMarkerRef.current) {
      // Custom DivIcon for the user marker (Vehicle/Arrow)
      // The color changes dynamically via ID manipulation below to avoid re-creating the marker
      const userIcon = L.divIcon({
        className: 'bg-transparent',
        html: `<div id="user-heading-marker" class="w-0 h-0 border-l-[8px] border-l-transparent border-b-[20px] ${markerColor} border-r-[8px] border-r-transparent filter drop-shadow-md transition-transform duration-200 ease-linear" style="transform: rotate(${visualHeadingRef.current}deg);"></div>`,
        iconSize: [16, 20],
        iconAnchor: [8, 10]
      });
      userMarkerRef.current = L.marker([location.lat, location.lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([location.lat, location.lng]);
      
      // Update heading rotation and color efficiently via direct DOM access
      const el = document.getElementById('user-heading-marker');
      if (el) {
        el.style.transform = `rotate(${visualHeadingRef.current}deg)`;
        // Update color class for DR vs GPS
        if (isGpsActive) {
            el.classList.add('border-b-blue-600');
            el.classList.remove('border-b-amber-500');
        } else {
            el.classList.add('border-b-amber-500');
            el.classList.remove('border-b-blue-600');
        }
      }
    }

    // --- 2. Update Accuracy Circle ---
    const radius = isGpsActive ? 20 : 150; 
    const color = isGpsActive ? GPS_ACTIVE_COLOR : DR_COLOR;
    
    if (accuracyLayerGroupRef.current) {
        if (!circleRef.current) {
          circleRef.current = L.circle([location.lat, location.lng], { radius, color, fillColor: color, fillOpacity: 0.15, weight: 1 });
          circleRef.current.addTo(accuracyLayerGroupRef.current);
        } else {
          circleRef.current.setLatLng([location.lat, location.lng]);
          circleRef.current.setRadius(radius);
          circleRef.current.setStyle({ color, fillColor: color });
        }
    }

    // --- 3. Look-Ahead Camera Follow Logic ---
    if (isAutoFollow) {
      const currentCenter = map.getCenter();
      const dist = currentCenter.distanceTo([location.lat, location.lng]);

      // Calculate "Look Ahead" point
      // If moving (speed > 1 m/s), center the map ahead of the vehicle
      // This allows the user to see the upcoming route.
      // 3 seconds look ahead or minimum 20m if moving
      const lookAheadDist = speed > 1 ? Math.max(30, speed * 3) : 0; 
      
      // Calculate target center based on current heading
      const targetCenter = lookAheadDist > 0 
          ? calculateNewPosition(location, lookAheadDist, heading)
          : location;

      if (dist > 500) {
        // Large jump: fly animation (e.g. initial load or re-center)
        map.flyTo([targetCenter.lat, targetCenter.lng], map.getZoom(), { duration: 1.5 });
      } else {
        // Continuous updates: use setView without animation to prevent Leaflet tween conflicts
        // with the high-frequency physics loop from App.tsx.
        // The smoothness comes from the smooth inputs.
        map.setView([targetCenter.lat, targetCenter.lng], map.getZoom(), { animate: false });
      }
    }
    
    prevLocRef.current = location;
  }, [location, heading, speed, isGpsActive, isAutoFollow]);

  // Render Target Marker (in Waypoints Group)
  useEffect(() => {
    if (!waypointsLayerGroupRef.current) return;

    if (targetLocation) {
        if (!targetMarkerRef.current) {
            targetMarkerRef.current = L.marker([targetLocation.lat, targetLocation.lng], { icon: DestinationIcon });
            targetMarkerRef.current.addTo(waypointsLayerGroupRef.current);
        } else {
            targetMarkerRef.current.setLatLng([targetLocation.lat, targetLocation.lng]);
             // Ensure it's in the group if it was removed/re-added (edge case)
            if (!waypointsLayerGroupRef.current.hasLayer(targetMarkerRef.current)) {
                targetMarkerRef.current.addTo(waypointsLayerGroupRef.current);
            }
        }
        
        // Re-enable auto follow when a new destination is set
        setIsAutoFollow(true);
    } else {
        if (targetMarkerRef.current) {
            targetMarkerRef.current.remove();
            targetMarkerRef.current = null;
        }
    }
  }, [targetLocation]);

  // Render Waypoint Markers (in Waypoints Group)
  useEffect(() => {
      if (!waypointsLayerGroupRef.current) return;

      // Remove old markers
      waypointMarkersRef.current.forEach(m => m.remove());
      waypointMarkersRef.current = [];

      // Add new markers
      waypoints.forEach(wp => {
          if (waypointsLayerGroupRef.current) {
              const marker = L.marker([wp.lat, wp.lng], { icon: WaypointIcon });
              marker.addTo(waypointsLayerGroupRef.current);
              waypointMarkersRef.current.push(marker);
          }
      });
  }, [waypoints]);

  // Draw Route (in Route Group)
  useEffect(() => {
    if (!routeLayerGroupRef.current) return;

    if (routeLineRef.current) routeLineRef.current.remove();

    let path: [number, number][] = [];
    if (routeCoordinates && routeCoordinates.length > 0) {
        path = routeCoordinates.map(c => [c.lat, c.lng]);
    } else if (targetLocation) {
        path = [[location.lat, location.lng]];
        waypoints.forEach(wp => path.push([wp.lat, wp.lng]));
        path.push([targetLocation.lat, targetLocation.lng]);
    }

    if (path.length > 0) {
      routeLineRef.current = L.polyline(path, {
        color: '#3b82f6', weight: 6, opacity: 0.8, lineCap: 'round', lineJoin: 'round',
        dashArray: mode === TransportMode.WALK ? '1, 8' : undefined 
      });
      routeLineRef.current.addTo(routeLayerGroupRef.current);
    }

  }, [routeCoordinates, waypoints, targetLocation, mode]); 

  // Draw Recorded Track (Breadcrumbs) - OsmAnd Style
  useEffect(() => {
    if (!trackLayerGroupRef.current) return;
    
    // Remove existing track line if any
    if (trackLineRef.current) trackLineRef.current.remove();

    if (recordedTrack.length > 1) {
        const path = recordedTrack.map(c => [c.lat, c.lng] as [number, number]);
        
        // Red dashed line for recording
        trackLineRef.current = L.polyline(path, {
            color: '#ef4444', // Red-500
            weight: 4,
            opacity: 0.6,
            dashArray: '5, 10',
            lineCap: 'butt'
        });
        trackLineRef.current.addTo(trackLayerGroupRef.current);
    }
  }, [recordedTrack]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full z-0 outline-none" />
      
      {/* Recenter Button (appears when user pans away) */}
      {!isAutoFollow && (
        <button 
          onClick={() => setIsAutoFollow(true)}
          className="absolute bottom-6 right-6 z-[400] bg-white text-blue-600 p-3 rounded-full shadow-xl border border-blue-100 flex items-center justify-center animate-bounce"
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      )}
    </div>
  );
};