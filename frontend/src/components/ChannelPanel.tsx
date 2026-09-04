import React from 'react';
import { CreditCard, UserCheck, Building, Smartphone, HelpCircle } from 'lucide-react';
import { ChannelPredictionResult } from '../types';

interface ChannelPanelProps {
  channelData: ChannelPredictionResult | null;
}

const getChannelIcon = (channel: string) => {
  switch (channel.toUpperCase()) {
    case 'ATM':
      return <CreditCard className="h-4 w-4" />;
    case 'AGENT':
      return <UserCheck className="h-4 w-4" />;
    case 'BRANCH':
      return <Building className="h-4 w-4" />;
    case 'UPI':
      return <Smartphone className="h-4 w-4" />;
    default:
      return <HelpCircle className="h-4 w-4" />;
  }
};

export const ChannelPanel: React.FC<ChannelPanelProps> = ({ channelData }) => {
  const predictions = channelData?.predictions || [];
  const sorted = [...predictions].sort((a, b) => b.probability - a.probability);
  const topChannel = channelData?.top_channel;

  return (
    <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
          <div className="flex items-center space-x-2">
            <CreditCard className="h-4 w-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Predicted Cash-Out Channel
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            5-way Multiclass
          </span>
        </div>

        {/* Prediction Bars */}
        <div className="space-y-3">
          {sorted.map((item, idx) => {
            const isTop = item.channel === topChannel;
            const pct = Math.round(item.probability * 100);

            return (
              <div key={item.channel} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <span className={isTop ? 'text-cyan-400 font-bold' : 'text-slate-400'}>
                      {getChannelIcon(item.channel)}
                    </span>
                    <span className={isTop ? 'text-white font-bold' : 'text-slate-300 font-medium'}>
                      {item.channel}
                    </span>
                    {isTop && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                        Primary
                      </span>
                    )}
                  </div>
                  <span className={`font-mono font-bold ${isTop ? 'text-cyan-300 text-sm' : 'text-slate-400'}`}>
                    {pct}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/60 relative">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      isTop
                        ? 'bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                        : idx === 1
                        ? 'bg-slate-600'
                        : 'bg-slate-700/60'
                    }`}
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <span>Leading Liquidation Mode:</span>
        <span className="font-mono text-cyan-400 font-bold">{topChannel || '--'}</span>
      </div>
    </div>
  );
};
