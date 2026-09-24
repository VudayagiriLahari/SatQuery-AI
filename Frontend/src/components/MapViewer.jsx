import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function MapViewer({
  mode = 'overview', // 'overview' | 'impact'
  floodGeoJSON,
  floodMetrics,
  centroid,
  populationGeoJSON,
  exposedPopulation,
  buildingsGeoJSON,
  affectedBuildings,
  evacuationCandidates,
  affectedVillages,
  affectedVillagesGeoJSON,
  affectedRoadsGeoJSON,
  affectedVegetationGeoJSON,
  priorityScores,
  selectedFeature,
  onSelectFeature,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const floodLayerRef = useRef(null);
  const popLayerRef = useRef(null);
  const bldLayerRef = useRef(null);
  const villagesLayerRef = useRef(null);
  const roadsLayerRef = useRef(null);
  const vegLayerRef = useRef(null);
  const riskLayerRef = useRef(null);
  const centMarkerRef = useRef(null);
  const layerControlRef = useRef(null);
  const baseLayersRef = useRef({});
  const overlayLayersRef = useRef({});
  const lastAnalysisBoundsRef = useRef(null);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 5,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

    const osm = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxZoom: 19,
      }
    );

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '© <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri Satellite</a>',
        maxZoom: 18,
      }
    );

    satellite.addTo(map);

    const baseMaps = {
      'Satellite': satellite,
      'Street Map': osm,
    };
    baseLayersRef.current = baseMaps;

    const overlayMaps = {};
    overlayLayersRef.current = overlayMaps;

    const layerControl = L.control.layers(baseMaps, overlayMaps, {
      position: 'topright',
      collapsed: false,
    });
    layerControl.addTo(map);
    layerControlRef.current = layerControl;

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Reset / Fit to Analysis Extent handler
  const handleResetBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map && lastAnalysisBoundsRef.current && lastAnalysisBoundsRef.current.isValid()) {
      map.fitBounds(lastAnalysisBoundsRef.current, { padding: [35, 35], maxZoom: 15, animate: true });
    }
  }, []);

  // Toggle Fullscreen safely
  const handleToggleFullscreen = useCallback(() => {
    const el = mapContainerRef.current?.parentElement;
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => {
        setIsFullscreen(true);
        setTimeout(() => mapInstanceRef.current?.invalidateSize(), 200);
      }).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => {
        setIsFullscreen(false);
        setTimeout(() => mapInstanceRef.current?.invalidateSize(), 200);
      }).catch(() => {});
    }
  }, []);

  const villageLookup = useRef({});
  useEffect(() => {
    const lookup = {};
    if (affectedVillages && Array.isArray(affectedVillages)) {
      affectedVillages.forEach((v) => {
        if (v.name) {
          lookup[v.name.toLowerCase().trim()] = v;
        }
      });
    }
    villageLookup.current = lookup;
  }, [affectedVillages]);

  const priorityLookup = useRef({});
  useEffect(() => {
    const lookup = {};
    if (priorityScores && Array.isArray(priorityScores)) {
      priorityScores.forEach((p) => {
        if (p.village_name) {
          lookup[p.village_name.toLowerCase().trim()] = p;
        }
      });
    }
    priorityLookup.current = lookup;
  }, [priorityScores]);

  // Update GIS Layers whenever props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    let floodBounds = null;
    let fallbackBounds = null;

    // -------------------------------------------------------------------------
    // 1. FLOOD EXTENT LAYER (MAIN OVERLAY FOCUS)
    // -------------------------------------------------------------------------
    if (floodLayerRef.current) {
      try {
        layerControlRef.current?.removeLayer(floodLayerRef.current);
        map.removeLayer(floodLayerRef.current);
      } catch (_) {}
      floodLayerRef.current = null;
    }

    if (floodGeoJSON && floodGeoJSON.features && floodGeoJSON.features.length > 0) {
      const areaVal = floodMetrics?.areaKm2 != null ? Number(floodMetrics.areaKm2).toFixed(2) : null;
      const areaStr = areaVal ? `${areaVal} km²` : 'Calculated Extent';
      const countStr = floodMetrics?.polygonCount != null ? floodMetrics.polygonCount : floodGeoJSON.features.length;

      const floodLayer = L.geoJSON(floodGeoJSON, {
        style: {
          color: '#00e5ff',
          weight: 2.5,
          opacity: 0.95,
          fillColor: '#0284c7',
          fillOpacity: 0.55,
        },
        onEachFeature: (feature, lyr) => {
          lyr.on({
            mouseover: (e) => {
              e.target.setStyle({
                fillColor: '#38bdf8',
                fillOpacity: 0.75,
                weight: 3.5,
                color: '#00ffff',
              });
            },
            mouseout: (e) => {
              floodLayer.resetStyle(e.target);
            },
          });

          lyr.bindPopup(
            '<div class="gis-popup flood-popup">' +
              '<div class="gis-popup-header">' +
                '<div class="gis-popup-title">Detected Flood Extent</div>' +
                '<span class="gis-popup-badge" style="background:#0284c7; color:#fff;">SATELLITE DETECTED</span>' +
              '</div>' +
              '<div class="gis-popup-body">' +
                '<div class="gis-popup-row">' +
                  '<span class="gis-popup-label">Flooded Area:</span>' +
                  `<span class="gis-popup-val" style="color:#0284c7; font-weight:700;">${areaStr}</span>` +
                '</div>' +
                '<div class="gis-popup-row">' +
                  '<span class="gis-popup-label">Polygon Count:</span>' +
                  `<span class="gis-popup-val">${countStr}</span>` +
                '</div>' +
                '<div class="gis-popup-footnote">Generated via GEE Sentinel-1 SAR change detection</div>' +
              '</div>' +
            '</div>',
            { maxWidth: 260 }
          );
        },
      });

      floodLayer.addTo(map);
      floodLayerRef.current = floodLayer;
      layerControlRef.current?.addOverlay(floodLayer, '🌊 Flooded Area');

      try {
        const b = floodLayer.getBounds();
        if (b && b.isValid()) {
          floodBounds = b;
        }
      } catch (_) {}
    }

    // -------------------------------------------------------------------------
    // 2. CENTROID MARKER
    // -------------------------------------------------------------------------
    if (centMarkerRef.current) {
      try {
        map.removeLayer(centMarkerRef.current);
      } catch (_) {}
      centMarkerRef.current = null;
    }

    if (centroid && centroid.latitude != null && centroid.longitude != null) {
      const centIcon = L.divIcon({
        className: 'custom-centroid-marker-wrapper',
        html: (
          '<div class="custom-centroid-pin" title="Flood Centroid" style="background:#475569; width:20px; height:20px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 0 8px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px;">' +
            '📍' +
          '</div>'
        ),
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
      });

      const centMarker = L.marker([centroid.latitude, centroid.longitude], { icon: centIcon });
      centMarker.bindPopup(
        '<div class="gis-popup centroid-popup">' +
          '<div class="gis-popup-header">' +
            '<div class="gis-popup-title">Flood Extent Centroid</div>' +
          '</div>' +
          '<div class="gis-popup-body">' +
            '<div class="gis-popup-row">' +
              '<span class="gis-popup-label">Latitude:</span>' +
              `<span class="gis-popup-val">${centroid.latitude.toFixed(6)}° N</span>` +
            '</div>' +
            '<div class="gis-popup-row">' +
              '<span class="gis-popup-label">Longitude:</span>' +
              `<span class="gis-popup-val">${centroid.longitude.toFixed(6)}° E</span>` +
            '</div>' +
            '<div class="gis-popup-footnote">Geographic centroid of detected flood polygon</div>' +
          '</div>' +
        '</div>',
        { maxWidth: 240 }
      );

      centMarker.addTo(map);
      centMarkerRef.current = centMarker;

      const pBounds = L.latLngBounds([
        L.latLng(centroid.latitude, centroid.longitude),
        L.latLng(centroid.latitude, centroid.longitude)
      ]);
      fallbackBounds = fallbackBounds ? fallbackBounds.extend(pBounds) : pBounds;
    }

    // -------------------------------------------------------------------------
    // 3. REAL AFFECTED VILLAGE/ADMINISTRATIVE BOUNDARIES
    // -------------------------------------------------------------------------
    if (villagesLayerRef.current) {
      try {
        layerControlRef.current?.removeLayer(villagesLayerRef.current);
        map.removeLayer(villagesLayerRef.current);
      } catch (_) {}
      villagesLayerRef.current = null;
    }

    if (affectedVillagesGeoJSON && affectedVillagesGeoJSON.features && affectedVillagesGeoJSON.features.length > 0) {
      const villagesLayer = L.geoJSON(affectedVillagesGeoJSON, {
        style: (feature) => {
          const vName = (feature?.properties?.name || feature?.properties?.NAME || '').toLowerCase().trim();
          const pData = priorityLookup.current[vName];
          const isSelected = selectedFeature?.type === 'village' && selectedFeature?.name?.toLowerCase().trim() === vName;

          const rCode = pData?.risk_code || feature?.properties?.risk_code;
          let strokeColor = '#f59e0b'; // Amber default
          let fillColor = '#fbbf24';

          if (rCode === 'HIGH') {
            strokeColor = '#ef4444';
            fillColor = '#f87171';
          } else if (rCode === 'MEDIUM') {
            strokeColor = '#f59e0b';
            fillColor = '#fbbf24';
          } else if (rCode === 'LOW') {
            strokeColor = '#eab308';
            fillColor = '#fef08a';
          }

          return {
            color: isSelected ? '#ffffff' : strokeColor,
            weight: isSelected ? 3.8 : 2.2,
            opacity: 0.95,
            fillColor: fillColor,
            fillOpacity: 0.18,
            dashArray: '5, 5',
          };
        },
        onEachFeature: (feature, lyr) => {
          const rawName = feature.properties?.name || feature.properties?.NAME || 'Affected Village';
          const cleanKey = rawName.toLowerCase().trim();
          const vData = villageLookup.current[cleanKey] || {};
          const pData = priorityLookup.current[cleanKey] || {};

          const rLevel = pData.risk_level || feature.properties?.risk_level || vData.risk_level || 'MEDIUM RISK';
          const rSymbol = pData.risk_symbol || feature.properties?.risk_symbol || '🟠';
          const iScore = pData.impact_score != null ? pData.impact_score : (feature.properties?.impact_score || 0.5);

          const floodedKm2 = vData.area_flooded_km2 != null ? `${vData.area_flooded_km2.toFixed(2)} km²` : (feature.properties?.area_flooded_km2 != null ? `${feature.properties.area_flooded_km2} km²` : 'N/A');
          const popEst = vData.population_affected != null ? vData.population_affected.toLocaleString() : (feature.properties?.population_affected != null ? feature.properties.population_affected.toLocaleString() : 'N/A');
          const bldEst = vData.buildings_affected != null ? vData.buildings_affected.toLocaleString() : (feature.properties?.buildings_affected != null ? feature.properties.buildings_affected.toLocaleString() : 'N/A');
          const rdEst = vData.roads_affected_km != null ? `${vData.roads_affected_km.toFixed(2)} km` : (feature.properties?.roads_affected_km != null ? `${feature.properties.roads_affected_km} km` : 'N/A');
          const vegEst = vData.vegetation_affected_ha != null ? `${vData.vegetation_affected_ha.toFixed(1)} ha` : (feature.properties?.vegetation_affected_ha != null ? `${feature.properties.vegetation_affected_ha} ha` : 'N/A');

          lyr.bindTooltip(
            `<div class="village-map-label">${rSymbol} ${rawName}</div>`,
            {
              permanent: true,
              direction: 'center',
              className: 'custom-village-label',
            }
          );

          lyr.on({
            mouseover: (e) => {
              e.target.setStyle({ weight: 3.5, fillOpacity: 0.35 });
            },
            mouseout: (e) => {
              villagesLayer.resetStyle(e.target);
            },
            click: () => {
              if (onSelectFeature) {
                onSelectFeature({ type: 'village', name: rawName, data: { ...vData, ...pData } });
              }
            },
          });

          lyr.bindPopup(
            '<div class="gis-popup village-popup">' +
              '<div class="gis-popup-header">' +
                `<div class="gis-popup-title">${rawName}</div>` +
                `<span class="gis-popup-badge" style="background:${rLevel.includes('HIGH') ? '#ef4444' : rLevel.includes('MEDIUM') ? '#f59e0b' : '#eab308'}; color:#fff;">${rSymbol} ${rLevel}</span>` +
              '</div>' +
              '<div class="gis-popup-body">' +
                '<div class="gis-popup-row">' +
                  '<span class="gis-popup-label">Impact Score:</span>' +
                  `<span class="gis-popup-val font-mono" style="font-weight:700;">${iScore.toFixed(3)}</span>` +
                '</div>' +
                '<div class="gis-popup-row">' +
                  '<span class="gis-popup-label">Flooded Area:</span>' +
                  `<span class="gis-popup-val">${floodedKm2}</span>` +
                '</div>' +
                '<div class="gis-popup-row">' +
                  '<span class="gis-popup-label">Population Exposed:</span>' +
                  `<span class="gis-popup-val" style="color:#e11d48; font-weight:700;">${popEst} people</span>` +
                '</div>' +
                '<div class="gis-popup-row">' +
                  '<span class="gis-popup-label">Buildings Affected:</span>' +
                  `<span class="gis-popup-val" style="color:#d97706;">${bldEst} structures</span>` +
                '</div>' +
                '<div class="gis-popup-row">' +
                  '<span class="gis-popup-label">Roads Inundated:</span>' +
                  `<span class="gis-popup-val" style="color:#ef4444;">${rdEst}</span>` +
                '</div>' +
                '<div class="gis-popup-row">' +
                  '<span class="gis-popup-label">Vegetation Inundated:</span>' +
                  `<span class="gis-popup-val" style="color:#16a34a;">${vegEst}</span>` +
                '</div>' +
                '<div class="gis-popup-footnote alert-box">' +
                  'Spatial overlay & transparent weighting score from measured exposure layers.' +
                '</div>' +
              '</div>' +
            '</div>',
            { maxWidth: 280 }
          );
        },
      });

      villagesLayer.addTo(map);
      villagesLayerRef.current = villagesLayer;
      layerControlRef.current?.addOverlay(villagesLayer, '🏘️ Villages');
    }

    // -------------------------------------------------------------------------
    // 4. VILLAGE RISK MARKERS LAYER (🔴 HIGH / 🟠 MEDIUM / 🟡 LOW RISK MARKERS AT CENTROIDS)
    // -------------------------------------------------------------------------
    if (riskLayerRef.current) {
      try {
        layerControlRef.current?.removeLayer(riskLayerRef.current);
        map.removeLayer(riskLayerRef.current);
      } catch (_) {}
      riskLayerRef.current = null;
    }

    if (affectedVillagesGeoJSON && affectedVillagesGeoJSON.features && affectedVillagesGeoJSON.features.length > 0) {
      const riskGroup = L.layerGroup();

      affectedVillagesGeoJSON.features.forEach((feature) => {
        const rawName = feature.properties?.name || feature.properties?.NAME || 'Village';
        const cleanKey = rawName.toLowerCase().trim();
        const pData = priorityLookup.current[cleanKey] || {};
        const vData = villageLookup.current[cleanKey] || {};

        let cLat = feature.properties?.centroid?.latitude || vData.centroid?.latitude;
        let cLng = feature.properties?.centroid?.longitude || vData.centroid?.longitude;

        if (cLat == null || cLng == null) {
          try {
            const b = L.geoJSON(feature).getBounds();
            if (b && b.isValid()) {
              const c = b.getCenter();
              cLat = c.lat; cLng = c.lng;
            }
          } catch (_) {}
        }

        if (cLat == null || cLng == null) return;

        const rLevel = pData.risk_level || feature.properties?.risk_level || vData.risk_level || 'MEDIUM RISK';
        const rSymbol = rLevel.includes('HIGH') ? '🔴' : rLevel.includes('MEDIUM') ? '🟠' : '🟡';
        const rBadgeText = rLevel.includes('HIGH') ? 'HIGH RISK' : rLevel.includes('MEDIUM') ? 'MED RISK' : 'LOW RISK';
        const badgeBg = rLevel.includes('HIGH') ? '#ef4444' : rLevel.includes('MEDIUM') ? '#f59e0b' : '#eab308';
        const iScore = pData.impact_score != null ? pData.impact_score : (feature.properties?.impact_score || 0.5);

        const floodedKm2 = vData.area_flooded_km2 != null ? `${vData.area_flooded_km2.toFixed(2)} km²` : 'N/A';
        const popEst = vData.population_affected != null ? vData.population_affected.toLocaleString() : 'N/A';
        const bldEst = vData.buildings_affected != null ? vData.buildings_affected.toLocaleString() : 'N/A';
        const rdEst = vData.roads_affected_km != null ? `${vData.roads_affected_km.toFixed(2)} km` : 'N/A';
        const vegEst = vData.vegetation_affected_ha != null ? `${vData.vegetation_affected_ha.toFixed(1)} ha` : 'N/A';

        const riskIcon = L.divIcon({
          className: 'custom-risk-marker-wrapper',
          html: (
            `<div class="custom-risk-pin" style="background:${badgeBg}; color:#fff; border:2px solid #fff; border-radius:14px; padding:2px 8px; font-size:11px; font-weight:700; box-shadow:0 2px 10px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; cursor:pointer;">` +
              `<span>${rSymbol}</span>` +
              `<span>${rBadgeText}</span>` +
            '</div>'
          ),
          iconSize: [85, 24],
          iconAnchor: [42, 12],
          popupAnchor: [0, -12],
        });

        const marker = L.marker([cLat, cLng], { icon: riskIcon });

        marker.on('click', () => {
          if (onSelectFeature) {
            onSelectFeature({ type: 'village', name: rawName, data: { ...vData, ...pData } });
          }
        });

        marker.bindPopup(
          '<div class="gis-popup village-popup">' +
            '<div class="gis-popup-header">' +
              `<div class="gis-popup-title">${rawName}</div>` +
              `<span class="gis-popup-badge" style="background:${badgeBg}; color:#fff;">${rSymbol} ${rLevel}</span>` +
            '</div>' +
            '<div class="gis-popup-body">' +
              '<div class="gis-popup-row">' +
                '<span class="gis-popup-label">Impact Score:</span>' +
                `<span class="gis-popup-val font-mono" style="font-weight:700;">${iScore.toFixed(3)}</span>` +
              '</div>' +
              '<div class="gis-popup-row">' +
                '<span class="gis-popup-label">Flooded Area:</span>' +
                `<span class="gis-popup-val">${floodedKm2}</span>` +
              '</div>' +
              '<div class="gis-popup-row">' +
                '<span class="gis-popup-label">Population Exposed:</span>' +
                `<span class="gis-popup-val" style="color:#e11d48; font-weight:700;">${popEst} people</span>` +
              '</div>' +
              '<div class="gis-popup-row">' +
                '<span class="gis-popup-label">Buildings Affected:</span>' +
                `<span class="gis-popup-val" style="color:#d97706;">${bldEst} structures</span>` +
              '</div>' +
              '<div class="gis-popup-row">' +
                '<span class="gis-popup-label">Roads Inundated:</span>' +
                `<span class="gis-popup-val" style="color:#ef4444;">${rdEst}</span>` +
              '</div>' +
              '<div class="gis-popup-row">' +
                '<span class="gis-popup-label">Vegetation Inundated:</span>' +
                `<span class="gis-popup-val" style="color:#16a34a;">${vegEst}</span>` +
              '</div>' +
            '</div>' +
          '</div>',
          { maxWidth: 280 }
        );

        riskGroup.addLayer(marker);
      });

      riskGroup.addTo(map);
      riskLayerRef.current = riskGroup;
      layerControlRef.current?.addOverlay(riskGroup, '⚠️ Village Risk');
    }

    // -------------------------------------------------------------------------
    // 5. IMPACT ANALYSIS LAYERS (POPULATION, BUILDINGS, ROADS, VEGETATION)
    // -------------------------------------------------------------------------
    if (popLayerRef.current) {
      try { layerControlRef.current?.removeLayer(popLayerRef.current); map.removeLayer(popLayerRef.current); } catch (_) {}
      popLayerRef.current = null;
    }
    if (bldLayerRef.current) {
      try { layerControlRef.current?.removeLayer(bldLayerRef.current); map.removeLayer(bldLayerRef.current); } catch (_) {}
      bldLayerRef.current = null;
    }
    if (roadsLayerRef.current) {
      try { layerControlRef.current?.removeLayer(roadsLayerRef.current); map.removeLayer(roadsLayerRef.current); } catch (_) {}
      roadsLayerRef.current = null;
    }
    if (vegLayerRef.current) {
      try { layerControlRef.current?.removeLayer(vegLayerRef.current); map.removeLayer(vegLayerRef.current); } catch (_) {}
      vegLayerRef.current = null;
    }

    if (mode === 'impact') {
      // Vegetation Layer
      if (affectedVegetationGeoJSON && affectedVegetationGeoJSON.features && affectedVegetationGeoJSON.features.length > 0) {
        const vegLayer = L.geoJSON(affectedVegetationGeoJSON, {
          style: { color: '#16a34a', weight: 1.8, opacity: 0.9, fillColor: '#22c55e', fillOpacity: 0.45 },
          onEachFeature: (feature, lyr) => {
            const vName = feature.properties?.name || 'Crop / Vegetation Zone';
            lyr.bindPopup(
              '<div class="gis-popup veg-popup">' +
                '<div class="gis-popup-header">' +
                  `<div class="gis-popup-title">${vName}</div>` +
                  '<span class="gis-popup-badge" style="background:#16a34a; color:#fff;">VEGETATION</span>' +
                '</div>' +
                '<div class="gis-popup-body">' +
                  '<div class="gis-popup-row"><span class="gis-popup-label">Land Cover:</span><span class="gis-popup-val">' + (feature.properties?.crop_type || 'Agricultural Paddy / Landcover') + '</span></div>' +
                  '<div class="gis-popup-row"><span class="gis-popup-label">Status:</span><span class="gis-popup-val" style="color:#16a34a; font-weight:700;">Submerged by flood</span></div>' +
                '</div>' +
              '</div>',
              { maxWidth: 260 }
            );
          },
        });
        vegLayer.addTo(map);
        vegLayerRef.current = vegLayer;
        layerControlRef.current?.addOverlay(vegLayer, '🌾 Vegetation');
      }

      // Population Density (Person icons only, NO raw purple raster grid boxes)
      if (populationGeoJSON && populationGeoJSON.features && populationGeoJSON.features.length > 0) {
        const exposedPopFeatures = populationGeoJSON.features.filter((f) => f.properties?.is_exposed === true);
        const popGroup = L.layerGroup();
        exposedPopFeatures.forEach((feature) => {
          const popVal = feature.properties?.population != null ? Number(feature.properties.population) : 0;
          if (popVal <= 0) return;
          let cLat = null, cLng = null;
          try {
            const b = L.geoJSON(feature).getBounds();
            if (b && b.isValid()) {
              const c = b.getCenter(); cLat = c.lat; cLng = c.lng;
            }
          } catch (_) {}
          if (cLat == null || cLng == null) return;
          const formattedPop = popVal >= 1000 ? `${(popVal / 1000).toFixed(1)}k` : popVal.toLocaleString();
          const personIcon = L.divIcon({
            className: 'custom-pop-marker-wrapper',
            html: `<div class="custom-pop-badge" title="${popVal.toLocaleString()} exposed people"><span class="pop-icon">👥</span><span class="pop-count">${formattedPop}</span></div>`,
            iconSize: [52, 22],
            iconAnchor: [26, 11],
            popupAnchor: [0, -10],
          });
          const marker = L.marker([cLat, cLng], { icon: personIcon });
          marker.bindPopup(`<div class="gis-popup pop-popup"><div class="gis-popup-header"><div class="gis-popup-title">Exposed Population</div></div><div class="gis-popup-body"><div class="gis-popup-row"><span class="gis-popup-label">Exposed People:</span><span class="gis-popup-val" style="color:#e11d48; font-weight:700;">${popVal.toLocaleString()} people</span></div></div></div>`, { maxWidth: 260 });
          popGroup.addLayer(marker);
        });
        popGroup.addTo(map);
        popLayerRef.current = popGroup;
        layerControlRef.current?.addOverlay(popGroup, '👥 Population Exposure');
      }

      // Buildings
      if (buildingsGeoJSON && buildingsGeoJSON.features && buildingsGeoJSON.features.length > 0) {
        const exposedBldFeatures = buildingsGeoJSON.features.filter((f) => f.properties?.is_exposed === true);
        const bldGeoJSONToRender = exposedBldFeatures.length > 0 ? { ...buildingsGeoJSON, features: exposedBldFeatures } : buildingsGeoJSON;
        const bldLayer = L.geoJSON(bldGeoJSONToRender, {
          style: { color: '#d97706', weight: 1.6, opacity: 0.95, fillColor: '#f59e0b', fillOpacity: 0.7 },
        });
        bldLayer.addTo(map);
        bldLayerRef.current = bldLayer;
        layerControlRef.current?.addOverlay(bldLayer, '🏠 Buildings/Infrastructure');
      }

      // Roads
      if (affectedRoadsGeoJSON && affectedRoadsGeoJSON.features && affectedRoadsGeoJSON.features.length > 0) {
        const roadsLayer = L.geoJSON(affectedRoadsGeoJSON, {
          style: { color: '#ef4444', weight: 3.5, opacity: 0.95, dashArray: '6, 6' },
        });
        roadsLayer.addTo(map);
        roadsLayerRef.current = roadsLayer;
        layerControlRef.current?.addOverlay(roadsLayer, '🛣️ Roads');
      }
    }

    // -------------------------------------------------------------------------
    // 6. AUTOMATICALLY ZOOM TIGHTLY TO DETECTED FLOOD / VILLAGES BOUNDS
    // -------------------------------------------------------------------------
    const targetBounds = (floodBounds && floodBounds.isValid()) ? floodBounds : fallbackBounds;

    if (targetBounds && targetBounds.isValid()) {
      lastAnalysisBoundsRef.current = targetBounds;
      setTimeout(() => {
        try {
          map.invalidateSize();
          map.flyToBounds(targetBounds, { padding: [35, 35], maxZoom: 15, duration: 1.2 });
        } catch (_) {
          try {
            map.fitBounds(targetBounds, { padding: [30, 30], maxZoom: 15 });
          } catch (e) {}
        }
      }, 50);
    } else {
      map.invalidateSize();
    }
  }, [
    mode,
    floodGeoJSON,
    floodMetrics,
    centroid,
    populationGeoJSON,
    exposedPopulation,
    buildingsGeoJSON,
    affectedBuildings,
    affectedVillagesGeoJSON,
    affectedRoadsGeoJSON,
    affectedVegetationGeoJSON,
    evacuationCandidates,
    selectedFeature,
    onSelectFeature,
  ]);

  const hasData =
    (floodGeoJSON && floodGeoJSON.features && floodGeoJSON.features.length > 0) ||
    (affectedVillagesGeoJSON && affectedVillagesGeoJSON.features && affectedVillagesGeoJSON.features.length > 0);

  return (
    <div className={`map-wrapper ${isFullscreen ? 'fullscreen' : ''}`}>
      {!hasData && (
        <div className="map-no-data">
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
            Interactive Disaster Analysis Map
          </div>
          <span>Upload pre & post satellite GeoTIFFs and run Flood Analysis to view spatial results.</span>
        </div>
      )}

      {/* Main Map Container */}
      <div ref={mapContainerRef} className="leaflet-map-container" />

      {/* Floating Map Toolbar Controls */}
      <div className="map-action-toolbar">
        {hasData && (
          <button
            className="map-tool-btn"
            onClick={handleResetBounds}
            title="Fit map tightly to flood bounds"
            aria-label="Fit to flood extent"
          >
            <span className="btn-text">Reset Extent</span>
          </button>
        )}
        <button
          className="map-tool-btn"
          onClick={handleToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen'}
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? '✕ Exit' : 'Fullscreen'}
        </button>
      </div>

      {/* Active Selection Banner */}
      {selectedFeature && (
        <div className="map-selection-banner">
          <span>Selected {selectedFeature.type === 'village' ? 'Village' : 'Site'}: <b>{selectedFeature.name}</b></span>
          <button
            className="banner-close-btn"
            onClick={() => onSelectFeature && onSelectFeature(null)}
            title="Clear selection"
          >
            ✕
          </button>
        </div>
      )}

      {/* Floating Map Legend Overlay */}
      {hasData && (
        <div className="map-legend-overlay">
          <div className="legend-title">{mode === 'overview' ? 'Flood Overview Layers' : 'GIS Risk & Impact Layers'}</div>
          <div className="legend-items">
            <div className="legend-item">
              <span className="legend-color-box flood-box"></span>
              <span className="legend-label">🌊 Flooded Area</span>
            </div>
            <div className="legend-item">
              <span className="legend-color-box building-box"></span>
              <span className="legend-label">🏘️ Villages</span>
            </div>
            {mode === 'impact' && (
              <>
                <div className="legend-item">
                  <span className="legend-color-box veg-box" style={{ background: 'rgba(34, 197, 94, 0.6)', border: '1.5px solid #16a34a' }}></span>
                  <span className="legend-label">🌾 Vegetation</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-box building-box"></span>
                  <span className="legend-label">🏠 Buildings</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line road-line"></span>
                  <span className="legend-label">🛣️ Roads</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon">👥</span>
                  <span className="legend-label">People Exposed</span>
                </div>
                <div className="legend-item" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="legend-label" style={{ fontWeight: 700, color: '#94a3b8' }}>Risk Classification:</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon">🔴</span>
                  <span className="legend-label" style={{ color: '#ef4444', fontWeight: 600 }}>High Risk (&ge; 0.60)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon">🟠</span>
                  <span className="legend-label" style={{ color: '#f59e0b', fontWeight: 600 }}>Medium Risk (0.30 - 0.59)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon">🟡</span>
                  <span className="legend-label" style={{ color: '#eab308', fontWeight: 600 }}>Low Risk (&lt; 0.30)</span>
                </div>
              </>
            )}
            <div className="legend-item">
              <span className="legend-icon">📍</span>
              <span className="legend-label">Centroid</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
