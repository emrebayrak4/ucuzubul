import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * Tiny persisted store (AsyncStorage + in-memory cache + listeners) for device-only state:
 * compare list, recent searches, privacy choices. Values are validated on read by `parse`.
 */
export interface LocalStore<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (fn: (v: T) => void) => () => void;
  ready: Promise<void>;
}

export function createLocalStore<T>(key: string, initial: T, parse: (raw: unknown) => T | null): LocalStore<T> {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  const ready = AsyncStorage.getItem(key)
    .then((raw) => {
      if (!raw) return;
      const parsed = parse(JSON.parse(raw));
      if (parsed !== null) {
        value = parsed;
        listeners.forEach((l) => l(value));
      }
    })
    .catch(() => undefined);

  return {
    get: () => value,
    set: (next) => {
      value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      listeners.forEach((l) => l(value));
      AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    ready,
  };
}

export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
