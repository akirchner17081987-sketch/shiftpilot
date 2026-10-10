"""Verify the published staffing simulator and wish planning against this checked-out release."""
import hashlib
import os
import re
import time
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
assets = ["assets/shift-handover-core-v1.js", "assets/shift-handover-v1.js", "assets/shift-handover-v1.css", "assets/staffing-simulator-core-v1.js", "assets/staffing-simulator-v1.js", "assets/staffing-simulator-v1.css", "assets/staffing-simulator-worker-v1.js", "assets/month-optimizer-core-v1.js", "assets/ot-weekend-holiday-policy.js", "assets/help-center-content-v3.js", "assets/wish-planning-core-v1.js", "assets/wish-planning-v1.js", "assets/wish-planning-v1.css", "assets/compliance-core-v2.js", "assets/employee-portal-workspace-v2.js", "assets/month-optimizer-v1.js", "assets/conflict-plausibility-v1.js"]
expected = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in assets}
dynamic_assets = {"assets/compliance-core-v2.js", "assets/employee-portal-workspace-v2.js"}
loader_source = re.search(r'src="(assets/conflict-plausibility-v1\.js[^\"]*)"', (root / "index.html").read_text(encoding="utf-8")).group(1)
help_source = re.search(r'src="(assets/help-center-content-v3\.js[^\"]*)"', (root / "index.html").read_text(encoding="utf-8")).group(1)
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
        if not all(name in index for name in assets if "worker" not in name and name not in dynamic_assets):
            raise RuntimeError("Published index does not load the staffing-simulator workspace")
        if f'src="{loader_source}"' not in index:
            raise RuntimeError("Published index does not yet load the updated module loader cache version")
        if f'src="{help_source}"' not in index:
            raise RuntimeError("Published index does not yet load the updated help cache version")
        print(f"Live verification passed: staffing-simulator, wish planning, shift handover and help assets exactly match release {revision}, and the production index loads them with the expected help cache version.", flush=True)
        break
    except Exception as error:
        print(f"Attempt {attempt}: waiting for IONOS release ({error})", flush=True)
        time.sleep(6)
else:
    raise SystemExit("IONOS live verification failed: expected release was not available within 10 minutes.")
