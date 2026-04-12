import sys
import time
import requests
import json
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Run this and wait for FastAPI server to start
BASE_URL = "http://localhost:8000/api"

def wait_for_server():
    for _ in range(10):
        try:
            r = requests.get(f"{BASE_URL}/generation_config")
            if r.status_code == 200:
                logger.info("Server is up!")
                return True
        except:
            pass
        time.sleep(1)
    return False

def test_generate_image():
    logger.info("Generating two images...")
    # Generate image 1
    r1 = requests.post(f"{BASE_URL}/generate_flux_image", json={"prompt": "A beautiful sunset over a red desert", "width": 512, "height": 512})
    r1.raise_for_status()
    d1 = r1.json()
    
    # Generate image 2 
    r2 = requests.post(f"{BASE_URL}/generate_flux_image", json={"prompt": "A bright futuristic neon city at night", "width": 512, "height": 512})
    r2.raise_for_status()
    d2 = r2.json()

    return d1["timestamp"], d2["timestamp"]

def test_slideshow(t1, t2):
    logger.info(f"Generating slideshow from {t1} and {t2}...")
    r = requests.post(f"{BASE_URL}/generate_slideshow", json={"timestamps": [t1, t2]})
    r.raise_for_status()
    return r.json()

def test_resize(video_uuid):
    logger.info(f"Resizing video {video_uuid}...")
    # NOTE: /studio/transform/video takes uuid, operation, params
    r = requests.post(f"{BASE_URL}/studio/transform/video", json={
        "uuid": video_uuid,
        "operation": "resize_video",
        "params": {"width": 320, "height": 320}
    })
    r.raise_for_status()
    return r.json()

if __name__ == "__main__":
    if not wait_for_server():
        logger.error("Server did not start in time. Exiting.")
        sys.exit(1)
        
    try:
        t1, t2 = test_generate_image()
        logger.info(f"Generated images. Timestamps: {t1}, {t2}")
        
        slideshow_res = test_slideshow(t1, t2)
        logger.info(f"Slideshow generated: {json.dumps(slideshow_res, indent=2)}")
        
        video_uuid = slideshow_res["uuid"]
        
        resize_res = test_resize(video_uuid)
        logger.info(f"Video resized: {json.dumps(resize_res, indent=2)}")
        
        logger.info("All new features verified successfully!")
        
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        sys.exit(1)
