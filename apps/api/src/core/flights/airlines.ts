/**
 * Airline network model used ONLY by the labeled demo fare engine (source = "demo").
 * Real IATA codes, alliances and hub airports so demo itineraries look plausible; schedules and prices are synthetic.
 */
import type { Alliance } from "@pricora/contracts";

export type RegionId = "NA" | "LATAM" | "EU" | "ME" | "AF" | "AS_E" | "AS_SE" | "AS_S" | "OC";

export type BagPolicy =
  /** US legacy: basic = carry-on, checked fee; main = checked fee; flex = 1 checked. Long-haul: main includes 1 checked. */
  | "us_legacy"
  /** US/EU/LatAm ultra low-cost: personal item only, everything for a fee. */
  | "ulcc"
  /** Southwest/JetBlue-style hybrid: carry-on included, checked fee (flex includes). */
  | "hybrid"
  /** European/Asian full service: basic carry-on only on short-haul, 1 checked on long-haul. */
  | "full_service"
  /** Gulf/Asian premium: at least 1 checked on every fare. */
  | "premium";

export interface AirlineInfo {
  iata: string;
  name: string;
  alliance: Alliance | null;
  country: string;
  lcc: boolean;
  /** Price multiplier vs. a typical legacy carrier. */
  priceFactor: number;
  hubs: string[];
  /** Countries with a domestic network (medium + large airports). */
  home: string[];
  /** Regions served short/medium-haul from hubs (large airports). */
  regional: RegionId[];
  /** Regions served long-haul from hubs (major gateways). */
  longHaul: RegionId[];
  bags: BagPolicy;
  /** Interline/codeshare partners outside the alliance (single ticket). */
  partners?: string[];
  /** Regional operator used on short hops (operated-by line). */
  regionalOperator?: { iata: string; name: string };
  /** Leading digit block for flight numbers. */
  numberBase: number;
  /** Fleet hints. */
  narrowbody: string[];
  widebody: string[];
}

const NB_A = ["Airbus A320neo", "Airbus A321neo", "Airbus A319"];
const NB_B = ["Boeing 737-800", "Boeing 737 MAX 8", "Boeing 737-900ER"];
const NB_MIX = ["Airbus A321neo", "Boeing 737-800", "Airbus A320"];

export const AIRLINES: AirlineInfo[] = [
  // ---------------------------------------------------------------- North America
  { iata: "AA", name: "American Airlines", alliance: "oneworld", country: "US", lcc: false, priceFactor: 1, hubs: ["DFW", "CLT", "ORD", "MIA", "PHL", "PHX", "DCA", "JFK", "LAX"], home: ["US"], regional: ["NA", "LATAM"], longHaul: ["EU", "AS_E", "OC", "LATAM"], bags: "us_legacy", regionalOperator: { iata: "MQ", name: "Envoy Air" }, numberBase: 1, narrowbody: ["Airbus A321", "Boeing 737-800", "Airbus A319"], widebody: ["Boeing 787-9", "Boeing 777-300ER", "Boeing 787-8"], partners: ["AS", "JL", "BA", "IB", "QR"] },
  { iata: "DL", name: "Delta Air Lines", alliance: "skyteam", country: "US", lcc: false, priceFactor: 1.04, hubs: ["ATL", "DTW", "MSP", "SLC", "JFK", "LGA", "LAX", "SEA", "BOS"], home: ["US"], regional: ["NA", "LATAM"], longHaul: ["EU", "AS_E", "OC", "LATAM", "AF"], bags: "us_legacy", regionalOperator: { iata: "9E", name: "Endeavor Air" }, numberBase: 1, narrowbody: ["Airbus A321neo", "Boeing 737-900ER", "Airbus A220-300"], widebody: ["Airbus A350-900", "Airbus A330-900neo", "Boeing 767-400ER"], partners: ["LA", "WS", "VS", "KE", "AF", "KL"] },
  { iata: "UA", name: "United Airlines", alliance: "star", country: "US", lcc: false, priceFactor: 1.02, hubs: ["ORD", "DEN", "IAH", "EWR", "SFO", "IAD", "LAX"], home: ["US"], regional: ["NA", "LATAM"], longHaul: ["EU", "AS_E", "AS_SE", "AS_S", "OC", "LATAM", "ME", "AF"], bags: "us_legacy", regionalOperator: { iata: "OO", name: "SkyWest Airlines" }, numberBase: 1, narrowbody: ["Boeing 737 MAX 9", "Airbus A320", "Boeing 737-900"], widebody: ["Boeing 787-10", "Boeing 777-200ER", "Boeing 767-300ER"] },
  { iata: "WN", name: "Southwest Airlines", alliance: null, country: "US", lcc: true, priceFactor: 0.82, hubs: ["MDW", "DAL", "HOU", "BWI", "DEN", "LAS", "PHX", "OAK", "BNA", "MCO", "ATL"], home: ["US"], regional: [], longHaul: [], bags: "hybrid", numberBase: 1, narrowbody: ["Boeing 737-800", "Boeing 737 MAX 8", "Boeing 737-700"], widebody: [] },
  { iata: "B6", name: "JetBlue", alliance: null, country: "US", lcc: true, priceFactor: 0.88, hubs: ["JFK", "BOS", "FLL", "MCO"], home: ["US"], regional: ["LATAM"], longHaul: [], bags: "hybrid", partners: ["EK", "EY", "TK", "QR", "AA"], numberBase: 1, narrowbody: ["Airbus A321neo", "Airbus A320", "Airbus A220-300"], widebody: [] },
  { iata: "AS", name: "Alaska Airlines", alliance: "oneworld", country: "US", lcc: false, priceFactor: 0.94, hubs: ["SEA", "PDX", "SFO", "LAX", "ANC"], home: ["US"], regional: ["NA"], longHaul: [], bags: "us_legacy", regionalOperator: { iata: "QX", name: "Horizon Air" }, numberBase: 1, narrowbody: ["Boeing 737-900ER", "Boeing 737 MAX 9", "Boeing 737-800"], widebody: [], partners: ["AA", "HA"] },
  { iata: "NK", name: "Spirit Airlines", alliance: null, country: "US", lcc: true, priceFactor: 0.62, hubs: ["FLL", "LAS", "MCO", "DTW"], home: ["US"], regional: [], longHaul: [], bags: "ulcc", numberBase: 1, narrowbody: ["Airbus A320neo", "Airbus A321"], widebody: [] },
  { iata: "F9", name: "Frontier Airlines", alliance: null, country: "US", lcc: true, priceFactor: 0.6, hubs: ["DEN", "MCO", "LAS", "PHL"], home: ["US"], regional: [], longHaul: [], bags: "ulcc", numberBase: 1, narrowbody: ["Airbus A321neo", "Airbus A320neo"], widebody: [] },
  { iata: "HA", name: "Hawaiian Airlines", alliance: "oneworld", country: "US", lcc: false, priceFactor: 1, hubs: ["HNL", "OGG"], home: ["US"], regional: [], longHaul: ["AS_E", "OC"], bags: "us_legacy", numberBase: 1, narrowbody: ["Airbus A321neo", "Boeing 717-200"], widebody: ["Airbus A330-200", "Boeing 787-9"], partners: ["AS", "AA"] },
  { iata: "AC", name: "Air Canada", alliance: "star", country: "CA", lcc: false, priceFactor: 1.02, hubs: ["YYZ", "YUL", "YVR"], home: ["CA"], regional: ["NA", "LATAM"], longHaul: ["EU", "AS_E", "AS_S", "OC", "ME"], bags: "us_legacy", regionalOperator: { iata: "QK", name: "Jazz Aviation" }, numberBase: 1, narrowbody: ["Airbus A220-300", "Airbus A321", "Boeing 737 MAX 8"], widebody: ["Boeing 787-9", "Boeing 777-300ER"] },
  { iata: "WS", name: "WestJet", alliance: null, country: "CA", lcc: false, priceFactor: 0.9, hubs: ["YYC", "YYZ"], home: ["CA"], regional: ["NA", "LATAM"], longHaul: [], bags: "hybrid", partners: ["DL", "AF", "KL"], numberBase: 1, narrowbody: ["Boeing 737-800", "Boeing 737 MAX 8"], widebody: ["Boeing 787-9"] },
  { iata: "AM", name: "Aeroméxico", alliance: "skyteam", country: "MX", lcc: false, priceFactor: 0.95, hubs: ["MEX"], home: ["MX"], regional: ["NA", "LATAM"], longHaul: ["EU", "AS_E"], bags: "full_service", numberBase: 4, narrowbody: ["Boeing 737 MAX 8", "Embraer E190"], widebody: ["Boeing 787-9"], partners: ["DL"] },
  { iata: "Y4", name: "Volaris", alliance: null, country: "MX", lcc: true, priceFactor: 0.62, hubs: ["GDL", "TIJ", "MEX", "CUN"], home: ["MX"], regional: ["NA"], longHaul: [], bags: "ulcc", numberBase: 7, narrowbody: ["Airbus A320neo", "Airbus A321neo"], widebody: [] },
  { iata: "CM", name: "Copa Airlines", alliance: "star", country: "PA", lcc: false, priceFactor: 0.95, hubs: ["PTY"], home: ["PA"], regional: ["LATAM", "NA"], longHaul: [], bags: "full_service", numberBase: 1, narrowbody: ["Boeing 737 MAX 9", "Boeing 737-800"], widebody: [], partners: ["UA"] },
  { iata: "AV", name: "Avianca", alliance: "star", country: "CO", lcc: false, priceFactor: 0.92, hubs: ["BOG", "SAL"], home: ["CO"], regional: ["LATAM", "NA"], longHaul: ["EU"], bags: "full_service", numberBase: 2, narrowbody: ["Airbus A320neo", "Airbus A320"], widebody: ["Boeing 787-8"] },
  { iata: "LA", name: "LATAM Airlines", alliance: null, country: "CL", lcc: false, priceFactor: 0.98, hubs: ["GRU", "SCL", "LIM", "BOG"], home: ["BR", "CL", "PE", "CO", "EC"], regional: ["LATAM"], longHaul: ["NA", "EU"], bags: "full_service", partners: ["DL"], numberBase: 8, narrowbody: ["Airbus A320neo", "Airbus A321"], widebody: ["Boeing 787-9", "Boeing 777-300ER"] },
  // ---------------------------------------------------------------- Europe & Turkey
  { iata: "BA", name: "British Airways", alliance: "oneworld", country: "GB", lcc: false, priceFactor: 1.08, hubs: ["LHR", "LGW"], home: ["GB"], regional: ["EU", "AF", "ME"], longHaul: ["NA", "LATAM", "AS_E", "AS_SE", "AS_S", "ME", "AF"], bags: "full_service", numberBase: 1, narrowbody: ["Airbus A320neo", "Airbus A321neo", "Airbus A319"], widebody: ["Boeing 777-300ER", "Airbus A350-1000", "Boeing 787-9", "Airbus A380-800"] },
  { iata: "VS", name: "Virgin Atlantic", alliance: "skyteam", country: "GB", lcc: false, priceFactor: 1.05, hubs: ["LHR", "MAN"], home: [], regional: [], longHaul: ["NA", "LATAM", "AS_S", "AF"], bags: "full_service", numberBase: 1, narrowbody: [], widebody: ["Airbus A350-1000", "Boeing 787-9", "Airbus A330-900neo"], partners: ["DL"] },
  { iata: "LH", name: "Lufthansa", alliance: "star", country: "DE", lcc: false, priceFactor: 1.06, hubs: ["FRA", "MUC"], home: ["DE"], regional: ["EU", "ME", "AF"], longHaul: ["NA", "LATAM", "AS_E", "AS_SE", "AS_S", "ME", "AF"], bags: "full_service", numberBase: 4, narrowbody: NB_A, widebody: ["Airbus A350-900", "Boeing 747-8", "Boeing 787-9", "Airbus A340-600"] },
  { iata: "LX", name: "Swiss", alliance: "star", country: "CH", lcc: false, priceFactor: 1.1, hubs: ["ZRH", "GVA"], home: ["CH"], regional: ["EU", "ME"], longHaul: ["NA", "LATAM", "AS_E", "AS_SE", "AS_S"], bags: "full_service", numberBase: 1, narrowbody: ["Airbus A220-300", "Airbus A321neo"], widebody: ["Boeing 777-300ER", "Airbus A330-300"] },
  { iata: "OS", name: "Austrian Airlines", alliance: "star", country: "AT", lcc: false, priceFactor: 1.02, hubs: ["VIE"], home: ["AT"], regional: ["EU", "ME"], longHaul: ["NA", "AS_E"], bags: "full_service", numberBase: 1, narrowbody: ["Airbus A320", "Embraer E195"], widebody: ["Boeing 787-9", "Boeing 777-200ER"] },
  { iata: "AF", name: "Air France", alliance: "skyteam", country: "FR", lcc: false, priceFactor: 1.05, hubs: ["CDG", "ORY"], home: ["FR"], regional: ["EU", "AF", "ME"], longHaul: ["NA", "LATAM", "AS_E", "AS_SE", "AS_S", "ME", "AF"], bags: "full_service", numberBase: 1, narrowbody: ["Airbus A220-300", "Airbus A320", "Airbus A321"], widebody: ["Boeing 777-300ER", "Airbus A350-900", "Boeing 787-9"], partners: ["DL"] },
  { iata: "KL", name: "KLM", alliance: "skyteam", country: "NL", lcc: false, priceFactor: 1.03, hubs: ["AMS"], home: ["NL"], regional: ["EU", "ME", "AF"], longHaul: ["NA", "LATAM", "AS_E", "AS_SE", "AS_S", "ME", "AF"], bags: "full_service", numberBase: 1, narrowbody: ["Boeing 737-800", "Embraer E195-E2", "Boeing 737-900"], widebody: ["Boeing 787-10", "Boeing 777-300ER", "Airbus A330-300"], partners: ["DL"] },
  { iata: "IB", name: "Iberia", alliance: "oneworld", country: "ES", lcc: false, priceFactor: 0.98, hubs: ["MAD"], home: ["ES"], regional: ["EU", "AF"], longHaul: ["NA", "LATAM"], bags: "full_service", numberBase: 3, narrowbody: ["Airbus A320neo", "Airbus A321XLR"], widebody: ["Airbus A350-900", "Airbus A330-200"] },
  { iata: "AY", name: "Finnair", alliance: "oneworld", country: "FI", lcc: false, priceFactor: 0.98, hubs: ["HEL"], home: ["FI"], regional: ["EU"], longHaul: ["NA", "AS_E", "AS_SE", "AS_S"], bags: "full_service", numberBase: 1, narrowbody: ["Airbus A321", "Airbus A320"], widebody: ["Airbus A350-900", "Airbus A330-300"] },
  { iata: "SK", name: "SAS", alliance: "skyteam", country: "SE", lcc: false, priceFactor: 1, hubs: ["CPH", "ARN", "OSL"], home: ["SE", "NO", "DK"], regional: ["EU"], longHaul: ["NA", "AS_E"], bags: "full_service", numberBase: 9, narrowbody: ["Airbus A320neo", "Boeing 737-800"], widebody: ["Airbus A350-900", "Airbus A330-300"] },
  { iata: "EI", name: "Aer Lingus", alliance: null, country: "IE", lcc: false, priceFactor: 0.95, hubs: ["DUB"], home: ["IE"], regional: ["EU"], longHaul: ["NA"], bags: "full_service", partners: ["BA", "AA", "UA", "B6"], numberBase: 1, narrowbody: ["Airbus A320neo", "Airbus A321LR"], widebody: ["Airbus A330-300"] },
  { iata: "TP", name: "TAP Air Portugal", alliance: "star", country: "PT", lcc: false, priceFactor: 0.92, hubs: ["LIS", "OPO"], home: ["PT"], regional: ["EU", "AF"], longHaul: ["NA", "LATAM", "AF"], bags: "full_service", numberBase: 2, narrowbody: ["Airbus A320neo", "Airbus A321neo"], widebody: ["Airbus A330-900neo"] },
  { iata: "LO", name: "LOT Polish Airlines", alliance: "star", country: "PL", lcc: false, priceFactor: 0.9, hubs: ["WAW"], home: ["PL"], regional: ["EU", "ME"], longHaul: ["NA", "AS_E", "AS_S"], bags: "full_service", numberBase: 3, narrowbody: ["Boeing 737 MAX 8", "Embraer E195"], widebody: ["Boeing 787-9"] },
  { iata: "AZ", name: "ITA Airways", alliance: null, country: "IT", lcc: false, priceFactor: 1, hubs: ["FCO", "LIN"], home: ["IT"], regional: ["EU"], longHaul: ["NA", "LATAM", "AS_E"], bags: "full_service", partners: ["LH", "LX", "OS"], numberBase: 6, narrowbody: ["Airbus A320neo", "Airbus A220-300"], widebody: ["Airbus A330-900neo", "Airbus A350-900"] },
  { iata: "FR", name: "Ryanair", alliance: null, country: "IE", lcc: true, priceFactor: 0.48, hubs: ["DUB", "STN", "BGY", "CRL", "BCN", "MAD", "LIS", "CIA", "WMI", "BUD"], home: ["IE", "GB", "IT", "ES", "PL"], regional: ["EU"], longHaul: [], bags: "ulcc", numberBase: 1, narrowbody: ["Boeing 737-800", "Boeing 737 MAX 8-200"], widebody: [] },
  { iata: "U2", name: "easyJet", alliance: null, country: "GB", lcc: true, priceFactor: 0.56, hubs: ["LGW", "LTN", "GVA", "BER", "AMS", "MXP", "ORY", "MAN"], home: ["GB"], regional: ["EU"], longHaul: [], bags: "ulcc", numberBase: 8, narrowbody: ["Airbus A320neo", "Airbus A319", "Airbus A321neo"], widebody: [] },
  { iata: "W6", name: "Wizz Air", alliance: null, country: "HU", lcc: true, priceFactor: 0.5, hubs: ["BUD", "LTN", "WAW", "OTP", "SOF", "FCO"], home: ["HU", "PL", "RO"], regional: ["EU", "ME"], longHaul: [], bags: "ulcc", numberBase: 2, narrowbody: ["Airbus A321neo", "Airbus A320neo"], widebody: [] },
  { iata: "VY", name: "Vueling", alliance: null, country: "ES", lcc: true, priceFactor: 0.6, hubs: ["BCN", "FCO", "ORY"], home: ["ES"], regional: ["EU"], longHaul: [], bags: "ulcc", partners: ["IB", "BA"], numberBase: 1, narrowbody: ["Airbus A320neo", "Airbus A321"], widebody: [] },
  { iata: "TK", name: "Turkish Airlines", alliance: "star", country: "TR", lcc: false, priceFactor: 0.95, hubs: ["IST"], home: ["TR"], regional: ["EU", "ME", "AF", "AS_S"], longHaul: ["NA", "LATAM", "AS_E", "AS_SE", "AS_S", "AF", "OC"], bags: "premium", numberBase: 1, narrowbody: ["Airbus A321neo", "Boeing 737 MAX 8", "Airbus A320neo"], widebody: ["Boeing 777-300ER", "Airbus A350-900", "Boeing 787-9", "Airbus A330-300"], partners: ["B6"] },
  { iata: "PC", name: "Pegasus Airlines", alliance: null, country: "TR", lcc: true, priceFactor: 0.55, hubs: ["SAW", "ADB", "AYT", "ESB"], home: ["TR"], regional: ["EU", "ME"], longHaul: [], bags: "ulcc", numberBase: 1, narrowbody: ["Airbus A320neo", "Airbus A321neo", "Boeing 737-800"], widebody: [] },
  { iata: "VF", name: "AJet", alliance: null, country: "TR", lcc: true, priceFactor: 0.58, hubs: ["SAW", "ESB"], home: ["TR"], regional: ["EU", "ME"], longHaul: [], bags: "ulcc", partners: ["TK"], numberBase: 1, narrowbody: ["Boeing 737-800", "Airbus A321neo"], widebody: [] },
  // ---------------------------------------------------------------- Middle East & Africa
  { iata: "EK", name: "Emirates", alliance: null, country: "AE", lcc: false, priceFactor: 1.08, hubs: ["DXB"], home: [], regional: ["ME", "AS_S", "AF", "EU"], longHaul: ["NA", "LATAM", "EU", "AS_E", "AS_SE", "AS_S", "AF", "OC"], bags: "premium", partners: ["B6", "AS", "QF"], numberBase: 2, narrowbody: [], widebody: ["Airbus A380-800", "Boeing 777-300ER", "Airbus A350-900"] },
  { iata: "QR", name: "Qatar Airways", alliance: "oneworld", country: "QA", lcc: false, priceFactor: 1.05, hubs: ["DOH"], home: [], regional: ["ME", "AS_S", "AF", "EU"], longHaul: ["NA", "LATAM", "EU", "AS_E", "AS_SE", "AS_S", "AF", "OC"], bags: "premium", partners: ["B6"], numberBase: 7, narrowbody: ["Airbus A320", "Boeing 737 MAX 8"], widebody: ["Airbus A350-1000", "Boeing 777-300ER", "Boeing 787-9", "Airbus A380-800"] },
  { iata: "EY", name: "Etihad Airways", alliance: null, country: "AE", lcc: false, priceFactor: 1, hubs: ["AUH"], home: [], regional: ["ME", "AS_S", "EU"], longHaul: ["NA", "EU", "AS_E", "AS_SE", "AS_S"], bags: "premium", partners: ["B6", "AA"], numberBase: 1, narrowbody: ["Airbus A321neo"], widebody: ["Boeing 787-10", "Airbus A350-1000", "Boeing 777-300ER"] },
  { iata: "ET", name: "Ethiopian Airlines", alliance: "star", country: "ET", lcc: false, priceFactor: 0.95, hubs: ["ADD"], home: ["ET"], regional: ["AF", "ME"], longHaul: ["NA", "EU", "AS_E", "AS_S"], bags: "premium", numberBase: 5, narrowbody: ["Boeing 737 MAX 8"], widebody: ["Boeing 787-9", "Airbus A350-900"] },
  { iata: "MS", name: "EgyptAir", alliance: "star", country: "EG", lcc: false, priceFactor: 0.9, hubs: ["CAI"], home: ["EG"], regional: ["AF", "ME", "EU"], longHaul: ["NA", "AS_E"], bags: "premium", numberBase: 9, narrowbody: ["Airbus A320neo", "Boeing 737-800"], widebody: ["Boeing 787-9"] },
  { iata: "AT", name: "Royal Air Maroc", alliance: "oneworld", country: "MA", lcc: false, priceFactor: 0.9, hubs: ["CMN"], home: ["MA"], regional: ["AF", "EU"], longHaul: ["NA", "LATAM"], bags: "full_service", numberBase: 2, narrowbody: ["Boeing 737-800", "Boeing 737 MAX 8"], widebody: ["Boeing 787-9"] },
  // ---------------------------------------------------------------- Asia-Pacific
  { iata: "JL", name: "Japan Airlines", alliance: "oneworld", country: "JP", lcc: false, priceFactor: 1.05, hubs: ["HND", "NRT"], home: ["JP"], regional: ["AS_E", "AS_SE"], longHaul: ["NA", "EU", "OC", "AS_S", "AS_SE"], bags: "premium", numberBase: 0, narrowbody: ["Boeing 737-800", "Airbus A321neo"], widebody: ["Airbus A350-1000", "Boeing 787-9", "Boeing 777-300ER"], partners: ["AA"] },
  { iata: "NH", name: "ANA", alliance: "star", country: "JP", lcc: false, priceFactor: 1.05, hubs: ["HND", "NRT"], home: ["JP"], regional: ["AS_E", "AS_SE"], longHaul: ["NA", "EU", "OC", "AS_S", "AS_SE"], bags: "premium", numberBase: 0, narrowbody: ["Boeing 737-800", "Airbus A321neo"], widebody: ["Boeing 787-9", "Boeing 777-300ER", "Boeing 787-10"], partners: ["UA"] },
  { iata: "ZG", name: "ZIPAIR", alliance: null, country: "JP", lcc: true, priceFactor: 0.62, hubs: ["NRT"], home: [], regional: ["AS_E", "AS_SE"], longHaul: ["NA"], bags: "ulcc", partners: ["JL"], numberBase: 0, narrowbody: [], widebody: ["Boeing 787-8"] },
  { iata: "KE", name: "Korean Air", alliance: "skyteam", country: "KR", lcc: false, priceFactor: 1, hubs: ["ICN"], home: ["KR"], regional: ["AS_E", "AS_SE"], longHaul: ["NA", "EU", "OC", "AS_S", "ME"], bags: "premium", numberBase: 0, narrowbody: ["Boeing 737 MAX 8", "Airbus A321neo"], widebody: ["Boeing 777-300ER", "Boeing 787-9", "Airbus A380-800", "Boeing 747-8"], partners: ["DL"] },
  { iata: "OZ", name: "Asiana Airlines", alliance: "star", country: "KR", lcc: false, priceFactor: 0.97, hubs: ["ICN"], home: ["KR"], regional: ["AS_E", "AS_SE"], longHaul: ["NA", "EU"], bags: "premium", numberBase: 2, narrowbody: ["Airbus A321neo"], widebody: ["Airbus A350-900", "Boeing 777-200ER", "Airbus A380-800"] },
  { iata: "SQ", name: "Singapore Airlines", alliance: "star", country: "SG", lcc: false, priceFactor: 1.1, hubs: ["SIN"], home: [], regional: ["AS_SE", "AS_E", "AS_S", "OC"], longHaul: ["NA", "EU", "OC", "AS_E", "AS_S", "AF", "ME"], bags: "premium", numberBase: 0, narrowbody: ["Boeing 737-8"], widebody: ["Airbus A350-900ULR", "Boeing 777-300ER", "Airbus A380-800", "Boeing 787-10"] },
  { iata: "CX", name: "Cathay Pacific", alliance: "oneworld", country: "HK", lcc: false, priceFactor: 1.05, hubs: ["HKG"], home: [], regional: ["AS_E", "AS_SE", "AS_S"], longHaul: ["NA", "EU", "OC", "ME", "AS_S"], bags: "premium", numberBase: 8, narrowbody: ["Airbus A321neo"], widebody: ["Airbus A350-1000", "Boeing 777-300ER", "Airbus A330-300"] },
  { iata: "BR", name: "EVA Air", alliance: "star", country: "TW", lcc: false, priceFactor: 0.98, hubs: ["TPE"], home: [], regional: ["AS_E", "AS_SE"], longHaul: ["NA", "EU", "OC"], bags: "premium", numberBase: 0, narrowbody: ["Airbus A321"], widebody: ["Boeing 777-300ER", "Boeing 787-10", "Airbus A350-1000"] },
  { iata: "CI", name: "China Airlines", alliance: "skyteam", country: "TW", lcc: false, priceFactor: 0.94, hubs: ["TPE"], home: [], regional: ["AS_E", "AS_SE"], longHaul: ["NA", "EU", "OC"], bags: "premium", numberBase: 0, narrowbody: ["Airbus A321neo"], widebody: ["Airbus A350-900", "Boeing 777-300ER"] },
  { iata: "TG", name: "Thai Airways", alliance: "star", country: "TH", lcc: false, priceFactor: 0.92, hubs: ["BKK"], home: ["TH"], regional: ["AS_SE", "AS_E", "AS_S"], longHaul: ["EU", "OC"], bags: "premium", numberBase: 6, narrowbody: ["Airbus A320"], widebody: ["Boeing 787-9", "Airbus A350-900", "Boeing 777-300ER"] },
  { iata: "AI", name: "Air India", alliance: "star", country: "IN", lcc: false, priceFactor: 0.9, hubs: ["DEL", "BOM"], home: ["IN"], regional: ["AS_S", "ME", "AS_SE"], longHaul: ["NA", "EU", "OC", "AS_E"], bags: "premium", numberBase: 1, narrowbody: ["Airbus A320neo", "Airbus A321neo"], widebody: ["Boeing 777-300ER", "Boeing 787-8", "Airbus A350-900"] },
  { iata: "CA", name: "Air China", alliance: "star", country: "CN", lcc: false, priceFactor: 0.9, hubs: ["PEK", "PKX"], home: ["CN"], regional: ["AS_E", "AS_SE"], longHaul: ["NA", "EU", "OC"], bags: "premium", numberBase: 9, narrowbody: ["Airbus A320neo", "Boeing 737-800"], widebody: ["Boeing 777-300ER", "Airbus A350-900", "Boeing 747-8"] },
  { iata: "MU", name: "China Eastern", alliance: "skyteam", country: "CN", lcc: false, priceFactor: 0.88, hubs: ["PVG", "SHA"], home: ["CN"], regional: ["AS_E", "AS_SE"], longHaul: ["NA", "EU", "OC"], bags: "premium", numberBase: 5, narrowbody: ["Airbus A320neo", "COMAC C919"], widebody: ["Boeing 777-300ER", "Airbus A350-900"] },
  { iata: "PR", name: "Philippine Airlines", alliance: null, country: "PH", lcc: false, priceFactor: 0.92, hubs: ["MNL"], home: ["PH"], regional: ["AS_SE", "AS_E"], longHaul: ["NA", "OC"], bags: "premium", numberBase: 1, narrowbody: ["Airbus A321neo"], widebody: ["Airbus A350-900", "Boeing 777-300ER"] },
  { iata: "QF", name: "Qantas", alliance: "oneworld", country: "AU", lcc: false, priceFactor: 1.08, hubs: ["SYD", "MEL", "BNE", "PER"], home: ["AU"], regional: ["OC", "AS_SE"], longHaul: ["NA", "EU", "AS_E", "AS_SE", "AS_S", "LATAM"], bags: "premium", partners: ["EK"], numberBase: 0, narrowbody: ["Boeing 737-800", "Airbus A321XLR"], widebody: ["Boeing 787-9", "Airbus A380-800", "Airbus A330-300"] },
  { iata: "NZ", name: "Air New Zealand", alliance: "star", country: "NZ", lcc: false, priceFactor: 1.02, hubs: ["AKL"], home: ["NZ"], regional: ["OC"], longHaul: ["NA", "AS_E", "AS_SE"], bags: "premium", numberBase: 0, narrowbody: ["Airbus A321neo", "Airbus A320neo"], widebody: ["Boeing 787-9", "Boeing 777-300ER"] },
];

export const AIRLINE_BY_CODE = new Map(AIRLINES.map((a) => [a.iata, a]));

/** Regional operators referenced in operated-by lines. */
export const OPERATOR_NAMES: Record<string, string> = Object.fromEntries(
  AIRLINES.flatMap((a) => (a.regionalOperator ? [[a.regionalOperator.iata, a.regionalOperator.name]] : [])),
);

/** Two carriers can sell one ticket (same airline, same alliance or an explicit partnership). */
export function canInterline(a: AirlineInfo, b: AirlineInfo): boolean {
  if (a.iata === b.iata) return true;
  if (a.alliance && a.alliance === b.alliance) return true;
  return Boolean(a.partners?.includes(b.iata) || b.partners?.includes(a.iata));
}

export const NARROWBODY_FALLBACK = [...NB_A, ...NB_B, ...NB_MIX];
