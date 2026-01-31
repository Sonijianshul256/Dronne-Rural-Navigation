import React from 'react';

interface SpeedometerProps {
  currentSpeed: number; // m/s
}

export const Speedometer: React.FC<SpeedometerProps> = ({ currentSpeed }) => {
  const speedKmh = currentSpeed * 3.6;
  const maxSpeed = 60;
  const radius = 80;
  const centerX = 100;
  const centerY = 100;
  const strokeWidth = 12;

  // Calculate angle: -90 (0kmh) to 90 (maxSpeed)
  // Clamp speed
  const displaySpeed = Math.min(Math.max(0, speedKmh), maxSpeed);
  const percent = displaySpeed / maxSpeed;
  const angle = -90 + (percent * 180);

  // Create ticks
  const renderTicks = () => {
    const ticks = [];
    const step = 10;
    for (let i = 0; i <= maxSpeed; i += step) {
      const tickAngle = -90 + (i / maxSpeed) * 180;
      const rad = (tickAngle * Math.PI) / 180;
      
      const isMajor = i % 20 === 0;
      const innerR = radius - (isMajor ? 15 : 10);
      const outerR = radius - 5;
      
      const x1 = centerX + innerR * Math.cos(rad);
      const y1 = centerY + innerR * Math.sin(rad);
      const x2 = centerX + outerR * Math.cos(rad);
      const y2 = centerY + outerR * Math.sin(rad);

      ticks.push(
        <line 
          key={`line-${i}`} 
          x1={x1} y1={y1} x2={x2} y2={y2} 
          stroke={isMajor ? "#78716c" : "#d6d3d1"} 
          strokeWidth={isMajor ? 2 : 1} 
        />
      );
      
      if (isMajor) {
         const textR = radius - 28;
         const tx = centerX + textR * Math.cos(rad);
         const ty = centerY + textR * Math.sin(rad);
         ticks.push(
            <text 
              key={`text-${i}`} 
              x={tx} y={ty} 
              textAnchor="middle" 
              dominantBaseline="middle" 
              className="text-[10px] fill-stone-500 font-mono font-bold"
            >
              {i}
            </text>
         );
      }
    }
    return ticks;
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-[200px] h-[110px]">
        <svg width="100%" height="100%" viewBox="0 0 200 110" className="overflow-visible">
            {/* Background Arc */}
            <path 
               d="M 20 100 A 80 80 0 0 1 180 100" 
               fill="none" 
               stroke="#e7e5e4" 
               strokeWidth={strokeWidth} 
               strokeLinecap="round"
            />
            
            {renderTicks()}

            {/* Needle */}
            <g transform={`rotate(${angle}, ${centerX}, ${centerY})`} className="transition-transform duration-300 ease-out">
                {/* Needle Base/Center */}
                <circle cx={centerX} cy={centerY} r="6" fill="#7c2d12" />
                {/* Needle Body */}
                <line x1={centerX} y1={centerY} x2={centerX} y2={centerY - radius + 5} stroke="#ea580c" strokeWidth="3" strokeLinecap="round" />
            </g>
        </svg>
        
        {/* Digital Readout Overlay */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center translate-y-1">
            <span className="text-3xl font-black text-stone-800 tracking-tighter leading-none">
                {speedKmh.toFixed(1)}
            </span>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">km/h</span>
        </div>
      </div>
    </div>
  );
};
