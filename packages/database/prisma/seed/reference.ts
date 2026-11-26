/**
 * Reference seed data: categories, retailers, airports, airlines.
 * Retailers are real US stores. NO trust scores, NO ratings; integration status starts as pending_configuration.
 * Retailer logos are not seeded (trademarks) — UI renders a text tile using brandColor.
 */

export interface SeedCategory {
  slug: string;
  name: string;
  icon: string;
  children?: { slug: string; name: string }[];
}

/** 16 top-level categories from MASTER_PLAN, with subcategories. */
export const CATEGORIES: SeedCategory[] = [
  { slug: "electronics", name: "Electronics", icon: "tv", children: [
    { slug: "tv-home-theater", name: "TVs & Home Theater" },
    { slug: "headphones-audio", name: "Headphones & Audio" },
    { slug: "cameras", name: "Cameras" },
    { slug: "wearables", name: "Wearables" },
  ] },
  { slug: "computers", name: "Computers", icon: "laptop", children: [
    { slug: "laptops", name: "Laptops" },
    { slug: "tablets", name: "Tablets" },
    { slug: "monitors", name: "Monitors" },
    { slug: "computer-accessories", name: "Computer Accessories" },
  ] },
  { slug: "smartphones", name: "Smartphones", icon: "smartphone", children: [
    { slug: "unlocked-phones", name: "Unlocked Phones" },
    { slug: "phone-accessories", name: "Phone Accessories" },
  ] },
  { slug: "gaming", name: "Gaming", icon: "gamepad", children: [
    { slug: "consoles", name: "Consoles & VR" },
    { slug: "video-games", name: "Video Games" },
    { slug: "gaming-accessories", name: "Controllers & Accessories" },
  ] },
  { slug: "home-kitchen", name: "Home & Kitchen", icon: "cooking-pot", children: [
    { slug: "small-kitchen-appliances", name: "Small Kitchen Appliances" },
    { slug: "coffee-espresso", name: "Coffee & Espresso Machines" },
    { slug: "cookware", name: "Cookware" },
  ] },
  { slug: "appliances", name: "Appliances", icon: "washing-machine", children: [
    { slug: "vacuums-floor-care", name: "Vacuums & Floor Care" },
    { slug: "laundry", name: "Washers & Dryers" },
  ] },
  { slug: "fashion", name: "Fashion", icon: "shirt", children: [
    { slug: "shoes", name: "Shoes" },
    { slug: "clothing", name: "Clothing" },
    { slug: "accessories", name: "Accessories" },
  ] },
  { slug: "beauty-personal-care", name: "Beauty & Personal Care", icon: "sparkles", children: [
    { slug: "hair-tools", name: "Hair Tools" },
    { slug: "skincare", name: "Skincare" },
    { slug: "oral-care", name: "Oral Care" },
  ] },
  { slug: "sports-outdoors", name: "Sports & Outdoors", icon: "bike", children: [
    { slug: "fitness", name: "Fitness Equipment" },
    { slug: "camping-hiking", name: "Camping & Hiking" },
    { slug: "drinkware", name: "Drinkware" },
  ] },
  { slug: "automotive", name: "Automotive", icon: "car", children: [
    { slug: "car-electronics", name: "Car Electronics" },
    { slug: "car-care", name: "Car Care" },
  ] },
  { slug: "baby-kids", name: "Baby & Kids", icon: "baby", children: [
    { slug: "strollers-car-seats", name: "Strollers & Car Seats" },
    { slug: "diapering", name: "Diapering" },
  ] },
  { slug: "toys", name: "Toys", icon: "blocks", children: [
    { slug: "building-sets", name: "Building Sets" },
    { slug: "dolls-playsets", name: "Dolls & Playsets" },
  ] },
  { slug: "grocery", name: "Grocery", icon: "shopping-basket", children: [
    { slug: "coffee-tea", name: "Coffee & Tea" },
  ] },
  { slug: "pet-supplies", name: "Pet Supplies", icon: "paw-print", children: [
    { slug: "dog-supplies", name: "Dog Supplies" },
    { slug: "cat-supplies", name: "Cat Supplies" },
  ] },
  { slug: "office-supplies", name: "Office Supplies", icon: "printer", children: [
    { slug: "printers", name: "Printers" },
    { slug: "office-furniture", name: "Office Furniture" },
  ] },
  { slug: "tools-home-improvement", name: "Tools & Home Improvement", icon: "hammer", children: [
    { slug: "power-tools", name: "Power Tools" },
    { slug: "smart-home", name: "Smart Home" },
  ] },
];

export interface SeedRetailer {
  slug: string;
  name: string;
  domain: string;
  brandColor: string;
  /** Search URL template; `{q}` is replaced by the URL-encoded product title. Lands on a real search page. */
  searchUrl: string;
  freeShippingThresholdCents: number | null;
  membershipName: string | null;
  membershipKey: string | null;
  /** Retailer publishes an official product API → seed a pending_configuration integration row. */
  officialApi: { provider: string; kind: "retailer_api" | "affiliate_network" } | null;
  /** Prices typically end in .00 (e.g. Apple) instead of .99. */
  roundDollars?: boolean;
}

export const RETAILERS: SeedRetailer[] = [
  { slug: "amazon", name: "Amazon", domain: "amazon.com", brandColor: "#FF9900", searchUrl: "https://www.amazon.com/s?k={q}", freeShippingThresholdCents: 3500, membershipName: "Prime", membershipKey: "amazon-prime", officialApi: { provider: "amazon-paapi", kind: "retailer_api" } },
  { slug: "walmart", name: "Walmart", domain: "walmart.com", brandColor: "#0071DC", searchUrl: "https://www.walmart.com/search?q={q}", freeShippingThresholdCents: 3500, membershipName: "Walmart+", membershipKey: "walmart-plus", officialApi: { provider: "walmart-affiliate-api", kind: "retailer_api" } },
  { slug: "best-buy", name: "Best Buy", domain: "bestbuy.com", brandColor: "#0046BE", searchUrl: "https://www.bestbuy.com/site/searchpage.jsp?st={q}", freeShippingThresholdCents: 3500, membershipName: "My Best Buy Plus", membershipKey: "bestbuy-plus", officialApi: { provider: "bestbuy-products-api", kind: "retailer_api" } },
  { slug: "target", name: "Target", domain: "target.com", brandColor: "#CC0000", searchUrl: "https://www.target.com/s?searchTerm={q}", freeShippingThresholdCents: 3500, membershipName: "Target Circle 360", membershipKey: "target-circle-360", officialApi: null },
  { slug: "ebay", name: "eBay", domain: "ebay.com", brandColor: "#E53238", searchUrl: "https://www.ebay.com/sch/i.html?_nkw={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: { provider: "ebay-browse-api", kind: "retailer_api" } },
  { slug: "costco", name: "Costco", domain: "costco.com", brandColor: "#005DAA", searchUrl: "https://www.costco.com/CatalogSearch?keyword={q}", freeShippingThresholdCents: null, membershipName: "Costco Membership", membershipKey: "costco", officialApi: null },
  { slug: "home-depot", name: "The Home Depot", domain: "homedepot.com", brandColor: "#F96302", searchUrl: "https://www.homedepot.com/s/{q}", freeShippingThresholdCents: 4500, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "lowes", name: "Lowe's", domain: "lowes.com", brandColor: "#004990", searchUrl: "https://www.lowes.com/search?searchTerm={q}", freeShippingThresholdCents: 4500, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "newegg", name: "Newegg", domain: "newegg.com", brandColor: "#F7A71B", searchUrl: "https://www.newegg.com/p/pl?d={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "bh-photo", name: "B&H Photo", domain: "bhphotovideo.com", brandColor: "#1F2A44", searchUrl: "https://www.bhphotovideo.com/c/search?q={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "macys", name: "Macy's", domain: "macys.com", brandColor: "#E21A2C", searchUrl: "https://www.macys.com/shop/search?keyword={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "kohls", name: "Kohl's", domain: "kohls.com", brandColor: "#860035", searchUrl: "https://www.kohls.com/search.jsp?search={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "nordstrom", name: "Nordstrom", domain: "nordstrom.com", brandColor: "#111111", searchUrl: "https://www.nordstrom.com/sr?keyword={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "sephora", name: "Sephora", domain: "sephora.com", brandColor: "#000000", searchUrl: "https://www.sephora.com/search?keyword={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "ulta", name: "Ulta Beauty", domain: "ulta.com", brandColor: "#E86C2C", searchUrl: "https://www.ulta.com/search?search={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "chewy", name: "Chewy", domain: "chewy.com", brandColor: "#1C49C2", searchUrl: "https://www.chewy.com/s?query={q}", freeShippingThresholdCents: 4900, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "dicks", name: "Dick's Sporting Goods", domain: "dickssportinggoods.com", brandColor: "#006341", searchUrl: "https://www.dickssportinggoods.com/search/SearchDisplay?searchTerm={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "staples", name: "Staples", domain: "staples.com", brandColor: "#CC0000", searchUrl: "https://www.staples.com/search?query={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "wayfair", name: "Wayfair", domain: "wayfair.com", brandColor: "#7F187F", searchUrl: "https://www.wayfair.com/keyword.php?keyword={q}", freeShippingThresholdCents: 3500, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "gamestop", name: "GameStop", domain: "gamestop.com", brandColor: "#E2231A", searchUrl: "https://www.gamestop.com/search/?q={q}", freeShippingThresholdCents: null, membershipName: null, membershipKey: null, officialApi: null },
  { slug: "apple", name: "Apple", domain: "apple.com", brandColor: "#1D1D1F", searchUrl: "https://www.apple.com/us/search/{q}", freeShippingThresholdCents: 0, membershipName: null, membershipKey: null, officialApi: null, roundDollars: true },
  { slug: "back-market", name: "Back Market", domain: "backmarket.com", brandColor: "#0C0C0C", searchUrl: "https://www.backmarket.com/en-us/search?q={q}", freeShippingThresholdCents: 0, membershipName: null, membershipKey: null, officialApi: null },
];

/** [iata, icao, name, city, region, country, lat, lon, timezone, rank] */
export type AirportRow = [string, string | null, string, string, string | null, string, number, number, string, number];

export const AIRPORTS: AirportRow[] = [
  ["ATL", "KATL", "Hartsfield–Jackson Atlanta International Airport", "Atlanta", "GA", "US", 33.6407, -84.4277, "America/New_York", 100],
  ["LAX", "KLAX", "Los Angeles International Airport", "Los Angeles", "CA", "US", 33.9416, -118.4085, "America/Los_Angeles", 99],
  ["ORD", "KORD", "O'Hare International Airport", "Chicago", "IL", "US", 41.9742, -87.9073, "America/Chicago", 98],
  ["DFW", "KDFW", "Dallas/Fort Worth International Airport", "Dallas", "TX", "US", 32.8998, -97.0403, "America/Chicago", 97],
  ["DEN", "KDEN", "Denver International Airport", "Denver", "CO", "US", 39.8561, -104.6737, "America/Denver", 96],
  ["JFK", "KJFK", "John F. Kennedy International Airport", "New York", "NY", "US", 40.6413, -73.7781, "America/New_York", 99],
  ["SFO", "KSFO", "San Francisco International Airport", "San Francisco", "CA", "US", 37.6213, -122.379, "America/Los_Angeles", 95],
  ["SEA", "KSEA", "Seattle–Tacoma International Airport", "Seattle", "WA", "US", 47.4502, -122.3088, "America/Los_Angeles", 93],
  ["LAS", "KLAS", "Harry Reid International Airport", "Las Vegas", "NV", "US", 36.084, -115.1537, "America/Los_Angeles", 94],
  ["MCO", "KMCO", "Orlando International Airport", "Orlando", "FL", "US", 28.4312, -81.3081, "America/New_York", 94],
  ["EWR", "KEWR", "Newark Liberty International Airport", "Newark", "NJ", "US", 40.6895, -74.1745, "America/New_York", 92],
  ["CLT", "KCLT", "Charlotte Douglas International Airport", "Charlotte", "NC", "US", 35.214, -80.9431, "America/New_York", 90],
  ["PHX", "KPHX", "Phoenix Sky Harbor International Airport", "Phoenix", "AZ", "US", 33.4342, -112.0116, "America/Phoenix", 90],
  ["IAH", "KIAH", "George Bush Intercontinental Airport", "Houston", "TX", "US", 29.9902, -95.3368, "America/Chicago", 90],
  ["MIA", "KMIA", "Miami International Airport", "Miami", "FL", "US", 25.7959, -80.287, "America/New_York", 93],
  ["BOS", "KBOS", "Boston Logan International Airport", "Boston", "MA", "US", 42.3656, -71.0096, "America/New_York", 91],
  ["MSP", "KMSP", "Minneapolis–Saint Paul International Airport", "Minneapolis", "MN", "US", 44.8848, -93.2223, "America/Chicago", 86],
  ["FLL", "KFLL", "Fort Lauderdale–Hollywood International Airport", "Fort Lauderdale", "FL", "US", 26.0742, -80.1506, "America/New_York", 85],
  ["DTW", "KDTW", "Detroit Metropolitan Wayne County Airport", "Detroit", "MI", "US", 42.2162, -83.3554, "America/Detroit", 84],
  ["PHL", "KPHL", "Philadelphia International Airport", "Philadelphia", "PA", "US", 39.8744, -75.2424, "America/New_York", 84],
  ["LGA", "KLGA", "LaGuardia Airport", "New York", "NY", "US", 40.7769, -73.874, "America/New_York", 92],
  ["BWI", "KBWI", "Baltimore/Washington International Airport", "Baltimore", "MD", "US", 39.1774, -76.6684, "America/New_York", 82],
  ["SLC", "KSLC", "Salt Lake City International Airport", "Salt Lake City", "UT", "US", 40.7899, -111.9791, "America/Denver", 82],
  ["SAN", "KSAN", "San Diego International Airport", "San Diego", "CA", "US", 32.7338, -117.1933, "America/Los_Angeles", 83],
  ["IAD", "KIAD", "Washington Dulles International Airport", "Washington", "VA", "US", 38.9531, -77.4565, "America/New_York", 85],
  ["DCA", "KDCA", "Ronald Reagan Washington National Airport", "Washington", "VA", "US", 38.8512, -77.0402, "America/New_York", 85],
  ["MDW", "KMDW", "Chicago Midway International Airport", "Chicago", "IL", "US", 41.7868, -87.7522, "America/Chicago", 80],
  ["TPA", "KTPA", "Tampa International Airport", "Tampa", "FL", "US", 27.9755, -82.5332, "America/New_York", 80],
  ["PDX", "KPDX", "Portland International Airport", "Portland", "OR", "US", 45.5898, -122.5951, "America/Los_Angeles", 79],
  ["HNL", "PHNL", "Daniel K. Inouye International Airport", "Honolulu", "HI", "US", 21.3187, -157.9225, "Pacific/Honolulu", 80],
  ["AUS", "KAUS", "Austin–Bergstrom International Airport", "Austin", "TX", "US", 30.1975, -97.6664, "America/Chicago", 81],
  ["BNA", "KBNA", "Nashville International Airport", "Nashville", "TN", "US", 36.1263, -86.6774, "America/Chicago", 80],
  ["DAL", "KDAL", "Dallas Love Field", "Dallas", "TX", "US", 32.8471, -96.8518, "America/Chicago", 74],
  ["HOU", "KHOU", "William P. Hobby Airport", "Houston", "TX", "US", 29.6454, -95.2789, "America/Chicago", 74],
  ["STL", "KSTL", "St. Louis Lambert International Airport", "St. Louis", "MO", "US", 38.7487, -90.37, "America/Chicago", 72],
  ["MSY", "KMSY", "Louis Armstrong New Orleans International Airport", "New Orleans", "LA", "US", 29.9934, -90.258, "America/Chicago", 75],
  ["RDU", "KRDU", "Raleigh–Durham International Airport", "Raleigh", "NC", "US", 35.8801, -78.788, "America/New_York", 72],
  ["SJC", "KSJC", "San José Mineta International Airport", "San Jose", "CA", "US", 37.3639, -121.9289, "America/Los_Angeles", 72],
  ["OAK", "KOAK", "Oakland International Airport", "Oakland", "CA", "US", 37.7126, -122.2197, "America/Los_Angeles", 70],
  ["SMF", "KSMF", "Sacramento International Airport", "Sacramento", "CA", "US", 38.6954, -121.5908, "America/Los_Angeles", 68],
  ["SNA", "KSNA", "John Wayne Airport", "Santa Ana", "CA", "US", 33.6762, -117.8675, "America/Los_Angeles", 68],
  ["ANC", "PANC", "Ted Stevens Anchorage International Airport", "Anchorage", "AK", "US", 61.1743, -149.9963, "America/Anchorage", 60],
  ["YYZ", "CYYZ", "Toronto Pearson International Airport", "Toronto", "ON", "CA", 43.6777, -79.6248, "America/Toronto", 78],
  ["YVR", "CYVR", "Vancouver International Airport", "Vancouver", "BC", "CA", 49.1967, -123.1815, "America/Vancouver", 72],
  ["MEX", "MMMX", "Mexico City International Airport", "Mexico City", null, "MX", 19.4361, -99.0719, "America/Mexico_City", 76],
  ["CUN", "MMUN", "Cancún International Airport", "Cancún", "QR", "MX", 21.0365, -86.877, "America/Cancun", 77],
  ["LHR", "EGLL", "Heathrow Airport", "London", "England", "GB", 51.47, -0.4543, "Europe/London", 90],
  ["CDG", "LFPG", "Paris Charles de Gaulle Airport", "Paris", null, "FR", 49.0097, 2.5479, "Europe/Paris", 88],
  ["FRA", "EDDF", "Frankfurt Airport", "Frankfurt", "Hesse", "DE", 50.0379, 8.5622, "Europe/Berlin", 84],
  ["AMS", "EHAM", "Amsterdam Airport Schiphol", "Amsterdam", null, "NL", 52.3105, 4.7683, "Europe/Amsterdam", 84],
  ["MAD", "LEMD", "Adolfo Suárez Madrid–Barajas Airport", "Madrid", null, "ES", 40.4983, -3.5676, "Europe/Madrid", 80],
  ["FCO", "LIRF", "Leonardo da Vinci–Fiumicino Airport", "Rome", null, "IT", 41.8003, 12.2389, "Europe/Rome", 80],
  ["DUB", "EIDW", "Dublin Airport", "Dublin", null, "IE", 53.4264, -6.2499, "Europe/Dublin", 74],
  ["IST", "LTFM", "Istanbul Airport", "Istanbul", null, "TR", 41.2753, 28.7519, "Europe/Istanbul", 82],
  ["DXB", "OMDB", "Dubai International Airport", "Dubai", null, "AE", 25.2532, 55.3657, "Asia/Dubai", 86],
  ["DOH", "OTHH", "Hamad International Airport", "Doha", null, "QA", 25.2731, 51.6081, "Asia/Qatar", 78],
  ["NRT", "RJAA", "Narita International Airport", "Tokyo", null, "JP", 35.772, 140.3929, "Asia/Tokyo", 82],
  ["HND", "RJTT", "Tokyo Haneda Airport", "Tokyo", null, "JP", 35.5494, 139.7798, "Asia/Tokyo", 84],
  ["ICN", "RKSI", "Incheon International Airport", "Seoul", null, "KR", 37.4602, 126.4407, "Asia/Seoul", 80],
  ["HKG", "VHHH", "Hong Kong International Airport", "Hong Kong", null, "HK", 22.308, 113.9185, "Asia/Hong_Kong", 78],
  ["SIN", "WSSS", "Singapore Changi Airport", "Singapore", null, "SG", 1.3644, 103.9915, "Asia/Singapore", 80],
  ["SYD", "YSSY", "Sydney Kingsford Smith Airport", "Sydney", "NSW", "AU", -33.9399, 151.1753, "Australia/Sydney", 76],
  ["GRU", "SBGR", "São Paulo/Guarulhos International Airport", "São Paulo", "SP", "BR", -23.4356, -46.4731, "America/Sao_Paulo", 74],
  ["SJU", "TJSJ", "Luis Muñoz Marín International Airport", "San Juan", "PR", "US", 18.4394, -66.0018, "America/Puerto_Rico", 70],
];

/** [iata, icao, name, country] */
export const AIRLINES: [string, string, string, string][] = [
  ["AA", "AAL", "American Airlines", "US"],
  ["DL", "DAL", "Delta Air Lines", "US"],
  ["UA", "UAL", "United Airlines", "US"],
  ["WN", "SWA", "Southwest Airlines", "US"],
  ["B6", "JBU", "JetBlue", "US"],
  ["AS", "ASA", "Alaska Airlines", "US"],
  ["NK", "NKS", "Spirit Airlines", "US"],
  ["F9", "FFT", "Frontier Airlines", "US"],
  ["HA", "HAL", "Hawaiian Airlines", "US"],
  ["AC", "ACA", "Air Canada", "CA"],
  ["BA", "BAW", "British Airways", "GB"],
  ["LH", "DLH", "Lufthansa", "DE"],
  ["AF", "AFR", "Air France", "FR"],
  ["EK", "UAE", "Emirates", "AE"],
  ["TK", "THY", "Turkish Airlines", "TR"],
  ["QR", "QTR", "Qatar Airways", "QA"],
  ["JL", "JAL", "Japan Airlines", "JP"],
  ["AM", "AMX", "Aeroméxico", "MX"],
];

export interface SeedHotel {
  name: string;
  city: string;
  region: string;
  stars: number;
  address: string;
  lat: number;
  lon: number;
  amenities: string[];
  baseNightlyCents: number;
}

/**
 * Demo hotels — fictional names (not real properties) so demo rates can never be mistaken for a real hotel's prices.
 * Every row is source = "demo".
 */
export const HOTELS: SeedHotel[] = [
  { name: "Demo Midtown Park Hotel", city: "New York", region: "NY", stars: 4, address: "Midtown Manhattan, New York, NY", lat: 40.7549, lon: -73.984, amenities: ["wifi", "fitness_center", "restaurant", "bar"], baseNightlyCents: 32900 },
  { name: "Demo Hudson River Inn", city: "New York", region: "NY", stars: 3, address: "Chelsea, New York, NY", lat: 40.7465, lon: -74.0014, amenities: ["wifi", "breakfast"], baseNightlyCents: 21900 },
  { name: "Demo Battery Harbor Suites", city: "New York", region: "NY", stars: 5, address: "Financial District, New York, NY", lat: 40.7069, lon: -74.0113, amenities: ["wifi", "spa", "pool", "fitness_center", "restaurant"], baseNightlyCents: 54900 },
  { name: "Demo Sunset Boulevard Hotel", city: "Los Angeles", region: "CA", stars: 4, address: "West Hollywood, Los Angeles, CA", lat: 34.0901, lon: -118.3868, amenities: ["wifi", "pool", "bar", "parking"], baseNightlyCents: 28900 },
  { name: "Demo Santa Monica Beach Lodge", city: "Los Angeles", region: "CA", stars: 3, address: "Santa Monica, CA", lat: 34.0104, lon: -118.4962, amenities: ["wifi", "parking", "breakfast"], baseNightlyCents: 22900 },
  { name: "Demo Downtown Arts District Hotel", city: "Los Angeles", region: "CA", stars: 4, address: "Arts District, Los Angeles, CA", lat: 34.0403, lon: -118.2353, amenities: ["wifi", "fitness_center", "restaurant"], baseNightlyCents: 24900 },
  { name: "Demo Lakeshore Loop Hotel", city: "Chicago", region: "IL", stars: 4, address: "The Loop, Chicago, IL", lat: 41.8826, lon: -87.6233, amenities: ["wifi", "fitness_center", "bar"], baseNightlyCents: 23900 },
  { name: "Demo River North Inn", city: "Chicago", region: "IL", stars: 3, address: "River North, Chicago, IL", lat: 41.8924, lon: -87.6341, amenities: ["wifi", "breakfast"], baseNightlyCents: 17900 },
  { name: "Demo Magnificent Mile Suites", city: "Chicago", region: "IL", stars: 5, address: "Magnificent Mile, Chicago, IL", lat: 41.8955, lon: -87.6244, amenities: ["wifi", "spa", "pool", "restaurant"], baseNightlyCents: 41900 },
  { name: "Demo South Beach Ocean Hotel", city: "Miami", region: "FL", stars: 4, address: "South Beach, Miami Beach, FL", lat: 25.7826, lon: -80.1341, amenities: ["wifi", "pool", "beach_access", "bar"], baseNightlyCents: 31900 },
  { name: "Demo Brickell Bay Inn", city: "Miami", region: "FL", stars: 3, address: "Brickell, Miami, FL", lat: 25.7617, lon: -80.1918, amenities: ["wifi", "pool", "parking"], baseNightlyCents: 19900 },
  { name: "Demo Strip Central Resort", city: "Las Vegas", region: "NV", stars: 4, address: "Las Vegas Strip, Las Vegas, NV", lat: 36.1147, lon: -115.1728, amenities: ["wifi", "pool", "casino", "spa", "restaurant"], baseNightlyCents: 18900 },
  { name: "Demo Fremont Street Hotel", city: "Las Vegas", region: "NV", stars: 3, address: "Downtown, Las Vegas, NV", lat: 36.1706, lon: -115.1446, amenities: ["wifi", "pool", "casino"], baseNightlyCents: 8900 },
  { name: "Demo Union Square Hotel", city: "San Francisco", region: "CA", stars: 4, address: "Union Square, San Francisco, CA", lat: 37.788, lon: -122.4075, amenities: ["wifi", "fitness_center", "restaurant"], baseNightlyCents: 27900 },
  { name: "Demo Embarcadero Bay Inn", city: "San Francisco", region: "CA", stars: 3, address: "Embarcadero, San Francisco, CA", lat: 37.7955, lon: -122.3937, amenities: ["wifi", "breakfast"], baseNightlyCents: 21900 },
];
