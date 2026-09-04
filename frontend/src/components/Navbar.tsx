import React from 'react';
import { 
  ShieldAlert, 
  Activity, 
  FolderKanban, 
  Radar, 
  BarChart3, 
  MapPin, 
  Cpu, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isBackendHealthy: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, isBackendHealthy }) => {
  return (
    <header className="border-b border-slate-800/80 bg-[#0c121e]/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Product Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('overview')}>
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold tracking-wider text-base sm:text-lg text-slate-100 uppercase font-mono">
                  CASHINT
                </span>
              </div>
              <p className="text-[11px] text-cyan-400 font-mono tracking-wide font-normal hidden sm:block">
                (Case-Adaptive Predictive Cash-out Intelligence)
              </p>
            </div>
          </div>

          {/* Navigation Groups */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 text-xs font-medium">
            
            {/* Intelligence Group */}
            <div className="flex items-center space-x-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md transition-all ${
                  activeTab === 'overview'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Overview</span>
              </button>

              <button
                onClick={() => setActiveTab('cases')}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md transition-all ${
                  activeTab === 'cases'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <FolderKanban className="h-3.5 w-3.5" />
                <span>Cases</span>
              </button>

              <button
                onClick={() => setActiveTab('investigation')}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md transition-all ${
                  activeTab === 'investigation'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Radar className="h-3.5 w-3.5" />
                <span>Live Investigation</span>
              </button>
            </div>

            {/* Analytics Group */}
            <div className="flex items-center space-x-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md transition-all ${
                  activeTab === 'analytics'
                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Analytics</span>
              </button>

              <button
                onClick={() => setActiveTab('atms')}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md transition-all ${
                  activeTab === 'atms'
                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>ATM Explorer</span>
              </button>
            </div>

            {/* System Group */}
            <div className="flex items-center space-x-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('models')}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md transition-all ${
                  activeTab === 'models'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                <span>Model Status</span>
              </button>
            </div>

          </nav>

          {/* System Status Pill */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono">
              {isBackendHealthy ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-400 font-medium">Models Active</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="text-rose-400 font-medium">Backend Offline</span>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </header>
  );
};
