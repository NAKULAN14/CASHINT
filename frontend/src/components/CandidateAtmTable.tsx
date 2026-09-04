import React from 'react';
import { MapPin, Building2, Navigation, AlertCircle } from 'lucide-react';
import { LocationCandidate } from '../types';

interface CandidateAtmTableProps {
  candidates: LocationCandidate[];
  locationMode: 'baseline' | 'model';
}

export const CandidateAtmTable: React.FC<CandidateAtmTableProps> = ({
  candidates,
  locationMode,
}) => {
  return (
    <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
        <div className="flex items-center space-x-2">
          <MapPin className="h-4 w-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Top-3 Location Candidates ({locationMode === 'baseline' ? 'Nearest Baseline' : 'Model Ranker'})
          </h3>
        </div>
        <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
          Ranked Candidates
        </span>
      </div>

      <div className="space-y-2.5">
        {candidates.map((atm, idx) => {
          const rank = idx + 1;
          const badgeClass =
            rank === 1
              ? 'bg-amber-500 text-black font-black'
              : rank === 2
              ? 'bg-cyan-500 text-black font-black'
              : 'bg-blue-600 text-white font-black';

          return (
            <div
              key={atm.id}
              className="bg-[#12192b] border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <div className={`h-7 w-7 rounded-md flex items-center justify-center text-xs font-mono shadow-md ${badgeClass}`}>
                  #{rank}
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-slate-100 flex items-center space-x-2">
                    <span>{atm.id}</span>
                    <span className="text-slate-400 font-normal">({atm.bank || 'Bank'})</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center space-x-3">
                    <span className="flex items-center space-x-1 text-cyan-300 font-semibold">
                      <Navigation className="h-3 w-3" />
                      <span>{atm.dist_victim_km.toFixed(1)} km from victim</span>
                    </span>
                    {atm.dist_terminal_km !== undefined && atm.dist_terminal_km !== null && (
                      <span className="text-purple-300">
                        {atm.dist_terminal_km.toFixed(1)} km from terminal
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {locationMode === 'model' && atm.score !== undefined && atm.score !== null && (
                <div className="text-right font-mono">
                  <div className="text-[9px] uppercase text-slate-400">Score</div>
                  <div className="text-xs font-bold text-amber-300">{atm.score.toFixed(4)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {locationMode === 'model' && (
        <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] font-mono text-amber-400/90 flex items-center space-x-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Notice: Experimental LambdaMART model scores 15 nearest + 5 random candidates.</span>
        </div>
      )}
    </div>
  );
};
