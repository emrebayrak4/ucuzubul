import { BedDouble, Building2, Castle, Home, Hotel, TreePalm } from "lucide-react";
import type { HotelPropertyType } from "@pricora/contracts";

/**
 * Shared (server + client) data for the hotels home. Kept out of the "use client" module so server pages can read it.
 * `type` is the search filter value (HotelPropertyType) carried into results as `types=`.
 */
export const PROPERTY_TYPES: ReadonlyArray<{ key: string; label: string; type: HotelPropertyType; icon: typeof Hotel }> = [
  { key: "hotels", label: "Hotels", type: "hotel", icon: Hotel },
  { key: "apartments", label: "Apartments", type: "apartment", icon: Building2 },
  { key: "resorts", label: "Resorts", type: "resort", icon: TreePalm },
  { key: "villas", label: "Villas", type: "villa", icon: Castle },
  { key: "hostels", label: "Hostels", type: "hostel", icon: BedDouble },
  { key: "guest-houses", label: "Guest houses", type: "guest_house", icon: Home },
];
