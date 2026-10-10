"""Verify the published staffing-simulator assets against this checked-out release."""
import hashlib
import os
import time
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
assets = ["assets/staffing-simulator-core-v1.js", "assets/staffing-simulator-v1.js", "assets/staffing-simulator-v1.css", "assets/staffing-simulator-worker-v1.js", "assets/month-optimizer-core-v1.js", "assets/ot-weekend-holiday-policy.js"]
expected = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in assets}
revision = os.environ.get("GITHUB_SHA", "staffing-check")
deadline = time.monotonic() + 600
attempt = 0
while time.monotonic() < deadline:
    attempt += 1
    try:
        for name, digest in expected.items():
            request = urllib.request.Request(f"https://schichtfunk.de/{name}?verify={revision}", headers={"Cache-Control": "no-cache", "User-Agent": "SchichtFunk-release-verification"})
            with urllib.request.urlopen(request, timeout=12) as response:
                body = response.read()
                if response.status != 200 or hashlib.sha256(body).hexdigest() != digest:
                    raise RuntimeError(f"Release asset not yet published: {name}")
        request = urllib.request.Request(f"https://schichtfunk.de/?verify={revision}", headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=12) as response:
            index = response.read().decode("utf-8")
        if not all(name in index for name in assets if "worker" not in name):
            raise RuntimeError("Published index does not load the staffing-simulator workspace")
        print(f"Live verification passed: all staffing-simulator assets exactly match release {revision}, and the production index loads them.", flush=True)
        break
    except Exception as error:
        print(f"Attempt {attempt}: waiting for IONOS release ({error})", flush=True)
        time.sleep(6)
else:
    raise SystemExit("IONOS live verification failed: expected release was not available within 10 minutes.")
