import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Search, Filter, Building2, Loader2, Navigation } from 'lucide-react';
import { fetchAtms, fetchCases, fetchCaseSnapshots, predictSnapshot } from '../services/api';
import { ATM, CaseSummary, LocationCandidate } from '../types';
import { formatINR, shortId } from '../utils/formatters';

const createAtmClusterIcon = (isHighlight: boolean, rank?: number) =>
  L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div class="flex items-center justify-center">
        <div class="h-6 w-6 rounded-full ${
          isHighlight
            ? 'bg-amber-500 border-2 border-white ring-4 ring-amber-500/40 text-black font-black'
            : 'bg-indigo-600/80 border border-indigo-400 text-white font-bold'
        } shadow-lg flex items-center justify-center text-[10px] font-mono">
          ${rank ? `#${rank}` : 'ATM'}
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

export const ATMIntelligence: React.FC = () => {
  const [atms, setAtms] = useState<ATM[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [predictedAtms, setPredictedAtms] = useState<LocationCandidate[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  // Load sample of ATMs and cases on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [atmsRes, casesRes] = await Promise.all([
          fetchAtms(300), // Load 300 for snappy smooth map rendering
          fetchCases({ limit: 50 }),
        ]);
        setAtms(atmsRes);
        setCases(casesRes);
        if (casesRes.length > 0) {
          setSelectedCaseId(casesRes[0].case_id);
        }
      } catch (e) {
        console.error('Failed to load ATM intelligence data:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // When a case is selected, predict its top candidate ATMs
  useEffect(() => {
    async function predictCaseAtms() {
      if (!selectedCaseId) return;
      try {
        const snaps = await fetchCaseSnapshots(selectedCaseId);
        if (snaps.length > 0) {
          const res = await predictSnapshot(snaps[0], 'baseline');
          setPredictedAtms(res.location.top_locations);
        }
      } catch (e) {
        console.error('Failed to predict ATMs for case:', e);
      }
    }
    predictCaseAtms();
  }, [selectedCaseId]);

  // Unique banks list
  const banks = useMemo(() => {
    const set = new Set<string>();
    atms.forEach((a) => {
      if (a.bank) set.add(a.bank);
    });
    return Array.from(set);
  }, [atms]);

  const filteredAtms = useMemo(() => {
    if (selectedBank === 'all') return atms;
    return atms.filter((a) => a.bank === selectedBank);
  }, [atms, selectedBank]);

  return (
    <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-indigo-400 font-mono text-xs uppercase tracking-wider mb-1">
            <MapPin className="h-4 w-4" />
            <span>National Infrastructure Explorer</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase font-mono">
            ATM Geospatial Intelligence
          </h2>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Case Selector */}
          <div className="flex items-center space-x-2 bg-[#0e1524] border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Highlight Case:</span>
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="bg-transparent text-cyan-400 font-bold focus:outline-none cursor-pointer"
            >
              {cases.map((c) => (
                <option key={c.case_id} value={c.case_id} className="bg-slate-900 text-slate-200">
                  #{shortId(c.case_id)} ({formatINR(c.stolen_amount)})
                </option>
              ))}
            </select>
          </div>

          {/* Bank Filter */}
          <div className="flex items-center space-x-2 bg-[#0e1524] border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Bank Rail:</span>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-slate-200">All Banks</option>
              {banks.map((b) => (
                <option key={b} value={b} className="bg-slate-900 text-slate-200">
                  {b}
                </option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* Map + Selected Case Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Map View */}
        <div className="lg:col-span-8 bg-[#0e1524] border border-slate-800 rounded-xl overflow-hidden shadow-lg h-[600px] relative">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400 font-mono text-xs">
              <Loader2 className="h-5 w-5 text-indigo-400 animate-spin mr-2" />
              <span>Rendering terminal network...</span>
            </div>
          ) : (
            <MapContainer
              center={[19.0760, 72.8777]}
              zoom={6}
              scrollWheelZoom={true}
              className="w-full h-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />

              {/* Sample ATM Markers */}
              {filteredAtms.map((atm) => (
                <Marker
                  key={atm.id}
                  position={[atm.lat, atm.lon]}
                  icon={createAtmClusterIcon(false)}
                >
                  <Popup>
                    <div className="font-mono text-xs">
                      <div className="font-bold text-white mb-0.5">{atm.id}</div>
                      <div className="text-slate-400">Bank: {atm.bank || 'Banking Terminal'}</div>
                      <div className="text-slate-500 mt-1">{atm.lat.toFixed(4)}, {atm.lon.toFixed(4)}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Predicted Target ATM Markers */}
              {predictedAtms.map((atm, idx) => (
                <Marker
                  key={`pred-${atm.id}`}
                  position={[atm.lat, atm.lon]}
                  icon={createAtmClusterIcon(true, idx + 1)}
                >
                  <Popup>
                    <div className="font-mono text-xs">
                      <div className="font-bold text-amber-400 uppercase">Target Candidate #{idx + 1}</div>
                      <div className="font-bold text-white text-sm my-0.5">{atm.id}</div>
                      <div className="text-slate-300">Bank: {atm.bank || 'Bank'}</div>
                      <div className="text-cyan-400 font-semibold mt-1">
                        Distance to Victim: {atm.dist_victim_km.toFixed(1)} km
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        {/* Right Info Column: Top Predicted Candidate for Active Case */}
        <div className="lg:col-span-4 space-y-4">
          
          <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-5 shadow-lg">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400 mb-2">
              Case #{shortId(selectedCaseId)} Target Assessment
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Nearest-to-victim candidates predicted for rapid field cordoning and surveillance alert.
            </p>

            <div className="space-y-3">
              {predictedAtms.map((atm, idx) => (
                <div
                  key={atm.id}
                  className="bg-[#12192b] border border-slate-800 rounded-lg p-3.5 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-white flex items-center space-x-1.5">
                      <span className="h-5 w-5 rounded bg-amber-500 text-black font-black text-center text-xs flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <span>{atm.id}</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {atm.bank}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-slate-400 flex items-center justify-between pt-1">
                    <span className="text-slate-400">Victim Distance:</span>
                    <span className="text-cyan-300 font-bold">{atm.dist_victim_km.toFixed(1)} km</span>
                  </div>
                  {atm.dist_terminal_km !== undefined && atm.dist_terminal_km !== null && (
                    <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
                      <span className="text-slate-400">Terminal Distance:</span>
                      <span className="text-purple-300 font-bold">{atm.dist_terminal_km.toFixed(1)} km</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0e1524] border border-slate-800 rounded-xl p-4 shadow-lg text-xs font-mono text-slate-400 space-y-2">
            <div className="font-bold text-slate-200 uppercase tracking-wider">
              Terminal Registry Specs
            </div>
            <div className="flex justify-between">
              <span>Total National Terminals:</span>
              <span className="text-white font-bold">54,914</span>
            </div>
            <div className="flex justify-between">
              <span>Geocoding Integrity:</span>
              <span className="text-emerald-400 font-bold">100% WGS84 Resolved</span>
            </div>
            <div className="flex justify-between">
              <span>Banking Networks:</span>
              <span className="text-slate-300 font-bold">{banks.length || 2} Major Networks</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
