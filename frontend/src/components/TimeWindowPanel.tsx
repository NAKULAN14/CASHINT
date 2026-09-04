import React from 'react';
import { Clock, Hourglass, Calendar, AlertCircle } from 'lucide-react';
import { TimeWindowResult } from '../types';
import { formatWallClock, formatHours } from '../utils/formatters';

interface TimeWindowPanelProps {
  timeWindow: TimeWindowResult | null;
  asOfTime: string;
}

export const TimeWindowPanel: React.FC<TimeWindowPanelProps> = ({ timeWindow, asOfTime }) => {
  const p10 = timeWindow?.lower_hours ?? 0;
  const p50 = timeWindow?.median_hours ?? 0;
  const p90 = timeWindow?.upper_hours ?? 0;

  const startTime = timeWindow ? formatWallClock(timeWindow.cashout_window_start) : '--:--';
  const endTime = timeWindow ? formatWallClock(timeWindow.cashout_window_end) : '--:--';
  const currentTime = asOfTime ? formatWallClock(asOfTime) : '--:--';

  // Calculate relative positions for visual timeline bar
  const maxScale = Math.max(p90 * 1.15, 1.0);
  const p10Pct = Math.min(Math.max((p10 / maxScale) * 100, 5), 85);
  const p50Pct = Math.min(Math.max((p50 / maxScale) * 100, 10), 90);
  const p90Pct = Math.min(Math.max((p90 / maxScale) * 100, 20), 98);

  return (
    <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Expected Cash-Out Window
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            P10 / P50 / P90 Quantiles
          </span>
        </div>

        {/* Big Wall Clock Window */}
        <div className="bg-[#12192b] border border-slate-800 rounded-lg p-3 text-center mb-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-0.5">
            Predicted Interception Window
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-amber-400 tracking-wider">
            {startTime} – {endTime}
          </div>
          <div className="text-xs font-mono text-slate-300 mt-1 flex items-center justify-center space-x-2">
            <span>Interval: {formatHours(p10)} – {formatHours(p90)}</span>
            <span className="text-slate-500">•</span>
            <span className="text-amber-300 font-bold">Median: {formatHours(p50)}</span>
          </div>
        </div>

        {/* Graphical Timeline Bar */}
        <div className="py-2 px-1">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-2 flex justify-between">
            <span>As of ({currentTime})</span>
            <span>Upper Bound ({formatHours(p90)})</span>
          </div>

          <div className="relative h-6 flex items-center">
            {/* Timeline base track */}
            <div className="h-1.5 w-full bg-slate-900 rounded-full border border-slate-800 relative">
              {/* Quantile interval span (p10 to p90) */}
              <div
                className="absolute top-0 bottom-0 bg-gradient-to-r from-amber-500/40 via-amber-400 to-amber-500/40 rounded-full transition-all duration-700"
                style={{
                  left: `${p10Pct}%`,
                  width: `${Math.max(p90Pct - p10Pct, 5)}%`,
                }}
              />
            </div>

            {/* Current Point (NOW) */}
            <div className="absolute left-0 -top-1 flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-cyan-400 border border-slate-900 shadow-sm" />
              <span className="text-[9px] font-mono text-cyan-400 mt-1">NOW</span>
            </div>

            {/* P10 Marker */}
            <div
              className="absolute -top-1 flex flex-col items-center transition-all duration-700"
              style={{ left: `${p10Pct}%` }}
            >
              <span className="h-3 w-1 bg-amber-400/80 rounded" />
              <span className="text-[9px] font-mono text-slate-400 mt-1">P10</span>
            </div>

            {/* P50 Median Marker */}
            <div
              className="absolute -top-2 flex flex-col items-center transition-all duration-700"
              style={{ left: `${p50Pct}%` }}
            >
              <span className="h-4 w-4 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md flex items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-950" />
              </span>
              <span className="text-[9px] font-mono font-bold text-amber-300 mt-0.5">P50</span>
            </div>

            {/* P90 Marker */}
            <div
              className="absolute -top-1 flex flex-col items-center transition-all duration-700"
              style={{ left: `${p90Pct}%` }}
            >
              <span className="h-3 w-1 bg-amber-400/80 rounded" />
              <span className="text-[9px] font-mono text-slate-400 mt-1">P90</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <span>Log-space transformed with expm1:</span>
        <span className="font-mono text-slate-300 font-semibold">Active Quantile Model</span>
      </div>
    </div>
  );
};
