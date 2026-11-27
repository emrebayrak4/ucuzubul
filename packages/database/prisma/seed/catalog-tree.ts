/**
 * Shopping category tree (3 levels) + spec-filter (facet) definitions + SEO intro text.
 * Level-1 and most level-2 slugs match prisma/seed/reference.ts so the base seed and this module agree.
 * Facets are stored on Category.facets (JSON, contracts `CategoryFacetDef[]`); descendants inherit, deeper keys override.
 */

export interface FacetDef {
  key: string;
  label: string;
  attribute: string;
  sort?: "count" | "alpha" | "numeric" | "custom";
  order?: string[];
}

export interface TreeNode {
  slug: string;
  name: string;
  icon?: string;
  facets?: FacetDef[];
  /** One-paragraph "what to look for" text; the runner wraps it into the SEO block. */
  guide?: string;
  children?: TreeNode[];
}

const f = (key: string, label: string, attribute: string, sort: FacetDef["sort"] = "count", order?: string[]): FacetDef => ({
  key,
  label,
  attribute,
  sort,
  ...(order ? { order } : {}),
});

const leaf = (slug: string, name: string, facets?: FacetDef[], guide?: string): TreeNode => ({ slug, name, ...(facets ? { facets } : {}), ...(guide ? { guide } : {}) });

// Reusable facet sets
const TV = [
  f("screen-size", "Screen size", "Screen size", "numeric"),
  f("panel", "Panel type", "Panel type", "custom", ["OLED", "QD-OLED", "Mini-LED", "QLED", "LED"]),
  f("resolution", "Resolution", "Resolution", "custom", ["8K", "4K", "1080p"]),
  f("refresh-rate", "Refresh rate", "Refresh rate", "numeric"),
  f("smart-platform", "Smart platform", "Smart platform"),
  f("model-year", "Model year", "Model year", "numeric"),
];
const LAPTOP = [
  f("cpu-brand", "Processor brand", "Processor brand"),
  f("cpu", "Processor", "Processor", "alpha"),
  f("ram", "RAM", "RAM", "numeric"),
  f("storage", "Storage", "Storage", "numeric"),
  f("screen-size", "Screen size", "Screen size", "numeric"),
  f("gpu", "Graphics", "Graphics", "alpha"),
  f("os", "Operating system", "Operating system"),
  f("refresh-rate", "Refresh rate", "Refresh rate", "numeric"),
];
const PHONE = [
  f("storage", "Storage", "Storage", "numeric"),
  f("color", "Color", "Color", "alpha"),
  f("carrier", "Carrier", "Carrier"),
  f("screen-size", "Screen size", "Screen size", "numeric"),
  f("os", "Operating system", "Operating system"),
  f("ram", "RAM", "RAM", "numeric"),
  f("connectivity", "Network", "Network"),
];
const MONITOR = [
  f("screen-size", "Screen size", "Screen size", "numeric"),
  f("resolution", "Resolution", "Resolution", "custom", ["5K", "4K", "1440p", "1080p"]),
  f("refresh-rate", "Refresh rate", "Refresh rate", "numeric"),
  f("panel", "Panel type", "Panel type"),
  f("curved", "Curved", "Curved"),
  f("adaptive-sync", "Adaptive sync", "Adaptive sync"),
];
const HEADPHONES = [
  f("form-factor", "Type", "Form factor"),
  f("anc", "Noise cancellation", "Noise cancellation"),
  f("connection", "Connection", "Connection"),
  f("battery", "Battery life", "Battery life", "numeric"),
  f("water", "Water resistance", "Water resistance", "alpha"),
  f("color", "Color", "Color", "alpha"),
];

export const CATALOG_TREE: TreeNode[] = [
  {
    slug: "electronics", name: "Electronics", icon: "tv",
    children: [
      { slug: "tv-home-theater", name: "TVs & Home Theater", facets: TV,
        guide: "For TVs, panel type matters most: OLED and QD-OLED give perfect blacks and wide viewing angles, Mini-LED gets brighter for sunny rooms, and standard LED is the budget pick. Pair 120 Hz or faster panels with HDMI 2.1 if you game.",
        children: [
          leaf("oled-tvs", "OLED TVs"),
          leaf("qled-mini-led-tvs", "QLED & Mini-LED TVs"),
          leaf("led-tvs", "LED TVs"),
          leaf("soundbars", "Soundbars", [f("channels", "Channels", "Channels", "alpha"), f("atmos", "Dolby Atmos", "Dolby Atmos"), f("subwoofer", "Subwoofer", "Subwoofer"), f("connection", "Connection", "Connection")],
            "Soundbars are compared by channel layout (3.1 to 11.1.4), Dolby Atmos support, and whether a wireless subwoofer is included. HDMI eARC passes lossless audio from your TV."),
          leaf("streaming-devices", "Streaming Devices", [f("resolution", "Resolution", "Resolution", "custom", ["4K", "1080p"]), f("platform", "Platform", "Platform"), f("form-factor", "Form factor", "Form factor")]),
        ] },
      { slug: "headphones-audio", name: "Headphones & Audio", facets: HEADPHONES,
        guide: "Compare headphones by form factor, active noise cancellation, battery life with ANC on, and codec support. Water resistance (IPX4 and up) matters for workouts.",
        children: [
          leaf("over-ear-headphones", "Over-Ear Headphones"),
          leaf("wireless-earbuds", "Wireless Earbuds"),
          leaf("bluetooth-speakers", "Bluetooth Speakers", [f("water", "Water resistance", "Water resistance", "alpha"), f("battery", "Battery life", "Battery life", "numeric"), f("size-class", "Size", "Size class", "custom", ["Mini", "Portable", "Large"]), f("color", "Color", "Color", "alpha")]),
        ] },
      { slug: "cameras", name: "Cameras",
        facets: [f("sensor", "Sensor format", "Sensor format", "custom", ["Full frame", "APS-C", "Micro Four Thirds", '1/1.3"', '1/1.9"']), f("megapixels", "Resolution", "Megapixels", "numeric"), f("mount", "Lens mount", "Lens mount"), f("video", "Max video", "Max video", "alpha")],
        guide: "Sensor size drives image quality in low light: full frame beats APS-C, which beats smaller sensors. Check the lens mount, because lenses are the long-term investment.",
        children: [
          leaf("mirrorless-cameras", "Mirrorless Cameras"),
          leaf("action-cameras", "Action Cameras", [f("video", "Max video", "Max video", "alpha"), f("waterproof", "Waterproof depth", "Waterproof depth", "numeric")]),
          leaf("camera-lenses", "Camera Lenses", [f("mount", "Lens mount", "Lens mount"), f("lens-type", "Lens type", "Lens type"), f("focal", "Focal length", "Focal length", "alpha")]),
        ] },
      { slug: "wearables", name: "Wearables",
        facets: [f("case-size", "Case size", "Case size", "numeric"), f("compat", "Works with", "Compatibility"), f("gps", "GPS", "GPS"), f("cellular", "Cellular", "Cellular"), f("battery", "Battery life", "Battery life", "numeric")],
        children: [leaf("smartwatches", "Smartwatches"), leaf("fitness-trackers", "Fitness Trackers")] },
    ],
  },
  {
    slug: "computers", name: "Computers", icon: "laptop",
    children: [
      { slug: "laptops", name: "Laptops", facets: LAPTOP,
        guide: "For laptops, 16 GB of RAM is the comfortable minimum in 2026, and a 512 GB SSD avoids storage juggling. Gaming laptops are best compared by GPU (an RTX 4060 or better handles 1080p/1440p), screen refresh rate and cooling, not just CPU.",
        children: [
          leaf("gaming-laptops", "Gaming Laptops"),
          leaf("ultrabooks", "Ultrabooks"),
          leaf("macbooks", "MacBooks"),
          leaf("chromebooks", "Chromebooks"),
          leaf("2-in-1-laptops", "2-in-1 Laptops"),
        ] },
      { slug: "tablets", name: "Tablets",
        facets: [f("storage", "Storage", "Storage", "numeric"), f("screen-size", "Screen size", "Screen size", "numeric"), f("connectivity", "Connectivity", "Connectivity"), f("os", "Operating system", "Operating system"), f("color", "Color", "Color", "alpha")],
        children: [leaf("ipads", "iPads"), leaf("android-tablets", "Android Tablets"), leaf("e-readers", "E-Readers")] },
      { slug: "monitors", name: "Monitors", facets: MONITOR,
        guide: "Monitors are compared by resolution, refresh rate and panel: IPS for color, VA for contrast, OLED for both plus instant response. For gaming, 1440p at 165 Hz or higher is the sweet spot.",
        children: [leaf("gaming-monitors", "Gaming Monitors"), leaf("4k-monitors", "4K & Creator Monitors"), leaf("office-monitors", "Office Monitors")] },
      { slug: "computer-components", name: "PC Components",
        children: [
          leaf("graphics-cards", "Graphics Cards", [f("chipset-brand", "Chipset brand", "Chipset brand"), f("chipset", "GPU", "GPU chipset", "alpha"), f("vram", "Video memory", "Video memory", "numeric"), f("brand-partner", "Card maker", "Card maker")],
            "Graphics cards are compared by GPU chipset first — the card maker (ASUS, MSI, Gigabyte…) mostly changes cooling, size and clocks. 12 GB of VRAM or more is safer for 1440p and new games."),
          leaf("cpus", "Processors (CPUs)", [f("cpu-brand", "Brand", "Processor brand"), f("cores", "Cores", "Cores", "numeric"), f("socket", "Socket", "Socket"), f("igpu", "Integrated graphics", "Integrated graphics")]),
          leaf("internal-ssds", "Internal SSDs", [f("capacity", "Capacity", "Capacity", "numeric"), f("interface", "Interface", "Interface"), f("form-factor", "Form factor", "Form factor")]),
        ] },
      { slug: "computer-accessories", name: "Computer Accessories",
        children: [
          leaf("keyboards", "Keyboards", [f("connection", "Connection", "Connection"), f("switch", "Switch type", "Switch type"), f("layout", "Layout", "Layout"), f("backlight", "Backlight", "Backlight")]),
          leaf("mice", "Mice", [f("connection", "Connection", "Connection"), f("use", "Designed for", "Designed for"), f("weight", "Weight", "Weight", "numeric")]),
          leaf("external-ssds", "External Drives", [f("capacity", "Capacity", "Capacity", "numeric"), f("interface", "Interface", "Interface"), f("drive-type", "Drive type", "Drive type")]),
          leaf("wi-fi-routers", "Wi-Fi Routers & Mesh", [f("wifi", "Wi-Fi standard", "Wi-Fi standard", "custom", ["Wi-Fi 7", "Wi-Fi 6E", "Wi-Fi 6"]), f("mesh", "Mesh system", "Mesh"), f("pack", "Pack size", "Pack size", "numeric")]),
          leaf("webcams", "Webcams", [f("resolution", "Resolution", "Resolution", "custom", ["4K", "1440p", "1080p"]), f("mic", "Microphone", "Microphone")]),
        ] },
    ],
  },
  {
    slug: "smartphones", name: "Smartphones", icon: "smartphone", facets: PHONE,
    guide: "Phones are listed per storage size and color, so prices are never mixed across variants. \"Unlocked\" phones work on any major US carrier; carrier-locked deals often require a plan.",
    children: [
      { slug: "unlocked-phones", name: "Unlocked Phones",
        children: [leaf("iphones", "iPhones"), leaf("samsung-galaxy-phones", "Samsung Galaxy Phones"), leaf("google-pixel-phones", "Google Pixel Phones"), leaf("budget-phones", "Budget & Midrange Phones")] },
      { slug: "phone-accessories", name: "Phone Accessories",
        facets: [f("compat", "Compatible with", "Compatibility"), f("acc-type", "Type", "Accessory type"), f("wattage", "Output", "Output power", "numeric"), f("magsafe", "MagSafe / Qi2", "MagSafe")],
        children: [leaf("phone-cases", "Cases & Screen Protectors"), leaf("chargers-power-banks", "Chargers & Power Banks")] },
    ],
  },
  {
    slug: "gaming", name: "Gaming", icon: "gamepad",
    children: [
      { slug: "consoles", name: "Consoles & VR",
        facets: [f("platform", "Platform", "Platform"), f("storage", "Storage", "Storage", "numeric"), f("edition", "Edition", "Edition")],
        children: [leaf("game-consoles", "Game Consoles"), leaf("vr-headsets", "VR Headsets")] },
      { slug: "video-games", name: "Video Games",
        facets: [f("platform", "Platform", "Platform"), f("esrb", "ESRB rating", "ESRB rating", "custom", ["E", "E10+", "T", "M"]), f("genre", "Genre", "Genre", "alpha"), f("edition", "Edition", "Edition")],
        children: [leaf("ps5-games", "PS5 Games"), leaf("switch-games", "Nintendo Switch Games"), leaf("xbox-games", "Xbox Games")] },
      { slug: "gaming-accessories", name: "Controllers & Accessories",
        facets: [f("platform", "Platform", "Platform"), f("connection", "Connection", "Connection")],
        children: [leaf("controllers", "Controllers"), leaf("gaming-headsets", "Gaming Headsets")] },
    ],
  },
  {
    slug: "home-kitchen", name: "Home & Kitchen", icon: "cooking-pot",
    children: [
      { slug: "small-kitchen-appliances", name: "Small Kitchen Appliances",
        children: [
          leaf("air-fryers", "Air Fryers", [f("capacity", "Capacity", "Capacity", "numeric"), f("af-type", "Type", "Air fryer type"), f("baskets", "Baskets", "Baskets", "numeric")],
            "Air fryers are compared by usable capacity (quarts), basket layout — dual-basket models cook two foods at once — and whether they double as a toaster oven."),
          leaf("blenders", "Blenders", [f("blender-type", "Type", "Blender type"), f("watts", "Power", "Power", "numeric"), f("capacity", "Capacity", "Capacity", "numeric")]),
          leaf("stand-mixers", "Stand Mixers", [f("capacity", "Bowl size", "Bowl size", "numeric"), f("color", "Color", "Color", "alpha")]),
        ] },
      { slug: "coffee-espresso", name: "Coffee & Espresso Machines",
        facets: [f("machine-type", "Type", "Machine type"), f("frother", "Milk frothing", "Milk frothing"), f("grinder", "Built-in grinder", "Built-in grinder")],
        children: [leaf("espresso-machines", "Espresso Machines"), leaf("drip-coffee-makers", "Drip Coffee Makers"), leaf("single-serve-coffee", "Single-Serve Coffee Makers")] },
      { slug: "cookware", name: "Cookware",
        facets: [f("material", "Material", "Material"), f("pieces", "Pieces", "Pieces", "numeric"), f("induction", "Induction compatible", "Induction compatible"), f("oven-safe", "Oven safe to", "Oven safe to", "numeric")],
        children: [leaf("cookware-sets", "Cookware Sets"), leaf("skillets", "Skillets & Frying Pans")] },
    ],
  },
  {
    slug: "appliances", name: "Appliances", icon: "washing-machine",
    children: [
      { slug: "vacuums-floor-care", name: "Vacuums & Floor Care",
        facets: [f("vac-type", "Type", "Vacuum type"), f("self-empty", "Self-emptying", "Self-emptying"), f("mop", "Mopping", "Mopping"), f("runtime", "Runtime", "Runtime", "numeric"), f("power", "Power source", "Power source")],
        guide: "Robot vacuums are compared by navigation (LiDAR maps rooms more reliably than cameras), self-emptying docks and mopping. For stick vacuums, runtime on standard power and bin size matter most.",
        children: [leaf("robot-vacuums", "Robot Vacuums"), leaf("cordless-stick-vacuums", "Cordless Stick Vacuums"), leaf("upright-vacuums", "Upright & Canister Vacuums")] },
      { slug: "laundry", name: "Washers & Dryers",
        facets: [f("load", "Loading", "Loading"), f("capacity", "Capacity", "Capacity", "numeric"), f("fuel", "Fuel", "Fuel"), f("energy-star", "ENERGY STAR", "ENERGY STAR"), f("finish", "Finish", "Finish")],
        children: [leaf("washers", "Washers"), leaf("dryers", "Dryers")] },
      { slug: "refrigerators", name: "Refrigerators",
        facets: [f("style", "Style", "Refrigerator style"), f("capacity", "Capacity", "Capacity", "numeric"), f("finish", "Finish", "Finish"), f("energy-star", "ENERGY STAR", "ENERGY STAR"), f("counter-depth", "Counter depth", "Counter depth")] },
      { slug: "dishwashers", name: "Dishwashers",
        facets: [f("noise", "Noise level", "Noise level", "numeric"), f("tub", "Tub", "Tub material"), f("finish", "Finish", "Finish"), f("third-rack", "Third rack", "Third rack")] },
    ],
  },
  {
    slug: "fashion", name: "Fashion", icon: "shirt",
    children: [
      { slug: "shoes", name: "Shoes",
        facets: [f("gender", "Gender", "Gender"), f("shoe-type", "Type", "Shoe type"), f("color", "Color", "Color", "alpha"), f("width", "Width", "Width")],
        children: [leaf("running-shoes", "Running Shoes"), leaf("sneakers", "Sneakers"), leaf("boots", "Boots")] },
      { slug: "clothing", name: "Clothing",
        facets: [f("gender", "Gender", "Gender"), f("material", "Material", "Material"), f("color", "Color", "Color", "alpha")],
        children: [leaf("jackets", "Jackets & Coats"), leaf("jeans", "Jeans")] },
      { slug: "accessories", name: "Accessories",
        facets: [f("acc-type", "Type", "Accessory type"), f("color", "Color", "Color", "alpha"), f("material", "Material", "Material")],
        children: [leaf("backpacks", "Backpacks & Bags"), leaf("sunglasses", "Sunglasses"), leaf("watches", "Watches")] },
    ],
  },
  {
    slug: "beauty-personal-care", name: "Beauty & Personal Care", icon: "sparkles",
    children: [
      { slug: "hair-tools", name: "Hair Tools",
        facets: [f("tool-type", "Type", "Tool type"), f("watts", "Power", "Power", "numeric"), f("tech", "Technology", "Technology")],
        children: [leaf("hair-dryers", "Hair Dryers"), leaf("hair-stylers", "Multi-Stylers"), leaf("flat-irons", "Flat Irons")] },
      { slug: "skincare", name: "Skincare",
        facets: [f("skin-type", "Skin type", "Skin type"), f("size", "Size", "Size", "numeric"), f("spf", "SPF", "SPF", "numeric")],
        children: [leaf("moisturizers", "Moisturizers"), leaf("sunscreen", "Sunscreen")] },
      { slug: "oral-care", name: "Oral Care",
        facets: [f("brush-tech", "Technology", "Brush technology"), f("pressure", "Pressure sensor", "Pressure sensor"), f("modes", "Cleaning modes", "Cleaning modes", "numeric")],
        children: [leaf("electric-toothbrushes", "Electric Toothbrushes"), leaf("water-flossers", "Water Flossers")] },
      { slug: "shavers-trimmers", name: "Shavers & Trimmers",
        facets: [f("shaver-type", "Type", "Shaver type"), f("wet-dry", "Wet & dry", "Wet & dry"), f("runtime", "Runtime", "Runtime", "numeric")],
        children: [leaf("electric-shavers", "Electric Shavers"), leaf("beard-trimmers", "Beard Trimmers")] },
    ],
  },
  {
    slug: "sports-outdoors", name: "Sports & Outdoors", icon: "bike",
    children: [
      { slug: "fitness", name: "Fitness Equipment",
        facets: [f("equip-type", "Type", "Equipment type"), f("max-weight", "Max weight", "Max weight", "numeric"), f("subscription", "Subscription", "Subscription")],
        children: [leaf("exercise-bikes", "Exercise Bikes"), leaf("dumbbells", "Dumbbells & Weights"), leaf("treadmills", "Treadmills")] },
      { slug: "camping-hiking", name: "Camping & Hiking",
        facets: [f("capacity", "Capacity", "Capacity", "numeric"), f("season", "Season", "Season"), f("weight", "Weight", "Weight", "numeric")],
        children: [leaf("tents", "Tents"), leaf("sleeping-bags", "Sleeping Bags"), leaf("coolers", "Coolers")] },
      { slug: "drinkware", name: "Drinkware",
        facets: [f("capacity", "Capacity", "Capacity", "numeric"), f("material", "Material", "Material"), f("color", "Color", "Color", "alpha"), f("lid", "Lid", "Lid type")],
        children: [leaf("water-bottles", "Water Bottles"), leaf("tumblers", "Tumblers")] },
      { slug: "bikes-scooters", name: "Bikes & E-Scooters",
        facets: [f("range", "Range", "Range", "numeric"), f("top-speed", "Top speed", "Top speed", "numeric"), f("motor", "Motor", "Motor power", "numeric")],
        children: [leaf("electric-scooters", "Electric Scooters"), leaf("e-bikes", "E-Bikes")] },
    ],
  },
  {
    slug: "automotive", name: "Automotive", icon: "car",
    children: [
      { slug: "car-electronics", name: "Car Electronics",
        facets: [f("resolution", "Resolution", "Resolution", "custom", ["4K", "1440p", "1080p"]), f("channels", "Channels", "Camera channels"), f("carplay", "CarPlay / Android Auto", "CarPlay"), f("peak-amps", "Peak amps", "Peak amps", "numeric")],
        children: [leaf("dash-cams", "Dash Cams"), leaf("car-stereos", "Car Stereos"), leaf("jump-starters", "Jump Starters")] },
      { slug: "car-care", name: "Car Care",
        facets: [f("power", "Power source", "Power source"), f("max-psi", "Max pressure", "Max pressure", "numeric")],
        children: [leaf("tire-inflators", "Tire Inflators"), leaf("car-cleaning", "Car Cleaning")] },
    ],
  },
  {
    slug: "baby-kids", name: "Baby & Kids", icon: "baby",
    children: [
      { slug: "strollers-car-seats", name: "Strollers & Car Seats",
        facets: [f("stroller-type", "Type", "Stroller type"), f("max-weight", "Max child weight", "Max child weight", "numeric"), f("weight", "Product weight", "Weight", "numeric")],
        children: [leaf("strollers", "Strollers"), leaf("car-seats", "Car Seats")] },
      { slug: "diapering", name: "Diapering",
        facets: [f("size", "Size", "Diaper size", "custom", ["Newborn", "Size 1", "Size 2", "Size 3", "Size 4", "Size 5", "Size 6"]), f("count", "Count", "Count", "numeric")],
        children: [leaf("diapers", "Diapers"), leaf("wipes", "Baby Wipes")] },
      { slug: "baby-monitors", name: "Baby Monitors",
        facets: [f("monitor-type", "Type", "Monitor type"), f("resolution", "Resolution", "Resolution"), f("subscription", "Subscription", "Subscription")] },
    ],
  },
  {
    slug: "toys", name: "Toys", icon: "blocks",
    children: [
      { slug: "building-sets", name: "Building Sets",
        facets: [f("theme", "Theme", "Theme", "alpha"), f("pieces", "Pieces", "Pieces", "numeric"), f("age", "Age", "Age", "numeric")],
        children: [leaf("lego-sets", "LEGO Sets"), leaf("magnetic-tiles", "Magnetic Tiles")] },
      { slug: "dolls-playsets", name: "Dolls & Playsets",
        facets: [f("age", "Age", "Age", "numeric"), f("theme", "Theme", "Theme", "alpha")],
        children: [leaf("dolls", "Dolls"), leaf("playsets", "Playsets")] },
      { slug: "rc-drones", name: "Drones & RC",
        facets: [f("camera", "Camera", "Camera"), f("flight-time", "Flight time", "Flight time", "numeric"), f("weight-class", "Weight class", "Weight class")],
        children: [leaf("drones", "Drones"), leaf("rc-cars", "RC Cars")] },
    ],
  },
  {
    slug: "grocery", name: "Grocery", icon: "shopping-basket",
    children: [
      { slug: "coffee-tea", name: "Coffee & Tea",
        facets: [f("roast", "Roast", "Roast", "custom", ["Light", "Medium", "Medium-dark", "Dark"]), f("form", "Form", "Form"), f("size", "Size", "Size", "numeric"), f("caffeine", "Caffeine", "Caffeine")],
        children: [leaf("coffee-beans", "Coffee Beans & Ground"), leaf("k-cups-pods", "K-Cups & Pods"), leaf("tea", "Tea")] },
      { slug: "snacks", name: "Snacks", facets: [f("snack-type", "Type", "Snack type"), f("count", "Pack size", "Count", "numeric")] },
    ],
  },
  {
    slug: "pet-supplies", name: "Pet Supplies", icon: "paw-print",
    children: [
      { slug: "dog-supplies", name: "Dog Supplies",
        facets: [f("life-stage", "Life stage", "Life stage"), f("flavor", "Flavor", "Flavor", "alpha"), f("size", "Bag size", "Bag size", "numeric"), f("grain", "Grain", "Grain")],
        children: [leaf("dog-food", "Dog Food"), leaf("dog-beds", "Dog Beds & Crates")] },
      { slug: "cat-supplies", name: "Cat Supplies",
        facets: [f("life-stage", "Life stage", "Life stage"), f("flavor", "Flavor", "Flavor", "alpha"), f("litter-type", "Litter type", "Litter type"), f("size", "Size", "Bag size", "numeric")],
        children: [leaf("cat-food", "Cat Food"), leaf("cat-litter", "Cat Litter")] },
    ],
  },
  {
    slug: "office-supplies", name: "Office Supplies", icon: "printer",
    children: [
      { slug: "printers", name: "Printers",
        facets: [f("print-tech", "Technology", "Print technology"), f("color-print", "Color", "Color printing"), f("functions", "Functions", "Functions"), f("wireless", "Wireless", "Wireless"), f("ink-system", "Ink system", "Ink system")],
        guide: "Printers are best compared on cost per page, not sticker price: ink-tank (EcoTank, MegaTank) and laser printers cost more up front but far less per page than cartridge inkjets.",
        children: [leaf("inkjet-printers", "Inkjet & Ink-Tank Printers"), leaf("laser-printers", "Laser Printers")] },
      { slug: "office-furniture", name: "Office Furniture",
        facets: [f("furniture-type", "Type", "Furniture type"), f("material", "Material", "Material"), f("width", "Desktop width", "Desktop width", "numeric"), f("adjustable", "Adjustability", "Adjustability")],
        children: [leaf("office-chairs", "Office Chairs"), leaf("standing-desks", "Standing Desks")] },
    ],
  },
  {
    slug: "tools-home-improvement", name: "Tools & Home Improvement", icon: "hammer",
    children: [
      { slug: "power-tools", name: "Power Tools",
        facets: [f("voltage", "Voltage", "Voltage", "numeric"), f("battery-included", "Battery included", "Battery included"), f("brushless", "Motor", "Motor"), f("platform", "Battery platform", "Battery platform", "alpha")],
        guide: "Cordless tools lock you into a battery platform (DeWalt 20V MAX, Milwaukee M18, Makita 18V LXT, Ryobi ONE+), so compare kits that include batteries against bare tools. Brushless motors run longer per charge.",
        children: [leaf("drills-drivers", "Drills & Drivers"), leaf("impact-drivers", "Impact Drivers"), leaf("circular-saws", "Saws"), leaf("tool-combo-kits", "Combo Kits")] },
      { slug: "smart-home", name: "Smart Home",
        facets: [f("ecosystem", "Works with", "Ecosystem"), f("power", "Power source", "Power source"), f("resolution", "Video resolution", "Video resolution"), f("subscription", "Subscription needed", "Subscription")],
        children: [leaf("smart-speakers", "Smart Speakers & Displays"), leaf("video-doorbells", "Video Doorbells"), leaf("security-cameras", "Security Cameras"), leaf("smart-thermostats", "Smart Thermostats"), leaf("smart-lighting", "Smart Lighting")] },
    ],
  },
];

/** Flattens the tree with paths/depths in display order. */
export function flattenTree(): { node: TreeNode; parentSlug: string | null; path: string; depth: number; sortOrder: number }[] {
  const out: { node: TreeNode; parentSlug: string | null; path: string; depth: number; sortOrder: number }[] = [];
  const walk = (nodes: TreeNode[], parent: { slug: string; path: string } | null, depth: number) => {
    nodes.forEach((n, i) => {
      const path = parent ? `${parent.path}/${n.slug}` : n.slug;
      out.push({ node: n, parentSlug: parent?.slug ?? null, path, depth, sortOrder: i });
      if (n.children) walk(n.children, { slug: n.slug, path }, depth + 1);
    });
  };
  walk(CATALOG_TREE, null, 0);
  return out;
}

/** SEO intro block for a category: generic comparison paragraph + the category-specific guide (if any). */
export function seoTextFor(name: string, guide: string | undefined, ancestorGuide: string | undefined): string {
  const intro =
    `Compare ${name.toLowerCase()} prices across major US stores in one place. Every listing shows the lowest price, the number of stores carrying it, ` +
    `shipping and an estimated total, plus up to a year of real price history so you can tell a genuine deal from a temporary markup.`;
  const how =
    `Use the filters to narrow by specs, brand, store and price, then open a product to see every store's offer side by side and set a price alert. ` +
    `Store order is always by price — sponsored placements are labeled and never change the ranking or the Deal Score.`;
  return [intro, guide ?? ancestorGuide, how].filter(Boolean).join("\n\n");
}
