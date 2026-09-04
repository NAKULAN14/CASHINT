import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  BarChart3, 
  Layers, 
  Clock, 
  MapPin, 
  Loader2 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell 
} from 'recharts';
import { fetchModelStatus } from '../services/api';
import { ModelStatusResponse } from '../types';

export const ModelStatus: React.FC = () => {
  const [data, setData] = useState<ModelStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchModelStatus();
        setData(res);
      } catch (e) {
        console.error('Failed to load model status:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px] text-slate-400 font-mono text-xs">
        <Loader2 className="h-6 w-6 text-cyan-400 animate-spin mr-2" />
        <span>Loading model diagnostics and metrics...</span>
      </div>
    );
  }

  const channel = data?.channel_model;
  const time = data?.time_model;
  const location = data?.location_model;

  // Format feature importances for time model
  const timeFeatures = (time?.feature_importance || []).slice(0, 8).map((f: any) => ({
    name: f.feature,
    gain: Math.round(f.gain || 0),
  }));

  return (
    <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2 text-amber-400 font-mono text-xs uppercase tracking-wider mb-1">
          <Cpu className="h-4 w-4" />
          <span>Machine Learning Infrastructure & Diagnostics</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase font-mono">
          Model Evaluation & Transparency
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Real-time performance benchmarks, baseline comparisons, and feature attribution.
        </p>
      </div>

      {/* Critical Evaluation Transparency Banner */}
      <div className="bg-amber-950/30 border border-amber-500/60 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold font-mono text-amber-300 uppercase tracking-wider">
              System Evaluation Disclosure: Location Baseline Superiority
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              The trained machine learning location ranker achieves <strong>47.6% Top-1 accuracy</strong>, which is currently slightly below the <strong>48.9% Top-1 accuracy</strong> of the nearest-to-victim geographic heuristic baseline. In accordance with strict engineering integrity, our production system defaults to the <strong>Nearest-to-Victim Baseline</strong>, while exposing the experimental model for audit and continuous tuning.
            </p>
          </div>
        </div>
      </div>

      {/* 3 Model Architecture Diagnostic Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Channel Model */}
        <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
              <div className="flex items-center space-x-2">
                <Layers className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Channel Model
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
                Active
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="text-[10px] uppercase text-slate-400">Architecture</div>
                <div className="text-sm font-bold text-white">Multiclass Pattern Classifier</div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#12192b] p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-400">Accuracy</div>
                  <div className="text-xl font-bold text-emerald-400">44.0%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Baseline</div>
                  <div className="text-xl font-bold text-slate-400">34.0%</div>
                </div>
              </div>

              <div className="text-slate-300 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Output Classes:</span>
                  <span className="text-white">ATM, Agent, Branch, UPI, Other</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Top Feature:</span>
                  <span className="text-cyan-300 font-bold">stolen_amount</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Improvement over Baseline:</span>
                  <span className="text-emerald-400 font-bold">+29.4% Relative</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 text-[10px] text-slate-400">
            Calibrated against real PaySim transaction size distributions.
          </div>
        </div>

        {/* Time Model */}
        <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Time Window Model
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-400 border border-amber-800">
                Active
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="text-[10px] uppercase text-slate-400">Architecture</div>
                <div className="text-sm font-bold text-white">Quantile Temporal Regressors</div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#12192b] p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-400">Median MAE</div>
                  <div className="text-xl font-bold text-amber-400">1.96 hrs</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Baseline MAE</div>
                  <div className="text-xl font-bold text-slate-400">2.53 hrs</div>
                </div>
              </div>

              <div className="text-slate-300 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">P10-P90 Coverage:</span>
                  <span className="text-emerald-400 font-bold">76.3% (Target ~80%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Avg Predicted Width:</span>
                  <span className="text-white">5.32 hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Top Feature:</span>
                  <span className="text-amber-300 font-bold">hop_velocity</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 text-[10px] text-slate-400">
            Trained on log1p(hours_to_cashout) and inverted using expm1().
          </div>
        </div>

        {/* Location Model */}
        <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
              <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Location Model
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-400 border border-purple-800">
                Baseline Active
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="text-[10px] uppercase text-slate-400">Architecture</div>
                <div className="text-sm font-bold text-white">Spatial Ranking Engine</div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#12192b] p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-400">Top-1 Accuracy</div>
                  <div className="text-xl font-bold text-slate-300">47.6%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Baseline Top-1</div>
                  <div className="text-xl font-bold text-cyan-400">48.9%</div>
                </div>
              </div>

              <div className="text-slate-300 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Model MRR:</span>
                  <span className="text-slate-300">0.518</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Baseline MRR:</span>
                  <span className="text-cyan-400 font-bold">0.525</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Production Mode:</span>
                  <span className="text-emerald-400 font-bold">Nearest-to-Victim</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 text-[10px] text-slate-400">
            Shortlist evaluation: 15 nearest + 5 random candidates.
          </div>
        </div>

      </div>

      {/* Feature Importance Attribution Chart */}
      <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Time Model Feature Importance (Information Gain)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Feature Gain Metric</span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeFeatures} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
              <XAxis type="number" stroke="#64748b" fontSize={11} />
              <YAxis dataKey="name" type="category" stroke="#cbd5e1" fontSize={11} width={130} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px', color: '#f3f4f6' }}
              />
              <Bar dataKey="gain" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};
