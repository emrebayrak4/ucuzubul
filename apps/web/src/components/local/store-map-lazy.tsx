"use client";

import dynamic from "next/dynamic";
import type { StorePin } from "./store-map";

/** Leaflet touches `window` — load the map client-side only. */
const StoreMap = dynamic(() => import("./store-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-md bg-surface-2" aria-hidden />,
});

export function StoreMapLazy(props: { pins: StorePin[]; origin: { lat: number; lng: number; zip: string } | null; className?: string }) {
  return <StoreMap {...props} />;
}
