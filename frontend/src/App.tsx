import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Overview } from './pages/Overview';
import { CaseList } from './pages/CaseList';
import { Investigation } from './pages/Investigation';
import { PredictionAnalytics } from './pages/PredictionAnalytics';
import { ATMIntelligence } from './pages/ATMIntelligence';
import { ModelStatus } from './pages/ModelStatus';
import { fetchHealth, fetchCases } from './services/api';
import { ShieldCheck, Terminal, Cpu } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('b59cf7be-ba3a-42df-9a03-0d448d4be42e');
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean>(true);

  // Check health and initialize default case ID
  useEffect(() => {
    async function init() {
      try {
        const health = await fetchHealth();
        setIsBackendHealthy(health.status === 'ok');

        const cases = await fetchCases({ limit: 1 });
        if (cases.length > 0) {
          setSelectedCaseId(cases[0].case_id);
        }
      } catch {
        setIsBackendHealthy(false);
      }
    }
    init();

    // Check health every 15 seconds
    const interval = setInterval(async () => {
      try {
        const health = await fetchHealth();
        setIsBackendHealthy(health.status === 'ok');
      } catch {
        setIsBackendHealthy(false);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setActiveTab('investigation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isBackendHealthy={isBackendHealthy}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'overview' && (
          <Overview onSelectCase={handleSelectCase} />
        )}

        {activeTab === 'cases' && (
          <CaseList onSelectCase={handleSelectCase} />
        )}

        {activeTab === 'investigation' && (
          <Investigation
            caseId={selectedCaseId}
            onBackToCases={() => setActiveTab('cases')}
          />
        )}

        {activeTab === 'analytics' && (
          <PredictionAnalytics />
        )}

        {activeTab === 'atms' && (
          <ATMIntelligence />
        )}

        {activeTab === 'models' && (
          <ModelStatus />
        )}
      </main>

      {/* Bottom Operational Footer */}
      <footer className="border-t border-slate-800/80 bg-[#070b12] py-4 text-xs font-mono text-slate-500">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span className="text-slate-300 font-bold">CASHINT</span>
            <span className="text-cyan-400 font-normal">(Case-Adaptive Predictive Cash-out Intelligence)</span>
          </div>

          <div className="flex items-center space-x-4 text-[11px]">
            <span className="flex items-center space-x-1 text-slate-400">
              <Terminal className="h-3 w-3 text-cyan-400" />
              <span>Enterprise Intelligence Engine</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-semibold">Deployable Production System</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default App;
