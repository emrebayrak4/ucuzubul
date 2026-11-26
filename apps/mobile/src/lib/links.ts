import * as WebBrowser from "expo-web-browser";
import { Share } from "react-native";
import { track } from "./analytics";
import { api } from "./api";
import { WEB_URL, brand } from "./config";

const browserOptions: WebBrowser.WebBrowserOpenOptions = {
  presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
};

/** Opens the outbound redirect (/v1/go/:offerId) in the in-app browser. Never the raw retailer URL. */
export async function openOffer(offerId: string, retailerName: string, placement = "app_pdp_offer"): Promise<void> {
  track("outbound_redirect", { kind: "offer", retailerOrProvider: retailerName });
  await WebBrowser.openBrowserAsync(api.catalog.goUrl(offerId, placement), browserOptions);
}

/** Opens /v1/travel/go/:type/:id (affiliate redirect) in the in-app browser. */
export async function openTravelDeal(type: "flight" | "hotel", id: string, providerName: string): Promise<void> {
  track("outbound_redirect", { kind: type, retailerOrProvider: providerName });
  await WebBrowser.openBrowserAsync(api.travel.goUrl(type, id), browserOptions);
}

export async function openWebPath(path: string): Promise<void> {
  await WebBrowser.openBrowserAsync(WEB_URL + path, browserOptions);
}

/** Native share sheet with the public web URL (universal link → opens the app when installed). */
export async function shareProduct(slug: string, title: string): Promise<void> {
  const url = `${WEB_URL}/products/${slug}`;
  await Share.share({ title, message: `${title} — compare prices on ${brand.name}\n${url}`, url });
}
