
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
}

export interface SensorReadings {
  alpha: number | null; // Compass heading (0-360)
  beta: number | null;  // Front/Back tilt
  gamma: number | null; // Left/Right tilt
  accX: number | null;
  accY: number | null;
  accZ: number | null;
}

export interface SensorCalibration {
  alphaOffset: number;
  accXOffset: number;
  accYOffset: number;
  accZOffset: number;
}

export enum NavigationMode {
  IDLE = 'IDLE',
  NAVIGATING = 'NAVIGATING',
  OFFLINE_CACHING = 'OFFLINE_CACHING'
}

export enum TransportMode {
  WALK = 'WALK',
  BIKE = 'BIKE',
  CAR = 'CAR'
}

export interface RoutePoint {
  id: string;
  coords: Coordinates;
  name: string;
  type: 'start' | 'end' | 'waypoint' | 'hazard';
}

export interface AppState {
  currentLocation: Coordinates;
  isGpsActive: boolean;
  isOfflineMode: boolean;
  batteryLevel: number;
  signalStrength: number; // 0-4
}

export interface RoutingOptions {
  preferPaved: boolean;
  avoidHills: boolean;
  allowHighways: boolean;
}
