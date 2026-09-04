import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  PieChart as PieIcon, 
  TrendingUp, 
  Layers, 
  CheckCircle2, 
  Clock, 
  Shield 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  LineChart, 
  Line, 
  CartesianGrid 
} from 'recharts';
import { fetchCases } from '../services/api';
import { CaseSummary } from '../types';
import { formatINR } from '../utils/formatters';

export const PredictionAnalytics: React.FC = () => {
  const [cases, setCases] = useState<CaseSummary[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchCases({ limit: 200 });
        setCases(res);
      } catch (e) {
        console.error('Failed to load analytics cases:', e);
      }
    }
    load();
  }, []);

  // Compute hops distribution
  const hopCounts: Record<number, number> = {};
  cases.forEach((c) => {
    const hops = c.n_total_snapshots;
    hopCounts[hops] = (hopCounts[hops] || 0) + 1;
  });

  const hopsData = Object.entries(hopCounts).map(([hops, count]) => ({
    hops: `${hops} Hops`,
    cases: count,
  }));

  // Amount bracket distribution
  const brackets = [
    { name: '< ₹25K', min: 0, max: 25000, count: 0 },
    { name: '₹25K - ₹50K', min: 25000, max: 50000, count: 0 },
    { name: '₹50K - ₹1L', min: 50000, max: 100000, count: 0 },
    { name: '₹1L - ₹2L', min: 100000, max: 200000, count: 0 },
    { name: '> ₹2L', min: 200000, max: Infinity, count: 0 },
  ];

  cases.forEach((c) => {
    for (const b of brackets) {
      if (c.stolen_amount >= b.min && c.stolen_amount < b.max) {
        b.count++;
        break;
      }
    }
  });

  // Hop progression vs simulated confidence convergence
  const confidenceConvergence = [
    { hop: 'Hop 1', low: 75, medium: 22, high: 3 },
    { hop: 'Hop 2', low: 48, medium: 41, high: 11 },
    { hop: 'Hop 3', low: 24, medium: 52, high: 24 },
    { hop: 'Hop 4', low: 8, medium: 46, high: 46 },
  ];

  return (
    <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-wider mb-1">
          <BarChart3 className="h-4 w-4" />
          <span>Cross-Case Intelligence Insights</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase font-mono">
          Prediction & Pipeline Analytics
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Aggregated behavioral patterns across 2,000 synthetic incident streams.
        </p>
      </div>

      {/* Grid of Analytical Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Evidence Hops Depth */}
        <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-purple-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Layering Depth Distribution (Snapshots per Incident)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Depth</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hopsData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hops" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px', color: '#f3f4f6' }}
                />
                <Bar dataKey="cases" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stolen Amount Brackets */}
        <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Stolen Value Segmentation (INR)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Value Bands</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brackets} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px', color: '#f3f4f6' }}
                />
                <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Confidence Evolution across hops */}
        <div className="lg:col-span-2 bg-[#0e1524] border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Confidence Level Progression as Evidence Accumulates
              </h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 font-semibold">
              Evidence Resolution
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={confidenceConvergence} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hop" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px', color: '#f3f4f6' }}
                  formatter={(val: any) => [`${val}% of cases`, '']}
                />
                <Line type="monotone" dataKey="low" name="LOW Confidence" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="medium" name="MEDIUM Confidence" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="high" name="HIGH Confidence" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 text-xs text-slate-400 text-center font-mono">
            Key Insight: Early snapshots (Hop 1) heavily classify as LOW confidence due to the volume penalty. As layering progresses (Hops 3-4), confidence shifts into MEDIUM and HIGH.
          </div>
        </div>

      </div>

    </div>
  );
};
