// Leaflet is loaded via CDN in index.html and available as a global
declare const L: any;
declare module "leaflet" {
  export = L;
}
declare module "leaflet/dist/leaflet.css" {
  const styles: any;
  export default styles;
}
