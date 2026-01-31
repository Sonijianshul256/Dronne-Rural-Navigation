import { Coordinates } from "../types";

// Earth radius in meters
const R = 6378137;

/**
 * Calculates a new position based on start position, distance traveled, and bearing.
 * Uses the Haversine formula inverse (Destination point given distance and bearing).
 * 
 * @param start Current coordinates
 * @param distanceMeters Distance traveled in meters
 * @param bearingDegrees Heading in degrees (0 = North, 90 = East)
 */
export const calculateNewPosition = (
  start: Coordinates,
  distanceMeters: number,
  bearingDegrees: number
): Coordinates => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const lat1 = toRad(start.lat);
  const lon1 = toRad(start.lng);
  const angularDistance = distanceMeters / R;
  const bearingRad = toRad(bearingDegrees);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: toDeg(lat2),
    lng: toDeg(lon2)
  };
};

/**
 * Calculates the Great Circle distance between two points in meters.
 */
export const calculateDistance = (p1: Coordinates, p2: Coordinates): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
};

/**
 * Calculates the initial bearing (forward azimuth) from start to end.
 * Returns degrees 0-360.
 */
export const calculateBearing = (start: Coordinates, end: Coordinates): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const lat1 = toRad(start.lat);
  const lat2 = toRad(end.lat);
  const dLon = toRad(end.lng - start.lng);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return bearing;
};

/**
 * Simulates signal strength variation based on "rural" conditions
 * Random walk logic
 */
export const getSimulatedSignalStrength = (current: number): number => {
  const change = Math.random() > 0.5 ? 1 : -1;
  const next = current + change;
  return Math.max(0, Math.min(4, next));
};
