import React from 'react';
import { Network, UserCheck, ShieldAlert, ArrowDown, Building2, Flame } from 'lucide-react';
import { Snapshot, Account } from '../types';
import { shortId } from '../utils/formatters';

interface MuleChainProps {
  snapshot: Snapshot;
}

export const MuleChain: React.FC<MuleChainProps> = ({ snapshot }) => {
  const visibleAccounts = snapshot.visible_accounts || [];
  const terminalId = snapshot.terminal_account_id;

  return (
    <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
        <div className="flex items-center space-x-2">
          <Network className="h-4 w-4 text-purple-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Mule Account Routing Chain
          </h3>
        </div>
        <span className="text-[11px] font-mono text-purple-400 font-semibold">
          {visibleAccounts.length} Observed Hops
        </span>
      </div>

      {/* Vertical Node Sequence */}
      <div className="flex-1 flex flex-col space-y-2 relative px-2 py-1">
        
        {/* Victim Origin Node */}
        <div className="bg-rose-950/30 border border-rose-800/60 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-full bg-rose-600/30 border border-rose-500 text-rose-400 flex items-center justify-center font-bold text-xs">
              VIC
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold">
                Victim Origin
              </div>
              <div className="text-xs font-mono font-bold text-slate-200">
                CASE #{shortId(snapshot.case_id)}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Initial Infiltration
          </span>
        </div>

        {/* Down Arrow */}
        <div className="flex justify-center my-0.5">
          <ArrowDown className="h-4 w-4 text-slate-600 animate-bounce" />
        </div>

        {/* Mule Accounts Chain */}
        {visibleAccounts.map((acc, idx) => {
          const isTerminal = acc.account_id === terminalId;
          const readiness = acc.cashout_readiness ?? 0;

          return (
            <React.Fragment key={acc.account_id}>
              <div
                className={`rounded-lg p-3 border transition-all relative ${
                  isTerminal
                    ? 'bg-gradient-to-r from-purple-950/60 to-slate-900 border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/40'
                    : 'bg-[#12192b] border-slate-800 hover:border-slate-700'
                }`}
              >
                {isTerminal && (
                  <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-mono font-black tracking-wider uppercase flex items-center space-x-1 shadow-md">
                    <Flame className="h-3 w-3 fill-current" />
                    <span>Current Money Location</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                      isTerminal
                        ? 'bg-purple-600 text-white border border-amber-400'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      M{idx + 1}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-slate-100">
                          {acc.account_id}
                        </span>
                        {acc.dormant_before_case && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-rose-950/80 text-rose-400 border border-rose-800/60">
                            Sleeper Mule
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                        <span className="text-slate-300 font-medium">{acc.bank}</span>
                        <span>•</span>
                        <span>{acc.age_days} days old</span>
                      </div>
                    </div>
                  </div>

                  {/* Readiness Indicator */}
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Readiness</div>
                    <div className="text-xs font-mono font-bold text-amber-400">
                      {Math.round(readiness * 100)}%
                    </div>
                  </div>
                </div>

                {/* Micro readiness bar */}
                <div className="mt-2 h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isTerminal ? 'bg-amber-400' : 'bg-purple-500'
                    }`}
                    style={{ width: `${Math.round(readiness * 100)}%` }}
                  />
                </div>
              </div>

              {/* Down Arrow between hops */}
              {idx < visibleAccounts.length - 1 && (
                <div className="flex justify-center my-0.5">
                  <ArrowDown className="h-4 w-4 text-slate-600" />
                </div>
              )}
            </React.Fragment>
          );
        })}

      </div>
    </div>
  );
};
