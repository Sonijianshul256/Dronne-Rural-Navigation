import React from 'react';
import { Map, Compass, WifiOff, Activity, ArrowRight, Smartphone } from 'lucide-react';

interface WelcomeScreenProps {
  onStart: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  return (
    <div className="h-screen w-full bg-stone-950 text-stone-100 flex flex-col items-center justify-between p-6 relative overflow-hidden font-sans">
      {/* Ambient Background */}
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-amber-900/20 via-stone-900/10 to-transparent pointer-events-none" />
      <div className="absolute -right-20 top-20 w-64 h-64 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-20 bottom-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md z-10">
        
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-6 group">
            <div className="absolute inset-0 bg-amber-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>
            <div className="relative w-24 h-24 bg-stone-900 border border-stone-800 rounded-3xl flex items-center justify-center shadow-2xl rotate-6 group-hover:rotate-3 transition-transform duration-500">
              <Compass className="w-12 h-12 text-amber-500" />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-stone-800 p-2 rounded-xl border border-stone-700 shadow-lg">
                <WifiOff className="w-4 h-4 text-stone-400" />
            </div>
          </div>
          
          <h1 className="text-4xl font-black tracking-tighter text-center text-white mb-2">
            DRONNE<span className="text-amber-500">RuralNav</span>
          </h1>
          <p className="text-stone-400 text-center text-sm font-medium tracking-wide max-w-[260px] leading-relaxed">
            INTELLIGENT OFFLINE NAVIGATION & SENSOR FUSION SYSTEM
          </p>
        </div>

        {/* Feature List */}
        <div className="w-full space-y-3">
          <FeatureRow 
            icon={<WifiOff className="w-5 h-5 text-amber-500" />} 
            text="Works completely offline without signal"
          />
          <FeatureRow 
            icon={<Activity className="w-5 h-5 text-green-500" />} 
            text="Inertial dead reckoning when GPS fails"
          />
          <FeatureRow 
            icon={<Map className="w-5 h-5 text-blue-500" />} 
            text="Local map tile caching & storage"
          />
        </div>
      </div>

      {/* Footer / CTA */}
      <div className="w-full max-w-md z-10 pt-6 pb-4 space-y-6">
        <button 
          onClick={onStart}
          className="group w-full bg-white text-stone-950 h-16 rounded-2xl font-bold text-lg flex items-center justify-between px-8 hover:bg-stone-200 transition-all active:scale-[0.98] shadow-lg shadow-white/5"
        >
          <span className="tracking-tight">Initialize System</span>
          <div className="w-10 h-10 bg-stone-950 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
             <ArrowRight className="w-5 h-5 text-white" />
          </div>
        </button>
        
        <div className="flex justify-center gap-6 opacity-40">
           <Smartphone className="w-4 h-4" />
           <span className="text-[10px] font-mono tracking-[0.2em] uppercase">RuralNav v1.0 • Ready</span>
        </div>
      </div>
    </div>
  );
};

const FeatureRow: React.FC<{ icon: React.ReactNode, text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-4 p-4 bg-stone-900/60 border border-stone-800/60 rounded-xl backdrop-blur-sm">
    <div className="shrink-0">
      {icon}
    </div>
    <span className="text-sm font-medium text-stone-300">{text}</span>
  </div>
);
