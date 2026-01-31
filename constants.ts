import { Coordinates } from "./types";

// Default start location (Rural India context - approximate location)
export const DEFAULT_START_LOCATION: Coordinates = {
  lat: 26.9124, // Jaipur/Rajasthan region (referencing 'ARYA College' from PDF)
  lng: 75.7873
};

// Standard OSM
export const TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Satellite (Esri World Imagery)
export const SATELLITE_LAYER_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const SATELLITE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

// Terrain (Esri World Topo)
export const TERRAIN_LAYER_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
export const TERRAIN_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community';

// Offline Capabilities
export const CACHE_NAME = 'ruralnav-offline-tiles-v1';
export const MAX_OFFLINE_ZOOM_DEPTH = 2; // How many zoom levels deeper to download
export const MAX_TILES_PER_DOWNLOAD = 500; // Safety limit

// Dead Reckoning Constants
export const WALKING_SPEED_MPS = 1.4; // Average walking speed ~5km/h
export const BIKE_SPEED_MPS = 5.5;   // ~20km/h
export const CAR_SPEED_MPS = 11.1;   // ~40km/h (rural roads)

// Colors
export const THEME_COLOR = '#854d0e'; // Earthy brown/gold
export const GPS_ACTIVE_COLOR = '#22c55e';
export const GPS_LOST_COLOR = '#ef4444';
export const DR_COLOR = '#f59e0b'; // Amber for Dead Reckoning
