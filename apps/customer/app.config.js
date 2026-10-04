// Values that change per build come from environment variables, so nobody has to edit app.json:
//   EXPO_PUBLIC_API_URL      your server address, e.g. https://myrepairunder100-api.onrender.com
//   GOOGLE_MAPS_ANDROID_KEY  optional; turns on the real map for live tracking on Android
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
  return {
    ...config,
    android: { ...config.android, ...(mapsKey ? { config: { googleMaps: { apiKey: mapsKey } } } : {}) },
    extra: { ...config.extra, apiUrl: process.env.EXPO_PUBLIC_API_URL ?? config.extra?.apiUrl },
  };
};
