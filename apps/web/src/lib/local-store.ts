"use client";

import { useSyncExternalStore } from "react";

/** Tiny localStorage-backed store with cross-tab sync, for anonymous-friendly state (compare, basket). */
export function createLocalStore<T>(key: string, initial: T, validate: (v: unknown) => T | null) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue: T = initial;

  function read(): T {
    if (typeof window === "undefined") return initial;
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    if (!raw) {
      cachedValue = initial;
    } else {
      try {
        cachedValue = validate(JSON.parse(raw)) ?? initial;
      } catch {
        cachedValue = initial;
      }
    }
    return cachedValue;
  }

  function write(next: T) {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode / quota): keep in memory for this tab.
      cachedRaw = JSON.stringify(next);
      cachedValue = next;
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    get: read,
    set: (updater: (prev: T) => T) => write(updater(read())),
    use: (): T => useSyncExternalStore(subscribe, read, () => initial),
  };
}
