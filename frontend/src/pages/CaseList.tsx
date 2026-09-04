import React, { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  Search, 
  Filter, 
  ArrowUpDown, 
  ArrowRight, 
  Loader2, 
  Shield 
} from 'lucide-react';
import { fetchCases } from '../services/api';
import { CaseSummary } from '../types';
import { formatINR, formatDateTime, shortId } from '../utils/formatters';

interface CaseListProps {
  onSelectCase: (caseId: string) => void;
}

export const CaseList: React.FC<CaseListProps> = ({ onSelectCase }) => {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [urbanFilter, setUrbanFilter] = useState<'all' | 'urban' | 'rural'>('all');
  const [sortField, setSortField] = useState<'amount' | 'snapshots' | 'time'>('amount');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  useEffect(() => {
    async function loadCases() {
      setLoading(true);
      try {
        const res = await fetchCases({ limit: 500 });
        setCases(res);
      } catch (e) {
        console.error('Failed to load cases:', e);
      } finally {
        setLoading(false);
      }
    }
    loadCases();
  }, []);

  // Filter cases
  const filtered = cases.filter((c) => {
    if (search && !c.case_id.toLowerCase().includes(search.toLowerCase())) return false;
    if (urbanFilter === 'urban' && !c.urban) return false;
    if (urbanFilter === 'rural' && c.urban) return false;
    return true;
  });

  // Sort cases
  const sorted = [...filtered].sort((a, b) => {
    let diff = 0;
    if (sortField === 'amount') diff = a.stolen_amount - b.stolen_amount;
    else if (sortField === 'snapshots') diff = a.n_total_snapshots - b.n_total_snapshots;
    else if (sortField === 'time') diff = new Date(a.complaint_timestamp).getTime() - new Date(b.complaint_timestamp).getTime();
    return sortAsc ? diff : -diff;
  });

  // Pagination
  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (field: 'amount' | 'snapshots' | 'time') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs uppercase tracking-wider mb-1">
            <FolderKanban className="h-4 w-4" />
            <span>Cyber Incident Repositories</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase font-mono">
            Investigation Cases ({cases.length} Loaded)
          </h2>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Search */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Case ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-3 py-1.5 rounded-lg bg-[#0e1524] border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48 sm:w-60 font-mono"
            />
          </div>

          {/* Urban / Rural Filter */}
          <div className="flex items-center bg-[#0e1524] border border-slate-800 rounded-lg p-1 text-xs font-mono">
            <button
              onClick={() => { setUrbanFilter('all'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded transition-all ${
                urbanFilter === 'all' ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => { setUrbanFilter('urban'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded transition-all ${
                urbanFilter === 'urban' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Urban
            </button>
            <button
              onClick={() => { setUrbanFilter('rural'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded transition-all ${
                urbanFilter === 'rural' ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Rural
            </button>
          </div>

        </div>
      </div>

      {/* Cases Table */}
      <div className="bg-[#0e1524] border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400 font-mono text-xs">
            <Loader2 className="h-5 w-5 text-cyan-400 animate-spin mr-2" />
            <span>Loading cases repository...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[#12192b] border-b border-slate-800 text-[10px] uppercase text-slate-400 tracking-wider">
                  <th className="py-3 px-4 font-semibold">Case ID</th>
                  <th 
                    onClick={() => toggleSort('amount')}
                    className="py-3 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Stolen Value (INR)</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 font-semibold">Victim Setting</th>
                  <th 
                    onClick={() => toggleSort('snapshots')}
                    className="py-3 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Evidence Steps</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th 
                    onClick={() => toggleSort('time')}
                    className="py-3 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Complaint Time</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginated.map((c) => (
                  <tr
                    key={c.case_id}
                    onClick={() => onSelectCase(c.case_id)}
                    className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-bold text-white group-hover:text-cyan-400 transition-colors">
                      <div className="flex items-center space-x-2">
                        <Shield className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-400" />
                        <span>#{shortId(c.case_id)}</span>
                        <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">
                          ({c.case_id.substring(0, 14)}...)
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-bold text-slate-100 text-sm">
                      {formatINR(c.stolen_amount)}
                    </td>

                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                        c.urban
                          ? 'bg-blue-950 text-blue-400 border border-blue-800/50'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                      }`}>
                        {c.urban ? 'Urban' : 'Rural'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-300">
                      <span className="font-bold text-cyan-300">{c.n_total_snapshots}</span> snapshots
                    </td>

                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {formatDateTime(c.complaint_timestamp)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCase(c.case_id);
                        }}
                        className="px-3 py-1 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 hover:bg-cyan-900/60 transition-colors inline-flex items-center space-x-1 text-xs font-bold"
                      >
                        <span>Investigate</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="px-4 py-3 bg-[#12192b] border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length} cases
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 hover:text-white"
            >
              Previous
            </button>
            <span className="text-white font-bold">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 hover:text-white"
            >
              Next
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
