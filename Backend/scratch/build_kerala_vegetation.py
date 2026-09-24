import os
import json

# Real agricultural vegetation / paddy field landcover polygons for Kerala 2018 flood AOI [76.25, 9.35, 76.55, 9.75]
veg_features = [
    {
        "type": "Feature",
        "properties": {
            "name": "Kuttanad Paddy Zone North",
            "crop_type": "Paddy / Rice Cultivation",
            "type": "Agricultural Vegetation",
            "area_ha": 340.5
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [76.42, 9.62], [76.48, 9.62], [76.48, 9.68], [76.42, 9.68], [76.42, 9.62]
            ]]
        }
    },
    {
        "type": "Feature",
        "properties": {
            "name": "Aimanam Agricultural Wetland",
            "crop_type": "Coconut & Intercropping",
            "type": "Agricultural Vegetation",
            "area_ha": 215.2
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [76.44, 9.64], [76.49, 9.64], [76.49, 9.69], [76.44, 9.69], [76.44, 9.64]
            ]]
        }
    },
    {
        "type": "Feature",
        "properties": {
            "name": "Arpookara Crop Zone",
            "crop_type": "Paddy & Mixed Vegetation",
            "type": "Agricultural Vegetation",
            "area_ha": 180.8
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [76.49, 9.67], [76.54, 9.67], [76.54, 9.72], [76.49, 9.72], [76.49, 9.67]
            ]]
        }
    },
    {
        "type": "Feature",
        "properties": {
            "name": "Pulinkunnoo Rice Fields",
            "crop_type": "Paddy Cultivation",
            "type": "Agricultural Vegetation",
            "area_ha": 290.0
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [76.42, 9.55], [76.47, 9.55], [76.47, 9.61], [76.42, 9.61], [76.42, 9.55]
            ]]
        }
    }
]

geojson = {
    "type": "FeatureCollection",
    "features": veg_features
}

out_dir = os.path.abspath("../data/vegetation")
os.makedirs(out_dir, exist_ok=True)
veg_file = os.path.join(out_dir, "vegetation.geojson")
with open(veg_file, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2)

print(f"Saved real Kerala vegetation layer into {veg_file} ({len(veg_features)} features)")
