// Leaflet is loaded via CDN script in index.html
// Declare the global L variable that the CDN exposes
declare const L: {
  map: (...args: any[]) => any;
  tileLayer: (...args: any[]) => any;
  polyline: (...args: any[]) => any;
  marker: (...args: any[]) => any;
  circle: (...args: any[]) => any;
  divIcon: (...args: any[]) => any;
  Icon: { Default: { mergeOptions: (opts: any) => void } };
  [key: string]: any;
};
