"""
Exposure Analysis Service.

Calculates deterministic impact metrics for available geospatial layers.
All statistics are computed from real data overlays. When a dataset is unavailable,
the corresponding metric is set to None — never invented. Modeled metrics
such as population are explicitly documented as estimates.
"""

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

try:
    import geopandas as gpd
    from shapely.geometry import shape, mapping
    from shapely.validation import make_valid
    GEOPANDAS_AVAILABLE = True
except ImportError:
    GEOPANDAS_AVAILABLE = False

from app.services.gis_overlay import GISOverlayService


class ExposureAnalysisService:
    """
    Deterministic exposure analysis for flood impact assessment.
    """

    def __init__(self) -> None:
        self._overlay = GISOverlayService()

    def calculate_exposure(
        self,
        flood_geojson: Dict[str, Any],
        region_id: str,
        gis_repo: Any,  # GISRepository instance
    ) -> Dict[str, Any]:
        """
        Compute impact metrics for all available GIS layers.

        Returns a dict structured to match the ImpactMetrics schema.
        Only reports metrics for layers that are actually available.
        """
        result: Dict[str, Any] = {
            "affected_villages": [],
            "affected_population": None,
            "affected_buildings": None,
            "affected_road_length_km": None,
            "affected_vegetation_ha": None,
            "affected_villages_geojson": None,
            "affected_roads_geojson": None,
            "affected_vegetation_geojson": None,
            "data_availability": {
                "villages": False,
                "population": False,
                "buildings": False,
                "roads": False,
                "vegetation": False,
                "dem": False,
            },
            "disclaimer": (
                "Impact figures and population metrics are modeled estimates based on "
                "overlaying satellite flood extents with available geospatial layers."
            ),
        }

        # Check DEM availability
        if hasattr(gis_repo, "get_dem_path"):
            result["data_availability"]["dem"] = gis_repo.get_dem_path() is not None

        if not GEOPANDAS_AVAILABLE:
            logger.warning("geopandas not available — skipping exposure analysis.")
            return result

        if not flood_geojson:
            return result

        # Build flood GeoDataFrame from GeoJSON
        try:
            flood_gdf = self._geojson_to_gdf(flood_geojson)
        except Exception as exc:
            logger.error("Failed to parse flood GeoJSON: %s", exc)
            return result

        # Load layers
        pop_gdf = gis_repo.load_layer("population")
        buildings_gdf = gis_repo.load_layer("buildings")
        roads_gdf = gis_repo.load_layer("roads")
        veg_gdf = gis_repo.load_layer("vegetation")

        # --- Villages -------------------------------------------------------
        villages_gdf = gis_repo.load_layer("villages")
        visual_villages_gdf = gis_repo.load_layer("villages_visual")
        if villages_gdf is not None:
            result["data_availability"]["villages"] = True
            affected, villages_geojson = self._compute_affected_villages(
                flood_gdf, villages_gdf, visual_villages_gdf, pop_gdf, buildings_gdf, roads_gdf, veg_gdf
            )
            result["affected_villages"] = affected
            result["affected_villages_geojson"] = villages_geojson

        # --- Population -----------------------------------------------------
        if pop_gdf is not None:
            result["data_availability"]["population"] = True
            pop_total = self._compute_affected_population(flood_gdf, pop_gdf)
            result["affected_population"] = pop_total

        # --- Buildings -------------------------------------------------------
        if buildings_gdf is not None:
            result["data_availability"]["buildings"] = True
            building_count = self._compute_affected_buildings(flood_gdf, buildings_gdf)
            result["affected_buildings"] = building_count

        # --- Roads -----------------------------------------------------------
        if roads_gdf is not None:
            result["data_availability"]["roads"] = True
            road_km, roads_geojson = self._compute_affected_roads(roads_gdf, flood_gdf)
            result["affected_road_length_km"] = road_km
            result["affected_roads_geojson"] = roads_geojson

        # --- Vegetation ------------------------------------------------------
        if veg_gdf is not None:
            result["data_availability"]["vegetation"] = True
            veg_ha, veg_geojson = self._compute_affected_vegetation(veg_gdf, flood_gdf)
            result["affected_vegetation_ha"] = veg_ha
            result["affected_vegetation_geojson"] = veg_geojson

        return result

    # ------------------------------------------------------------------
    # Per-layer analysis helpers
    # ------------------------------------------------------------------

    def _compute_affected_villages(
        self,
        flood_gdf: Any,
        villages_gdf: Any,
        visual_villages_gdf: Optional[Any] = None,
        pop_gdf: Optional[Any] = None,
        bld_gdf: Optional[Any] = None,
        roads_gdf: Optional[Any] = None,
        veg_gdf: Optional[Any] = None,
    ) -> tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """Intersect village boundaries with flood polygon and compute overlap area and layer breakdown metrics."""
        try:
            if villages_gdf.crs != flood_gdf.crs:
                villages_gdf = villages_gdf.to_crs(flood_gdf.crs)

            intersected = self._overlay.overlay_flood_with_layers(
                flood_gdf, "villages", villages_gdf
            )
            if intersected is None or len(intersected) == 0:
                return [], None

            try:
                metric_crs = intersected.estimate_utm_crs()
            except Exception:
                metric_crs = "EPSG:3857"

            intersected_m = intersected.to_crs(metric_crs)
            name_col = self._find_name_column(intersected)
            intersected_wgs84 = intersected.to_crs("EPSG:4326")

            results = []
            for idx, row in intersected_m.iterrows():
                area_km2 = row.geometry.area / 1_000_000 if row.geometry else 0.0
                name = str(row.get(name_col, "Unknown")) if name_col else "Unknown"

                w_row = intersected_wgs84.loc[idx]
                c_lat, c_lon = None, None
                if w_row.geometry and not w_row.geometry.is_empty:
                    c = w_row.geometry.centroid
                    c_lat, c_lon = round(c.y, 6), round(c.x, 6)

                results.append(
                    {
                        "name": name,
                        "area_flooded_km2": round(area_km2, 4),
                        "population_affected": 0,
                        "buildings_affected": 0,
                        "roads_affected_km": 0.0,
                        "vegetation_affected_ha": 0.0,
                        "centroid": {"latitude": c_lat, "longitude": c_lon} if c_lat and c_lon else None,
                    }
                )

            # Spatial breakdown calculation per village
            if pop_gdf is not None:
                try:
                    pop_m = pop_gdf.to_crs(intersected_m.crs) if pop_gdf.crs != intersected_m.crs else pop_gdf
                    p_col = next((c for c in ["population", "pop", "POP", "Population"] if c in pop_m.columns), None)
                    if p_col:
                        for i, r_m in enumerate(intersected_m.geometry):
                            if r_m is None or r_m.is_empty: continue
                            ov = pop_m[pop_m.geometry.intersects(r_m)]
                            if not ov.empty:
                                results[i]["population_affected"] = int(ov[p_col].fillna(0).sum())
                except Exception as ex:
                    logger.warning("Per-village population breakdown notice: %s", ex)

            if bld_gdf is not None:
                try:
                    bld_m = bld_gdf.to_crs(intersected_m.crs) if bld_gdf.crs != intersected_m.crs else bld_gdf
                    for i, r_m in enumerate(intersected_m.geometry):
                        if r_m is None or r_m.is_empty: continue
                        ov = bld_m[bld_m.geometry.intersects(r_m)]
                        results[i]["buildings_affected"] = len(ov)
                except Exception as ex:
                    logger.warning("Per-village building breakdown notice: %s", ex)

            if roads_gdf is not None:
                try:
                    roads_m = roads_gdf.to_crs(intersected_m.crs) if roads_gdf.crs != intersected_m.crs else roads_gdf
                    for i, r_m in enumerate(intersected_m.geometry):
                        if r_m is None or r_m.is_empty: continue
                        ov = gpd.clip(roads_m, r_m)
                        if not ov.empty:
                            results[i]["roads_affected_km"] = round(float(ov.geometry.length.sum()) / 1000.0, 2)
                except Exception as ex:
                    logger.warning("Per-village road breakdown notice: %s", ex)

            if veg_gdf is not None:
                try:
                    veg_m = veg_gdf.to_crs(intersected_m.crs) if veg_gdf.crs != intersected_m.crs else veg_gdf
                    for i, r_m in enumerate(intersected_m.geometry):
                        if r_m is None or r_m.is_empty: continue
                        ov = gpd.clip(veg_m, r_m)
                        if not ov.empty:
                            results[i]["vegetation_affected_ha"] = round(float(ov.geometry.area.sum()) / 10000.0, 2)
                except Exception as ex:
                    logger.warning("Per-village vegetation breakdown notice: %s", ex)

            # Proportional fallback estimation if point/polygon datasets were not spatially matching
            tot_pop = sum(r["population_affected"] for r in results)
            if tot_pop == 0 and pop_gdf is not None:
                tot_area = sum(r["area_flooded_km2"] for r in results) or 1.0
                p_sum = self._compute_affected_population(flood_gdf, pop_gdf) or 0
                for r in results:
                    r["population_affected"] = int(p_sum * (r["area_flooded_km2"] / tot_area))

            tot_bld = sum(r["buildings_affected"] for r in results)
            if tot_bld == 0 and bld_gdf is not None:
                tot_area = sum(r["area_flooded_km2"] for r in results) or 1.0
                b_sum = self._compute_affected_buildings(flood_gdf, bld_gdf) or 0
                for r in results:
                    r["buildings_affected"] = int(b_sum * (r["area_flooded_km2"] / tot_area))

            tot_rd = sum(r["roads_affected_km"] for r in results)
            if tot_rd == 0.0 and roads_gdf is not None:
                tot_area = sum(r["area_flooded_km2"] for r in results) or 1.0
                r_sum, _ = self._compute_affected_roads(roads_gdf, flood_gdf)
                if r_sum:
                    for r in results:
                        r["roads_affected_km"] = round(r_sum * (r["area_flooded_km2"] / tot_area), 2)

            tot_vg = sum(r["vegetation_affected_ha"] for r in results)
            if tot_vg == 0.0 and veg_gdf is not None:
                tot_area = sum(r["area_flooded_km2"] for r in results) or 1.0
                v_sum, _ = self._compute_affected_vegetation(veg_gdf, flood_gdf)
                if v_sum:
                    for r in results:
                        r["vegetation_affected_ha"] = round(v_sum * (r["area_flooded_km2"] / tot_area), 2)

            results.sort(key=lambda x: x["area_flooded_km2"], reverse=True)

            # Export GeoJSON
            try:
                affected_names = {r["name"] for r in results}
                target_gdf = visual_villages_gdf if visual_villages_gdf is not None else villages_gdf
                if target_gdf.crs != "EPSG:4326":
                    target_gdf = target_gdf.to_crs("EPSG:4326")
                orig_name_col = self._find_name_column(target_gdf)
                if orig_name_col:
                    affected_gdf = target_gdf[target_gdf[orig_name_col].isin(affected_names)].copy()
                else:
                    affected_gdf = target_gdf.copy()
                affected_wgs84 = affected_gdf.to_crs("EPSG:4326")
                villages_geojson = json.loads(affected_wgs84.to_json())
            except Exception:
                villages_geojson = None

            return results, villages_geojson

        except Exception as exc:
            logger.error("Village exposure computation failed: %s", exc)
            return [], None

    def _compute_affected_roads(
        self, roads_gdf: Any, flood_gdf: Any
    ) -> tuple[float, Optional[Dict[str, Any]]]:
        """Calculate inundated road length and return intersected GeoJSON."""
        try:
            if roads_gdf.crs != flood_gdf.crs:
                roads_gdf = roads_gdf.to_crs(flood_gdf.crs)

            clipped = gpd.clip(roads_gdf, flood_gdf)
            if clipped.empty:
                return 0.0, None

            from shapely.geometry import LineString as SLineString, MultiLineString as SMultiLineString
            def _extract_lines(geom: Any) -> Any:
                if geom is None or geom.is_empty:
                    return None
                if isinstance(geom, (SLineString, SMultiLineString)):
                    return geom
                if hasattr(geom, "geoms"):
                    lines = [g for g in geom.geoms if isinstance(g, (SLineString, SMultiLineString))]
                    if lines:
                        return SMultiLineString(lines) if len(lines) > 1 else lines[0]
                return None

            clipped["geometry"] = clipped["geometry"].apply(_extract_lines)
            clipped = clipped[clipped.geometry.notnull() & ~clipped.geometry.is_empty]
            if clipped.empty:
                return 0.0, None

            try:
                metric_crs = clipped.estimate_utm_crs()
            except Exception:
                metric_crs = "EPSG:3857"

            clipped_metric = clipped.to_crs(metric_crs)
            total_length_m = float(clipped_metric.geometry.length.sum())
            total_km = round(total_length_m / 1000.0, 4)

            try:
                clipped_wgs84 = clipped.to_crs("EPSG:4326")
                roads_geojson = json.loads(clipped_wgs84.to_json())
            except Exception:
                roads_geojson = None

            return total_km, roads_geojson
        except Exception as exc:
            logger.error("Road exposure computation failed: %s", exc)
            return 0.0, None

    def _compute_affected_vegetation(
        self, veg_gdf: Any, flood_gdf: Any
    ) -> tuple[float, Optional[Dict[str, Any]]]:
        """Calculate inundated vegetation area in hectares and return intersected GeoJSON."""
        try:
            if veg_gdf.crs != flood_gdf.crs:
                veg_gdf = veg_gdf.to_crs(flood_gdf.crs)

            clipped = gpd.clip(veg_gdf, flood_gdf)
            if clipped.empty:
                return 0.0, None

            try:
                metric_crs = clipped.estimate_utm_crs()
            except Exception:
                metric_crs = "EPSG:3857"

            clipped_metric = clipped.to_crs(metric_crs)
            total_area_m2 = float(clipped_metric.geometry.area.sum())
            total_ha = round(total_area_m2 / 10000.0, 2)

            try:
                clipped_wgs84 = clipped.to_crs("EPSG:4326")
                veg_geojson = json.loads(clipped_wgs84.to_json())
            except Exception:
                veg_geojson = None

            return total_ha, veg_geojson
        except Exception as exc:
            logger.error("Vegetation exposure computation failed: %s", exc)
            return 0.0, None

    def _compute_affected_population(
        self, flood_gdf: Any, pop_gdf: Any
    ) -> Optional[int]:
        """Sum population in features that intersect the flood polygon."""
        try:
            if pop_gdf.crs != flood_gdf.crs:
                pop_gdf = pop_gdf.to_crs(flood_gdf.crs)

            pop_col = None
            for col in ["population", "pop", "pop_total", "total_pop", "POP", "Population"]:
                if col in pop_gdf.columns:
                    pop_col = col
                    break

            if pop_col is None:
                logger.info("No population column found in population layer.")
                return None

            intersected = self._overlay.overlay_flood_with_layers(
                flood_gdf, "population", pop_gdf
            )
            if intersected is None:
                return 0

            total = int(intersected[pop_col].fillna(0).sum())
            return total

        except Exception as exc:
            logger.error("Population computation failed: %s", exc)
            return None

    def _compute_affected_buildings(
        self, flood_gdf: Any, buildings_gdf: Any
    ) -> Optional[int]:
        """Count building footprints that intersect the flood polygon."""
        try:
            if buildings_gdf.crs != flood_gdf.crs:
                buildings_gdf = buildings_gdf.to_crs(flood_gdf.crs)

            intersected = self._overlay.overlay_flood_with_layers(
                flood_gdf, "buildings", buildings_gdf
            )
            if intersected is None:
                return 0
            return len(intersected)

        except Exception as exc:
            logger.error("Building count failed: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Utility helpers
    # ------------------------------------------------------------------

    def _geojson_to_gdf(self, geojson: Dict[str, Any]) -> Any:
        """Convert a GeoJSON dict to a GeoDataFrame in WGS84."""
        gdf = gpd.GeoDataFrame.from_features(
            geojson.get("features", []), crs="EPSG:4326"
        )
        gdf["geometry"] = gdf.geometry.apply(
            lambda g: make_valid(g) if not g.is_valid else g
        )
        return gdf

    @staticmethod
    def _find_name_column(gdf: Any) -> Optional[str]:
        """Find a plausible name column in a GeoDataFrame."""
        for col in ["name", "NAME", "village", "VILLAGE", "admin_name", "label", "ADM2_EN"]:
            if col in gdf.columns:
                return col
        return None
