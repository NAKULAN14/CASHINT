import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Snapshot, PredictionResult, CaseDetail, LocationCandidate } from '../types';
import { formatINR, shortId } from '../utils/formatters';

interface InvestigationMapProps {
  caseDetail: CaseDetail;
  snapshot: Snapshot;
  prediction: PredictionResult | null;
  locationMode: 'baseline' | 'model';
  onLocationModeChange?: (mode: 'baseline' | 'model') => void;
}

// Custom DivIcons for dark tactical look
const createVictimIcon = () =>
  L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div class="relative flex items-center justify-center">
        <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-rose-500 opacity-40"></span>
        <div class="h-8 w-8 rounded-full bg-rose-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-[11px] font-bold">
          VIC
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

const createAtmIcon = (rank: number) => {
  const colors = [
    { bg: 'bg-amber-500', border: 'border-white', text: 'text-black', shadow: 'shadow-amber-500/50' },
    { bg: 'bg-cyan-500', border: 'border-white', text: 'text-black', shadow: 'shadow-cyan-500/50' },
    { bg: 'bg-blue-600', border: 'border-white', text: 'text-white', shadow: 'shadow-blue-500/50' },
  ];
  const c = colors[rank - 1] || colors[2];

  return L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div class="flex flex-col items-center">
        <div class="h-7 w-7 rounded-md ${c.bg} ${c.border} border-2 shadow-lg flex items-center justify-center ${c.text} text-xs font-black">
          #${rank}
        </div>
        <div class="w-1.5 h-1.5 ${c.bg} rotate-45 -mt-0.5"></div>
      </div>
    `,
    iconSize: [28, 34],
    iconAnchor: [14, 34],
  });
};

const createMuleIcon = (isTerminal: boolean, index: number) =>
  L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div class="flex flex-col items-center">
        <div class="h-6 w-6 rounded-full ${
          isTerminal ? 'bg-purple-500 border-2 border-amber-400 ring-2 ring-purple-500/40' : 'bg-slate-700 border-2 border-purple-400'
        } shadow-md flex items-center justify-center text-white text-[10px] font-mono font-bold">
          M${index + 1}
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

// Component to smoothly pan and fit map view to active case coordinates
const MapBoundsUpdater: React.FC<{ coords: [number, number][] }> = ({ coords }) => {
  const map = useMap();

  useEffect(() => {
    if (!coords || coords.length === 0) return;
    try {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13, animate: true, duration: 0.8 });
    } catch {
      // Ignore transient bounds calculation errors
    }
  }, [coords, map]);

  return null;
};

export const InvestigationMap: React.FC<InvestigationMapProps> = ({
  caseDetail,
  snapshot,
  prediction,
  locationMode,
  onLocationModeChange,
}) => {
  const victimPos: [number, number] = [caseDetail.victim_lat, caseDetail.victim_lon];

  // Mule chain accounts from visible accounts
  const visibleAccounts = snapshot.visible_accounts || [];

  // Locations to draw line: Victim -> Mule 1 -> Mule 2 -> ...
  const chainCoords: [number, number][] = useMemo(() => {
    const pts: [number, number][] = [victimPos];
    visibleAccounts.forEach((acc) => {
      if (acc.branch_lat && acc.branch_lon) {
        pts.push([acc.branch_lat, acc.branch_lon]);
      }
    });
    return pts;
  }, [victimPos, visibleAccounts]);

  // Top candidate ATMs
  const topAtms: LocationCandidate[] = prediction?.location.top_locations || [];

  // All coordinates for fitting bounds
  const allCoords = useMemo(() => {
    const pts: [number, number][] = [...chainCoords];
    topAtms.forEach((atm) => pts.push([atm.lat, atm.lon]));
    return pts;
  }, [chainCoords, topAtms]);

  return (
    <div className="bg-[#0e1524] border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-[560px] relative">
      
      {/* Map Control Overlay Header */}
      <div className="px-4 py-2.5 bg-[#121929]/90 border-b border-slate-800/80 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
          <span className="text-xs font-bold tracking-wider text-slate-200 uppercase">
            Investigation Geospatial Tracking
          </span>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            ({chainCoords.length - 1} mule hops mapped)
          </span>
        </div>

        {/* Location Mode Selector */}
        {onLocationModeChange && (
          <div className="flex items-center space-x-1.5 bg-slate-900/90 px-2 py-1 rounded-md border border-slate-800 text-[11px] font-mono">
            <span className="text-slate-400 hidden sm:inline">Mode:</span>
            <button
              onClick={() => onLocationModeChange('baseline')}
              className={`px-2 py-0.5 rounded transition-all ${
                locationMode === 'baseline'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Baseline (Production)
            </button>
            <button
              onClick={() => onLocationModeChange('model')}
              className={`px-2 py-0.5 rounded transition-all ${
                locationMode === 'model'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Experimental Model
            </button>
          </div>
        )}
      </div>

      {/* Interactive Map */}
      <div className="flex-1 w-full h-full relative">
        <MapContainer
          center={victimPos}
          zoom={11}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          {/* CartoDB Dark Matter tiles */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          <MapBoundsUpdater coords={allCoords} />

          {/* Mule Chain Flow Line */}
          {chainCoords.length > 1 && (
            <Polyline
              positions={chainCoords}
              pathOptions={{
                color: '#a855f7',
                weight: 3,
                opacity: 0.8,
                dashArray: '8, 8',
              }}
            />
          )}

          {/* Victim Marker */}
          <Marker position={victimPos} icon={createVictimIcon()}>
            <Popup>
              <div className="text-slate-100">
                <div className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-1">
                  Victim Origin
                </div>
                <div className="font-mono text-sm font-semibold">{shortId(caseDetail.case_id)}</div>
                <div className="text-xs text-slate-300 mt-1">
                  Stolen Amount: <span className="text-emerald-400 font-mono font-bold">{formatINR(caseDetail.stolen_amount)}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Coordinates: {caseDetail.victim_lat.toFixed(4)}, {caseDetail.victim_lon.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>

          {/* Mule Account Branch Markers */}
          {visibleAccounts.map((acc, idx) => {
            if (!acc.branch_lat || !acc.branch_lon) return null;
            const isTerminal = acc.account_id === snapshot.terminal_account_id;
            return (
              <Marker
                key={acc.account_id}
                position={[acc.branch_lat, acc.branch_lon]}
                icon={createMuleIcon(isTerminal, idx)}
              >
                <Popup>
                  <div className="text-slate-100 min-w-[200px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-mono font-bold text-purple-400 uppercase">
                        Mule Hop #{idx + 1}
                      </span>
                      {isTerminal && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Money Location
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-sm font-bold text-slate-100">{acc.account_id}</div>
                    <div className="text-xs text-slate-300 mt-1">
                      Bank: <span className="font-medium text-white">{acc.bank}</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Account Age: <span className="font-mono">{acc.age_days} days</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Dormant Before Case: <span className="font-mono">{acc.dormant_before_case ? 'Yes (Sleeper)' : 'No'}</span>
                    </div>
                    {acc.cashout_readiness !== undefined && acc.cashout_readiness !== null && (
                      <div className="text-xs text-slate-300 mt-1">
                        Readiness: <span className="font-mono text-cyan-400 font-semibold">{Math.round(acc.cashout_readiness * 100)}%</span>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Top 3 Predicted ATM Candidate Markers */}
          {topAtms.map((atm, idx) => (
            <Marker
              key={atm.id}
              position={[atm.lat, atm.lon]}
              icon={createAtmIcon(idx + 1)}
            >
              <Popup>
                <div className="text-slate-100 min-w-[210px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                      Candidate ATM #{idx + 1}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {locationMode === 'baseline' ? 'Nearest Baseline' : 'Score Rank'}
                    </span>
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-100">{atm.id}</div>
                  <div className="text-xs text-slate-300 mt-1">
                    Bank: <span className="font-medium text-white">{atm.bank || 'Unknown Bank'}</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    Distance to Victim: <span className="font-mono text-cyan-400 font-bold">{atm.dist_victim_km.toFixed(1)} km</span>
                  </div>
                  {atm.dist_terminal_km !== undefined && atm.dist_terminal_km !== null && (
                    <div className="text-xs text-slate-300 mt-0.5">
                      Distance to Terminal: <span className="font-mono text-purple-400 font-bold">{atm.dist_terminal_km.toFixed(1)} km</span>
                    </div>
                  )}
                  {atm.score !== undefined && atm.score !== null && (
                    <div className="text-xs text-slate-300 mt-0.5">
                      Ranker Score: <span className="font-mono text-amber-400">{atm.score.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Map Legend Overlay */}
        <div className="absolute bottom-3 left-3 z-[400] bg-[#0c121e]/90 backdrop-blur border border-slate-800/90 rounded-lg p-2.5 text-[11px] font-mono space-y-1.5 shadow-md">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
            Map Legend
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 rounded-full bg-rose-600 border border-white" />
            <span className="text-slate-300">Victim Origin</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 rounded-full bg-purple-600 border border-purple-300" />
            <span className="text-slate-300">Mule Branch Hop</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 rounded bg-amber-500 border border-white" />
            <span className="text-slate-300">Candidate ATM (#1, #2, #3)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-4 h-0.5 border-t border-dashed border-purple-400" />
            <span className="text-slate-300">Mule Fund Route</span>
          </div>
        </div>

      </div>
    </div>
  );
};
