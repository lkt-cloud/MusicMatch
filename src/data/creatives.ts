import type { Creative, Role, Social } from './types';
import { travels } from './roles';
import { toGenreIds } from './genres';

// Sample data until there is a backend. Most people only share their city (their pin
// sits over the city's name); studios and a few others show an exact spot nearby.

const CITIES: Record<string, { coords: [number, number]; country: string }> = {
  Atlanta: { coords: [-84.388, 33.749], country: 'US' },
  'Los Angeles': { coords: [-118.244, 34.052], country: 'US' },
  'New York': { coords: [-74.006, 40.713], country: 'US' },
  Houston: { coords: [-95.37, 29.76], country: 'US' },
  Chicago: { coords: [-87.63, 41.878], country: 'US' },
  Miami: { coords: [-80.192, 25.762], country: 'US' },
  Memphis: { coords: [-90.049, 35.149], country: 'US' },
  Detroit: { coords: [-83.046, 42.331], country: 'US' },
  'New Orleans': { coords: [-90.072, 29.951], country: 'US' },
  Oakland: { coords: [-122.271, 37.804], country: 'US' },
  Toronto: { coords: [-79.383, 43.653], country: 'CA' },
  Kingston: { coords: [-76.81, 18.018], country: 'JM' },
  'Mexico City': { coords: [-99.133, 19.433], country: 'MX' },
  'São Paulo': { coords: [-46.633, -23.551], country: 'BR' },
  London: { coords: [-0.128, 51.507], country: 'GB' },
  Paris: { coords: [2.352, 48.857], country: 'FR' },
  Berlin: { coords: [13.405, 52.52], country: 'DE' },
  Stockholm: { coords: [18.069, 59.329], country: 'SE' },
  Lagos: { coords: [3.379, 6.524], country: 'NG' },
  Accra: { coords: [-0.187, 5.604], country: 'GH' },
  Nairobi: { coords: [36.822, -1.292], country: 'KE' },
  Johannesburg: { coords: [28.047, -26.204], country: 'ZA' },
  Mumbai: { coords: [72.878, 19.076], country: 'IN' },
  Seoul: { coords: [126.978, 37.566], country: 'KR' },
  Tokyo: { coords: [139.65, 35.676], country: 'JP' },
  Sydney: { coords: [151.209, -33.869], country: 'AU' },
};

export const CITY_NAMES = Object.keys(CITIES);
export const cityCoords = (city: string) => CITIES[city].coords;

const RATES: Record<Role, string[]> = {
  artist: ['Open to collabs', 'Features from $300', 'Open to collabs'],
  producer: ['Beats from $150', 'Leases from $40', 'Custom beats $400+'],
  videographer: ['Shoots from $400', 'Full video $1,200+', 'Day rate $650'],
  studio: ['$45 / hr', '$60 / hr with engineer', '$35 / hr'],
  engineer: ['Mix $120 / song', 'Mix + master $180', 'Master $60 / song'],
};

const BIOS: Record<Role, string[]> = {
  artist: [
    'Writing every day, recording every week. Looking for producers with a darker, cinematic sound.',
    'Melodic rap with a live-band feel. Always down to build with new people in the city.',
    'Storytelling first. Dropping an EP this winter and need visuals to match.',
  ],
  producer: [
    'Sample-heavy boom bap and soul chops. Stems included with every lease.',
    'Trap and drill with orchestral layers. Fast turnaround, clean sessions.',
    'Multi-instrumentalist — keys, bass, 808s. I like building records from scratch in the room.',
  ],
  videographer: [
    'Music videos, visualizers and BTS. Shooting on cinema cameras with a small, quick crew.',
    'Film-look color, handheld energy. I plan the treatment with you before we roll.',
    'Performance videos and live sessions. Drone and gimbal included.',
  ],
  studio: [
    'Two treated rooms, Neve preamps, vocal booth, lounge. Engineers on call.',
    'Cozy tracking room built for vocals. Late sessions welcome.',
    'Full production suite with a live room for bands. Parking on site.',
  ],
  engineer: [
    'Mixing rap vocals so they sit right on top. Revisions until it hits.',
    'Mix and master engineer. Loud, clear, and still breathing.',
    'Tracking and mixing — I work fast and I keep your takes organized.',
  ],
};

const WORK: Record<Role, string[]> = {
  artist: ['Late Night Drive', 'Northside', 'Paper Trails', 'No Ceiling'],
  producer: ['Velvet Loop', 'Glass Hours', 'Red Clay', 'Sunday Service'],
  videographer: ['“Northside” — music video', 'Live at the Warehouse', 'Visualizer series', 'Tour recap'],
  studio: ['Room A', 'Vocal booth', 'Live room', 'Control room'],
  engineer: ['Before / after — vocal chain', 'Mix reel 2026', 'Master reel', 'Stems breakdown'],
};

type Seed = [name: string, handle: string, role: Role, city: string, genres: string[], available?: boolean];

const SEEDS: Seed[] = [
  ['Dre Solace', 'dresolace', 'producer', 'Atlanta', ['Trap', 'Soul']],
  ['Kaya Wells', 'kayawells', 'videographer', 'Atlanta', ['Music video', 'BTS']],
  ['Southpaw Sound', 'southpawsound', 'studio', 'Atlanta', ['Recording', 'Mixing']],
  ['Lil Merit', 'lilmerit', 'artist', 'Atlanta', ['Rap', 'Melodic']],
  ['Tasha Grey', 'tashagrey', 'engineer', 'Atlanta', ['Mixing', 'Mastering'], false],
  ['Juno Park', 'junopark', 'producer', 'Atlanta', ['R&B', 'Trap']],
  ['Marcus Hale', 'marcushale', 'videographer', 'Los Angeles', ['Music video', 'Color']],
  ['Canyon Room', 'canyonroom', 'studio', 'Los Angeles', ['Recording', 'Live room']],
  ['Nia Vaughn', 'niavaughn', 'artist', 'Los Angeles', ['Rap', 'Alt']],
  ['808 Ezra', '808ezra', 'producer', 'Los Angeles', ['West Coast', 'Trap']],
  ['Leo Marsh', 'leomarsh', 'engineer', 'Los Angeles', ['Mixing']],
  ['Bodega Beats', 'bodegabeats', 'producer', 'New York', ['Boom bap', 'Drill']],
  ['Iris Cole', 'iriscole', 'videographer', 'New York', ['Visualizers', 'Live']],
  ['Canal St. Studio', 'canalst', 'studio', 'New York', ['Recording']],
  ['Kid Aurelio', 'kidaurelio', 'artist', 'New York', ['Drill', 'Rap']],
  ['Selah Moore', 'selahmoore', 'engineer', 'New York', ['Mastering'], false],
  ['Big Lou', 'biglou', 'artist', 'Houston', ['Rap', 'Chopped']],
  ['Third Ward Tapes', 'thirdward', 'studio', 'Houston', ['Recording', 'Mixing']],
  ['Ray Benton', 'raybenton', 'videographer', 'Houston', ['Music video']],
  ['Tre Knox', 'treknox', 'producer', 'Chicago', ['Drill', 'Soul']],
  ['Maya Lind', 'mayalind', 'engineer', 'Chicago', ['Mixing', 'Tracking']],
  ['Southside Lens', 'southsidelens', 'videographer', 'Chicago', ['Music video', 'Doc']],
  ['Coral Room', 'coralroom', 'studio', 'Miami', ['Recording']],
  ['Vice Kid', 'vicekid', 'artist', 'Miami', ['Rap', 'Latin']],
  ['Beale Street Keys', 'bealekeys', 'producer', 'Memphis', ['Memphis', 'Soul']],
  ['Motor City Mix', 'motorcitymix', 'engineer', 'Detroit', ['Mixing']],
  ['Tay Rivers', 'tayrivers', 'artist', 'Detroit', ['Rap']],
  ['Bayou Films', 'bayoufilms', 'videographer', 'New Orleans', ['Music video', 'Live']],
  ['Town Business', 'townbusiness', 'producer', 'Oakland', ['Bay', 'Funk']],
  ['Six North', 'sixnorth', 'studio', 'Toronto', ['Recording', 'Mixing']],
  ['Amara J', 'amaraj', 'artist', 'Toronto', ['R&B', 'Rap']],
  ['Yard Riddims', 'yardriddims', 'producer', 'Kingston', ['Dancehall', 'Reggae']],
  ['Luz Ortega', 'luzortega', 'videographer', 'Mexico City', ['Music video', 'Film']],
  ['Beto Ruiz', 'betoruiz', 'producer', 'Mexico City', ['Corridos', 'Trap']],
  ['Favela Frame', 'favelaframe', 'videographer', 'São Paulo', ['Music video']],
  ['MC Rocha', 'mcrocha', 'artist', 'São Paulo', ['Funk', 'Rap']],
  ['Grime Lab', 'grimelab', 'studio', 'London', ['Recording', 'Mixing']],
  ['Kofi Mensah', 'kofimensah', 'producer', 'London', ['Grime', 'UK drill']],
  ['Ellie Shaw', 'ellieshaw', 'videographer', 'London', ['Music video', 'Fashion']],
  ['Saint Luc', 'saintluc', 'engineer', 'Paris', ['Mixing', 'Mastering']],
  ['Noé B.', 'noeb', 'artist', 'Paris', ['Rap FR']],
  ['Kreuzberg Tonstudio', 'kreuzberg', 'studio', 'Berlin', ['Recording']],
  ['Linnea Ek', 'linneaek', 'producer', 'Stockholm', ['Pop', 'Trap']],
  ['Tunde Ade', 'tundeade', 'producer', 'Lagos', ['Afrobeats', 'Amapiano']],
  ['Island Lens', 'islandlens', 'videographer', 'Lagos', ['Music video']],
  ['Ada Nwosu', 'adanwosu', 'artist', 'Lagos', ['Afro-rap']],
  ['Osu Records', 'osurecords', 'studio', 'Accra', ['Recording']],
  ['Wanjiru K', 'wanjiruk', 'engineer', 'Nairobi', ['Mixing']],
  ['Kasi Keys', 'kasikeys', 'producer', 'Johannesburg', ['Amapiano', 'Gqom']],
  ['Rhea Kapoor', 'rheakapoor', 'videographer', 'Mumbai', ['Music video']],
  ['Han Jiwoo', 'hanjiwoo', 'producer', 'Seoul', ['K-hip hop', 'R&B']],
  ['Shibuya Sound', 'shibuyasound', 'studio', 'Tokyo', ['Recording', 'Mixing']],
  ['Kenji Aoki', 'kenjiaoki', 'videographer', 'Tokyo', ['Music video', 'Anime']],
  ['Harbour Mix', 'harbourmix', 'engineer', 'Sydney', ['Mixing', 'Mastering']],
  ['Kira Moss', 'kiramoss', 'artist', 'Sydney', ['Rap', 'Alt']],
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  // Final avalanche so similar inputs (e.g. "abcx" / "abcy") give unrelated outputs.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Sample street addresses for studios (made up).
const STUDIO_STREETS = ['Foundry St', 'Mill Rd', 'Canal St', 'Harbor Ave', 'Station Rd', 'Market St', 'Union Ave', 'Elm St'];

const TRAVEL_MILES = [10, 25, 25, 50, 100, 250];

const SOCIALS: Record<Role, Social['platform'][]> = {
  artist: ['instagram', 'spotify', 'tiktok'],
  producer: ['instagram', 'beatstars', 'youtube'],
  videographer: ['instagram', 'youtube', 'vimeo'],
  studio: ['instagram', 'website'],
  engineer: ['instagram', 'soundcloud'],
};

const sampleSocial = (platform: Social['platform'], handle: string): Social => {
  const urls: Partial<Record<Social['platform'], string>> = {
    instagram: `https://instagram.com/${handle}`,
    tiktok: `https://tiktok.com/@${handle}`,
    youtube: `https://youtube.com/@${handle}`,
    spotify: `https://open.spotify.com/search/${handle}`,
    beatstars: `https://beatstars.com/${handle}`,
    vimeo: `https://vimeo.com/${handle}`,
    soundcloud: `https://soundcloud.com/${handle}`,
    website: `https://${handle}.example.com`,
  };
  return { platform, url: urls[platform]! };
};

// Genres to fall back on when a sample person's tags aren't genres (e.g. "Mixing").
const LOCAL_SOUND: Record<string, string[]> = {
  London: ['grime', 'drill', 'rap'],
  Paris: ['rap', 'electronic'],
  Berlin: ['electronic', 'house', 'hiphop'],
  Stockholm: ['pop', 'electronic'],
  Lagos: ['afrobeats', 'rnb'],
  Accra: ['afrobeats', 'gospel'],
  Nairobi: ['afrobeats', 'hiphop'],
  Johannesburg: ['amapiano', 'house'],
  Kingston: ['dancehall', 'reggae'],
  'Mexico City': ['latin', 'trap'],
  'São Paulo': ['latin', 'funk'],
  Mumbai: ['hiphop', 'pop'],
  Seoul: ['kpop', 'rnb'],
  Tokyo: ['hiphop', 'lofi', 'jazz'],
  Sydney: ['hiphop', 'alt'],
};
const US_SOUND = ['hiphop', 'rap', 'rnb', 'trap', 'soul', 'gospel'];

function genresFor(handle: string, city: string, tags: string[]) {
  const ids = toGenreIds(tags);
  if (ids.length >= 2) return ids;
  const pool = LOCAL_SOUND[city] ?? US_SOUND;
  const start = Math.floor(hash(handle + 'g') * pool.length);
  for (let i = 0; ids.length < 2 + (hash(handle + 'n') > 0.6 ? 1 : 0) && i < pool.length; i++) {
    const id = pool[(start + i) % pool.length];
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

// Extra roles for some of the sample people.
const ALSO: Record<string, Role[]> = {
  dresolace: ['engineer'],
  junopark: ['artist'],
  southpawsound: ['engineer', 'producer'],
  tashagrey: ['producer'],
  biglou: ['producer'],
  leomarsh: ['producer'],
  kofimensah: ['artist', 'engineer'],
  sixnorth: ['engineer'],
  tundeade: ['engineer', 'artist'],
  kenjiaoki: ['producer'],
  amaraj: ['producer'],
  canyonroom: ['videographer'],
  marcushale: ['producer'],
  kasikeys: ['artist'],
};

// Sample people who chose to show their exact spot.
const EXACT = new Set(['dresolace', 'tashagrey', 'leomarsh', 'sixnorth', 'kenjiaoki']);

export const CREATIVES: Creative[] = SEEDS.map(([name, handle, role, city, genres, available = true], i) => {
  const { coords: [lng, lat], country } = CITIES[city];
  const pick = <T,>(arr: T[]) => arr[i % arr.length];
  return {
    id: handle,
    name,
    handle,
    role,
    alsoRoles: ALSO[handle] ?? [],
    country,
    city,
    coords: role === 'studio' || EXACT.has(handle)
      ? [lng + (hash(handle + 'x') - 0.5) * 0.5, lat + (hash(handle + 'y') - 0.5) * 0.35]
      : [lng, lat],
    exactLocation: EXACT.has(handle) || undefined,
    address:
      role === 'studio'
        ? `${100 + Math.floor(hash(handle + 'a') * 1900)} ${pick(STUDIO_STREETS)}, ${city}`
        : undefined,
    travelMiles: travels([role, ...(ALSO[handle] ?? [])]) ? TRAVEL_MILES[Math.floor(hash(handle + 't') * TRAVEL_MILES.length)] : undefined,
    bio: pick(BIOS[role]),
    rate: pick(RATES[role]),
    roleRates: Object.fromEntries((ALSO[handle] ?? []).filter((r) => r !== 'artist').map((r) => [r, pick(RATES[r])])),
    rating: Math.round((4.4 + hash(handle) * 0.6) * 10) / 10,
    reviews: 4 + Math.floor(hash(handle + 'r') * 90),
    genres: genresFor(handle, city, genres),
    available,
    work: WORK[role],
    socials: SOCIALS[role].map((pl) => sampleSocial(pl, handle)),
  };
});

export const ME_ID = 'me';

export const ME: Creative = {
  id: ME_ID,
  name: 'You',
  handle: 'you',
  role: 'artist',
  alsoRoles: [],
  country: 'US',
  city: 'Atlanta',
  coords: CITIES.Atlanta.coords,
  bio: 'Rapper based in Atlanta. Tell people what you’re working on and who you’re looking for.',
  rate: 'Open to collabs',
  rating: 5,
  reviews: 0,
  genres: ['rap', 'hiphop'],
  available: true,
  work: [],
  socials: [],
};
