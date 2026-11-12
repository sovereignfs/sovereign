declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

// MapLibre's own stylesheet, imported by `Map` (its markers, controls and attribution need it).
declare module 'maplibre-gl/dist/maplibre-gl.css';

// A file's served address, as the bundler gives it (an import whose specifier ends in `?url`): a story hands MapLibre's worker to `Map` this way.
declare module '*?url' {
  const url: string;
  export default url;
}
