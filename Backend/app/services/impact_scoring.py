"""
Impact Priority & Risk Scoring Service.

Computes transparent, decision-support priority and risk scores for flood-affected villages.
Scores are calculated from normalized exposure factors (population, buildings, roads, flooded area, vegetation).
Clearly documented as a transparent deterministic decision-support model.
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Transparent factor weights summing to 1.0
_DEFAULT_WEIGHTS: Dict[str, float] = {
    "population": 0.35,
    "buildings": 0.25,
    "roads": 0.20,
    "flooded_area": 0.10,
    "vegetation": 0.10,
}


class ImpactScoringService:
    """
    Transparent heuristic impact and risk scoring for flood-affected villages.
    """

    def compute_priority_scores(
        self,
        exposure_data: Dict[str, Any],
        weights: Optional[Dict[str, float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Score, rank, and classify risk for affected villages by transparent impact metrics.

        Args:
            exposure_data: Dict matching ImpactMetrics schema from ExposureAnalysisService
            weights: Optional weight overrides for factors

        Returns:
            List of dicts matching PriorityScore schema, sorted by score descending.
        """
        effective_weights = {**_DEFAULT_WEIGHTS, **(weights or {})}
        total_w = sum(effective_weights.values())
        if total_w > 0:
            effective_weights = {k: v / total_w for k, v in effective_weights.items()}

        villages = exposure_data.get("affected_villages", [])
        if not villages:
            return []

        # Find max factor values across all affected villages for min-max normalization [0, 1]
        max_pop = max((v.get("population_affected") or 0 for v in villages), default=1) or 1
        max_bld = max((v.get("buildings_affected") or 0 for v in villages), default=1) or 1
        max_road = max((v.get("roads_affected_km") or 0.0 for v in villages), default=1.0) or 1.0
        max_area = max((v.get("area_flooded_km2") or 0.0 for v in villages), default=1.0) or 1.0
        max_veg = max((v.get("vegetation_affected_ha") or 0.0 for v in villages), default=1.0) or 1.0

        scored = []
        for village in villages:
            name = village.get("name", "Unknown")
            v_pop = village.get("population_affected") or 0
            v_bld = village.get("buildings_affected") or 0
            v_road = village.get("roads_affected_km") or 0.0
            v_area = village.get("area_flooded_km2") or 0.0
            v_veg = village.get("vegetation_affected_ha") or 0.0

            f_pop = min(v_pop / max_pop, 1.0) if max_pop > 0 else 0.0
            f_bld = min(v_bld / max_bld, 1.0) if max_bld > 0 else 0.0
            f_road = min(v_road / max_road, 1.0) if max_road > 0 else 0.0
            f_area = min(v_area / max_area, 1.0) if max_area > 0 else 0.0
            f_veg = min(v_veg / max_veg, 1.0) if max_veg > 0 else 0.0

            factors = {
                "population": f_pop,
                "buildings": f_bld,
                "roads": f_road,
                "flooded_area": f_area,
                "vegetation": f_veg,
            }

            # Weighted impact score calculation
            score = sum(effective_weights.get(k, 0.0) * v for k, v in factors.items())
            score_rounded = round(score, 4)

            # Classify Risk Level (HIGH RISK, MEDIUM RISK, LOW RISK)
            if score_rounded >= 0.60:
                risk_level = "HIGH RISK"
                risk_code = "HIGH"
                risk_symbol = "🔴"
            elif score_rounded >= 0.30:
                risk_level = "MEDIUM RISK"
                risk_code = "MEDIUM"
                risk_symbol = "🟠"
            else:
                risk_level = "LOW RISK"
                risk_code = "LOW"
                risk_symbol = "🟡"

            # Attach calculated risk properties to village dict for frontend and API schemas
            village["priority_score"] = score_rounded
            village["impact_score"] = score_rounded
            village["risk_level"] = risk_level
            village["risk_code"] = risk_code
            village["risk_symbol"] = risk_symbol

            scored.append({
                "village_name": name,
                "priority_score": score_rounded,
                "impact_score": score_rounded,
                "risk_level": risk_level,
                "risk_code": risk_code,
                "risk_symbol": risk_symbol,
                "rank": 0,
                "area_flooded_km2": round(v_area, 4),
                "population_affected": v_pop,
                "buildings_affected": v_bld,
                "roads_affected_km": round(v_road, 2),
                "vegetation_affected_ha": round(v_veg, 2),
                "centroid": village.get("centroid"),
                "contributing_factors": {k: round(v, 4) for k, v in factors.items()},
            })

        # Sort by score descending and assign rank
        scored.sort(key=lambda x: x["priority_score"], reverse=True)
        for i, item in enumerate(scored):
            item["rank"] = i + 1

        return scored
