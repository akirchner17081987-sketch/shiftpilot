"""Author the static SchichtFunk night atlas, with no runtime map service.

python scripts/generate-night-atlas.py --cache /tmp/sf-atlas-source
Natural Earth terrain, roads and urban areas: public domain.
https://www.naturalearthdata.com/about/terms-of-use/
Lighting is our decorative rendering of sourced geography, not satellite imagery
or an indication of current traffic, population, or company activity.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import box, shape

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--cache', default='/tmp/sf-atlas-source')
cache = Path(parser.parse_args().cache)
cache.mkdir(parents=True, exist_ok=True)
data = json.loads((ROOT / 'assets/region-atlas-data-v1.json').read_text())
west, south, east, north = data['bounds']
clip = box(west, south, east, north)
relief = Image.open(ROOT / 'assets/region-atlas-relief-v1.webp').convert('RGB')
width, height = relief.size
scale = 2
size = (width * scale, height * scale)
merc = lambda latitude: np.log(np.tan(np.pi / 4 + np.radians(latitude) / 2))
top, bottom = merc(north), merc(south)
def project(coords):
    return [((x-west)/(east-west)*size[0], (top-merc(y))/(top-bottom)*size[1]) for x, y, *_ in coords]

sources = {}
def features(name):
    url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_' + name + '.geojson'
    path = cache / (name + '.json')
    if not path.exists():
        with urlopen(url, timeout=120) as response:
            path.write_bytes(response.read())
    sources[url] = hashlib.sha256(path.read_bytes()).hexdigest()
    return json.loads(path.read_text())['features']

urban = Image.new('L', size)
draw = ImageDraw.Draw(urban)
urban_count = 0
for feature in features('urban_areas'):
    geometry = shape(feature['geometry'])
    if not geometry.intersects(clip):
        continue
    geometry = geometry.intersection(clip)
    polygons = [geometry] if geometry.geom_type == 'Polygon' else getattr(geometry, 'geoms', [])
    for polygon in polygons:
        if polygon.geom_type != 'Polygon':
            continue
        draw.polygon(project(polygon.exterior.coords), fill=255)
        for ring in polygon.interiors:
            draw.polygon(project(ring.coords), fill=0)
    urban_count += 1

roads = Image.new('L', size)
draw = ImageDraw.Draw(roads)
road_count = 0
for feature in features('roads'):
    if (feature['properties'].get('type') or '').startswith('Ferry'):
        continue
    geometry = shape(feature['geometry'])
    if not geometry.intersects(clip):
        continue
    geometry = geometry.intersection(clip)
    lines = [geometry] if geometry.geom_type == 'LineString' else getattr(geometry, 'geoms', [])
    for line in lines:
        if line.geom_type != 'LineString':
            continue
        draw.line(project(line.coords), fill=105 if feature['properties'].get('expressway') else 50, width=1)
    road_count += 1

# Fixed lights confined to sourced urban footprints; supersampling suppresses grain.
mask = np.asarray(urban.resize((width, height), Image.Resampling.LANCZOS)).astype(float) / 255
rng = np.random.default_rng(20261019)
lamps = ((rng.random(mask.shape) > .64) * rng.uniform(65, 235, mask.shape) * mask).astype('uint8')
lights = Image.fromarray(lamps)
urban_soft = urban.resize((width, height), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.8))
roads = roads.resize((width, height), Image.Resampling.LANCZOS)
lamp_glow = lights.filter(ImageFilter.GaussianBlur(1.15))
road_glow = roads.filter(ImageFilter.GaussianBlur(1.1))
strength = (np.asarray(lights).astype(float) * .78 + np.asarray(lamp_glow) * 1.7
            + np.asarray(urban_soft) * .06 + np.asarray(roads) * .4 + np.asarray(road_glow) * .4) / 255

# City cores establish visual hierarchy without turning every settlement into a star.
cores = Image.new('L', (width, height))
draw = ImageDraw.Draw(cores)
for city in data['cities']:
    (x, y), = project([city['coords']])
    x, y = x / scale, y / scale
    radius = 2.3 if city['capital'] else 1.2
    draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=180 if city['capital'] else 100)
strength += np.asarray(cores.filter(ImageFilter.GaussianBlur(1.7))).astype(float) / 255

t = np.clip((np.asarray(relief).astype(float)[:, :, 0] - 62) / 115, 0, 1) ** 1.35
# Original low-frequency color variation adds depth without animated noise.
broad = Image.fromarray((rng.random((40, 50))*255).astype('uint8')).resize((width, height), Image.Resampling.BICUBIC)
variation = 1 + (np.asarray(broad).astype(float)/255-.5)*.24
rgb = (np.array([4, 12, 24]) + t[:, :, None] * np.array([11, 25, 39])) * variation[:, :, None]
strength = np.clip(strength, 0, 1)
rgb = rgb * (1-strength[:, :, None] * .25) + strength[:, :, None] * np.array([255, 180, 87])
target = ROOT / 'assets/region-atlas-night-v1.webp'
Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(target, quality=95, method=6)
print(json.dumps({'file': target.name, 'bytes': target.stat().st_size, 'urban_areas': urban_count,
                  'road_sections': road_count, 'source_sha256': sources}, indent=2))
