import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  MapPin, Navigation, Signal, WifiOff, Wifi, 
  Battery, Footprints, Bike, Car, Menu, Compass,
  AlertTriangle, Save, CloudOff, Download, CheckCircle, XCircle, Layers, Settings, Sliders, Cpu, Trash2, Database, Map as MapIcon,
  ArrowUp, CornerUpLeft, CornerUpRight, ArrowLeft, ArrowRight, Flag, Circle, CircleDot, Disc
} from 'lucide-react';
import { Coordinates, SensorReadings, TransportMode, NavigationMode, MapBounds, RoutingOptions, SensorCalibration } from './types';
import { DEFAULT_START_LOCATION, WALKING_SPEED_MPS, BIKE_SPEED_MPS, CAR_SPEED_MPS, MAX_TILES_PER_DOWNLOAD } from './constants';
import { calculateNewPosition, getSimulatedSignalStrength, calculateDistance, calculateBearing } from './services/navigationService';
import { calculateTilesInBounds, downloadTiles, getStorageEstimate, clearTileCache } from './services/offlineMapService';
import { getRoute } from './services/routingService';
import { MapView } from './components/MapView';
import { SensorMonitor } from './components/SensorMonitor';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Speedometer } from './components/Speedometer';
import { SensorCalibrationModal } from './components/SensorCalibrationModal';

const App: React.FC = () => {
  // --- UI State ---
  const [hasStarted, setHasStarted] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);

  // --- App State ---
  const [currentLocation, setCurrentLocation] = useState<Coordinates>(DEFAULT_START_LOCATION);
  const [targetLocation, setTargetLocation] = useState<Coordinates | null>(null);
  const [waypoints, setWaypoints] = useState<Coordinates[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>([]);
  // We use a ref for the navigation loop to ensure instant updates without React render lag
  const nextRoutePointIndexRef = useRef(1); 
  const [nextRoutePointIndex, setNextRoutePointIndex] = useState(1); // Keep state for UI sync if needed
  
  const [gpsActive, setGpsActive] = useState(true); // Toggle for simulation
  const [signalStrength, setSignalStrength] = useState(4);
  const [isOffline, setIsOffline] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0); // Speed in m/s
  const [altitude, setAltitude] = useState(432); // Start at approx Jaipur elevation
  
  const [mode, setMode] = useState<TransportMode>(TransportMode.WALK);
  const [navState, setNavState] = useState<NavigationMode>(NavigationMode.IDLE);
  
  const [sensors, setSensors] = useState<SensorReadings>({
    alpha: 0, beta: 0, gamma: 0, accX: 0, accY: 0, accZ: 0
  });

  const [calibration, setCalibration] = useState<SensorCalibration>({
    alphaOffset: 0, accXOffset: 0, accYOffset: 0, accZOffset: 0
  });

  const [showSensors, setShowSensors] = useState(false);

  // --- Track Recording (OsmAnd Style) ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordedTrack, setRecordedTrack] = useState<Coordinates[]>([]);
  const lastRecordPos = useRef<Coordinates | null>(null);
  
  // Navigation Instruction State
  const [nextManeuver, setNextManeuver] = useState<{ type: string; distance: number; text: string } | null>(null);

  // Routing Settings
  const [showSettings, setShowSettings] = useState(false);
  const [routingOptions, setRoutingOptions] = useState<RoutingOptions>({
    preferPaved: true,
    avoidHills: false,
    allowHighways: true
  });

  // Offline Map Download State
  const [currentMapBounds, setCurrentMapBounds] = useState<MapBounds | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadZoomDepth, setDownloadZoomDepth] = useState(2);
  const [storageUsage, setStorageUsage] = useState<{usage: number, quota: number} | null>(null);

  // Refs for animation loops
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();
  
  // Simulation State for "Mock Movement" on Desktop
  const [isSimulatingMove, setIsSimulatingMove] = useState(false);

  // --- Derived Calibrated Sensors ---
  const calibratedSensors = useMemo<SensorReadings>(() => {
    return {
      ...sensors,
      alpha: sensors.alpha !== null ? (sensors.alpha + calibration.alphaOffset + 360) % 360 : null,
      accX: sensors.accX !== null ? sensors.accX - calibration.accXOffset : null,
      accY: sensors.accY !== null ? sensors.accY - calibration.accYOffset : null,
      accZ: sensors.accZ !== null ? sensors.accZ - calibration.accZOffset : null,
    };
  }, [sensors, calibration]);

  // --- Sensor Handling ---
  const handleSensorPermission = async () => {
    // Request permission for iOS 13+ devices
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === 'granted') {
          startSensorListeners();
        } else {
          alert("Permission denied for sensors.");
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      startSensorListeners();
    }
  };

  const startSensorListeners = () => {
    window.addEventListener('deviceorientation', (event) => {
      setSensors(prev => ({
        ...prev,
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma
      }));
    });

    window.addEventListener('devicemotion', (event) => {
      setSensors(prev => ({
        ...prev,
        accX: event.acceleration?.x || 0,
        accY: event.acceleration?.y || 0,
        accZ: event.acceleration?.z || 0
      }));
    });
  };

  // --- Reset Navigation State when Route Changes ---
  useEffect(() => {
    nextRoutePointIndexRef.current = 1;
    setNextRoutePointIndex(1);
    setNextManeuver(null);
  }, [routeCoordinates]);

  // --- Navigation & Dead Reckoning Loop ---
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = (time - lastTimeRef.current) / 1000; // seconds

      // SIGNAL & ALTITUDE SIMULATION
      if (Math.random() > 0.95) {
         setSignalStrength(prev => getSimulatedSignalStrength(prev));
      }
      
      if (gpsActive) {
         // Slight altitude drift to simulate sensor noise or terrain change
         setAltitude(prev => prev + (Math.random() - 0.5) * 0.2);
      }

      let calculatedSpeed = 0;
      
      // Use CALIBRATED sensor values for navigation logic
      let calculatedHeading = (sensors.alpha || 0) + calibration.alphaOffset;
      calculatedHeading = (calculatedHeading + 360) % 360;

      const accX = (sensors.accX || 0) - calibration.accXOffset;
      const accY = (sensors.accY || 0) - calibration.accYOffset;

      // --- SIMULATION LOGIC: FOLLOW ROAD (REFINED) ---
      if (isSimulatingMove && navState === NavigationMode.NAVIGATING && routeCoordinates.length > 1) {
        let targetIdx = nextRoutePointIndexRef.current;
        if (targetIdx >= routeCoordinates.length) targetIdx = routeCoordinates.length - 1;

        // --- 1. DUAL LOOKAHEAD PREDICTION SYSTEM ---
        
        // Steering Lookahead: Close range for precision (10m - 30m)
        const steerDist = Math.max(10, currentSpeed * 1.5); 
        // Braking Lookahead: Long range for detecting curvature early (40m - 100m)
        const brakeDist = Math.max(40, currentSpeed * 4.0);

        // Helper to find exact point X meters along the path from current position
        const getPointAtDist = (nextIdx: number, dist: number): Coordinates => {
             let remaining = dist;
             
             // First segment: Current Pos -> Next Route Point
             let p1 = currentLocation;
             let p2 = routeCoordinates[nextIdx];
             let segLen = calculateDistance(p1, p2);
             
             if (remaining <= segLen) {
                 // Interpolate
                 const ratio = remaining / segLen;
                 return {
                     lat: p1.lat + (p2.lat - p1.lat) * ratio,
                     lng: p1.lng + (p2.lng - p1.lng) * ratio
                 };
             }
             
             remaining -= segLen;
             let i = nextIdx;
             
             // Subsequent segments: Node -> Node
             while (i < routeCoordinates.length - 1) {
                 p1 = routeCoordinates[i];
                 p2 = routeCoordinates[i+1];
                 segLen = calculateDistance(p1, p2);
                 
                 if (remaining <= segLen) {
                     const ratio = remaining / segLen;
                     return {
                         lat: p1.lat + (p2.lat - p1.lat) * ratio,
                         lng: p1.lng + (p2.lng - p1.lng) * ratio
                     };
                 }
                 remaining -= segLen;
                 i++;
             }
             
             return routeCoordinates[routeCoordinates.length - 1];
        };

        // Determine Waypoint Progress
        const distToNext = calculateDistance(currentLocation, routeCoordinates[targetIdx]);
        if (distToNext < Math.max(5, currentSpeed)) {
           if (nextRoutePointIndexRef.current < routeCoordinates.length - 1) {
              nextRoutePointIndexRef.current += 1;
              setNextRoutePointIndex(nextRoutePointIndexRef.current);
           }
        }
        
        // Calculate Target Points
        const steerTarget = getPointAtDist(targetIdx, steerDist);
        const brakeTarget = getPointAtDist(targetIdx, brakeDist);

        // --- 2. PHYSICS CALCULATION ---

        // Desired Heading (Steering)
        const bearingToSteer = calculateBearing(currentLocation, steerTarget);
        
        // Curvature Detection
        // Calculate the angle between the "Steering Vector" and "Braking Vector"
        // If they diverge significantly, a turn is coming up.
        const bearingToBrake = calculateBearing(currentLocation, brakeTarget);
        
        let curveAngle = Math.abs(bearingToSteer - bearingToBrake);
        if (curveAngle > 180) curveAngle = 360 - curveAngle;
        
        // Current Heading Error (Are we drifting?)
        let headingError = bearingToSteer - calculatedHeading;
        while (headingError < -180) headingError += 360;
        while (headingError > 180) headingError -= 360;

        // Calculate Target Speed based on Curvature
        let baseMaxSpeed = WALKING_SPEED_MPS;
        if (mode === TransportMode.BIKE) baseMaxSpeed = BIKE_SPEED_MPS;
        if (mode === TransportMode.CAR) baseMaxSpeed = CAR_SPEED_MPS;

        // Severity = Combination of upcoming curve + current misalignment
        const curvatureSeverity = (curveAngle * 1.8) + (Math.abs(headingError) * 0.5);
        
        // Speed Factor: 
        // 0 deg curve = 100% speed
        // 90 deg curve = ~30% speed
        const speedFactor = Math.max(0.3, 1.0 - (curvatureSeverity / 70));
        
        const targetSpeed = baseMaxSpeed * speedFactor;

        // --- 3. PHYSICS UPDATE ---
        
        // Acceleration / Deceleration
        if (currentSpeed < targetSpeed) {
            // Accelerate smoothly
            calculatedSpeed = currentSpeed + (2.5 * deltaTime);
        } else {
            // Brake harder than accelerate (Safety)
            calculatedSpeed = currentSpeed - (5.0 * deltaTime);
        }
        calculatedSpeed = Math.max(0.5, Math.min(calculatedSpeed, baseMaxSpeed));

        // Heading / Steering
        // Limit turn rate based on speed (Vehicle dynamics: fast = wide turns)
        const maxTurnRate = Math.max(35, 120 - (currentSpeed * 2.5)); 
        const turnStep = maxTurnRate * deltaTime;

        if (Math.abs(headingError) <= turnStep) {
           calculatedHeading = bearingToSteer;
        } else {
           calculatedHeading += Math.sign(headingError) * turnStep;
        }
        calculatedHeading = (calculatedHeading + 360) % 360;


        // --- 4. MOVE ---
        const moveDist = calculatedSpeed * deltaTime;
        setCurrentLocation(prev => calculateNewPosition(prev, moveDist, calculatedHeading));

      } 
      // --- DEAD RECKONING / FREE MOVEMENT ---
      else if (!gpsActive || (gpsActive && isSimulatingMove)) {
         // Manual simulation speed or sensor-based
         if (isSimulatingMove) {
            // Free movement (no route)
            switch(mode) {
              case TransportMode.WALK: calculatedSpeed = WALKING_SPEED_MPS; break;
              case TransportMode.BIKE: calculatedSpeed = BIKE_SPEED_MPS; break;
              case TransportMode.CAR: calculatedSpeed = CAR_SPEED_MPS; break;
            }
         } else if (!gpsActive) {
            // Real Dead Reckoning (Sensor based) using CALIBRATED values
            const accMagnitude = Math.sqrt(Math.pow(accX, 2) + Math.pow(accY, 2));
            // Simple step counting / movement detection threshold
            if (accMagnitude > 1.2) { 
               // Very rough estimation: magnitude maps to speed
               calculatedSpeed = Math.min(WALKING_SPEED_MPS * 1.5, accMagnitude * 0.5); 
            }
         }

         if (calculatedSpeed > 0) {
           setCurrentLocation(prev => {
             const distance = calculatedSpeed * deltaTime;
             return calculateNewPosition(prev, distance, calculatedHeading);
           });
         }
      }

      // Update Speed State (Throttled check to avoid render spam when idle)
      setCurrentSpeed(prev => Math.abs(prev - calculatedSpeed) > 0.1 ? calculatedSpeed : prev);

      // --- TRACK RECORDING (OsmAnd Feature) ---
      if (isRecording) {
         // Only add point if moved significantly (> 5 meters) to save memory/visual clutter
         const dist = lastRecordPos.current ? calculateDistance(currentLocation, lastRecordPos.current) : 100;
         if (dist > 5) {
             setRecordedTrack(prev => [...prev, currentLocation]);
             lastRecordPos.current = currentLocation;
         }
      }

    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, [gpsActive, sensors, isSimulatingMove, mode, navState, routeCoordinates, currentLocation, calibration, currentSpeed, isRecording]);

  useEffect(() => {
    if (hasStarted) {
        requestRef.current = requestAnimationFrame(animate);
    }
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate, hasStarted]);

  // --- Maneuver Detection Logic ---
  useEffect(() => {
    if (navState !== NavigationMode.NAVIGATING || routeCoordinates.length <= 1) {
      if (navState !== NavigationMode.NAVIGATING) setNextManeuver(null);
      return;
    }

    const idx = nextRoutePointIndex;
    
    // Check if arrived
    const distToEnd = targetLocation ? calculateDistance(currentLocation, targetLocation) : 0;
    if (idx >= routeCoordinates.length - 1 || distToEnd < 20) {
       setNextManeuver({ type: 'arrive', distance: distToEnd, text: 'Arriving at destination' });
       return;
    }
    
    // Calculate distance to next immediate point
    let distToTurn = calculateDistance(currentLocation, routeCoordinates[idx]);
    let maneuverFound = false;
    let mType = 'straight';
    let mText = 'Continue straight';

    // Look ahead logic to find next sharp turn
    let lookAheadDist = 0;
    const MAX_LOOKAHEAD = 1500; // Scan 1.5km ahead
    
    for (let i = idx; i < Math.min(routeCoordinates.length - 2, idx + 30); i++) {
       if (lookAheadDist > MAX_LOOKAHEAD) break;

       const pCurrent = routeCoordinates[i];
       const pNext = routeCoordinates[i+1];
       const pAfter = routeCoordinates[i+2];

       const segDist = calculateDistance(pCurrent, pNext);
       
       const b1 = calculateBearing(pCurrent, pNext);
       const b2 = calculateBearing(pNext, pAfter);
       
       let diff = b2 - b1;
       while (diff < -180) diff += 360;
       while (diff > 180) diff -= 360;

       if (Math.abs(diff) > 30) { // Turn detected > 30 degrees
          distToTurn += lookAheadDist;
          maneuverFound = true;
          
          if (Math.abs(diff) > 100) {
              mType = diff < 0 ? 'sharp-left' : 'sharp-right';
              mText = diff < 0 ? 'Sharp left turn' : 'Sharp right turn';
          } else if (Math.abs(diff) > 45) {
              mType = diff < 0 ? 'left' : 'right';
              mText = diff < 0 ? 'Turn left' : 'Turn right';
          } else {
              mType = diff < 0 ? 'slight-left' : 'slight-right';
              mText = diff < 0 ? 'Keep left' : 'Keep right';
          }
          break;
       }

       lookAheadDist += segDist;
    }

    if (!maneuverFound) {
       mType = 'straight';
       mText = 'Continue straight';
       distToTurn = lookAheadDist > 0 ? lookAheadDist : distToEnd; 
    }

    setNextManeuver({ type: mType, distance: distToTurn, text: mText });

  }, [currentLocation, routeCoordinates, nextRoutePointIndex, navState, targetLocation]);


  // --- Route Setting ---
  const handleSetDestination = async (dest?: Coordinates) => {
    const target = dest || {
      lat: currentLocation.lat + 0.005,
      lng: currentLocation.lng + 0.005
    };
    
    setTargetLocation(target);
    setNavState(NavigationMode.NAVIGATING);
    setRouteCoordinates([]); // Clear previous route while loading
    
    // Reset index refs
    nextRoutePointIndexRef.current = 1;
    setNextRoutePointIndex(1);

    try {
      // Calculate real route with options and waypoints
      const route = await getRoute(currentLocation, target, mode, routingOptions, waypoints);
      setRouteCoordinates(route);
    } catch (e) {
      console.error("Failed to calculate route, using straight line fallback");
      setRouteCoordinates([currentLocation, ...waypoints, target]);
    }
  };

  const handleAddWaypoint = (coords: Coordinates) => {
    setWaypoints(prev => [...prev, coords]);
  };

  const handleClearWaypoints = () => {
    setWaypoints([]);
    // If currently navigating, re-route to destination immediately without waypoints
    if (navState === NavigationMode.NAVIGATING && targetLocation) {
        // Trigger re-route logic (handled by effect or we call directly)
    }
  };

  const handleToggleRecording = () => {
      if (isRecording) {
          setIsRecording(false);
          // Optional: Save to local storage or prompt to save
      } else {
          setRecordedTrack([currentLocation]); // Start with current point
          lastRecordPos.current = currentLocation;
          setIsRecording(true);
      }
  };

  // Re-calculate route if options change while navigating
  useEffect(() => {
     if (navState === NavigationMode.NAVIGATING && targetLocation) {
        handleSetDestination(targetLocation);
     }
     // We include waypoints in dependency to auto-update route when waypoints change
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingOptions, waypoints]);

  // --- Offline Download Logic ---
  
  // Calculate estimated tiles
  const estimatedTileCount = useMemo(() => {
    if (!currentMapBounds) return 0;
    return calculateTilesInBounds(currentMapBounds, downloadZoomDepth).length;
  }, [currentMapBounds, downloadZoomDepth]);

  const updateStorage = useCallback(async () => {
    const estimate = await getStorageEstimate();
    setStorageUsage(estimate);
  }, []);

  useEffect(() => {
    if (showDownloadModal) {
      updateStorage();
    }
  }, [showDownloadModal, updateStorage]);

  // NEW: Also update storage when settings are opened
  useEffect(() => {
    if (showSettings) {
      updateStorage();
    }
  }, [showSettings, updateStorage]);

  const handleDownloadRegion = async () => {
    if (!currentMapBounds) return;
    
    setDownloadError(null);
    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: 0 });

    try {
      // Calculate tiles with selected depth
      const tiles = calculateTilesInBounds(currentMapBounds, downloadZoomDepth);
      setDownloadProgress({ current: 0, total: tiles.length });

      // Start download
      await downloadTiles(tiles, (current, total) => {
        setDownloadProgress({ current, total });
      });

      // Done
      await updateStorage();
      setIsDownloading(false);
      setTimeout(() => setShowDownloadModal(false), 2000); // Close after delay
    } catch (error: any) {
      setDownloadError(error.message || "Failed to download map region");
      setIsDownloading(false);
    }
  };

  const handleClearCache = async () => {
    if (window.confirm("Are you sure you want to clear all offline map data? This action cannot be undone.")) {
      await clearTileCache();
      await updateStorage();
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // --- Dynamic ETA Calculation ---
  const distToTarget = targetLocation ? calculateDistance(currentLocation, targetLocation) : 0;
  
  const etaDetails = useMemo(() => {
    let effectiveSpeed = currentSpeed;
    
    // If stopped or very slow, use default mode speed for estimation
    if (effectiveSpeed < 0.5) {
       switch(mode) {
          case TransportMode.WALK: effectiveSpeed = WALKING_SPEED_MPS; break;
          case TransportMode.BIKE: effectiveSpeed = BIKE_SPEED_MPS; break;
          case TransportMode.CAR: effectiveSpeed = CAR_SPEED_MPS; break;
       }
    }

    const seconds = distToTarget / effectiveSpeed;
    const minutes = Math.ceil(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    
    // Format duration
    let durationText = `${minutes} min`;
    if (hours > 0) {
        durationText = `${hours}h ${remainingMins}m`;
    }
    
    // Format Arrival Time
    const arrival = new Date(Date.now() + seconds * 1000);
    const arrivalTime = arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return { durationText, arrivalTime };
  }, [distToTarget, currentSpeed, mode]);

  const renderManeuverIcon = (type: string) => {
     switch(type) {
         case 'left': return <CornerUpLeft className="w-8 h-8 text-white" />;
         case 'sharp-left': return <CornerUpLeft className="w-8 h-8 text-white" strokeWidth={3} />;
         case 'slight-left': return <ArrowUp className="w-8 h-8 text-white transform -rotate-45" />;
         case 'right': return <CornerUpRight className="w-8 h-8 text-white" />;
         case 'sharp-right': return <CornerUpRight className="w-8 h-8 text-white" strokeWidth={3} />;
         case 'slight-right': return <ArrowUp className="w-8 h-8 text-white transform rotate-45" />;
         case 'arrive': return <Flag className="w-8 h-8 text-green-400" />;
         case 'straight': 
         default: return <ArrowUp className="w-8 h-8 text-white" />;
     }
  };

  if (!hasStarted) {
    return <WelcomeScreen onStart={() => setHasStarted(true)} />;
  }

  return (
    <div className="flex flex-col h-screen bg-stone-100">
      
      {/* --- Top Status Bar --- */}
      <header className="bg-stone-900 text-stone-200 p-2 px-4 flex justify-between items-center shadow-md z-50">
        <div className="flex items-center gap-2">
          <Menu className="w-5 h-5 text-stone-400" />
          <h1 className="font-bold tracking-wider text-amber-500">DRONNE<span className="text-white text-xs ml-1 font-normal opacity-70">RuralNav</span></h1>
        </div>
        
        <div className="flex items-center gap-4 text-xs font-mono">
          <button 
             onClick={() => setShowSettings(true)}
             className="p-1 hover:bg-stone-800 rounded transition-colors"
          >
             <Settings className="w-4 h-4 text-stone-400" />
          </button>

          <div className="flex items-center gap-1" title="Signal Strength">
            {isOffline ? (
              <CloudOff className="w-4 h-4 text-stone-500" />
            ) : (
              <>
                 <Signal className={`w-4 h-4 ${gpsActive && signalStrength > 1 ? 'text-green-500' : 'text-red-500'}`} />
                 <span className={gpsActive ? 'text-green-500' : 'text-red-500'}>
                   {gpsActive ? `${signalStrength * 25}%` : 'NO GPS'}
                 </span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-1">
             <Battery className="w-4 h-4 text-green-400" />
             <span>82%</span>
          </div>
        </div>
      </header>

      {/* --- Main Content Area (Map) --- */}
      <main className="flex-1 relative overflow-hidden">
        
        {/* Map Layer */}
        <div className="absolute inset-0 z-0">
          <MapView 
            location={currentLocation} 
            heading={calibratedSensors.alpha || 0}
            speed={currentSpeed}
            isGpsActive={gpsActive}
            targetLocation={targetLocation}
            waypoints={waypoints}
            routeCoordinates={routeCoordinates}
            recordedTrack={recordedTrack}
            mode={mode}
            onBoundsChange={setCurrentMapBounds}
            onMapClick={(coords) => handleSetDestination(coords)}
            onMapLongPress={handleAddWaypoint}
          />
        </div>

        {/* Info Overlay: Instructions */}
        {navState === NavigationMode.NAVIGATING && (
           <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-[90%] md:max-w-md z-[500] flex flex-col gap-2 pointer-events-none">
              
              {/* Turn Instruction Panel */}
              <div className="bg-stone-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl border border-stone-700 flex items-center gap-4 pointer-events-auto">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${nextManeuver?.type === 'arrive' ? 'bg-green-600' : 'bg-blue-600'}`}>
                      {nextManeuver ? renderManeuverIcon(nextManeuver.type) : <ArrowUp className="w-8 h-8" />}
                  </div>
                  <div className="flex-1 min-w-0">
                      <div className="text-2xl font-black leading-none mb-1">
                          {nextManeuver 
                            ? (nextManeuver.distance > 1000 
                                ? `${(nextManeuver.distance/1000).toFixed(1)} km` 
                                : `${Math.round(nextManeuver.distance)} m`) 
                            : '0 m'
                          }
                      </div>
                      <div className="text-sm font-medium text-stone-300 truncate">
                          {nextManeuver?.text || 'Proceed to route'}
                      </div>
                  </div>
              </div>

              {/* Waypoint Info (Mini Pill) */}
              {waypoints.length > 0 && (
                  <div className="self-center bg-stone-900/80 text-amber-400 px-3 py-1 rounded-full text-[10px] font-mono border border-stone-700/50 backdrop-blur-sm pointer-events-auto">
                      VIA {waypoints.length} STOP{waypoints.length > 1 ? 'S' : ''}
                  </div>
              )}
           </div>
        )}

        {/* Recording Indicator */}
        {isRecording && (
          <div className="absolute top-28 right-4 bg-red-600 text-white px-3 py-1 rounded-full shadow-lg z-[500] flex items-center gap-2 text-xs font-bold animate-pulse pointer-events-none">
            <Disc className="w-3 h-3" />
            REC
          </div>
        )}

        {/* Dead Reckoning Alert Overlay */}
        {!gpsActive && (
          <div className="absolute top-36 left-1/2 -translate-x-1/2 bg-amber-600/90 text-white px-4 py-2 rounded-full shadow-lg z-[500] flex items-center gap-2 text-sm font-bold animate-pulse pointer-events-none border-2 border-amber-400">
            <AlertTriangle className="w-4 h-4" />
            DEAD RECKONING ACTIVE
          </div>
        )}

        {/* Controls Overlay */}
        <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">
          <button 
            onClick={() => setShowSensors(!showSensors)}
            className="bg-stone-900/90 p-2 rounded-lg text-white shadow-xl hover:bg-stone-800 backdrop-blur-sm"
          >
            <ActivityIcon active={showSensors} />
          </button>
          <button 
            onClick={() => setIsOffline(!isOffline)}
            className={`p-2 rounded-lg text-white shadow-xl backdrop-blur-sm transition-colors ${isOffline ? 'bg-amber-600' : 'bg-stone-900/90'}`}
          >
            {isOffline ? <WifiOff className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
          </button>
        </div>

        {/* Sensor Panel */}
        {showSensors && (
           <div className="absolute top-16 right-4 z-[500] w-64 backdrop-blur-md">
             <SensorMonitor 
               sensors={calibratedSensors} 
               isDeadReckoning={!gpsActive} 
               gpsActive={gpsActive}
               signalStrength={signalStrength}
               speed={currentSpeed}
               altitude={altitude}
               onCalibrate={() => setShowCalibration(true)} 
             />
           </div>
        )}

        {/* Sensor Calibration Modal */}
        {showCalibration && (
            <SensorCalibrationModal
                rawSensors={sensors}
                calibration={calibration}
                onSave={(newCal) => {
                    setCalibration(newCal);
                    setShowCalibration(false);
                }}
                onClose={() => setShowCalibration(false)}
                onReconnect={handleSensorPermission}
            />
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div className="absolute inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-stone-900 text-white p-6 rounded-2xl shadow-2xl w-full max-w-sm border border-stone-700">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Settings className="w-5 h-5 text-stone-400" />
                    App Settings
                  </h3>
                  <button onClick={() => setShowSettings(false)} className="text-stone-500 hover:text-white">
                    <XCircle className="w-6 h-6" />
                  </button>
               </div>
               
               {/* Dedicated Offline Section (Routing) */}
               <div className="bg-stone-800/50 rounded-xl p-4 border border-stone-700 mb-4">
                  <div className="flex items-center gap-2 mb-4 text-amber-500 border-b border-stone-700/50 pb-2">
                     <Cpu className="w-4 h-4" />
                     <span className="text-xs font-bold uppercase tracking-wider">Offline Routing Engine</span>
                  </div>
                  
                  <div className="space-y-3">
                      <label className="flex items-center justify-between cursor-pointer group">
                         <div>
                            <span className="text-sm font-bold text-stone-300 group-hover:text-white transition-colors">Prefer Paved Roads</span>
                            <span className="block text-[10px] text-stone-500">Avoids unpaved rural tracks</span>
                         </div>
                         <div 
                            className={`w-10 h-5 rounded-full p-1 transition-colors ${routingOptions.preferPaved ? 'bg-amber-600' : 'bg-stone-600'}`}
                            onClick={() => setRoutingOptions(p => ({...p, preferPaved: !p.preferPaved}))}
                         >
                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${routingOptions.preferPaved ? 'translate-x-5' : 'translate-x-0'}`} />
                         </div>
                      </label>

                      <label className="flex items-center justify-between cursor-pointer group">
                         <div>
                            <span className="text-sm font-bold text-stone-300 group-hover:text-white transition-colors">Avoid Hills</span>
                            <span className="block text-[10px] text-stone-500">Flattest route possible</span>
                         </div>
                         <div 
                            className={`w-10 h-5 rounded-full p-1 transition-colors ${routingOptions.avoidHills ? 'bg-amber-600' : 'bg-stone-600'}`}
                            onClick={() => setRoutingOptions(p => ({...p, avoidHills: !p.avoidHills}))}
                         >
                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${routingOptions.avoidHills ? 'translate-x-5' : 'translate-x-0'}`} />
                         </div>
                      </label>

                      <label className="flex items-center justify-between cursor-pointer group">
                         <div>
                            <span className="text-sm font-bold text-stone-300 group-hover:text-white transition-colors">Allow Highways</span>
                            <span className="block text-[10px] text-stone-500">Include major arterial roads</span>
                         </div>
                         <div 
                            className={`w-10 h-5 rounded-full p-1 transition-colors ${routingOptions.allowHighways ? 'bg-amber-600' : 'bg-stone-600'}`}
                            onClick={() => setRoutingOptions(p => ({...p, allowHighways: !p.allowHighways}))}
                         >
                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${routingOptions.allowHighways ? 'translate-x-5' : 'translate-x-0'}`} />
                         </div>
                      </label>
                  </div>
               </div>

               {/* NEW: Storage Management Section */}
               <div className="bg-stone-800/50 rounded-xl p-4 border border-stone-700 mb-6">
                  <div className="flex items-center gap-2 mb-4 text-blue-400 border-b border-stone-700/50 pb-2">
                     <Database className="w-4 h-4" />
                     <span className="text-xs font-bold uppercase tracking-wider">Storage & Downloads</span>
                  </div>
                  
                  <div className="flex justify-between items-end mb-4">
                      <div>
                        <span className="text-xs text-stone-400 block mb-1">Cached Tiles</span>
                        <span className="text-lg font-mono font-bold text-white leading-none">
                            {storageUsage ? formatBytes(storageUsage.usage) : '---'}
                        </span>
                      </div>
                      <div className="text-right">
                         <span className="text-[10px] text-stone-500 uppercase tracking-wider font-bold">Limit</span>
                         <span className="block text-xs text-stone-400 font-mono">
                            {storageUsage && storageUsage.quota ? formatBytes(storageUsage.quota) : 'Unknown'}
                         </span>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={handleClearCache}
                        className="flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors text-xs font-bold"
                      >
                         <Trash2 className="w-3 h-3" /> CLEAR DATA
                      </button>
                      <button 
                        onClick={() => { setShowSettings(false); setShowDownloadModal(true); }}
                        className="flex items-center justify-center gap-2 py-2 rounded-lg bg-stone-700 text-stone-300 hover:bg-stone-600 transition-colors text-xs font-bold"
                      >
                         <Download className="w-3 h-3" /> MANAGE MAPS
                      </button>
                  </div>
               </div>

               <button 
                 onClick={() => setShowSettings(false)}
                 className="w-full bg-white text-stone-950 font-bold py-3 rounded-xl hover:bg-stone-200 transition-colors"
               >
                 Close & Apply
               </button>
            </div>
          </div>
        )}

        {/* Download Modal Overlay */}
        {showDownloadModal && (
          <div className="absolute inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-stone-900 text-white p-6 rounded-2xl shadow-2xl w-full max-w-sm border border-stone-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Download className="w-5 h-5 text-amber-500" />
                  Offline Maps
                </h3>
                {!isDownloading && (
                  <button onClick={() => setShowDownloadModal(false)} className="text-stone-500 hover:text-white">
                    <XCircle className="w-6 h-6" />
                  </button>
                )}
              </div>

              {!isDownloading && downloadProgress.total === 0 && !downloadError && (
                 <div className="flex flex-col gap-4">
                    {/* Storage Info */}
                    <div className="bg-stone-800/50 p-3 rounded-xl border border-stone-700 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-stone-400" />
                            <div className="flex flex-col">
                                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Storage Used</span>
                                <span className="text-sm font-mono text-stone-200">
                                    {storageUsage ? formatBytes(storageUsage.usage) : 'Calculating...'}
                                </span>
                            </div>
                        </div>
                        <button 
                            onClick={handleClearCache}
                            className="p-2 hover:bg-red-500/20 rounded-lg group transition-colors border border-transparent hover:border-red-500/30"
                            title="Clear Offline Cache"
                        >
                            <Trash2 className="w-4 h-4 text-stone-500 group-hover:text-red-400" />
                        </button>
                    </div>

                    <div className="text-center text-stone-400 text-sm">
                      <p className="mb-2">Download map tiles for the current visible region for offline use.</p>
                    </div>

                    {/* Depth Selection Controls */}
                    <div className="bg-stone-800/50 p-3 rounded-xl border border-stone-700">
                       <label className="text-xs font-bold text-stone-400 mb-2 block uppercase flex items-center gap-1">
                         <Layers className="w-3 h-3" /> Select Detail Level:
                       </label>
                       <div className="flex gap-2">
                         {[1, 2, 3].map(depth => (
                           <button
                             key={depth}
                             onClick={() => setDownloadZoomDepth(depth)}
                             className={`flex-1 py-2 px-1 rounded-lg border transition-all ${
                               downloadZoomDepth === depth 
                                 ? 'bg-amber-600 border-amber-500 text-white shadow-lg' 
                                 : 'bg-stone-800 border-stone-700 text-stone-500 hover:bg-stone-700 hover:text-stone-300'
                             }`}
                           >
                             <span className="block text-xs font-bold">
                               {depth === 1 ? 'Low' : depth === 2 ? 'Med' : 'High'}
                             </span>
                             <span className="text-[10px] opacity-70">+{depth} Zoom</span>
                           </button>
                         ))}
                       </div>
                    </div>

                    <div className="text-center">
                       <div className="text-xs text-stone-500 mb-2">
                         Estimated download: <span className="text-stone-300 font-bold">{estimatedTileCount} tiles</span>
                         {estimatedTileCount > MAX_TILES_PER_DOWNLOAD && (
                           <span className="block text-red-500 font-bold mt-1">
                             <AlertTriangle className="w-3 h-3 inline mr-1" />
                             Region too large. Zoom in.
                           </span>
                         )}
                       </div>
                       
                       <button 
                         onClick={handleDownloadRegion}
                         disabled={estimatedTileCount > MAX_TILES_PER_DOWNLOAD || estimatedTileCount === 0}
                         className={`w-full font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2
                           ${estimatedTileCount > MAX_TILES_PER_DOWNLOAD || estimatedTileCount === 0
                             ? 'bg-stone-800 text-stone-600 cursor-not-allowed'
                             : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg'
                           }
                         `}
                       >
                         {estimatedTileCount === 0 ? 'Map Loading...' : 'START DOWNLOAD'}
                       </button>
                    </div>
                 </div>
              )}

              {isDownloading && (
                <div className="space-y-4 py-4">
                   <div className="flex justify-between text-xs text-stone-400 font-mono">
                     <span>Downloading tiles...</span>
                     <span>{downloadProgress.current} / {downloadProgress.total}</span>
                   </div>
                   <div className="w-full bg-stone-800 h-4 rounded-full overflow-hidden border border-stone-700">
                     <div 
                        className="bg-amber-500 h-full transition-all duration-300 relative" 
                        style={{ width: `${(downloadProgress.current / (downloadProgress.total || 1)) * 100}%` }} 
                     >
                       <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                     </div>
                   </div>
                   <p className="text-center text-xs text-stone-500 animate-pulse">Please do not close this window.</p>
                </div>
              )}

              {!isDownloading && downloadProgress.total > 0 && downloadProgress.current === downloadProgress.total && (
                <div className="text-center py-4">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <p className="text-green-400 font-bold text-lg">Download Complete!</p>
                  <p className="text-stone-500 text-sm mt-1">{downloadProgress.total} tiles cached successfully.</p>
                </div>
              )}

              {downloadError && (
                <div className="text-center py-2">
                   <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
                   <p className="text-red-400 text-sm font-bold">Error</p>
                   <p className="text-stone-500 text-xs mt-1">{downloadError}</p>
                   <button onClick={() => setDownloadError(null)} className="mt-4 text-xs underline text-stone-400 hover:text-white">Try Again</button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* --- Bottom Navigation / Action Panel --- */}
      <footer className="bg-white border-t border-stone-200 z-50">
        
        {/* Route Info Panel (If Navigating) */}
        {navState === NavigationMode.NAVIGATING && (
          <div className="bg-blue-50 p-3 px-4 border-b border-blue-100 flex justify-between items-center shadow-sm">
            <div>
              <div className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Target Destination</div>
              <div className="text-stone-800 font-bold flex items-center gap-2 text-lg">
                 <Navigation className="w-5 h-5 text-blue-600 transform rotate-45" />
                 {distToTarget > 1000 
                    ? `${(distToTarget / 1000).toFixed(1)} km` 
                    : `${distToTarget.toFixed(0)} m`
                 }
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-stone-800 leading-none">
                {etaDetails.durationText}
              </div>
              <div className="text-xs text-stone-500 font-medium mt-1">
                Arrive {etaDetails.arrivalTime}
              </div>
            </div>
          </div>
        )}

        {/* Speedometer Bar - REPLACED with Visual Component */}
        <div className="bg-stone-50 border-b border-stone-200 pt-3 pb-2 flex justify-center items-end shadow-inner relative overflow-hidden">
           {/* Subtle background texture */}
           <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#444_1px,transparent_1px)] [background-size:16px_16px]"></div>
           <Speedometer currentSpeed={currentSpeed} />
        </div>

        {/* Controls */}
        <div className="p-4 space-y-4">
          
          {/* Simulation & Recording Controls */}
          <div className="flex gap-2 overflow-x-auto pb-2 border-b border-stone-100 scrollbar-hide">
             <span className="text-xs font-bold text-stone-400 uppercase self-center mr-2 shrink-0">Demo:</span>
             <button 
                onClick={() => setGpsActive(!gpsActive)}
                className={`px-3 py-1 rounded text-xs font-bold shrink-0 transition-colors ${gpsActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
             >
               GPS: {gpsActive ? 'ON' : 'OFF (DR Mode)'}
             </button>
             <button 
                onMouseDown={() => setIsSimulatingMove(true)}
                onMouseUp={() => setIsSimulatingMove(false)}
                onTouchStart={() => setIsSimulatingMove(true)}
                onTouchEnd={() => setIsSimulatingMove(false)}
                className={`px-3 py-1 rounded text-xs font-bold shrink-0 transition-colors ${isSimulatingMove ? 'bg-blue-600 text-white' : 'bg-stone-200 text-stone-600'}`}
             >
               HOLD TO MOVE
             </button>
             <div className="h-4 w-px bg-stone-300 self-center mx-1"></div>
             <button
               onClick={handleToggleRecording}
               className={`px-3 py-1 rounded text-xs font-bold shrink-0 flex items-center gap-1 transition-colors ${isRecording ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-stone-100 text-stone-500'}`}
             >
               {isRecording ? <CircleDot className="w-3 h-3 animate-pulse" /> : <Circle className="w-3 h-3" />}
               {isRecording ? 'REC' : 'GPX'}
             </button>
          </div>

          {/* Mode Selection */}
          <div className="grid grid-cols-4 gap-2">
            <ModeBtn 
              icon={<Footprints className="w-5 h-5" />} 
              label="Walk" 
              active={mode === TransportMode.WALK} 
              onClick={() => setMode(TransportMode.WALK)} 
            />
            <ModeBtn 
              icon={<Bike className="w-5 h-5" />} 
              label="Bike" 
              active={mode === TransportMode.BIKE} 
              onClick={() => setMode(TransportMode.BIKE)} 
            />
            <ModeBtn 
              icon={<Car className="w-5 h-5" />} 
              label="Car" 
              active={mode === TransportMode.CAR} 
              onClick={() => setMode(TransportMode.CAR)} 
            />
            <button 
              onClick={() => setShowDownloadModal(true)}
              className="flex flex-col items-center justify-center p-2 rounded-lg bg-stone-100 text-stone-600 active:bg-stone-200"
            >
              <Save className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-bold">CACHE</span>
            </button>
          </div>

          {/* Primary Action */}
          <div className="flex gap-2">
             <button 
               onClick={() => handleSetDestination()}
               className="flex-1 bg-stone-900 text-white py-3 rounded-xl font-bold text-lg shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
             >
               <MapPin className="w-5 h-5" />
               {navState === NavigationMode.NAVIGATING ? 'RE-ROUTE NEARBY' : 'NAVIGATE TO CLINIC'}
             </button>
             
             {(waypoints.length > 0 || recordedTrack.length > 0) && (
                <button 
                  onClick={() => { handleClearWaypoints(); setRecordedTrack([]); setIsRecording(false); }}
                  className="bg-red-100 text-red-600 px-4 rounded-xl font-bold active:scale-[0.98] transition-transform flex flex-col items-center justify-center border border-red-200 shadow-lg"
                  title="Clear Track & Waypoints"
                >
                   <MapIcon className="w-5 h-5" />
                   <span className="text-[10px]">CLEAR</span>
                </button>
             )}
          </div>
        </div>
      </footer>
    </div>
  );
};

// Helper Components
const ModeBtn: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 ${
      active ? 'bg-amber-100 text-amber-800 shadow-inner ring-1 ring-amber-300' : 'bg-stone-50 text-stone-500 hover:bg-stone-100'
    }`}
  >
    {icon}
    <span className="text-[10px] font-bold mt-1 uppercase">{label}</span>
  </button>
);

const ActivityIcon: React.FC<{ active: boolean }> = ({ active }) => (
   active ? <Compass className="w-5 h-5 text-amber-400" /> : <Compass className="w-5 h-5" />
);

export default App;