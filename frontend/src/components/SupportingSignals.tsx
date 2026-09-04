import React from 'react';
import { HelpCircle, CheckCircle, Zap, Shield, FileSpreadsheet } from 'lucide-react';
import { SupportingSignal } from '../types';

interface SupportingSignalsProps {
  signals?: SupportingSignal[];
}

export const SupportingSignals: React.FC<SupportingSignalsProps> = ({ signals = [] }) => {
  return (
    <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
        <div className="flex items-center space-x-2">
          <Zap className="h-4 w-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Supporting Signals (Why This Prediction?)
          </h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          Non-Causal Feature Indicators
        </span>
      </div>

      <div className="text-[11px] text-slate-400 mb-3 leading-relaxed">
        Observed behavioural signals extracted by the model pipeline. These statistical correlations inform risk calibration rather than mechanistic causal proof.
      </div>

      {/* Signals Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800/80 text-[10px] uppercase text-slate-400 tracking-wider">
              <th className="pb-2 font-semibold">Signal</th>
              <th className="pb-2 font-semibold">Current Value</th>
              <th className="pb-2 font-semibold">Interpretation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {signals.map((sig, idx) => (
              <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-2.5 pr-2 font-medium text-slate-200 flex items-center space-x-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    sig.importance === 'High' ? 'bg-cyan-400' : sig.importance === 'Medium' ? 'bg-amber-400' : 'bg-slate-500'
                  }`} />
                  <span>{sig.signal}</span>
                </td>
                <td className="py-2.5 px-2 font-bold text-cyan-300 whitespace-nowrap">
                  {sig.value}
                </td>
                <td className="py-2.5 pl-2 text-[11px] font-sans text-slate-300">
                  {sig.interpretation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
