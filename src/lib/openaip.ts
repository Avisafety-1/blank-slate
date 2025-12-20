export const openAipConfig = {
  apiKey: import.meta.env.VITE_OPENAIP_API_KEY as string | undefined,
  tiles: {
    base: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    topo: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    airspace:
      "https://{s}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey={key}",
  },
  attribution: {
    osm: '&copy; OpenStreetMap contributors',
    satellite: 'Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP',
    topo: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
    airspace: 'data © <a href="https://www.openaip.net">OpenAIP</a>',
  },
};
