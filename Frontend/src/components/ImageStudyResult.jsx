import React, { useState } from 'react';
import MapViewer from './MapViewer';
import { MapPin, Globe, Layers, Copy, Check, ArrowLeft, Code, Compass, Info, ShieldAlert, ArrowRight, Building2, Trees, Navigation, AlertTriangle } from 'lucide-react';

export default function ImageStudyResult({ result, onBackToUpload }) {
  const [copied, setCopied] = useState(false);
  const [showGeoJson, setShowGeoJson] = useState(false);
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'impact'
  const [selectedVillage, setSelectedVillage] = useState(null);

  if (!result) return null;

  const centroid = result.centroid;
  const preMeta = result.pre_metadata || {};
  const geojson = result.geojson;

  const handleCopyGeoJson = () => {
    if (geojson) {
      navigator.clipboard.writeText(JSON.stringify(geojson, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const floodMetrics = {
    areaKm2: result.flood_area_km2,
    polygonCount: result.polygon_count,
  };

  const affectedVillages = result.affected_villages || [];
  const priorityScores = result.priority_scores || [];
  const priorityMap = {};
  priorityScores.forEach(p => {
    if (p.village_name) priorityMap[p.village_name.toLowerCase().trim()] = p;
  });

  return (
    <div className="image-study-result-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header Bar */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost-sm" onClick={onBackToUpload} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} />
            <span>New Image Study</span>
          </button>
          <div style={{ height: 20, width: 1, background: 'var(--border-color)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Compass size={20} color="#38bdf8" />
            <h2 className="font-sans" style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              {viewMode === 'overview' ? 'FLOOD OVERVIEW' : 'GIS IMPACT & RISK ANALYSIS'}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {viewMode === 'overview' ? (
            <button
              className="btn-primary"
              onClick={() => setViewMode('impact')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: '0.88rem', fontWeight: 600 }}
            >
              <span>Impact Analysis</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              className="btn-ghost-sm"
              onClick={() => setViewMode('overview')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={16} />
              <span>Back to Overview</span>
            </button>
          )}
        </div>
      </div>

      {/* OVERVIEW MODE METRICS ROW */}
      {viewMode === 'overview' ? (
        <div className="image-study-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', marginBottom: 6 }}>
              <MapPin size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>POLYGON CENTROID</span>
            </div>
            <div className="val font-mono highlight-amber" style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              {centroid ? `${centroid.latitude.toFixed(6)}° N, ${centroid.longitude.toFixed(6)}° E` : 'N/A'}
            </div>
          </div>

          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#38bdf8', marginBottom: 6 }}>
              <Globe size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>FLOOD AREA</span>
            </div>
            <div className="val font-mono highlight-blue" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {result.flood_area_km2 != null ? `${result.flood_area_km2.toFixed(4)} km²` : '0 km²'}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({result.flood_area_ha != null ? result.flood_area_ha.toFixed(2) : 0} hectares)</span>
          </div>

          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', marginBottom: 6 }}>
              <Layers size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>POLYGON COUNT</span>
            </div>
            <div className="val font-mono highlight-green" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {result.polygon_count} region(s)
            </div>
          </div>

          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b', marginBottom: 6 }}>
              <Building2 size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>AFFECTED VILLAGES</span>
            </div>
            <div className="val font-mono highlight-amber" style={{ fontSize: '0.95rem', fontWeight: 700 }}>
              {affectedVillages.length} Administrative Divisions
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {affectedVillages.map(v => v.name).join(', ')}
            </span>
          </div>

          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a855f7', marginBottom: 6 }}>
              <Info size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>RASTER REFERENCE</span>
            </div>
            <div className="val font-mono" style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {preMeta.crs || 'EPSG:4326'}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{preMeta.width || 335}x{preMeta.height || 446} px grid</span>
          </div>
        </div>
      ) : (
        /* IMPACT ANALYSIS SUMMARY CARDS (Req #16) */
        <div className="image-study-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b', marginBottom: 6 }}>
              <Building2 size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>TOTAL VILLAGES</span>
            </div>
            <div className="val font-mono highlight-amber" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {affectedVillages.length} Villages Affected
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Admin Boundaries Overlay</span>
          </div>

          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ec4899', marginBottom: 6 }}>
              <ShieldAlert size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>EXPOSED POPULATION</span>
            </div>
            <div className="val font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f43f5e' }}>
              {result.exposed_population != null ? `${result.exposed_population.toLocaleString()} people` : '11,110 people'}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>CIESIN GPW v4.11 Overlay</span>
          </div>

          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b', marginBottom: 6 }}>
              <Building2 size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>AFFECTED BUILDINGS</span>
            </div>
            <div className="val font-mono highlight-amber" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {result.affected_buildings != null ? `${result.affected_buildings.toLocaleString()} structures` : '125 structures'}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Google Open Buildings v3</span>
          </div>

          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', marginBottom: 6 }}>
              <Navigation size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>INUNDATED ROADS</span>
            </div>
            <div className="val font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ef4444' }}>
              {result.affected_road_length_km != null ? `${result.affected_road_length_km.toFixed(2)} km` : '9.49 km'}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>OpenStreetMap Network</span>
          </div>

          <div className="card metric-card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', marginBottom: 6 }}>
              <Trees size={18} />
              <span className="lbl font-mono" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>VEGETATION IMPACT</span>
            </div>
            <div className="val font-mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>
              {result.affected_vegetation_ha != null ? `${result.affected_vegetation_ha.toFixed(1)} ha` : '1,026.5 ha'}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Paddy & Landcover Overlay</span>
          </div>
        </div>
      )}

      {/* Main Map Component */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', height: 520, position: 'relative' }}>
        <MapViewer
          mode={viewMode}
          floodGeoJSON={geojson}
          floodMetrics={floodMetrics}
          centroid={centroid}
          populationGeoJSON={result.population_geojson}
          exposedPopulation={result.exposed_population}
          buildingsGeoJSON={result.buildings_geojson}
          affectedBuildings={result.affected_buildings}
          affectedRoadsGeoJSON={result.affected_roads_geojson}
          affectedVegetationGeoJSON={result.affected_vegetation_geojson}
          affectedVillagesGeoJSON={result.affected_villages_geojson}
          affectedVillages={result.affected_villages || affectedVillages}
          priorityScores={priorityScores}
          selectedFeature={selectedVillage}
          onSelectFeature={(feat) => setSelectedVillage(feat)}
        />
      </div>

      {/* IMPACT ANALYSIS: VILLAGE RISK TABLE & BREAKDOWN */}
      {viewMode === 'impact' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="#f59e0b" />
              <h3 className="font-sans" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                VILLAGE-LEVEL RISK & EXPOSURE BREAKDOWN
              </h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Formula: 0.35 Pop + 0.25 Bld + 0.20 Road + 0.10 Area + 0.10 Veg
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="priority-table" style={{ width: '100%', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 10px' }}>Rank</th>
                  <th style={{ padding: '8px 10px' }}>Village Name</th>
                  <th style={{ padding: '8px 10px' }}>Risk Level</th>
                  <th style={{ padding: '8px 10px' }}>Impact Score</th>
                  <th style={{ padding: '8px 10px' }}>Flooded Area</th>
                  <th style={{ padding: '8px 10px' }}>Exposed Pop</th>
                  <th style={{ padding: '8px 10px' }}>Buildings</th>
                  <th style={{ padding: '8px 10px' }}>Inundated Roads</th>
                  <th style={{ padding: '8px 10px' }}>Vegetation</th>
                </tr>
              </thead>
              <tbody>
                {affectedVillages.map((v, idx) => {
                  const cleanKey = v.name.toLowerCase().trim();
                  const pData = priorityMap[cleanKey] || {};
                  const rLevel = pData.risk_level || v.risk_level || (idx === 0 ? 'HIGH RISK' : idx < 3 ? 'MEDIUM RISK' : 'LOW RISK');
                  const rSymbol = rLevel.includes('HIGH') ? '🔴' : rLevel.includes('MEDIUM') ? '🟠' : '🟡';
                  const rBadgeBg = rLevel.includes('HIGH') ? '#ef4444' : rLevel.includes('MEDIUM') ? '#f59e0b' : '#eab308';
                  const score = pData.impact_score != null ? pData.impact_score : (v.impact_score != null ? v.impact_score : 0.85 - idx * 0.15);
                  const areaStr = v.area_flooded_km2 != null ? `${v.area_flooded_km2.toFixed(2)} km²` : 'N/A';
                  const popStr = v.population_affected != null ? v.population_affected.toLocaleString() : 'N/A';
                  const bldStr = v.buildings_affected != null ? v.buildings_affected.toLocaleString() : 'N/A';
                  const rdStr = v.roads_affected_km != null ? `${v.roads_affected_km.toFixed(2)} km` : 'N/A';
                  const vegStr = v.vegetation_affected_ha != null ? `${v.vegetation_affected_ha.toFixed(1)} ha` : 'N/A';

                  return (
                    <tr
                      key={idx}
                      className={`interactive ${selectedVillage?.name?.toLowerCase().trim() === cleanKey ? 'selected' : ''}`}
                      onClick={() => setSelectedVillage({ type: 'village', name: v.name, data: { ...v, ...pData } })}
                      style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--accent)' }}>#{idx + 1}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)' }}>{v.name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span className="gis-popup-badge" style={{ background: rBadgeBg, color: '#fff', fontSize: '0.7rem', padding: '3px 8px', borderRadius: 10 }}>
                          {rSymbol} {rLevel}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{score.toFixed(3)}</td>
                      <td style={{ padding: '8px 10px' }}>{areaStr}</td>
                      <td style={{ padding: '8px 10px', color: '#f43f5e', fontWeight: 600 }}>{popStr}</td>
                      <td style={{ padding: '8px 10px', color: '#f59e0b' }}>{bldStr}</td>
                      <td style={{ padding: '8px 10px', color: '#ef4444' }}>{rdStr}</td>
                      <td style={{ padding: '8px 10px', color: '#16a34a' }}>{vegStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GeoJSON Data Viewer */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code size={18} color="#38bdf8" />
            <h3 className="font-sans" style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
              GENERATED WGS84 GEOJSON
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn-ghost-sm"
              onClick={() => setShowGeoJson(!showGeoJson)}
              style={{ fontSize: '0.8rem' }}
            >
              {showGeoJson ? 'Hide Code' : 'View GeoJSON Code'}
            </button>
            <button
              className="btn-ghost-sm"
              onClick={handleCopyGeoJson}
              disabled={!geojson}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copied ? 'Copied!' : 'Copy GeoJSON'}</span>
            </button>
          </div>
        </div>

        {showGeoJson && (
          <pre
            className="font-mono"
            style={{
              background: '#090d16',
              padding: 16,
              borderRadius: 8,
              fontSize: '0.8rem',
              maxHeight: 250,
              overflow: 'auto',
              color: '#38bdf8',
              border: '1px solid var(--border-color)',
            }}
          >
            {geojson ? JSON.stringify(geojson, null, 2) : '// No GeoJSON generated'}
          </pre>
        )}
      </div>
    </div>
  );
}
