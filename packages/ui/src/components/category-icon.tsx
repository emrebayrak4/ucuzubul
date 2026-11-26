import * as React from "react";
import {
  Baby,
  Bike,
  Car,
  CookingPot,
  Droplets,
  Gamepad2,
  Hammer,
  Laptop,
  MonitorSmartphone,
  Package,
  Paperclip,
  PawPrint,
  Puzzle,
  Refrigerator,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Plane,
  BedDouble,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn";

/** Category slug (DB) -> neutral line icon. Used as image fallback; never as decoration. */
export const categoryIcons: Readonly<Record<string, LucideIcon>> = {
  electronics: MonitorSmartphone,
  computers: Laptop,
  smartphones: Smartphone,
  gaming: Gamepad2,
  "home-kitchen": CookingPot,
  appliances: Refrigerator,
  fashion: Shirt,
  "beauty-personal-care": Droplets,
  "sports-outdoors": Bike,
  automotive: Car,
  "baby-kids": Baby,
  toys: Puzzle,
  grocery: ShoppingBasket,
  "pet-supplies": PawPrint,
  "office-supplies": Paperclip,
  "tools-home-improvement": Hammer,
  flights: Plane,
  hotels: BedDouble,
};

export function getCategoryIcon(slug?: string | null): LucideIcon {
  return (slug && categoryIcons[slug]) || Package;
}

export interface CategoryIconProps extends React.SVGAttributes<SVGSVGElement> {
  category?: string | null;
  size?: number;
}

export function CategoryIcon({ category, size = 24, className, ...props }: CategoryIconProps) {
  const Icon = getCategoryIcon(category);
  return <Icon aria-hidden size={size} strokeWidth={1.5} className={cn("text-text-muted", className)} {...props} />;
}
