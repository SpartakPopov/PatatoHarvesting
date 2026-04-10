import json
import pandas as pd
from geojson import Feature, Point, FeatureCollection

# Alert threshold: Flag if damage exceeds 15% [cite: 56]
DAMAGE_ALERT_THRESHOLD = 0.15 

def process_stream(input_file):
    with open(input_file, "r") as f:
        raw_data = json.load(f)
        
    processed_records = []
    
    for frame in raw_data:
        # Count objects by class per frame
        counts = {"potato_good": 0, "potato_damaged": 0, "clod": 0, "stone": 0}
        for det in frame["detections"]:
            counts[det["class"]] += 1
            
        # Calculate damage ratio for this specific frame
        total_potatoes = counts["potato_good"] + counts["potato_damaged"]
        damage_ratio = counts["potato_damaged"] / total_potatoes if total_potatoes > 0 else 0
        
        record = {
            "timestamp": frame["timestamp"],
            "lat": frame["gps"]["lat"],
            "lon": frame["gps"]["lon"],
            "potato_good": counts["potato_good"],
            "potato_damaged": counts["potato_damaged"],
            "clod": counts["clod"],
            "stone": counts["stone"],
            "damage_ratio": damage_ratio
        }
        processed_records.append(record)
        
    df = pd.DataFrame(processed_records)
    
    # Calculate Rolling Stats (e.g., last 10 frames / 10 seconds) [cite: 55]
    df['rolling_damage_pct'] = df['damage_ratio'].rolling(window=10, min_periods=1).mean() * 100
    df['alert_triggered'] = df['rolling_damage_pct'] > (DAMAGE_ALERT_THRESHOLD * 100)
    
    return df

def export_to_csv(df, output_filename="dashboard_stats.csv"):
    # Output the clean stats for the UI charts [cite: 90]
    df.to_csv(output_filename, index=False)
    print(f"Stats exported to {output_filename}")

def export_to_geojson(df, output_filename="field_heatmap.geojson"):
    # Output GeoJSON for the Leaflet/Mapbox heatmap [cite: 88]
    features = []
    
    for _, row in df.iterrows():
        point = Point((row["lon"], row["lat"]))
        properties = {
            "timestamp": row["timestamp"],
            "rolling_damage_pct": round(row["rolling_damage_pct"], 2),
            "alert": bool(row["alert_triggered"])
        }
        features.append(Feature(geometry=point, properties=properties))
        
    feature_collection = FeatureCollection(features)
    
    with open(output_filename, "w") as f:
        json.dump(feature_collection, f, indent=4)
    print(f"Heatmap data exported to {output_filename}")

if __name__ == "__main__":
    # Run the pipeline
    print("Ingesting model data...")
    df_stats = process_stream("mock_model_output.json")
    
    print("Exporting dashboard deliverables...")
    export_to_csv(df_stats)
    export_to_geojson(df_stats)
    print("Pipeline execution complete! Ready for UI ingestion.")