// Static city→coordinates lookup. Keys are lowercase "city, st" (two-letter state).
// Covers the top US cities by population plus veterinary hubs.
const COORDS: Record<string, [number, number]> = {
  // Northeast
  "new york, ny": [40.7128, -74.006], "brooklyn, ny": [40.6782, -73.9442],
  "buffalo, ny": [42.8864, -78.8784], "albany, ny": [42.6526, -73.7562],
  "rochester, ny": [43.1566, -77.6088], "yonkers, ny": [40.9312, -73.8988],
  "boston, ma": [42.3601, -71.0589], "worcester, ma": [42.2626, -71.8023],
  "springfield, ma": [42.1015, -72.5898], "cambridge, ma": [42.3736, -71.1097],
  "lowell, ma": [42.6334, -71.3162], "providence, ri": [41.824, -71.4128],
  "hartford, ct": [41.7658, -72.6851], "bridgeport, ct": [41.1865, -73.1952],
  "new haven, ct": [41.3083, -72.9279], "stamford, ct": [41.0534, -73.5387],
  "portland, me": [43.6591, -70.2568], "manchester, nh": [42.9956, -71.4548],
  "concord, nh": [43.2081, -71.5376], "burlington, vt": [44.4759, -73.2121],
  "philadelphia, pa": [39.9526, -75.1652], "pittsburgh, pa": [40.4406, -79.9959],
  "allentown, pa": [40.6023, -75.4714], "harrisburg, pa": [40.2732, -76.8867],
  "newark, nj": [40.7357, -74.1724], "jersey city, nj": [40.7178, -74.0431],
  "trenton, nj": [40.2171, -74.7429], "wilmington, de": [39.7447, -75.5484],
  "baltimore, md": [39.2904, -76.6122], "annapolis, md": [38.9784, -76.4922],
  "washington, dc": [38.9072, -77.0369], "washington": [38.9072, -77.0369],
  "leesburg, va": [39.1154, -77.5636],   "leesburg": [39.1154, -77.5636],
  "silver spring, md": [38.9907, -77.026],
  // Southeast
  "virginia beach, va": [36.8529, -75.978], "norfolk, va": [36.8508, -76.2859],
  "richmond, va": [37.5407, -77.436], "roanoke, va": [37.271, -79.9414],
  "arlington, va": [38.8816, -77.0910], "alexandria, va": [38.8048, -77.0469],
  "charleston, wv": [38.3498, -81.6326], "charlotte, nc": [35.2271, -80.8431],
  "raleigh, nc": [35.7796, -78.6382], "greensboro, nc": [36.0726, -79.792],
  "durham, nc": [35.994, -78.8986], "winston-salem, nc": [36.0999, -80.2442],
  "wilmington, nc": [34.2257, -77.9447], "chapel hill, nc": [35.9132, -79.0558],
  "columbia, sc": [34.0007, -81.0348], "charleston, sc": [32.7765, -79.9311],
  "greenville, sc": [34.8526, -82.394], "atlanta, ga": [33.749, -84.388],
  "savannah, ga": [32.0835, -81.0998], "augusta, ga": [33.4735, -82.0105],
  "macon, ga": [32.8407, -83.6324], "jacksonville, fl": [30.3322, -81.6557],
  "miami, fl": [25.7617, -80.1918], "tampa, fl": [27.9506, -82.4572],
  "orlando, fl": [28.5383, -81.3792], "st. petersburg, fl": [27.7676, -82.6403],
  "fort lauderdale, fl": [26.1224, -80.1373], "tallahassee, fl": [30.4518, -84.2807],
  "gainesville, fl": [29.6516, -82.3248], "naples, fl": [26.142, -81.7948],
  "sarasota, fl": [27.3364, -82.5307],
  "birmingham, al": [33.5186, -86.8104], "montgomery, al": [32.3669, -86.2999],
  "huntsville, al": [34.7304, -86.5861], "mobile, al": [30.6954, -88.0399],
  "jackson, ms": [32.2988, -90.1848], "gulfport, ms": [30.3674, -89.0928],
  "memphis, tn": [35.1495, -90.049], "nashville, tn": [36.1627, -86.7816],
  "knoxville, tn": [35.9606, -83.9207], "chattanooga, tn": [35.0456, -85.3097],
  "louisville, ky": [38.2527, -85.7585], "lexington, ky": [38.0406, -84.5037],
  "new orleans, la": [29.9511, -90.0715], "baton rouge, la": [30.4515, -91.1871],
  "shreveport, la": [32.5252, -93.7502], "lafayette, la": [30.2241, -92.0198],
  "little rock, ar": [34.7465, -92.2896], "fayetteville, ar": [36.0822, -94.1719],
  // Midwest
  "chicago, il": [41.8781, -87.6298], "aurora, il": [41.7606, -88.3201],
  "naperville, il": [41.7508, -88.1535], "springfield, il": [39.7817, -89.6501],
  "peoria, il": [40.6936, -89.589], "rockford, il": [42.2711, -89.094],
  "indianapolis, in": [39.7684, -86.1581], "fort wayne, in": [41.1306, -85.1289],
  "evansville, in": [37.9716, -87.5711], "south bend, in": [41.6764, -86.252],
  "columbus, oh": [39.9612, -82.9988], "cleveland, oh": [41.4993, -81.6944],
  "cincinnati, oh": [39.1031, -84.512], "toledo, oh": [41.6528, -83.5379],
  "akron, oh": [41.0814, -81.519], "dayton, oh": [39.7589, -84.1916],
  "canton, oh": [40.7989, -81.3784],
  "detroit, mi": [42.3314, -83.0458], "grand rapids, mi": [42.9634, -85.6681],
  "lansing, mi": [42.7325, -84.5555], "ann arbor, mi": [42.2808, -83.743],
  "flint, mi": [43.0125, -83.6875], "sterling heights, mi": [42.5803, -83.0302],
  "milwaukee, wi": [43.0389, -87.9065], "madison, wi": [43.0731, -89.4012],
  "green bay, wi": [44.5133, -88.0133], "kenosha, wi": [42.5847, -87.8212],
  "minneapolis, mn": [44.9778, -93.265], "st. paul, mn": [44.9537, -93.09],
  "rochester, mn": [44.0121, -92.4802], "duluth, mn": [46.7867, -92.1005],
  "des moines, ia": [41.5868, -93.625], "cedar rapids, ia": [41.9779, -91.6656],
  "iowa city, ia": [41.6611, -91.5302], "kansas city, mo": [39.0997, -94.5786],
  "st. louis, mo": [38.627, -90.1994], "springfield, mo": [37.2153, -93.2982],
  "columbia, mo": [38.9517, -92.3341], "omaha, ne": [41.2565, -95.9345],
  "lincoln, ne": [40.8136, -96.7026], "wichita, ks": [37.6872, -97.3301],
  "overland park, ks": [38.9822, -94.6708], "topeka, ks": [39.0558, -95.689],
  "sioux falls, sd": [43.5473, -96.7283], "fargo, nd": [46.8772, -96.7898],
  // South-Central / Texas
  "houston, tx": [29.7604, -95.3698], "san antonio, tx": [29.4241, -98.4936],
  "dallas, tx": [32.7767, -96.797], "austin, tx": [30.2672, -97.7431],
  "fort worth, tx": [32.7555, -97.3308], "el paso, tx": [31.7619, -106.485],
  "arlington, tx": [32.7357, -97.1081], "corpus christi, tx": [27.8006, -97.3964],
  "plano, tx": [33.0198, -96.6989], "lubbock, tx": [33.5779, -101.8552],
  "amarillo, tx": [35.222, -101.8313], "garland, tx": [32.9126, -96.6389],
  "irving, tx": [32.814, -96.9489], "laredo, tx": [27.5306, -99.4803],
  "college station, tx": [30.6280, -96.3344], "waco, tx": [31.5493, -97.1467],
  "oklahoma city, ok": [35.4676, -97.5164], "tulsa, ok": [36.154, -95.9928],
  "albuquerque, nm": [35.0844, -106.6504], "santa fe, nm": [35.687, -105.9378],
  "las vegas, nv": [36.1699, -115.1398], "henderson, nv": [36.0395, -114.9817],
  "reno, nv": [39.5296, -119.8138],
  // Mountain West
  "denver, co": [39.7392, -104.9903], "colorado springs, co": [38.8339, -104.8214],
  "aurora, co": [39.7294, -104.8319], "fort collins, co": [40.5853, -105.0844],
  "boulder, co": [40.015, -105.2705], "pueblo, co": [38.2544, -104.6091],
  "salt lake city, ut": [40.7608, -111.891], "west valley city, ut": [40.6916, -112.0011],
  "provo, ut": [40.2338, -111.6585], "ogden, ut": [41.223, -111.9738],
  "phoenix, az": [33.4484, -112.074], "tucson, az": [32.2226, -110.9747],
  "scottsdale, az": [33.4942, -111.9261], "mesa, az": [33.4152, -111.8315],
  "chandler, az": [33.3062, -111.8413], "tempe, az": [33.4255, -111.94],
  "gilbert, az": [33.3528, -111.789], "glendale, az": [33.5387, -112.1860],
  "boise, id": [43.615, -116.2023], "meridian, id": [43.6121, -116.3915],
  "billings, mt": [45.7833, -108.5007], "missoula, mt": [46.8721, -113.994],
  "great falls, mt": [47.5002, -111.2998], "casper, wy": [42.8501, -106.3252],
  "cheyenne, wy": [41.14, -104.8202],
  // Pacific
  "los angeles, ca": [34.0522, -118.2437], "san francisco, ca": [37.7749, -122.4194],
  "san diego, ca": [32.7157, -117.1611], "san jose, ca": [37.3382, -121.8863],
  "fresno, ca": [36.7378, -119.7871], "sacramento, ca": [38.5816, -121.4944],
  "long beach, ca": [33.7701, -118.1937], "oakland, ca": [37.8044, -122.2712],
  "bakersfield, ca": [35.3733, -119.0187], "anaheim, ca": [33.8353, -117.9145],
  "riverside, ca": [33.9806, -117.3755], "stockton, ca": [37.9577, -121.2908],
  "irvine, ca": [33.6846, -117.8265], "fremont, ca": [37.5485, -121.9886],
  "santa ana, ca": [33.7455, -117.8677], "pasadena, ca": [34.1478, -118.1445],
  "santa barbara, ca": [34.4208, -119.6982], "santa rosa, ca": [38.4404, -122.7141],
  "ventura, ca": [34.2805, -119.2945], "modesto, ca": [37.6391, -120.9969],
  "chula vista, ca": [32.6401, -117.0842], "santa clarita, ca": [34.3917, -118.5426],
  "davis, ca": [38.5449, -121.7405],
  "seattle, wa": [47.6062, -122.3321], "spokane, wa": [47.6588, -117.426],
  "tacoma, wa": [47.2529, -122.4443], "bellevue, wa": [47.6101, -122.2015],
  "olympia, wa": [47.0379, -122.9007], "kent, wa": [47.3809, -122.2348],
  "portland, or": [45.5051, -122.675], "eugene, or": [44.0521, -123.0868],
  "salem, or": [44.9429, -123.0351], "bend, or": [44.0582, -121.3153],
  "gresham, or": [45.4982, -122.4302], "corvallis, or": [44.5646, -123.2620],
  "anchorage, ak": [61.2181, -149.9003], "fairbanks, ak": [64.8378, -147.7164],
  "honolulu, hi": [21.3069, -157.8583], "hilo, hi": [19.7297, -155.09],
};

// Maps full US state names to two-letter abbreviations
const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

export function normalizeState(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.trim();
  if (s.length <= 2) return s.toUpperCase();
  return STATE_NAMES[s.toLowerCase()] ?? s.substring(0, 2).toUpperCase();
}

export function geocodeLocation(
  city: string | null | undefined,
  state: string | null | undefined
): [number, number] | null {
  if (!city) return null;
  const c = city.trim().toLowerCase();
  const st = normalizeState(state);
  const key = st ? `${c}, ${st.toLowerCase()}` : c;
  return COORDS[key] ?? null;
}

// Small deterministic jitter so multiple advisors in the same city
// are spread in a circle rather than stacked on a single point.
export function getJitter(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h) + id.charCodeAt(i);
    h |= 0;
  }
  const angle = (Math.abs(h) % 360) * (Math.PI / 180);
  const r = 0.13; // ~9 miles spread
  return [Math.sin(angle) * r, Math.cos(angle) * r];
}
