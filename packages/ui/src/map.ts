/**
 * `@sovereignfs/ui/map`: the map, in an entry of its own so that an app with no map carries no MapLibre. It needs `maplibre-gl`, an optional peer dependency of this package.
 */
export { Map } from './components/Map/Map';
export type { LatLng, MapMarkerData, MapMarkerTone, MapPick, MapProps } from './components/Map/Map';
export { isAllowedRequest } from './components/Map/mapModel';
