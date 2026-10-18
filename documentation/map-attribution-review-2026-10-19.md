# Visible map attribution review — 2026-10-19

The visible `Natural Earth · © OpenStreetMap` footer was carried forward from the
older map. It has been removed following a review of the actual data use and the
publishers' guidelines. This does not declare the application or all its source
code public domain, and no bundled software licence notice has been removed.

## Map geography and appearance

The country outlines, rivers, lakes, place labels, terrain relief, road geometry
and urban footprints used by the regional atlas are Natural Earth data. The night
palette, decorative lighting, atmosphere, site UI and animations are our own
rendering. No OpenStreetMap tiles or OSM geometry are used by this map.

Natural Earth's terms explicitly place its raster and vector map data in the
public domain, permit commercial use and modification, and state that credit is
unnecessary:

https://www.naturalearthdata.com/about/terms-of-use/

## Six address positions

`assets/location-map-core-v1.js` retains six previously geocoded latitude/longitude
pairs associated with company addresses. The application matches those fixed
addresses locally; it does not query Nominatim or another OSM geocoding service,
include the OSM database, or systematically extract new OSM features. Unverified
addresses remain unpositioned, and explicitly supplied coordinates are supported.

The OSMF Geocoding Guideline distinguishes public geocoders and applications
incorporating them (which must credit OSM) from stored individual geocoding
results. Its “Geocoding store locations” example and attribution FAQ say such
results need not retain attached attribution when the collection is not a
Derivative Database. The reviewed six company address results are an insubstantial
collection, not a general-purpose OSM geodatabase or systematic feature export.
On that basis, no persistent OSM credit is displayed on this Natural Earth map.

https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline
https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline
https://osmfoundation.org/wiki/Licence/Attribution_Guidelines

The original coordinate provenance is documented here rather than relabelled as
independently surveyed data. Adding live OSM geocoding, OSM tiles/geometry or a
substantial extraction requires a fresh attribution and licensing review.

## Preserved notices and validation

D3/TopoJSON ISC notices in `assets/location-map-engine-v1.js` and all other vendor
licence notices remain intact. Natural Earth source URLs and hashes remain in
the authoring scripts and atlas documentation. Coordinate values and map
rendering are unchanged. The visible footer continues to show the selected
address or existing selection guidance.

Validated with the static production build, existing location-map/loading tests
and full-page browser QA including site selection, globe switching, themes,
responsive layouts and motion settings.
