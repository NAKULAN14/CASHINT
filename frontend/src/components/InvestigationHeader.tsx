import React from 'react';
import { 
  Shield, 
  MapPin, 
  Clock, 
  Layers, 
  TrendingUp, 
  Compass, 
  Building2, 
  Smartphone, 
  CreditCard 
} from 'lucide-react';
import { PredictionResult, CaseDetail } from '../types';
import { formatINR, formatWallClock, formatHours, getConfidenceBadgeColor, shortId } from '../utils/formatters';

interface InvestigationHeaderProps {
  caseDetail: CaseDetail;
  prediction: PredictionResult | null;
  currentStep: number;
  totalSteps: number;
}

export const InvestigationHeader: React.FC<InvestigationHeaderProps> = ({
  caseDetail,
  prediction,
  currentStep,
  totalSteps,
}) => {
  const confStyle = prediction 
    ? getConfidenceBadgeColor(prediction.confidence.level) 
    : { bg: 'bg-slate-800', text: 'text-slate-400', border: 'border-slate-700', dot: 'bg-slate-500' };

  const topChannel = prediction?.channel.top_channel || 'Calculating...';
  const topLocation = prediction?.location.top_locations[0];
  const timeStart = prediction ? formatWallClock(prediction.time_window.cashout_window_start) : '--:--';
  const timeEnd = prediction ? formatWallClock(prediction.time_window.cashout_window_end) : '--:--';
  const medianHours = prediction ? formatHours(prediction.time_window.median_hours) : '--';

  return (
    <div className="bg-[#0e1524] border border-slate-800/90 rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden mb-5">
      {/* Background cyber accent glow */}
      <div className="absolute top-0 right-0 w-96 h-32 bg-cyan-500/5 blur-3xl pointer-events-none -mr-10 -mt-10" />
      
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        
        <div className="flex items-center space-x-3">
          <div className="px-2.5 py-1 rounded bg-cyan-950/60 border border-cyan-800/50 text-cyan-400 font-mono text-xs font-semibold tracking-wider uppercase flex items-center space-x-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span>CASE #{shortId(caseDetail.case_id)}</span>
          </div>

          <div className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
            {formatINR(caseDetail.stolen_amount)}
          </div>

          <span className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${
            caseDetail.urban 
              ? 'bg-blue-950/70 text-blue-400 border border-blue-800/40' 
              : 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/40'
          }`}>
            {caseDetail.urban ? 'Urban Victim' : 'Rural Victim'}
          </span>
        </div>

        {/* Evidence step indicator */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400">Evidence Step:</span>
            <span className="text-cyan-400 font-bold">{currentStep + 1}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{totalSteps}</span>
          </div>

          {/* Confidence Badge */}
          {prediction && (
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-bold font-mono tracking-wider ${confStyle.bg} ${confStyle.text} ${confStyle.border}`}>
              <span className={`h-2 w-2 rounded-full ${confStyle.dot} animate-pulse`} />
              <span>{prediction.confidence.level} CONFIDENCE ({Math.round(prediction.confidence.overall_score * 100)}%)</span>
            </div>
          )}
        </div>

      </div>

      {/* Hero Intelligence Assessment Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-4">
        
        {/* WHERE */}
        <div className="bg-[#121b2d]/80 rounded-lg p-3 border border-slate-800/70 hover:border-cyan-500/30 transition-colors">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center space-x-1.5">
            <MapPin className="h-3.5 w-3.5 text-cyan-400" />
            <span>Predicted Location (Where)</span>
          </div>
          <div className="mt-1 font-mono text-sm sm:text-base font-bold text-slate-100 truncate">
            {topLocation ? topLocation.id : 'Scanning ATMs...'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">
            {topLocation ? `${topLocation.dist_victim_km.toFixed(1)} km from victim (${topLocation.bank || 'Bank'})` : 'Awaiting baseline'}
          </div>
        </div>

        {/* WHEN */}
        <div className="bg-[#121b2d]/80 rounded-lg p-3 border border-slate-800/70 hover:border-amber-500/30 transition-colors">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center space-x-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span>Cash-Out Window (When)</span>
          </div>
          <div className="mt-1 font-mono text-sm sm:text-base font-bold text-slate-100">
            {timeStart} – {timeEnd}
          </div>
          <div className="text-xs text-amber-400/90 mt-0.5">
            Median ETA: ~{medianHours} from report
          </div>
        </div>

        {/* HOW */}
        <div className="bg-[#121b2d]/80 rounded-lg p-3 border border-slate-800/70 hover:border-indigo-500/30 transition-colors">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center space-x-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
            <span>Predicted Channel (How)</span>
          </div>
          <div className="mt-1 font-mono text-sm sm:text-base font-bold text-indigo-300">
            {topChannel}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {prediction ? `${Math.round(prediction.channel.top_probability * 100)}% predicted likelihood` : 'Calculating...'}
          </div>
        </div>

        {/* CONFIDENCE */}
        <div className="bg-[#121b2d]/80 rounded-lg p-3 border border-slate-800/70 hover:border-slate-700 transition-colors">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center space-x-1.5">
            <Compass className="h-3.5 w-3.5 text-slate-400" />
            <span>Intelligence Readiness</span>
          </div>
          <div className="mt-1 font-mono text-sm sm:text-base font-bold text-slate-100">
            {prediction ? `${Math.round(prediction.confidence.overall_score * 100)}% Readiness` : '--'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {prediction?.confidence.evidence_penalty_applied 
              ? 'Early hop penalty active' 
              : 'Multi-signal calibrated'}
          </div>
        </div>

      </div>

    </div>
  );
};
