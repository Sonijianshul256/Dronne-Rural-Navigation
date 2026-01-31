import { Coordinates, TransportMode, RoutingOptions } from '../types';
import { calculateOfflineRoute } from './offlineRoutingEngine';

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1';

/**
 * Calculates a route between two points, optionally visiting waypoints in order.
 * 
 * Strategy:
 * 1. Attempt to fetch high-accuracy route from Online OSRM API.
 * 2. If network fails or API is down, fallback to Local Offline Routing Engine.
 * 3. Local Engine uses a pre-loaded graph to calculate A* path.
 */
export const getRoute = async (
  start: Coordinates,
  end: Coordinates,
  mode: TransportMode,
  options?: RoutingOptions,
  waypoints: Coordinates[] = []
): Promise<Coordinates[]> => {
  
  // If browser reports offline immediately, skip to local engine
  if (!navigator.onLine) {
    console.log("Device offline: Using local routing engine.");
    return calculateOfflineRouteWithWaypoints(start, end, waypoints, options);
  }

  try {
    // Map TransportMode to OSRM profile
    let profile = 'driving';
    if (mode === TransportMode.WALK) profile = 'foot';
    if (mode === TransportMode.BIKE) profile = 'bike';

    // Construct URL for OSRM API with waypoints
    // Format: /profile/start;waypoint1;waypoint2;end?options
    const points = [start, ...waypoints, end];
    const coordinatesString = points.map(p => `${p.lng},${p.lat}`).join(';');
    
    const url = `${OSRM_BASE_URL}/${profile}/${coordinatesString}?overview=full&geometries=geojson`;

    // Attempt to fetch from network with short timeout to favor offline fallback quickly if laggy
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    
    if (!response.ok) {
        throw new Error('Routing API response not ok');
    }

    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      const coordinates = data.routes[0].geometry.coordinates;
      return coordinates.map((coord: number[]) => ({
        lat: coord[1],
        lng: coord[0]
      }));
    }
    
    throw new Error('No route found in API response');

  } catch (error) {
    console.warn("Online routing unavailable:", error);
    console.log("Falling back to embedded offline routing engine with options:", options);
    
    // Robust Offline Fallback
    return calculateOfflineRouteWithWaypoints(start, end, waypoints, options);
  }
};

/**
 * Helper to chain offline routing requests for multiple segments
 */
const calculateOfflineRouteWithWaypoints = (
  start: Coordinates,
  end: Coordinates,
  waypoints: Coordinates[],
  options?: RoutingOptions
): Coordinates[] => {
  const allPoints = [start, ...waypoints, end];
  let fullRoute: Coordinates[] = [];

  for (let i = 0; i < allPoints.length - 1; i++) {
    const segmentStart = allPoints[i];
    const segmentEnd = allPoints[i + 1];
    
    const segmentRoute = calculateOfflineRoute(segmentStart, segmentEnd, options);
    
    // Avoid duplicating the connection point (end of prev is start of next)
    if (i > 0) {
      fullRoute = [...fullRoute, ...segmentRoute.slice(1)];
    } else {
      fullRoute = [...fullRoute, ...segmentRoute];
    }
  }

  return fullRoute;
};
