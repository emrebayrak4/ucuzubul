/** Background service worker (Chrome) / event page (Firefox). */
import { lightColors } from "@pricora/design-tokens";
import { createApi } from "./api";
import { createBackground } from "./service";
import type { KeyValueArea } from "../shared/cache";
import { API_ORIGIN } from "../shared/env";
import type { ExtensionMessage } from "../shared/messages";
import { findBuiltInRetailer, hostOf } from "../shared/urlMatching";

const BADGE_COLOR = lightColors.primary;

function area(a: chrome.storage.StorageArea | undefined, fallback: KeyValueArea): KeyValueArea {
  if (!a) return fallback;
  return {
    get: (keys) => a.get(keys) as Promise<Record<string, unknown>>,
    set: (items) => a.set(items),
    remove: (keys) => a.remove(keys),
  };
}

/** In-memory fallback if storage.session is unavailable (older Firefox). */
function memoryArea(): KeyValueArea {
  const m = new Map<string, unknown>();
  return {
    async get(keys) {
      const list = keys === null ? [...m.keys()] : Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (m.has(k)) out[k] = m.get(k);
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) m.set(k, v);
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) m.delete(k);
    },
  };
}

const bg = createBackground({
  api: createApi({ origin: API_ORIGIN }),
  local: area(chrome.storage.local, memoryArea()),
  session: area(chrome.storage.session, memoryArea()),
});

const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("/")).origin;

function fromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try {
    return new URL(sender.url).origin === EXTENSION_ORIGIN;
  } catch {
    return false;
  }
}

/** Content-script message from a supported retailer tab, about a URL on the same retailer. */
function fromRetailerTab(sender: chrome.runtime.MessageSender, url: string): boolean {
  if (sender.id !== chrome.runtime.id || !sender.tab) return false;
  const senderRetailer = findBuiltInRetailer(hostOf(sender.url ?? sender.tab.url));
  const urlRetailer = findBuiltInRetailer(hostOf(url));
  return !!senderRetailer && !!urlRetailer && senderRetailer.domain === urlRetailer.domain;
}

async function handle(msg: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case "product:lookup":
      if (!fromRetailerTab(sender, msg.url)) return { kind: "none" };
      // The content script runs after the navigation committed (which resets per-tab badges), so refresh it here too.
      if (sender.tab?.id !== undefined) void updateBadge(sender.tab.id, sender.tab.url);
      return bg.productLookup(msg.url);
    case "checkout:match":
      return fromRetailerTab(sender, msg.url) ? bg.checkoutMatch(msg.url) : { kind: "none" };
    case "coupon:result": {
      if (!sender.tab || sender.id !== chrome.runtime.id || !findBuiltInRetailer(hostOf(sender.url ?? sender.tab.url))) {
        return { ok: false, error: "forbidden" };
      }
      return bg.couponResult(msg);
    }
    case "popup:state":
      return fromExtensionPage(sender) ? bg.popupState(msg.url) : null;
    case "popup:follow":
      return fromExtensionPage(sender) ? bg.follow(msg.retailerSlug) : { ok: false, error: "forbidden" };
    case "settings:get":
      return bg.getSettings();
    case "settings:set": {
      if (!fromExtensionPage(sender)) return bg.getSettings();
      const next = await bg.setSettings(msg.patch);
      void refreshAllBadges();
      return next;
    }
    case "cache:clear":
      return fromExtensionPage(sender) ? bg.clearCaches() : { ok: false, error: "forbidden" };
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((msg: ExtensionMessage, sender, sendResponse) => {
  handle(msg, sender)
    .then(sendResponse)
    .catch(() => sendResponse(null));
  return true; // async response
});

async function updateBadge(tabId: number, url: string | undefined): Promise<void> {
  // `url` is only visible for hosts in host_permissions (retailers); for every other tab it is undefined → no badge.
  const text = await bg.badgeText(url);
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text) await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
  } catch {
    // tab closed meanwhile
  }
}

async function refreshAllBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => (t.id !== undefined ? updateBadge(t.id, t.url) : Promise.resolve())));
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") void updateBadge(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs
    .get(tabId)
    .then((tab) => updateBadge(tabId, tab.url))
    .catch(() => undefined);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") void chrome.runtime.openOptionsPage();
});
