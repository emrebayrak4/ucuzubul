import * as Location from "expo-location";
import { lookupZipForCoords } from "./api";

export type ZipFromLocation =
  | { status: "ok"; zip: string; city: string | null; confidence: "high" | "medium" | "low" | null }
  | { status: "denied" }
  | { status: "unsupported" }
  | { status: "no_match" }
  | { status: "error"; message: string };

/**
 * "Use my location" — only ever called from an explicit tap. Asks for foreground permission, takes ONE coarse
 * fix (balanced accuracy) and sends rounded coordinates to GET /v1/geo/zip. Nothing is stored or tracked;
 * the user still reviews and saves the ZIP themselves.
 */
export async function zipFromCurrentLocation(): Promise<ZipFromLocation> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { status: "denied" };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const hit = await lookupZipForCoords(pos.coords.latitude, pos.coords.longitude);
    if (hit === "unsupported") return { status: "unsupported" };
    if (hit === null) return { status: "no_match" };
    return { status: "ok", zip: hit.zip, city: hit.city, confidence: hit.confidence };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Couldn't get your location." };
  }
}
