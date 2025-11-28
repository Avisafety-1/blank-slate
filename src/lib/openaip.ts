export const openAipConfig = {
  apiKey: import.meta.env.VITE_OPENAIP_API_KEY as string | undefined,
  tiles: {
    base: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    airspace:
      "https://{s}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey={key}",
  },
  attribution:
    '&copy; OpenStreetMap contributors, data © <a href="https://www.openaip.net">OpenAIP</a>',
};
