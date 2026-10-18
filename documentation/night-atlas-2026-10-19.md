# Night atlas for the daily overview

The regional map uses a self-hosted night palette, warm settlement lights, cyan
country outlines and separate SVG site markers. It retains the previous map
projection, verified company coordinates, responsive layout, edge feathering,
selection workflows and globe toggle.

The image is our own decorative rendering, not a satellite photograph or a
measurement of present activity. Real terrain, urban footprints and road geometry
come from Natural Earth (public domain). Visible attribution was reviewed and
removed on 2026-10-19; see `map-attribution-review-2026-10-19.md`. The six existing
address coordinates remain unchanged.

- `assets/region-atlas-night-v1.webp`: 1890 × 1520, 456,974 bytes.
- `scripts/generate-night-atlas.py`: reproducible authoring with the existing
  Python/Pillow/NumPy/Shapely toolchain, a fixed light pattern, clipped regional
  geography and supersampled road and settlement lights.
- `assets/region-atlas-v1.js`: static terrain rendering, soft regional boundary
  composition, atmospheric highlighting and collision-aware place labels.
- `assets/location-map-v1.js` and CSS: independent location halos and slow,
  staggered pulse rings; a single short highlight follows the selected site's
  label connector. The regional map does not draw a network between businesses.

Animation respects the application's motion setting, `prefers-reduced-motion`,
document visibility and viewport visibility. There is no continuous repaint of
the terrain or city lights. No map API, external runtime image request, new
runtime library, authentication change or database change is introduced.

## Sources

- Terms: https://www.naturalearthdata.com/about/terms-of-use/
- Urban areas: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-urban-area/
- Urban GeoJSON: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_urban_areas.geojson
  SHA-256 `5136ffd816a9b28c0f295e6797b4c03eaa421be80d78b90f542db4a932dd4497`
- Roads GeoJSON: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson
  SHA-256 `66a0c7b438e92fd124822cc5921cfa11042f48c294ade5e0f03f2c6640fd0248`

The generated image uses 2,850 clipped urban areas and 5,727 road sections.
Ferry routes are excluded. Relief and other geographic sources are documented in
`regional-atlas-2026-10-19.md`.

## Validation

- Static production build and full unit suite.
- Full-page browser QA with signed-out state and seven roles, verified and
  unverified sites, site selection, existing categories, globe switching, stable
  terrain pixels, motion-off and reduced-motion behavior.
- Dark and light application themes at 320, 390, 1440 and 1920 CSS pixels;
  desktop and mobile screenshots reviewed.
