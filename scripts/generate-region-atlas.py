"""Prepare the self-hosted SchichtFunk atlas from public-domain Natural Earth data.

Authoring only: Python 3, Pillow, numpy, shapely. No runtime Python dependencies.
python scripts/generate-region-atlas.py --cache /tmp/sf-atlas-source
Source terms: https://www.naturalearthdata.com/about/terms-of-use/
The relief is real hillshading, recolored in our own palette, not a satellite image.
"""
import argparse
import hashlib
import io
import json
import pathlib
import urllib.request
import zipfile

import numpy as np
from PIL import Image, ImageFilter
from shapely.geometry import box, shape, mapping
from shapely.geometry.polygon import orient

ROOT = pathlib.Path(__file__).resolve().parents[1]
BOUNDS = [-10, 40, 32, 61]
parser = argparse.ArgumentParser()
parser.add_argument('--cache', default='/tmp/sf-atlas-source')
args = parser.parse_args()
cache = pathlib.Path(args.cache)
cache.mkdir(parents=True, exist_ok=True)
sources = {}


def source(name, url):
    path = cache / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=120) as response:
            path.write_bytes(response.read())
    sources[url] = hashlib.sha256(path.read_bytes()).hexdigest()
    return path


def dataset(name, scale='10m'):
    filename = 'countries.json' if name == 'admin_0_countries' else name + '.json'
    url = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_{scale}_{name}.geojson'
    return json.loads(source(filename, url).read_text())['features']


def winding(geometry):
    if geometry.geom_type == 'Polygon':
        return mapping(orient(geometry, sign=-1))
    if geometry.geom_type == 'MultiPolygon':
        return {'type': 'MultiPolygon', 'coordinates': [mapping(orient(p, sign=-1))['coordinates'] for p in geometry.geoms]}
    return mapping(geometry)


def rounded(value):
    if isinstance(value, (list, tuple)):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return round(value, 4) if isinstance(value, float) else value


clip = box(*BOUNDS)
data = {'bounds': BOUNDS, 'source': 'Natural Earth · Public Domain', 'countries': [], 'rivers': [], 'lakes': [], 'cities': []}
for layer, dataset_name, scale in [('countries', 'admin_0_countries', '50m'), ('rivers', 'rivers_lake_centerlines', '10m'), ('lakes', 'lakes', '10m')]:
    for f in dataset(dataset_name, scale):
        geometry = shape(f['geometry'])
        if not geometry.intersects(clip):
            continue
        geometry = geometry.intersection(clip).simplify(.006, preserve_topology=True)
        if geometry.is_empty or geometry.geom_type == 'GeometryCollection':
            continue
        p = f['properties']
        props = {'name': p.get('name_de') or p.get('name') or p.get('NAME_DE') or p.get('ADMIN'), 'rank': p.get('scalerank', 0)}
        if layer == 'countries':
            props['id'] = p.get('ADM0_A3')
        data[layer].append({'type': 'Feature', 'properties': props, 'geometry': rounded(winding(geometry))})

names = {'Munich': 'München', 'Cologne': 'Köln', 'Vienna': 'Wien', 'Prague': 'Prag', 'Nuremberg': 'Nürnberg', 'Hanover': 'Hannover', 'Brussels': 'Brüssel', 'Zurich': 'Zürich', 'Geneva': 'Genf', 'Innsbruck': 'Innsbruck'}
for f in dataset('populated_places_simple'):
    p = f['properties']
    x, y = f['geometry']['coordinates']
    if BOUNDS[0] <= x <= BOUNDS[2] and BOUNDS[1] <= y <= BOUNDS[3] and (p['pop_max'] >= 180000 or p['adm0cap'] or p['name'] in ['Salzburg', 'Innsbruck', 'Linz']):
        data['cities'].append({'name': names.get(p['name'], p['name']), 'coords': [round(x, 4), round(y, 4)], 'rank': p['scalerank'], 'capital': bool(p['adm0cap'])})
data['cities'].sort(key=lambda c: (not c['capital'], c['rank']))
(ROOT / 'assets/region-atlas-data-v1.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')

archive = source('relief.zip', 'https://naciscdn.org/naturalearth/50m/raster/SR_50M.zip')
with zipfile.ZipFile(archive) as z:
    relief = Image.open(io.BytesIO(z.read('SR_50M.tif')))
    # Native cell centers: -179.9833333333, 89.9833333333; 1/30 degree.
    crop = relief.crop(((BOUNDS[0]+180)*30, (90-BOUNDS[3])*30, (BOUNDS[2]+180)*30, (90-BOUNDS[1])*30))
    crop = crop.filter(ImageFilter.GaussianBlur(.28))
    raw = np.asarray(crop).astype(float) / 255
merc = lambda latitude: np.log(np.tan(np.pi/4 + np.radians(latitude)/2))
top, bottom = merc(BOUNDS[3]), merc(BOUNDS[1])
width, height = 1890, round(1890 * (top-bottom) / np.radians(BOUNDS[2]-BOUNDS[0]))
latitudes = np.degrees(2*np.arctan(np.exp(np.linspace(top, bottom, height))) - np.pi/2)
ys = np.clip((BOUNDS[3]-latitudes)*30-.5, 0, raw.shape[0]-1)
y0 = np.floor(ys).astype(int)
shade = raw[y0] * (1-(ys-y0))[:, None] + raw[np.minimum(y0+1, raw.shape[0]-1)] * (ys-y0)[:, None]
shade = np.asarray(Image.fromarray(shade.astype(np.float32), mode='F').resize((width, height), Image.Resampling.BICUBIC))
# Deliberately quiet, continuous color fields. No random grain, fake forest data,
# invented road network, or animated texture. Color does not encode exact height.
tone = np.clip((shade-.48)*1.9+.48, 0, 1)
dark = np.array([62, 100, 92])
light = np.array([177, 191, 155])
rgb = dark + tone[:, :, None]*(light-dark)
alpine = np.exp(-((latitudes-46.7)/1.25)**2)[:, None, None]
rgb = rgb*(1-alpine*.16) + np.array([165, 183, 164])*alpine*.16
Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(ROOT / 'assets/region-atlas-relief-v1.webp', quality=94, method=6)
print(json.dumps({'layers': {k: len(v) for k, v in data.items() if isinstance(v, list) and k != 'bounds'}, 'relief': [width, height], 'source_sha256': sources}, indent=2))
