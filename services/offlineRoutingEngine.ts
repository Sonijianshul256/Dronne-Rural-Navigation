import { Coordinates, RoutingOptions } from "../types";
import { calculateDistance } from "./navigationService";

/**
 * OFFLINE ROUTING ENGINE
 * 
 * In a production environment, this service would act as a wrapper around 
 * a WASM-compiled library like Valhalla, GraphHopper, or OSRM running locally 
 * in the browser.
 * 
 * For this demonstration, we implement a JavaScript-native routing engine 
 * backed by a localized graph of the demo area (Jaipur/Rajasthan context).
 */

interface GraphEdge {
  nodeId: string;
  weight: number;     // Physical distance in meters
  surface: 'paved' | 'unpaved';
  isHilly: boolean;
}

interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  neighbors: GraphEdge[];
}

// --- 1. LOCAL TOPOLOGY DATA (Mock Road Network) ---
// Generating a grid-like network around the default location (26.9124, 75.7873)
const RAW_NODES = [
  // Center / Start Area
  { id: 'n1', lat: 26.9124, lng: 75.7873 }, // Start
  { id: 'n2', lat: 26.9124, lng: 75.7923 }, // East 1
  { id: 'n3', lat: 26.9124, lng: 75.7823 }, // West 1
  
  // North Street
  { id: 'n4', lat: 26.9169, lng: 75.7873 }, // North 1
  { id: 'n5', lat: 26.9169, lng: 75.7923 }, // NE
  { id: 'n6', lat: 26.9169, lng: 75.7823 }, // NW
  
  // South Street
  { id: 'n7', lat: 26.9079, lng: 75.7873 }, // South 1
  { id: 'n8', lat: 26.9079, lng: 75.7923 }, // SE
  { id: 'n9', lat: 26.9079, lng: 75.7823 }, // SW

  // Far East
  { id: 'n10', lat: 26.9124, lng: 75.7973 },
  { id: 'n11', lat: 26.9169, lng: 75.7973 },
  { id: 'n12', lat: 26.9079, lng: 75.7973 },

  // Far West
  { id: 'n13', lat: 26.9124, lng: 75.7773 },
  { id: 'n14', lat: 26.9169, lng: 75.7773 },
  { id: 'n15', lat: 26.9079, lng: 75.7773 },
  
  // Diagonal / irregular connections
  { id: 'n16', lat: 26.9200, lng: 75.7900 },
  { id: 'n17', lat: 26.9050, lng: 75.7850 },
];

// Initialize Graph
const graph: Map<string, GraphNode> = new Map();

// Populate nodes
RAW_NODES.forEach(n => {
  graph.set(n.id, { ...n, neighbors: [] });
});

// Helper to add bi-directional edge with attributes
const addEdge = (id1: string, id2: string, surface: 'paved' | 'unpaved' = 'paved', isHilly: boolean = false) => {
  const n1 = graph.get(id1);
  const n2 = graph.get(id2);
  if (n1 && n2) {
    const dist = calculateDistance(n1, n2);
    n1.neighbors.push({ nodeId: id2, weight: dist, surface, isHilly });
    n2.neighbors.push({ nodeId: id1, weight: dist, surface, isHilly });
  }
};

// Define Connections (Topology)
// Horizontal Streets - Main arterial roads (Paved)
addEdge('n3', 'n1', 'paved'); addEdge('n1', 'n2', 'paved'); addEdge('n2', 'n10', 'paved');
addEdge('n13', 'n3', 'unpaved', true); // Outer west is rough/hilly

// North connections - Residential (Paved)
addEdge('n6', 'n4', 'paved'); addEdge('n4', 'n5', 'paved'); addEdge('n5', 'n11', 'paved');
addEdge('n14', 'n6', 'unpaved'); // Far north west dirt track

// South connections - Rural (Mixed)
addEdge('n9', 'n7', 'unpaved'); addEdge('n7', 'n8', 'paved'); addEdge('n8', 'n12', 'unpaved', true);
addEdge('n15', 'n9', 'unpaved', true);

// Vertical Streets
addEdge('n6', 'n3', 'paved'); addEdge('n3', 'n9', 'unpaved'); addEdge('n9', 'n15', 'unpaved');
addEdge('n4', 'n1', 'paved'); addEdge('n1', 'n7', 'paved'); addEdge('n7', 'n17', 'unpaved');
addEdge('n5', 'n2', 'paved'); addEdge('n2', 'n8', 'paved');
addEdge('n11', 'n10', 'unpaved'); addEdge('n10', 'n12', 'unpaved');
addEdge('n14', 'n13', 'unpaved'); addEdge('n13', 'n15', 'unpaved');

// Diagonals (Shortcuts but maybe tough)
addEdge('n4', 'n16', 'unpaved', true);
addEdge('n16', 'n5', 'unpaved');


// --- 2. ALGORITHMS ---

/**
 * Finds the nearest node in the graph to a specific geolocation.
 */
const findNearestNode = (target: Coordinates): GraphNode | null => {
  let closest: GraphNode | null = null;
  let minDist = Infinity;

  graph.forEach(node => {
    const dist = calculateDistance(target, node);
    if (dist < minDist) {
      minDist = dist;
      closest = node;
    }
  });

  return closest;
};

/**
 * A* Pathfinding Algorithm with preferences
 */
export const calculateOfflineRoute = (
  start: Coordinates, 
  end: Coordinates,
  options?: RoutingOptions
): Coordinates[] => {
  const startNode = findNearestNode(start);
  const endNode = findNearestNode(end);

  if (!startNode || !endNode) return [start, end]; 
  if (startNode.id === endNode.id) return [start, end];

  const openSet: string[] = [startNode.id];
  const cameFrom: Map<string, string> = new Map();
  
  const gScore: Map<string, number> = new Map();
  graph.forEach(n => gScore.set(n.id, Infinity));
  gScore.set(startNode.id, 0);

  const fScore: Map<string, number> = new Map();
  graph.forEach(n => fScore.set(n.id, Infinity));
  fScore.set(startNode.id, calculateDistance(startNode, endNode));

  while (openSet.length > 0) {
    // Get node with lowest fScore
    openSet.sort((a, b) => (fScore.get(a) || Infinity) - (fScore.get(b) || Infinity));
    const currentId = openSet.shift()!;

    if (currentId === endNode.id) {
      return reconstructPath(cameFrom, currentId, start, end);
    }

    const current = graph.get(currentId)!;

    for (const neighbor of current.neighbors) {
      // Calculate dynamic cost based on preferences
      let edgeCost = neighbor.weight;
      
      // Apply penalties (Multiplier based)
      if (options?.preferPaved && neighbor.surface === 'unpaved') {
        edgeCost *= 3.0; // Significant penalty for dirt roads
      }
      
      if (options?.avoidHills && neighbor.isHilly) {
        edgeCost *= 5.0; // Avoid hills
      }

      // Simple heuristic for 'Main Roads' could be treating Paved as main
      if (options?.allowHighways === false && neighbor.surface === 'paved') {
         // This is inverted logic for "Allow Highways", implying if false, avoid them?
         // Let's assume this demo treats Paved as Highways for simplicity
         edgeCost *= 2.0; 
      }

      const tentativeG = (gScore.get(currentId) || Infinity) + edgeCost;

      if (tentativeG < (gScore.get(neighbor.nodeId) || Infinity)) {
        cameFrom.set(neighbor.nodeId, currentId);
        gScore.set(neighbor.nodeId, tentativeG);
        
        const neighborNode = graph.get(neighbor.nodeId)!;
        // Heuristic is still physical distance, ensuring A* admits admissibility but here we prioritize weight
        fScore.set(neighbor.nodeId, tentativeG + calculateDistance(neighborNode, endNode));

        if (!openSet.includes(neighbor.nodeId)) {
          openSet.push(neighbor.nodeId);
        }
      }
    }
  }

  // If no path found (disconnected graph), return direct line
  return [start, end];
};

const reconstructPath = (
  cameFrom: Map<string, string>, 
  currentId: string, 
  originalStart: Coordinates, 
  originalEnd: Coordinates
): Coordinates[] => {
  const path: Coordinates[] = [];
  let curr: string | undefined = currentId;

  while (curr) {
    const node = graph.get(curr)!;
    path.unshift({ lat: node.lat, lng: node.lng });
    curr = cameFrom.get(curr);
  }

  path.unshift(originalStart);
  path.push(originalEnd);

  return path;
};
