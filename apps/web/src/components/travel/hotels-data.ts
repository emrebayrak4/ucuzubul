import { Building2, Castle, Home, Hotel, Tent, TreePalm } from "lucide-react";

/** Shared (server + client) data for the hotels home. Kept out of the "use client" module so server pages can read it. */
export const PROPERTY_TYPES = [
  { key: "hotels", label: "Hotels", icon: Hotel },
  { key: "apartments", label: "Apartments", icon: Building2 },
  { key: "resorts", label: "Resorts", icon: TreePalm },
  { key: "villas", label: "Villas", icon: Castle },
  { key: "cabins", label: "Cabins", icon: Tent },
  { key: "guest-houses", label: "Guest houses", icon: Home },
] as const;
