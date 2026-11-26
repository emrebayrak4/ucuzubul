"use client";

import * as React from "react";
import Link from "next/link";
import { Building, Castle, Mountain, Tent, TreePalm } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pricora/ui";
import { Segmented } from "@/components/segmented";
import { PROPERTY_TYPES } from "./hotels-data";



export function PropertyTypes() {
  return (
    <section aria-labelledby="ptype">
      <h2 id="ptype" className="text-xl font-extrabold tracking-tight">
        Browse by property type
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PROPERTY_TYPES.map((p, i) => (
          <li key={p.key}>
            <Link href={`/travel/hotels?type=${p.key}`} className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
              <span className={["bg-hotels-soft", "bg-primary-soft", "bg-warning-soft", "bg-success-soft", "bg-flights-soft", "bg-surface-2"][i % 6] + " flex aspect-[4/3] items-center justify-center"}>
                <p.icon aria-hidden className="size-10 text-text opacity-80" />
              </span>
              <span className="px-3 py-2 text-sm font-bold group-hover:text-hotels-soft-fg">{p.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const THEMES = {
  beach: { label: "Beach", icon: TreePalm, places: ["Cancún", "Miami", "Honolulu", "Bali", "Phuket", "Mallorca", "Antalya", "Nice"] },
  city: { label: "City break", icon: Building, places: ["New York", "London", "Paris", "Istanbul", "Tokyo", "Barcelona", "Rome", "Amsterdam"] },
  ski: { label: "Ski", icon: Mountain, places: ["Aspen", "Vail", "Whistler", "Zermatt", "Chamonix", "Park City", "Niseko", "St. Anton"] },
  romantic: { label: "Romantic", icon: Castle, places: ["Paris", "Venice", "Santorini", "Prague", "Kyoto", "Lisbon", "Florence", "Bruges"] },
  nature: { label: "Outdoors", icon: Tent, places: ["Banff", "Queenstown", "Reykjavík", "Cape Town", "Denver", "Interlaken", "Salt Lake City", "Asheville"] },
} as const;
type ThemeKey = keyof typeof THEMES;

/** Theme chips → destination shortcuts (search prefill only). */
export function TripPlanner() {
  const [theme, setTheme] = React.useState<ThemeKey>("beach");
  return (
    <section aria-labelledby="planner">
      <h2 id="planner" className="text-xl font-extrabold tracking-tight">
        Quick trip planner
      </h2>
      <p className="mt-1 text-sm text-text-muted">Pick a vibe, then a destination — we&apos;ll prefill the search.</p>
      <div className="mt-3">
        <Segmented label="Trip theme" value={theme} onChange={setTheme} options={(Object.keys(THEMES) as ThemeKey[]).map((k) => ({ value: k, label: THEMES[k].label }))} />
      </div>
      <ul className="mt-4 flex flex-wrap gap-2" data-testid="trip-planner">
        {THEMES[theme].places.map((p) => (
          <li key={p}>
            <Link href={`/travel/hotels?city=${encodeURIComponent(p)}`} className="inline-flex h-10 items-center rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:border-hotels hover:text-hotels-soft-fg">
              {p}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const POPULAR = {
  cities: ["New York", "Las Vegas", "Orlando", "Chicago", "San Francisco", "London", "Paris", "Tokyo", "Istanbul", "Dubai", "Barcelona", "Rome", "Amsterdam", "Bangkok", "Lisbon", "Mexico City"],
  countries: ["United States", "Mexico", "Canada", "United Kingdom", "France", "Italy", "Spain", "Türkiye", "Japan", "Thailand", "Portugal", "Greece"],
  regions: ["California", "Florida", "Hawaii", "New England", "Caribbean", "Tuscany", "Andalusia", "Provence", "Bavaria", "Cappadocia", "Bali", "Algarve"],
} as const;

/** SEO-friendly tabbed link lists. Countries/regions link to the search form prefilled with the name. */
export function PopularWithTravelers() {
  return (
    <section aria-labelledby="popular-travel">
      <h2 id="popular-travel" className="text-xl font-extrabold tracking-tight">
        Popular with travelers
      </h2>
      <Tabs defaultValue="cities" className="mt-3">
        <TabsList aria-label="Popular places">
          <TabsTrigger value="cities">Cities</TabsTrigger>
          <TabsTrigger value="countries">Countries</TabsTrigger>
          <TabsTrigger value="regions">Regions</TabsTrigger>
        </TabsList>
        {(Object.keys(POPULAR) as Array<keyof typeof POPULAR>).map((k) => (
          <TabsContent key={k} value={k}>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              {POPULAR[k].map((p) => (
                <li key={p}>
                  <Link href={`/travel/hotels?city=${encodeURIComponent(p)}`} className="text-sm text-text hover:text-hotels-soft-fg hover:underline">
                    Hotels in {p}
                  </Link>
                </li>
              ))}
            </ul>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
