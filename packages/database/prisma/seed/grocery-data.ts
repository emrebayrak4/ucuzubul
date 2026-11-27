/**
 * Grocery & everyday-item demo catalog (CPG). Real brand / product names, DEMO prices (source = "demo", labeled in UI).
 * Sizes are as printed on the package; each size is its own product (never merged), linked by `family` as a size family.
 * Dietary attributes are only set where the brand's own package claim says so (gluten-free / organic / non-GMO);
 * nothing is inferred.
 */

export type Basis = "oz" | "fl_oz" | "ct" | "sheet" | "load";

export interface GroceryItem {
  brand: string;
  /** Title including the size exactly as sold — parsed by @pricora/algorithms parseNetQuantity. */
  title: string;
  /** Typical shelf price in dollars (demo). */
  price: number;
  category: string;
  /** Size family key (same product line, different sizes). */
  family?: string;
  /** Preferred unit basis when several measures are stated (e.g. "ct" for pods / diapers). */
  basis?: Basis;
  dietary?: string[];
  /** Override retailer set (club packs: costco / sams-club). */
  retailers?: string[];
  attrs?: Record<string, string>;
}

export interface GroceryCategory {
  slug: string;
  name: string;
  parent: string;
  icon?: string;
}

/** New categories (existing grocery/coffee-tea, snacks, diapering, dog-food, cat-food stay as they are). */
export const GROCERY_CATEGORIES: GroceryCategory[] = [
  { slug: "breakfast-cereal", name: "Breakfast & Cereal", parent: "grocery" },
  { slug: "beverages", name: "Beverages", parent: "grocery" },
  { slug: "pantry", name: "Pantry Staples", parent: "grocery" },
  { slug: "household-essentials", name: "Household Essentials", parent: "", icon: "spray-can" },
  { slug: "laundry", name: "Laundry", parent: "household-essentials" },
  { slug: "cleaning-supplies", name: "Cleaning Supplies", parent: "household-essentials" },
  { slug: "paper-goods", name: "Paper Towels & Toilet Paper", parent: "household-essentials" },
  { slug: "personal-care", name: "Personal Care", parent: "household-essentials" },
];

/** Categories (subtrees) that show unit prices prominently. */
export const UNIT_PRICING_ROOTS = ["grocery", "household-essentials", "diapering", "dog-food", "cat-food", "cat-litter"];

/** Facets for the grocery-style leaves (brand is a built-in facet). */
export const GROCERY_FACETS = [
  { key: "size", label: "Size", attribute: "Size", sort: "numeric" },
  { key: "pack-count", label: "Pack count", attribute: "Pack count", sort: "numeric" },
  { key: "dietary", label: "Dietary", attribute: "Dietary", sort: "alpha" },
];

export const GROCERY_RETAILERS = ["walmart", "target", "kroger", "amazon"];
export const PHARMACY_RETAILERS = ["walmart", "target", "amazon", "walgreens", "cvs", "kroger"];
export const CLUB = ["costco", "sams-club"];

const GF = "Gluten-free";
const ORG = "Organic";
const NONGMO = "Non-GMO";

export const GROCERY_ITEMS: GroceryItem[] = [
  // Breakfast & Cereal — size families
  { brand: "Cheerios", title: "Cheerios Heart Healthy Cereal, 8.9 oz", price: 4.49, category: "breakfast-cereal", family: "cheerios-original", dietary: [GF] },
  { brand: "Cheerios", title: "Cheerios Heart Healthy Cereal, Family Size 18 oz", price: 6.29, category: "breakfast-cereal", family: "cheerios-original", dietary: [GF] },
  { brand: "Cheerios", title: "Cheerios Heart Healthy Cereal, 2 x 20.35 oz", price: 9.99, category: "breakfast-cereal", family: "cheerios-original", dietary: [GF], retailers: CLUB },
  { brand: "Cheerios", title: "Honey Nut Cheerios Cereal, 10.8 oz", price: 4.79, category: "breakfast-cereal", family: "honey-nut-cheerios", dietary: [GF] },
  { brand: "Cheerios", title: "Honey Nut Cheerios Cereal, Family Size 18.8 oz", price: 6.49, category: "breakfast-cereal", family: "honey-nut-cheerios", dietary: [GF] },
  { brand: "Cheerios", title: "Honey Nut Cheerios Cereal, 2 x 27.2 oz", price: 11.49, category: "breakfast-cereal", family: "honey-nut-cheerios", dietary: [GF], retailers: CLUB },
  { brand: "Kellogg's", title: "Kellogg's Frosted Flakes Cereal, 13.5 oz", price: 4.99, category: "breakfast-cereal", family: "frosted-flakes" },
  { brand: "Kellogg's", title: "Kellogg's Frosted Flakes Cereal, Family Size 24 oz", price: 6.99, category: "breakfast-cereal", family: "frosted-flakes" },
  { brand: "General Mills", title: "Cinnamon Toast Crunch Cereal, 12 oz", price: 4.79, category: "breakfast-cereal", family: "cinnamon-toast-crunch" },
  { brand: "General Mills", title: "Cinnamon Toast Crunch Cereal, Family Size 18.8 oz", price: 6.49, category: "breakfast-cereal", family: "cinnamon-toast-crunch" },
  { brand: "Chex", title: "Rice Chex Gluten Free Cereal, 12 oz", price: 4.69, category: "breakfast-cereal", dietary: [GF] },
  { brand: "Quaker", title: "Quaker Old Fashioned Oats, 18 oz", price: 4.29, category: "breakfast-cereal", family: "quaker-old-fashioned" },
  { brand: "Quaker", title: "Quaker Old Fashioned Oats, 42 oz", price: 6.99, category: "breakfast-cereal", family: "quaker-old-fashioned" },
  { brand: "Quaker", title: "Quaker Old Fashioned Oats, 2 x 5 lb", price: 12.99, category: "breakfast-cereal", family: "quaker-old-fashioned", retailers: CLUB },
  { brand: "Kodiak", title: "Kodiak Power Cakes Buttermilk Pancake Mix, 20 oz", price: 5.49, category: "breakfast-cereal" },
  { brand: "Nature's Path", title: "Nature's Path Organic Heritage Flakes Cereal, 13.25 oz", price: 5.29, category: "breakfast-cereal", dietary: [ORG, NONGMO] },

  // Beverages
  { brand: "Coca-Cola", title: "Coca-Cola Classic Soda, 12 fl oz, 12 Pack", price: 7.99, category: "beverages", family: "coca-cola-cans" },
  { brand: "Coca-Cola", title: "Coca-Cola Classic Soda, 12 fl oz, 35 Pack", price: 17.99, category: "beverages", family: "coca-cola-cans", retailers: CLUB },
  { brand: "Pepsi", title: "Pepsi Cola Soda, 12 fl oz, 12 Pack", price: 7.49, category: "beverages" },
  { brand: "LaCroix", title: "LaCroix Sparkling Water Pamplemousse, 12 fl oz, 12 Pack", price: 5.99, category: "beverages" },
  { brand: "Gatorade", title: "Gatorade Thirst Quencher Fruit Punch, 20 fl oz, 8 Pack", price: 8.49, category: "beverages" },
  { brand: "Poland Spring", title: "Poland Spring Natural Spring Water, 16.9 fl oz, 24 Pack", price: 6.49, category: "beverages", family: "poland-spring" },
  { brand: "Poland Spring", title: "Poland Spring Natural Spring Water, 16.9 fl oz, 40 Pack", price: 9.49, category: "beverages", family: "poland-spring", retailers: CLUB },
  { brand: "Tropicana", title: "Tropicana Pure Premium Orange Juice No Pulp, 52 fl oz", price: 4.99, category: "beverages" },
  { brand: "Horizon Organic", title: "Horizon Organic Whole Milk, 64 fl oz", price: 5.79, category: "beverages", dietary: [ORG] },

  // Pantry
  { brand: "Barilla", title: "Barilla Spaghetti Pasta, 16 oz", price: 1.89, category: "pantry", family: "barilla-spaghetti" },
  { brand: "Barilla", title: "Barilla Spaghetti Pasta, 6 x 16 oz", price: 9.49, category: "pantry", family: "barilla-spaghetti", retailers: [...CLUB, "amazon"] },
  { brand: "Kraft", title: "Kraft Macaroni & Cheese Dinner Original, 7.25 oz", price: 1.49, category: "pantry", family: "kraft-mac" },
  { brand: "Kraft", title: "Kraft Macaroni & Cheese Dinner Original, 7.25 oz, 5 Pack", price: 5.99, category: "pantry", family: "kraft-mac" },
  { brand: "Annie's", title: "Annie's Organic Shells & White Cheddar Mac and Cheese, 6 oz", price: 2.29, category: "pantry", dietary: [ORG] },
  { brand: "Jif", title: "Jif Creamy Peanut Butter, 16 oz", price: 3.49, category: "pantry", family: "jif-creamy" },
  { brand: "Jif", title: "Jif Creamy Peanut Butter, 40 oz", price: 7.49, category: "pantry", family: "jif-creamy" },
  { brand: "Jif", title: "Jif Creamy Peanut Butter, 2 x 48 oz", price: 13.99, category: "pantry", family: "jif-creamy", retailers: CLUB },
  { brand: "Heinz", title: "Heinz Tomato Ketchup, 32 oz", price: 4.29, category: "pantry" },
  { brand: "Hellmann's", title: "Hellmann's Real Mayonnaise, 30 fl oz", price: 5.99, category: "pantry" },
  { brand: "Campbell's", title: "Campbell's Condensed Chicken Noodle Soup, 10.75 oz", price: 1.59, category: "pantry" },
  { brand: "Domino", title: "Domino Granulated Sugar, 4 lb", price: 3.99, category: "pantry" },
  { brand: "King Arthur", title: "King Arthur All-Purpose Flour, 5 lb", price: 5.49, category: "pantry", dietary: [NONGMO] },
  { brand: "Ben's Original", title: "Ben's Original Long Grain White Rice, 2 lb", price: 3.99, category: "pantry" },
  { brand: "Bertolli", title: "Bertolli Extra Virgin Olive Oil, 25.5 fl oz", price: 10.99, category: "pantry" },

  // Snacks (existing category)
  { brand: "Lay's", title: "Lay's Classic Potato Chips, Party Size 13 oz", price: 5.99, category: "snacks", dietary: [GF] },
  { brand: "Doritos", title: "Doritos Nacho Cheese Tortilla Chips, Party Size 14.5 oz", price: 6.49, category: "snacks" },
  { brand: "Pepperidge Farm", title: "Goldfish Cheddar Crackers, 30 oz", price: 9.99, category: "snacks" },
  { brand: "Oreo", title: "Oreo Chocolate Sandwich Cookies, Family Size 18.12 oz", price: 5.49, category: "snacks" },
  { brand: "Cheez-It", title: "Cheez-It Original Baked Snack Crackers, 21 oz", price: 6.99, category: "snacks" },
  { brand: "Nature Valley", title: "Nature Valley Crunchy Oats 'n Honey Granola Bars, 12 Count", price: 4.29, category: "snacks", basis: "ct" },

  // Coffee (existing categories)
  { brand: "Folgers", title: "Folgers Classic Roast Ground Coffee, 25.9 oz", price: 11.99, category: "coffee-beans", family: "folgers-classic" },
  { brand: "Folgers", title: "Folgers Classic Roast Ground Coffee, 43.5 oz", price: 17.99, category: "coffee-beans", family: "folgers-classic", retailers: [...CLUB, "walmart", "amazon"] },
  { brand: "Starbucks", title: "Starbucks Pike Place Roast K-Cup Pods, 22 Count", price: 15.99, category: "k-cups-pods", family: "starbucks-pike-kcup", basis: "ct" },
  { brand: "Starbucks", title: "Starbucks Pike Place Roast K-Cup Pods, 72 Count", price: 42.99, category: "k-cups-pods", family: "starbucks-pike-kcup", basis: "ct", retailers: [...CLUB, "amazon", "target"] },

  // Baby care (existing diapering)
  { brand: "Pampers", title: "Pampers Swaddlers Diapers Size 1, 84 Count", price: 29.99, category: "diapers", family: "pampers-swaddlers-1", basis: "ct" },
  { brand: "Pampers", title: "Pampers Swaddlers Diapers Size 1, 198 Count", price: 59.99, category: "diapers", family: "pampers-swaddlers-1", basis: "ct", retailers: [...CLUB, "amazon", "walmart", "target"] },
  { brand: "Huggies", title: "Huggies Little Snugglers Diapers Size 2, 132 Count", price: 44.99, category: "diapers", basis: "ct" },
  { brand: "Pampers", title: "Pampers Cruisers 360 Diapers Size 4, 116 Count", price: 54.99, category: "diapers", basis: "ct" },
  { brand: "Kirkland Signature", title: "Kirkland Signature Diapers Size 3, 174 Count", price: 47.99, category: "diapers", basis: "ct", retailers: ["costco"] },
  { brand: "Huggies", title: "Huggies Natural Care Sensitive Baby Wipes, 3 Packs of 56", price: 9.99, category: "wipes", family: "huggies-natural-care", basis: "ct" },
  { brand: "Huggies", title: "Huggies Natural Care Sensitive Baby Wipes, 12 Packs of 56", price: 29.99, category: "wipes", family: "huggies-natural-care", basis: "ct", retailers: [...CLUB, "amazon", "walmart"] },

  // Laundry
  { brand: "Tide", title: "Tide Original Liquid Laundry Detergent, 92 fl oz, 64 Loads", price: 14.99, category: "laundry", family: "tide-original-liquid", basis: "load" },
  { brand: "Tide", title: "Tide Original Liquid Laundry Detergent, 146 fl oz, 107 Loads", price: 24.99, category: "laundry", family: "tide-original-liquid", basis: "load", retailers: [...CLUB, "walmart", "amazon"] },
  { brand: "Tide", title: "Tide PODS Original Laundry Detergent Pacs, 42 Count", price: 14.99, category: "laundry", family: "tide-pods", basis: "ct" },
  { brand: "Tide", title: "Tide PODS Original Laundry Detergent Pacs, 81 Count", price: 24.99, category: "laundry", family: "tide-pods", basis: "ct" },
  { brand: "Gain", title: "Gain Original Liquid Laundry Detergent, 88 fl oz, 64 Loads", price: 12.99, category: "laundry", basis: "load" },
  { brand: "Arm & Hammer", title: "Arm & Hammer Clean Burst Liquid Laundry Detergent, 100.5 fl oz, 72 Loads", price: 8.99, category: "laundry", basis: "load" },
  { brand: "Persil", title: "Persil ProClean Original Liquid Laundry Detergent, 82.5 fl oz, 55 Loads", price: 13.99, category: "laundry", basis: "load" },

  // Cleaning
  { brand: "Clorox", title: "Clorox Disinfecting Wipes Fresh Scent, 3 Packs of 75", price: 12.49, category: "cleaning-supplies", basis: "ct" },
  { brand: "Lysol", title: "Lysol Disinfectant Spray Crisp Linen, 19 oz", price: 7.49, category: "cleaning-supplies" },
  { brand: "Dawn", title: "Dawn Ultra Dishwashing Liquid Original, 19.4 fl oz", price: 3.99, category: "cleaning-supplies", family: "dawn-ultra" },
  { brand: "Dawn", title: "Dawn Ultra Dishwashing Liquid Original, 2 x 56 fl oz", price: 14.99, category: "cleaning-supplies", family: "dawn-ultra", retailers: CLUB },
  { brand: "Cascade", title: "Cascade Platinum Plus Dishwasher Pods, 62 Count", price: 21.99, category: "cleaning-supplies", basis: "ct" },
  { brand: "Seventh Generation", title: "Seventh Generation Free & Clear Dish Liquid, 19 fl oz", price: 4.49, category: "cleaning-supplies" },

  // Paper goods
  { brand: "Bounty", title: "Bounty Select-A-Size Paper Towels, 6 Double Rolls, 98 Sheets per Roll", price: 13.99, category: "paper-goods", family: "bounty-sas", basis: "sheet" },
  { brand: "Bounty", title: "Bounty Select-A-Size Paper Towels, 12 Double Rolls, 98 Sheets per Roll", price: 25.99, category: "paper-goods", family: "bounty-sas", basis: "sheet", retailers: [...CLUB, "amazon", "walmart", "target"] },
  { brand: "Charmin", title: "Charmin Ultra Soft Toilet Paper, 6 Mega Rolls, 224 Sheets per Roll", price: 9.49, category: "paper-goods", family: "charmin-ultra-soft", basis: "sheet" },
  { brand: "Charmin", title: "Charmin Ultra Soft Toilet Paper, 18 Mega Rolls, 224 Sheets per Roll", price: 24.99, category: "paper-goods", family: "charmin-ultra-soft", basis: "sheet" },
  { brand: "Kleenex", title: "Kleenex Ultra Soft Facial Tissues, 4 Boxes, 120 Sheets per Box", price: 7.99, category: "paper-goods", basis: "sheet", attrs: { Note: "4 × 120 tissues" } },
  { brand: "Scott", title: "Scott 1000 Toilet Paper, 12 Rolls, 1000 Sheets per Roll", price: 11.99, category: "paper-goods", basis: "sheet" },

  // Personal care
  { brand: "Crest", title: "Crest Pro-Health Advanced Toothpaste, 5.1 oz, 3 Pack", price: 12.99, category: "personal-care" },
  { brand: "Colgate", title: "Colgate Total Whitening Toothpaste, 4.8 oz", price: 4.49, category: "personal-care" },
  { brand: "Dove", title: "Dove Deep Moisture Body Wash, 22 fl oz", price: 8.99, category: "personal-care" },
  { brand: "Head & Shoulders", title: "Head & Shoulders Classic Clean Shampoo, 13.5 fl oz", price: 7.99, category: "personal-care" },
  { brand: "Degree", title: "Degree Men Original Antiperspirant Deodorant, 2.7 oz, 2 Pack", price: 8.49, category: "personal-care" },
  { brand: "Gillette", title: "Gillette Fusion5 Razor Blade Refills, 8 Count", price: 29.99, category: "personal-care", basis: "ct" },

  // Pet food (existing categories)
  { brand: "Purina Pro Plan", title: "Purina Pro Plan Adult Chicken & Rice Dry Dog Food, 18 lb", price: 54.99, category: "dog-food", family: "pro-plan-chicken-rice" },
  { brand: "Purina Pro Plan", title: "Purina Pro Plan Adult Chicken & Rice Dry Dog Food, 35 lb", price: 82.99, category: "dog-food", family: "pro-plan-chicken-rice" },
  { brand: "Blue Buffalo", title: "Blue Buffalo Life Protection Formula Adult Chicken & Brown Rice Dry Dog Food, 30 lb", price: 69.99, category: "dog-food" },
  { brand: "Meow Mix", title: "Meow Mix Original Choice Dry Cat Food, 16 lb", price: 19.99, category: "cat-food" },
  { brand: "Fresh Step", title: "Fresh Step Clean Paws Clumping Cat Litter, 25 lb", price: 19.49, category: "cat-litter" },
];

/** Demo store locations near real ZIP centroids. Names are prefixed "Demo" — they are not real stores. */
export interface DemoLocation {
  retailer: string;
  zip: string;
  area: string;
  hours?: "standard" | "late" | "pharmacy";
}

export const DEMO_METROS: { zips: string[]; label: string }[] = [
  { label: "New York", zips: ["10001", "10011", "10016", "10003", "11211", "07302"] },
  { label: "Chicago", zips: ["60614", "60657", "60611", "60622"] },
  { label: "Austin", zips: ["78701", "78704", "78751", "78745"] },
  { label: "Cincinnati", zips: ["45202", "45209", "45219"] },
];

export const CHAIN_LOCATIONS: DemoLocation[] = [
  // New York
  { retailer: "target", zip: "10011", area: "Chelsea" },
  { retailer: "walgreens", zip: "10001", area: "Midtown", hours: "pharmacy" },
  { retailer: "cvs", zip: "10016", area: "Murray Hill", hours: "pharmacy" },
  { retailer: "cvs", zip: "10003", area: "East Village", hours: "late" },
  { retailer: "walmart", zip: "07302", area: "Jersey City" },
  { retailer: "costco", zip: "11211", area: "Brooklyn" },
  // Chicago
  { retailer: "target", zip: "60614", area: "Lincoln Park" },
  { retailer: "walgreens", zip: "60657", area: "Lakeview", hours: "pharmacy" },
  { retailer: "kroger", zip: "60622", area: "Wicker Park" },
  { retailer: "costco", zip: "60611", area: "Near North" },
  // Austin
  { retailer: "walmart", zip: "78745", area: "South Austin" },
  { retailer: "target", zip: "78704", area: "South Lamar" },
  { retailer: "sams-club", zip: "78751", area: "Hyde Park" },
  { retailer: "cvs", zip: "78701", area: "Downtown", hours: "pharmacy" },
  // Cincinnati (Kroger home market)
  { retailer: "kroger", zip: "45202", area: "Downtown" },
  { retailer: "kroger", zip: "45209", area: "Oakley" },
  { retailer: "kroger", zip: "45219", area: "Clifton" },
  { retailer: "walmart", zip: "45209", area: "Norwood" },
];

/** Demo independent shops (local sellers) — fictional, prefixed "Demo". */
export interface DemoLocalShop {
  slug: string;
  name: string;
  zip: string;
  address: string;
  category: string;
  deliveryRadiusMiles: number | null;
  pickupMinimumCents: number | null;
  deliveryMinimumCents: number | null;
  /** Fraction of the grocery catalog it stocks (deterministic subset). */
  share: number;
  /** Store price vs. typical shelf price. */
  priceFactor: number;
  sponsored?: boolean;
}

export const DEMO_LOCAL_SHOPS: DemoLocalShop[] = [
  { slug: "demo-chelsea-corner-market", name: "Demo Chelsea Corner Market", zip: "10011", address: "Demo address (approx.)", category: "grocery", deliveryRadiusMiles: 2, pickupMinimumCents: null, deliveryMinimumCents: 2500, share: 0.55, priceFactor: 1.08, sponsored: true },
  { slug: "demo-midtown-deli-grocery", name: "Demo Midtown Deli & Grocery", zip: "10001", address: "Demo address (approx.)", category: "convenience", deliveryRadiusMiles: 1, pickupMinimumCents: null, deliveryMinimumCents: 1500, share: 0.35, priceFactor: 1.15 },
  { slug: "demo-williamsburg-green-grocer", name: "Demo Williamsburg Green Grocer", zip: "11211", address: "Demo address (approx.)", category: "grocery", deliveryRadiusMiles: 3, pickupMinimumCents: 1000, deliveryMinimumCents: 3500, share: 0.45, priceFactor: 1.02 },
  { slug: "demo-lincoln-park-pharmacy", name: "Demo Lincoln Park Pharmacy", zip: "60614", address: "Demo address (approx.)", category: "pharmacy", deliveryRadiusMiles: null, pickupMinimumCents: null, deliveryMinimumCents: null, share: 0.3, priceFactor: 1.05 },
  { slug: "demo-south-congress-market", name: "Demo South Congress Market", zip: "78704", address: "Demo address (approx.)", category: "grocery", deliveryRadiusMiles: 4, pickupMinimumCents: null, deliveryMinimumCents: 3000, share: 0.5, priceFactor: 0.99 },
];

/** Pending applications for the moderation queue (fictional businesses). */
export const DEMO_PENDING_APPLICATIONS = [
  { email: "demo-applicant-1@example.test", companyName: "Demo Hudson Hardware", legalName: "Demo Hudson Hardware LLC", phone: "(212) 555-0101", category: "hardware", zip: "10014", state: "NY", city: "New York", address: "Demo address 1", website: null, hours: true },
  { email: "demo-applicant-2@example.test", companyName: "Demo Eastside Pet Pantry", legalName: "Demo Eastside Pet Pantry Inc.", phone: "(512) 555-0142", category: "pet", zip: "78702", state: "CA", city: "Austin", address: "Demo address 2", website: "https://example.com", hours: false },
];
