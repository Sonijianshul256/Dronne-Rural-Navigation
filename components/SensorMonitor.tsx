import React from 'react';
import { Activity, Compass, Move, Zap, Satellite, Gauge, Mountain, Crosshair, Signal } from 'lucide-react';
import { SensorReadings } from '../types';

interface SensorMonitorProps {
  sensors: SensorReadings;
  isDeadReckoning: boolean;
  gpsActive: boolean;
  signalStrength: number;
  speed: number;
  altitude: number;
  onCalibrate: () => void;
}

export const SensorMonitor: React.FC<SensorMonitorProps> = ({ 
  sensors, isDeadReckoning, gpsActive, signalStrength, speed, altitude, onCalibrate 
}) => {
  
  // Simulate HDOP based on signal strength (4 = Excellent/Low HDOP, 0 = Poor/High HDOP)
  const hdop = gpsActive ? Math.max(0.8, (5 - signalStrength) * 1.5) : 0;
  
  // Simulate Accuracy in meters based on HDOP
  const accuracy = gpsActive ? (hdop * 4).toFixed(1) : '---';

  const getGpsColor = () => {
    if (!gpsActive) return 'text-stone-600';
    if (signalStrength >= 3) return 'text-green-500';
    if (signalStrength === 2) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="bg-stone-900 text-green-400 p-4 rounded-lg font-mono text-sm shadow-inner border border-stone-700 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-stone-700 pb-2">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Activity className="w-5 h-5" /> SENSOR FUSION
        </h3>
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${isDeadReckoning ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-500'}`}>
          {isDeadReckoning ? 'DR ACTIVE' : 'STANDBY'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Orientation */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-stone-400 text-xs uppercase tracking-wider">
            <Compass className="w-4 h-4" /> Heading
          </div>
          <div className="text-2xl font-bold text-white">
            {sensors.alpha ? sensors.alpha.toFixed(1) : '---'}°
          </div>
          <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-300" 
              style={{ width: `${(sensors.alpha || 0) / 3.6}%` }} 
            />
          </div>
        </div>

        {/* Acceleration */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-stone-400 text-xs uppercase tracking-wider">
            <Move className="w-4 h-4" /> Motion
          </div>
          <div className="text-2xl font-bold text-white">
            {sensors.accX ? (Math.abs(sensors.accX) + Math.abs(sensors.accY || 0)).toFixed(2) : '0.00'}
            <span className="text-xs text-stone-500 ml-1">m/s²</span>
          </div>
          <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
             <div 
              className="bg-red-500 h-full transition-all duration-100" 
              style={{ width: `${Math.min(100, (Math.abs(sensors.accX || 0) * 10))}%` }} 
            />
          </div>
        </div>
      </div>

      {/* GPS Accuracy / GNSS Status Section */}
      <div className="pt-2 border-t border-stone-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-stone-400 text-xs uppercase tracking-wider">
               <Satellite className="w-4 h-4" /> GNSS Status
            </div>
            {gpsActive && (
               <div className="text-[10px] font-bold bg-stone-800 px-1.5 py-0.5 rounded text-stone-400">
                  SAT: {Math.max(0, signalStrength * 3 + 2)} / 12
               </div>
            )}
          </div>
          
          {/* Detailed Metric Grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
             <div className="bg-stone-800/50 p-2 rounded border border-stone-800 flex flex-col justify-between">
                <div className="flex items-center gap-1 text-[10px] text-stone-500 mb-1">
                   <Crosshair className="w-3 h-3" /> ACCURACY
                </div>
                <div className={`font-bold text-lg leading-none ${gpsActive ? 'text-white' : 'text-stone-600'}`}>
                   {accuracy} <span className="text-[10px] font-normal text-stone-500">m</span>
                </div>
             </div>

             <div className="bg-stone-800/50 p-2 rounded border border-stone-800 flex flex-col justify-between">
                <div className="flex items-center gap-1 text-[10px] text-stone-500 mb-1">
                   <Signal className="w-3 h-3" /> HDOP
                </div>
                <div className={`font-bold text-lg leading-none ${getGpsColor()}`}>
                   {gpsActive ? hdop.toFixed(1) : '-.-'}
                </div>
             </div>

             <div className="bg-stone-800/50 p-2 rounded border border-stone-800 flex flex-col justify-between">
                <div className="flex items-center gap-1 text-[10px] text-stone-500 mb-1">
                   <Mountain className="w-3 h-3" /> ALTITUDE
                </div>
                <div className={`font-bold text-lg leading-none ${gpsActive ? 'text-white' : 'text-stone-600'}`}>
                   {gpsActive ? altitude.toFixed(0) : '---'} <span className="text-[10px] font-normal text-stone-500">m</span>
                </div>
             </div>

             <div className="bg-stone-800/50 p-2 rounded border border-stone-800 flex flex-col justify-between">
                <div className="flex items-center gap-1 text-[10px] text-stone-500 mb-1">
                   <Gauge className="w-3 h-3" /> SPEED
                </div>
                <div className={`font-bold text-lg leading-none ${gpsActive ? 'text-white' : 'text-stone-600'}`}>
                   {(speed * 3.6).toFixed(1)} <span className="text-[10px] font-normal text-stone-500">km/h</span>
                </div>
             </div>
          </div>

          <div className="relative w-full h-1 bg-stone-800 rounded-full overflow-hidden mb-1">
             {gpsActive && (
                 <div 
                    className={`absolute inset-y-0 left-0 transition-all duration-500 ${signalStrength >= 3 ? 'bg-green-500' : signalStrength >= 2 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.max(5, Math.min(100, (1 - ((hdop - 0.8) / 6)) * 100))}%` }}
                 />
             )}
          </div>
          <div className="text-[9px] text-stone-600 text-center font-mono uppercase">Signal Confidence</div>
      </div>

      <button 
        onClick={onCalibrate}
        className="mt-2 w-full flex justify-center items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-300 py-2 rounded text-xs transition-colors"
      >
        <Zap className="w-3 h-3" /> CALIBRATE SENSORS
      </button>
    </div>
  );
};