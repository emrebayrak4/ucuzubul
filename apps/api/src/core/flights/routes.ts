/**
 * Curated popular routes for the DEMO fare engine: "A B carrier carrier…" = nonstop carriers on A⇄B.
 * Carriers are airlines that serve the market in reality; schedules/prices generated from them are still demo.
 * Routes not listed here fall back to the generic hub/network model in demo-engine.ts.
 */
const RAW = `
JFK LAX AA DL B6
JFK SFO AA DL B6
EWR SFO UA AS
EWR LAX UA
LGA ORD AA UA DL
LGA ATL DL WN
JFK MIA AA DL B6
LGA MIA AA DL
EWR MCO UA B6 NK
JFK MCO B6 DL
LGA DFW AA DL
JFK SEA DL AS B6
BOS LAX DL B6 AA
BOS SFO B6 UA DL AS
BOS ORD AA UA B6
BOS ATL DL WN
BOS MCO B6 DL WN
ORD LAX AA UA
ORD SFO UA AA
ORD DEN UA WN F9
ATL LAX DL
ATL MCO DL WN F9 NK
ATL DFW DL AA
ATL MIA DL AA
DFW LAX AA DL
DFW ORD AA UA
LAX SFO UA AS DL AA WN
LAX SEA AS DL
LAX LAS WN DL AA NK
LAX HNL HA AA DL UA AS
SFO HNL UA HA AS
SFO SEA AS UA DL
DEN LAX UA WN F9
DEN PHX WN UA F9 AA
LAS SFO WN UA AS
DCA BOS AA DL B6
IAD SFO UA
IAH LAX UA
IAH ORD UA AA
MSP ORD DL UA AA
DTW LGA DL
SEA ANC AS DL
PHX LAX AA WN
DAL HOU WN
AUS LAX AA WN DL
BNA LGA DL AA
MCO PHL AA F9 WN
CLT LGA AA
SLC LAX DL
FLL LGA DL B6 NK
MSY ATL DL WN
JFK LHR BA AA VS DL B6
EWR LHR UA BA VS
BOS LHR BA VS DL
ORD LHR AA BA UA
LAX LHR BA AA VS UA
SFO LHR BA UA VS
IAD LHR BA UA
MIA LHR BA AA
ATL LHR DL VS
DFW LHR AA BA
YYZ LHR AC BA
JFK CDG AF DL
EWR CDG UA AF
LAX CDG AF DL
ATL CDG DL AF
JFK FRA LH DL
ORD FRA LH UA
EWR FRA UA LH
IAD FRA UA LH
SFO FRA LH UA
JFK MUC LH
JFK AMS DL KL
ATL AMS DL KL
JFK MAD IB AA
JFK FCO AZ DL AA
EWR FCO UA
JFK BCN AA DL
JFK DUB EI DL
BOS DUB EI
JFK IST TK
ORD IST TK
LAX IST TK
IAD IST TK
MIA IST TK
JFK ZRH LX
JFK LIS TP
EWR LIS TP UA
JFK ATH DL
LAX HND AA DL UA NH JL
SFO HND UA NH JL
SFO NRT ZG
LAX NRT ZG
JFK HND JL NH
ORD HND UA JL NH
SEA HND DL
LAX ICN KE OZ
SFO ICN KE OZ UA
ATL ICN DL KE
JFK ICN KE OZ
LAX TPE BR CI
SFO TPE BR CI UA
SFO SIN SQ UA
EWR SIN SQ
LAX SIN SQ
SFO HKG CX UA
JFK HKG CX
LAX HKG CX
LAX MNL PR
SFO MNL PR UA
LAX SYD QF DL UA
SFO SYD UA QF
DFW SYD QF
LAX AKL NZ
SFO DEL AI
EWR DEL AI UA
JFK DEL AI
JFK DXB EK
LAX DXB EK
IAD DXB EK
JFK DOH QR
ORD DOH QR
DFW DOH QR
IAD DOH QR
MIA BOG AV AA
MIA GRU AA LA
JFK GRU AA LA
ATL GRU DL
MIA LIM AA LA
MIA SCL AA LA
LAX MEX AM DL
JFK MEX AM DL
IAH MEX UA AM
DFW CUN AA
IAH CUN UA
ATL CUN DL WN
LAX CUN AA DL AS
JFK CUN B6 DL AA
MIA PTY CM AA
JFK SJU B6 DL
MCO SJU B6 WN F9
LAX GDL Y4
MIA EZE AA
JFK EZE AA
LHR CDG BA AF
LHR AMS BA KL
LHR FRA BA LH
LHR MAD BA IB
LHR DUB BA EI
LHR IST BA TK
LGW BCN BA U2 VY
STN DUB FR
LTN BUD W6
LHR FCO BA AZ
CDG FCO AF AZ
CDG BCN AF VY
CDG IST AF TK
FRA IST LH TK
MUC IST LH TK
AMS IST KL TK
IST ADB TK
SAW ADB PC VF
IST AYT TK
SAW AYT PC VF
IST ESB TK
SAW ESB PC VF
IST BJV TK
IST DLM TK
SAW DLM PC
IST ATH TK
IST FCO TK AZ
IST BCN TK
IST DXB TK EK
IST DOH TK QR
SAW STN PC
SAW BER PC
MAD BCN IB VY
MAD LIS IB TP
LIS OPO TP
BCN FCO VY
AMS BCN KL VY
FRA MUC LH
ZRH LHR LX BA
VIE FRA OS LH
CPH LHR SK BA
HEL LHR AY BA
WAW LHR LO
DUB BCN EI FR
`;

const key = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export const CURATED_ROUTES: ReadonlyMap<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const line of RAW.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [a, b, ...carriers] = parts as [string, string, ...string[]];
    m.set(key(a, b), carriers);
  }
  return m;
})();

export function curatedCarriers(a: string, b: string): string[] | undefined {
  return CURATED_ROUTES.get(key(a, b));
}

/** Popular destinations offered by "Explore everywhere" (airport codes; served via the same demo/live fare source). */
export const EXPLORE_DESTINATIONS = [
  // US & Canada
  "LAX", "SFO", "LAS", "MCO", "MIA", "FLL", "JFK", "BOS", "ORD", "DEN", "SEA", "ATL", "DFW", "AUS", "MSY", "BNA", "SAN", "PHX", "SLC", "HNL", "OGG", "ANC", "DCA", "TPA", "CHS", "SAV", "PDX", "YYZ", "YVR", "YUL",
  // Mexico, Caribbean, Latin America
  "CUN", "SJD", "PVR", "MEX", "SJU", "PUJ", "MBJ", "NAS", "AUA", "SJO", "LIR", "PTY", "BOG", "MDE", "CTG", "LIM", "CUZ", "GRU", "GIG", "EZE", "SCL",
  // Europe
  "LHR", "CDG", "AMS", "FRA", "MUC", "MAD", "BCN", "LIS", "OPO", "FCO", "MXP", "VCE", "NAP", "ATH", "DUB", "EDI", "ZRH", "VIE", "PRG", "BUD", "CPH", "ARN", "OSL", "HEL", "KEF", "WAW", "BER", "NCE", "SPU", "DBV",
  // Turkey
  "IST", "SAW", "AYT", "ADB", "BJV", "DLM", "ESB", "NAV",
  // Middle East & Africa
  "DXB", "DOH", "AUH", "TLV", "AMM", "CAI", "RAK", "CMN", "CPT", "JNB", "NBO",
  // Asia-Pacific
  "HND", "NRT", "KIX", "ICN", "TPE", "HKG", "SIN", "BKK", "HKT", "DPS", "MNL", "SGN", "HAN", "KUL", "DEL", "BOM", "SYD", "MEL", "AKL", "NAN",
];
