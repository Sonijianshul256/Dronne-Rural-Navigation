import React, { useState, useEffect } from 'react';
import { X, Sliders, Compass, Move, Save, RotateCcw, Zap, Target } from 'lucide-react';
import { SensorReadings, SensorCalibration } from '../types';

interface SensorCalibrationModalProps {
  rawSensors: SensorReadings;
  calibration: SensorCalibration;
  onSave: (cal: SensorCalibration) => void;
  onClose: () => void;
  onReconnect: () => void;
}

export const SensorCalibrationModal: React.FC<SensorCalibrationModalProps> = ({
  rawSensors, calibration, onSave, onClose, onReconnect
}) => {
  const [tempCal, setTempCal] = useState<SensorCalibration>(calibration);
  const [activeTab, setActiveTab] = useState<'compass' | 'motion'>('compass');

  // Calculate current calibrated values for preview
  const rawAlpha = rawSensors.alpha || 0;
  const calAlpha = (rawAlpha + tempCal.alphaOffset + 360) % 360;
  
  const rawAccX = rawSensors.accX || 0;
  const rawAccY = rawSensors.accY || 0;
  const rawAccZ = rawSensors.accZ || 0;

  const calAccX = rawAccX - tempCal.accXOffset;
  const calAccY = rawAccY - tempCal.accYOffset;
  const calAccZ = rawAccZ - tempCal.accZOffset;

  const handleSetNorth = () => {
    // Set current raw heading as North (0)
    // Formula: (raw + offset) % 360 = 0  => offset = -raw
    setTempCal(prev => ({ ...prev, alphaOffset: -rawAlpha }));
  };

  const handleZeroAccel = () => {
    // Assume device is flat and still. 
    // X and Y bias should be removed (set offset to current reading).
    setTempCal(prev => ({
      ...prev,
      accXOffset: rawAccX,
      accYOffset: rawAccY,
      // We generally don't zero Z blindly as it contains gravity (9.8), 
      // but for DR we might want to isolate linear motion. 
      // For this simple app, we'll calibrate Z bias to 0 assuming gravity is handled elsewhere 
      // or just remove the current static reading.
      accZOffset: rawAccZ
    }));
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-stone-800 flex justify-between items-center bg-stone-900/50">
           <h2 className="text-lg font-bold text-white flex items-center gap-2">
             <Sliders className="w-5 h-5 text-amber-500" /> Sensor Calibration
           </h2>
           <button onClick={onClose} className="p-2 hover:bg-stone-800 rounded-full text-stone-400 hover:text-white transition-colors">
             <X className="w-5 h-5" />
           </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-800">
            <button 
                onClick={() => setActiveTab('compass')}
                className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'compass' ? 'bg-stone-800 text-white border-b-2 border-amber-500' : 'text-stone-500 hover:bg-stone-800/50'}`}
            >
                Compass
            </button>
            <button 
                onClick={() => setActiveTab('motion')}
                className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'motion' ? 'bg-stone-800 text-white border-b-2 border-amber-500' : 'text-stone-500 hover:bg-stone-800/50'}`}
            >
                Motion
            </button>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto">
           {activeTab === 'compass' && (
               <div className="space-y-6">
                   <div className="flex flex-col items-center justify-center py-4">
                       <div className="relative w-32 h-32 rounded-full border-4 border-stone-700 flex items-center justify-center bg-stone-800 shadow-inner">
                           {/* Dial Marks */}
                           <div className="absolute inset-0 rounded-full border border-stone-600 opacity-30"></div>
                           <div className="absolute top-2 text-xs font-bold text-amber-500">N</div>
                           <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-stone-600">E</div>
                           <div className="absolute bottom-2 text-[10px] font-bold text-stone-600">S</div>
                           <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-stone-600">W</div>
                           
                           {/* Raw Needle (Ghost) */}
                           <div 
                              className="absolute w-1 h-10 bg-stone-500/50 origin-bottom bottom-1/2 rounded-full transition-transform duration-300 ease-out z-0"
                              style={{ transform: `rotate(${-rawAlpha}deg)` }}
                           ></div>

                           {/* Calibrated Needle (Active) */}
                           <div 
                              className="absolute w-1 h-12 bg-red-500 origin-bottom bottom-1/2 rounded-full shadow-lg transition-transform duration-300 ease-out z-10"
                              style={{ transform: `rotate(${-calAlpha}deg)` }} 
                           ></div>
                           
                           {/* Center Cap */}
                           <div className="w-3 h-3 bg-stone-200 rounded-full z-20 shadow-md"></div>
                       </div>
                       
                       <div className="mt-4 flex gap-4 text-center">
                           <div>
                               <div className="text-3xl font-mono font-bold text-white">{calAlpha.toFixed(0)}°</div>
                               <div className="text-[10px] text-stone-500 uppercase tracking-wider">Calibrated</div>
                           </div>
                           <div className="opacity-50">
                               <div className="text-3xl font-mono font-bold text-stone-400">{rawAlpha.toFixed(0)}°</div>
                               <div className="text-[10px] text-stone-500 uppercase tracking-wider">Raw</div>
                           </div>
                       </div>
                   </div>

                   <div className="bg-stone-800/50 rounded-xl p-4 border border-stone-700 space-y-4">
                       <div className="flex justify-between items-center text-sm">
                           <span className="text-stone-400">Offset Adjustment:</span>
                           <span className="font-mono text-amber-500">{tempCal.alphaOffset.toFixed(0)}°</span>
                       </div>
                       
                       <div className="pt-2">
                          <label className="text-xs font-bold text-stone-500 mb-2 block">MANUAL OFFSET ({tempCal.alphaOffset}°)</label>
                          <input 
                            type="range" 
                            min="-180" max="180" 
                            value={tempCal.alphaOffset}
                            onChange={(e) => setTempCal(p => ({...p, alphaOffset: parseInt(e.target.value)}))}
                            className="w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                       </div>

                       <div className="flex gap-2 pt-2">
                           <button 
                             onClick={handleSetNorth}
                             className="flex-1 py-2 bg-stone-700 hover:bg-stone-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                           >
                             <Target className="w-3 h-3" /> SET AS NORTH
                           </button>
                           <button 
                             onClick={() => setTempCal(p => ({...p, alphaOffset: 0}))}
                             className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white rounded-lg"
                             title="Reset"
                           >
                             <RotateCcw className="w-4 h-4" />
                           </button>
                       </div>
                   </div>
               </div>
           )}

           {activeTab === 'motion' && (
               <div className="space-y-6">
                   {/* Bubble Level Visualization */}
                   <div className="flex flex-col items-center">
                       <div className="relative w-32 h-32 bg-stone-800 rounded-full border-4 border-stone-700 shadow-inner flex items-center justify-center overflow-hidden mb-2">
                            {/* Grid/Target */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                                <div className="w-full h-px bg-stone-500"></div>
                                <div className="h-full w-px bg-stone-500 absolute"></div>
                                <div className="w-16 h-16 border border-stone-500 rounded-full"></div>
                                <div className="w-8 h-8 border border-stone-500 rounded-full bg-stone-500/10"></div>
                            </div>
                            
                            {/* The Bubble */}
                            <div 
                              className={`absolute w-6 h-6 rounded-full shadow-lg border border-white/20 transition-all duration-100 ease-linear ${
                                Math.abs(calAccX) < 0.2 && Math.abs(calAccY) < 0.2 ? 'bg-green-500' : 'bg-amber-500'
                              }`}
                              style={{ 
                                // Visualize tilt: X accel moves bubble left/right, Y accel moves up/down
                                // Scaling factor 10 arbitrary for visual
                                transform: `translate(${-calAccX * 10}px, ${calAccY * 10}px)` 
                              }}
                            ></div>
                       </div>
                       <div className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Level Indicator</div>
                   </div>

                   <div className="grid grid-cols-3 gap-2 text-center">
                        <AxisDisplay label="X" raw={rawAccX} cal={calAccX} />
                        <AxisDisplay label="Y" raw={rawAccY} cal={calAccY} />
                        <AxisDisplay label="Z" raw={rawAccZ} cal={calAccZ} />
                   </div>

                   <div className="bg-stone-800/50 rounded-xl p-4 border border-stone-700 space-y-4">
                       <p className="text-xs text-stone-400 leading-relaxed">
                          Place device on a flat, stable surface. The bubble should be in the center green circle.
                          Click "Calibrate Still" to zero out the X/Y bias.
                       </p>

                       <button 
                         onClick={handleZeroAccel}
                         className="w-full py-3 bg-stone-700 hover:bg-stone-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-lg"
                       >
                         <Target className="w-4 h-4 text-amber-500" /> CALIBRATE STILL
                       </button>

                       <button 
                         onClick={() => setTempCal(p => ({...p, accXOffset: 0, accYOffset: 0, accZOffset: 0}))}
                         className="w-full py-2 bg-transparent border border-stone-700 hover:bg-stone-800 text-stone-400 text-xs font-bold rounded-lg flex items-center justify-center gap-2"
                       >
                         <RotateCcw className="w-3 h-3" /> RESET OFFSETS
                       </button>
                   </div>
               </div>
           )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-900 flex flex-col gap-3">
           <button 
             onClick={() => onSave(tempCal)}
             className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 active:scale-[0.98] transition-transform"
           >
             <Save className="w-4 h-4" /> SAVE CALIBRATION
           </button>
           
           <button 
             onClick={onReconnect}
             className="w-full py-2 flex items-center justify-center gap-2 text-xs text-stone-500 hover:text-stone-300"
           >
              <Zap className="w-3 h-3" /> Reconnect / Request Permissions
           </button>
        </div>
      </div>
    </div>
  );
};

const AxisDisplay: React.FC<{ label: string, raw: number | null, cal: number }> = ({ label, raw, cal }) => (
    <div className="bg-stone-800 p-2 rounded-lg border border-stone-700 relative overflow-hidden">
        {/* Simple Bar Chart Background */}
        <div className="absolute bottom-0 left-0 right-0 bg-stone-700/30 h-1">
             <div 
               className={`h-full transition-all duration-100 ${Math.abs(cal) > 0.5 ? 'bg-red-500' : 'bg-green-500'}`}
               style={{ width: `${Math.min(100, Math.abs(cal) * 20)}%` }} // 1g = 9.8 roughly 20% scale if range 5
             ></div>
        </div>

        <div className="text-[10px] font-bold text-stone-500 mb-1">ACCEL {label}</div>
        <div className={`text-lg font-mono font-bold ${Math.abs(cal) > 0.5 ? 'text-red-400' : 'text-green-400'}`}>
            {cal.toFixed(2)}
        </div>
        <div className="text-[9px] text-stone-600 font-mono">
            RAW: {raw?.toFixed(2) || '0.00'}
        </div>
    </div>
);
