import { isNative } from "../config.js";

/*
  Organic Maps is a native offline-maps app (Android / iOS / desktop, C++ core).
  It has no web SDK, so it can't be embedded inside DRISHTI. What a native app
  CAN do is hand a location to it: Organic Maps registers as a handler for
  standard geo: links, so on Android this opens the location in Organic Maps
  (or shows the system chooser if several map apps are installed).
  In a plain browser we fall back to OpenStreetMap on the web.
*/
export function openInOrganicMaps(lat, lon, name = "DRISHTI") {
  if (lat == null || lon == null) return;
  if (isNative()) {
    window.location.href = `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(name)})`;
  } else {
    window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`, "_blank", "noopener");
  }
}
