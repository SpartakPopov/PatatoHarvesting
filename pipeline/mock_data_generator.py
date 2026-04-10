import json
import random
from datetime import datetime, timedelta

# VDBorne is located around Reusel, NL. Let's use a starting coordinate there.
START_LAT = 51.3190
START_LON = 5.1610
CLASSES = ["potato_good", "potato_damaged", "clod", "stone"]

def generate_mock_stream(num_frames=100):
    stream = []
    current_time = datetime.now()
    
    # Simulate a tractor moving slowly north-east
    lat, lon = START_LAT, START_LON 
    
    for i in range(num_frames):
        # 1 frame per second simulation
        current_time += timedelta(seconds=1) 
        
        # Tractor movement simulation (slight adjustments to lat/lon)
        lat += random.uniform(-0.00001, 0.00005)
        lon += random.uniform(-0.00001, 0.00005)
        
        # Simulate 5 to 15 objects detected on the belt per frame
        num_objects = random.randint(5, 15)
        detections = []
        
        for _ in range(num_objects):
            # Heavily weight 'potato_good' to make it realistic
            obj_class = random.choices(CLASSES, weights=[70, 15, 10, 5])[0]
            detections.append({
                "class": obj_class,
                "confidence": round(random.uniform(0.60, 0.99), 2),
                # Fake bounding box [x1, y1, x2, y2]
                "bbox": [random.randint(0, 100), random.randint(0, 100), 
                         random.randint(150, 300), random.randint(150, 300)]
            })
            
        frame_data = {
            "frame_id": i,
            "timestamp": current_time.isoformat(),
            "gps": {"lat": lat, "lon": lon},
            "detections": detections
        }
        stream.append(frame_data)
        
    # Save the mock stream so your aggregator can ingest it
    with open("mock_model_output.json", "w") as f:
        json.dump(stream, f, indent=4)
    print(f"Generated {num_frames} mock frames in 'mock_model_output.json'")

if __name__ == "__main__":
    generate_mock_stream(120) # Simulate 2 minutes of harvesting