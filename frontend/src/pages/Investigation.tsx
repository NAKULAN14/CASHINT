import React, { useState, useEffect, useCallback } from 'react';
import { 
  fetchCase, 
  fetchCaseSnapshots, 
  predictSnapshot 
} from '../services/api';
import { 
  CaseDetail, 
  Snapshot, 
  PredictionResult 
} from '../types';
import { InvestigationHeader } from '../components/InvestigationHeader';
import { InvestigationMap } from '../components/InvestigationMap';
import { ChannelPanel } from '../components/ChannelPanel';
import { TimeWindowPanel } from '../components/TimeWindowPanel';
import { ConfidencePanel } from '../components/ConfidencePanel';
import { ReplayControls } from '../components/ReplayControls';
import { MuleChain } from '../components/MuleChain';
import { SupportingSignals } from '../components/SupportingSignals';
import { CandidateAtmTable } from '../components/CandidateAtmTable';
import { Loader2, AlertCircle } from 'lucide-react';

interface InvestigationProps {
  caseId: string;
  onBackToCases?: () => void;
}

export const Investigation: React.FC<InvestigationProps> = ({ caseId, onBackToCases }) => {
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [locationMode, setLocationMode] = useState<'baseline' | 'model'>('baseline');
  
  const [loading, setLoading] = useState<boolean>(true);
  const [predicting, setPredicting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Cache predictions by `${snapshot_index}_${locationMode}`
  const [predictionCache, setPredictionCache] = useState<Record<string, PredictionResult>>({});

  // 1. Fetch case and snapshots on mount or caseId change
  useEffect(() => {
    let isMounted = true;
    async function loadCaseData() {
      setLoading(true);
      setError(null);
      try {
        const [caseRes, snapsRes] = await Promise.all([
          fetchCase(caseId),
          fetchCaseSnapshots(caseId),
        ]);
        if (isMounted) {
          setCaseDetail(caseRes);
          setSnapshots(snapsRes);
          setCurrentIndex(0);
          setPredictionCache({});
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load case data');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadCaseData();
    return () => {
      isMounted = false;
    };
  }, [caseId]);

  // 2. Predict for current snapshot whenever currentIndex or locationMode changes
  const runPrediction = useCallback(async () => {
    if (!snapshots || snapshots.length === 0) return;
    const currentSnap = snapshots[currentIndex];
    if (!currentSnap) return;

    const cacheKey = `${currentSnap.snapshot_index}_${locationMode}`;
    if (predictionCache[cacheKey]) {
      setPrediction(predictionCache[cacheKey]);
      return;
    }

    setPredicting(true);
    try {
      const predRes = await predictSnapshot(currentSnap, locationMode);
      setPrediction(predRes);
      setPredictionCache((prev) => ({ ...prev, [cacheKey]: predRes }));
    } catch (err: any) {
      console.error('Prediction failed:', err);
    } finally {
      setPredicting(false);
    }
  }, [snapshots, currentIndex, locationMode, predictionCache]);

  useEffect(() => {
    runPrediction();
  }, [currentIndex, locationMode, snapshots]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] text-slate-400 font-mono">
        <Loader2 className="h-8 w-8 text-cyan-400 animate-spin mb-3" />
        <span>Loading Case #{caseId}...</span>
      </div>
    );
  }

  if (error || !caseDetail || snapshots.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center font-mono">
        <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-6 text-rose-300">
          <AlertCircle className="h-8 w-8 text-rose-400 mx-auto mb-3" />
          <h3 className="text-base font-bold mb-1">Case Not Available</h3>
          <p className="text-xs text-rose-300/80 mb-4">{error || 'Case records could not be retrieved.'}</p>
          {onBackToCases && (
            <button
              onClick={onBackToCases}
              className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white hover:bg-slate-800 transition-colors"
            >
              Back to Investigation Cases
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentSnapshot = snapshots[currentIndex];

  return (
    <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Hero Header Assessment */}
      <InvestigationHeader
        caseDetail={caseDetail}
        prediction={prediction}
        currentStep={currentIndex}
        totalSteps={snapshots.length}
      />

      {/* Main Workspace (Left 55% Map | Right 45% Prediction Panels) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
        
        {/* Left 55% (~7 columns): Geospatial Tracking Map */}
        <div className="lg:col-span-7">
          <InvestigationMap
            caseDetail={caseDetail}
            snapshot={currentSnapshot}
            prediction={prediction}
            locationMode={locationMode}
            onLocationModeChange={setLocationMode}
          />
        </div>

        {/* Right 45% (~5 columns): 3 Prediction Intelligence Panels */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <ChannelPanel channelData={prediction?.channel || null} />
          <TimeWindowPanel
            timeWindow={prediction?.time_window || null}
            asOfTime={currentSnapshot.as_of_time}
          />
          <ConfidencePanel confidence={prediction?.confidence || null} />
        </div>

      </div>

      {/* Evidence Evolution Stepper & Replay Mode */}
      <ReplayControls
        snapshots={snapshots}
        currentIndex={currentIndex}
        onSelectSnapshot={setCurrentIndex}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
      />

      {/* Lower Analytical Grid: Mule Chain (4 cols), Supporting Signals (5 cols), Candidate ATMs (3 cols) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        
        {/* Mule Chain Flow */}
        <div className="md:col-span-4">
          <MuleChain snapshot={currentSnapshot} />
        </div>

        {/* Why this prediction? Supporting Signals */}
        <div className="md:col-span-5">
          <SupportingSignals signals={prediction?.supporting_signals} />
        </div>

        {/* Candidate ATM Table */}
        <div className="md:col-span-3">
          <CandidateAtmTable
            candidates={prediction?.location.top_locations || []}
            locationMode={locationMode}
          />
        </div>

      </div>

    </div>
  );
};
