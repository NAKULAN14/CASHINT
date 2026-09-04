import React from 'react';
import { Compass, AlertTriangle, ShieldCheck, ShieldAlert, Info } from 'lucide-react';
import { ConfidenceResult } from '../types';
import { getConfidenceBadgeColor } from '../utils/formatters';

interface ConfidencePanelProps {
  confidence: ConfidenceResult | null;
}

export const ConfidencePanel: React.FC<ConfidencePanelProps> = ({ confidence }) => {
  if (!confidence) {
    return (
      <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg flex items-center justify-center">
        <span className="text-slate-500 text-xs font-mono">Computing confidence...</span>
      </div>
    );
  }

  const { level, overall_score, channel_conf, time_conf, location_conf, evidence_penalty_applied } =
    confidence;

  const badge = getConfidenceBadgeColor(level);
  const overallPct = Math.round(overall_score * 100);

  return (
    <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
          <div className="flex items-center space-x-2">
            <Compass className="h-4 w-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Confidence & Gate Calibration
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Multi-Signal Gate
          </span>
        </div>

        {/* Large Confidence Readout */}
        <div className="flex items-center justify-between bg-[#12192b] border border-slate-800 rounded-lg p-3 mb-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Assessment Level
            </div>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className={`h-2.5 w-2.5 rounded-full ${badge.dot} animate-pulse`} />
              <span className={`text-lg sm:text-xl font-black font-mono tracking-wide ${badge.text}`}>
                {level}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Actionability Score
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-white">
              {overallPct}%
            </div>
          </div>
        </div>

        {/* Component Bars */}
        <div className="space-y-2.5 mb-3">
          
          {/* Channel */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Channel Signal:</span>
              <span className="text-cyan-300 font-bold">{Math.round(channel_conf * 100)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.round(channel_conf * 100)}%` }}
              />
            </div>
          </div>

          {/* Time */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Time Interval Signal:</span>
              <span className="text-amber-300 font-bold">{Math.round(time_conf * 100)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.round(time_conf * 100)}%` }}
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Location Separation Signal:</span>
              <span className="text-indigo-300 font-bold">{Math.round(location_conf * 100)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.round(location_conf * 100)}%` }}
              />
            </div>
          </div>

        </div>

        {/* Low Confidence Warning or High Confidence Alert */}
        {level === 'LOW' && (
          <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong>Insufficient evidence:</strong> Treat current output as a broad regional forecast rather than an immediately actionable tactical lead.
            </p>
          </div>
        )}

        {level === 'HIGH' && (
          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-start space-x-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong>High Actionability:</strong> Narrow time window and strong channel consensus warrant high-priority field coordination.
            </p>
          </div>
        )}

        {level === 'MEDIUM' && (
          <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 flex items-start space-x-2">
            <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong>Moderate Actionability:</strong> Primary direction established; await next hop confirmation before dispatching physical units.
            </p>
          </div>
        )}
      </div>

      {evidence_penalty_applied && (
        <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] font-mono text-amber-400/90 flex items-center space-x-1.5">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>50% early-evidence volume penalty applied (hops &le; 1)</span>
        </div>
      )}
    </div>
  );
};
