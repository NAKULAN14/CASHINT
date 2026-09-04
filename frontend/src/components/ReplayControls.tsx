import React, { useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Pause, 
  RotateCcw, 
  Radio, 
  Layers 
} from 'lucide-react';
import { Snapshot } from '../types';
import { formatWallClock } from '../utils/formatters';

interface ReplayControlsProps {
  snapshots: Snapshot[];
  currentIndex: number;
  onSelectSnapshot: (index: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  snapshots,
  currentIndex,
  onSelectSnapshot,
  isPlaying,
  setIsPlaying,
}) => {
  const total = snapshots.length;
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        if (currentIndex >= total - 1) {
          setIsPlaying(false);
        } else {
          onSelectSnapshot(currentIndex + 1);
        }
      }, 3000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentIndex, total, onSelectSnapshot, setIsPlaying]);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setIsPlaying(false);
      onSelectSnapshot(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setIsPlaying(false);
      onSelectSnapshot(currentIndex + 1);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    onSelectSnapshot(0);
  };

  const togglePlay = () => {
    if (currentIndex >= total - 1) {
      onSelectSnapshot(0);
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg mb-5">
      
      {/* Controls & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        
        <div className="flex items-center space-x-2">
          <Layers className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Evidence Evolution & Investigation Replay
          </h3>

          {isPlaying && (
            <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-700/60 text-[10px] font-mono font-bold text-rose-400 animate-pulse ml-2">
              <Radio className="h-3 w-3" />
              <span>LIVE REPLAY</span>
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
            title="Reset to initial snapshot"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg border text-xs font-semibold font-mono transition-all ${
              currentIndex === 0
                ? 'bg-slate-900/50 border-slate-800/50 text-slate-600 cursor-not-allowed'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous</span>
          </button>

          <button
            onClick={togglePlay}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-bold font-mono transition-all shadow-sm ${
              isPlaying
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Auto Replay</span>
              </>
            )}
          </button>

          <button
            onClick={handleNext}
            disabled={currentIndex >= total - 1}
            className={`flex items-center space-x-1 px-3.5 py-1.5 rounded-lg border text-xs font-bold font-mono transition-all ${
              currentIndex >= total - 1
                ? 'bg-slate-900/50 border-slate-800/50 text-slate-600 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 border-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.3)]'
            }`}
          >
            <span>Next Evidence</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

      </div>

      {/* Snapshot Stepper Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 mt-4">
        {snapshots.map((snap, idx) => {
          const isActive = idx === currentIndex;
          const isPast = idx < currentIndex;
          const readiness = snap.terminal_account_readiness ?? 0;

          return (
            <div
              key={snap.snapshot_index}
              onClick={() => {
                setIsPlaying(false);
                onSelectSnapshot(idx);
              }}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                isActive
                  ? 'bg-cyan-950/40 border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/50'
                  : isPast
                  ? 'bg-[#101726]/60 border-slate-800 hover:border-slate-700'
                  : 'bg-[#0b101b]/40 border-slate-800/60 opacity-60 hover:opacity-100 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                <span className={`font-bold ${isActive ? 'text-cyan-400' : 'text-slate-400'}`}>
                  Snapshot {idx + 1}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {formatWallClock(snap.as_of_time)}
                </span>
              </div>

              <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Hops:</span>
                  <span className="font-bold text-white">{snap.n_hops_observed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Terminal:</span>
                  <span className="font-mono text-cyan-300 truncate max-w-[90px]">
                    {snap.terminal_account_id || 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Readiness:</span>
                  <span className="font-bold text-amber-300">{Math.round(readiness * 100)}%</span>
                </div>
              </div>

              {isActive && (
                <div className="mt-2 text-[10px] font-mono text-cyan-400 uppercase tracking-wider text-center font-bold bg-cyan-950/60 py-0.5 rounded border border-cyan-800/60">
                  Active Intelligence
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};
