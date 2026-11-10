/* ============================================
   Logica condivisa: dal testo/link dell'utente al link recensione
   Usata sia da api/search.js (Vercel) sia da server.js (sviluppo locale)
   ============================================ */

const MAX_QUERY_LENGTH = 2000;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co', 'g.page'];

class PublicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function getApiKey() {
  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (!key || /your_api/i.test(key)) {
    const err = new PublicError('Servizio non configurato: manca la chiave API Google.', 500);
    err.internal = 'GOOGLE_MAPS_API_KEY mancante o placeholder';
    throw err;
  }
  return key;
}

function reviewLinkFor(placeId) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/* ---------- Riconoscimento link ---------- */

function toUrl(text) {
  const t = text.trim();
  if (/\s/.test(t)) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : (/^[\w.-]+\.[a-z]{2,}\//i.test(t) ? `https://${t}` : null);
  if (!candidate) return null;
  try { return new URL(candidate); } catch { return null; }
}

function isShortHost(host) {
  return SHORT_HOSTS.includes(host.replace(/^www\./, ''));
}

function isGoogleMapsUrl(url) {
  const host = url.hostname.toLowerCase();
  if (/^maps\.google\.[a-z.]+$/.test(host)) return true;
  return /(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.startsWith('/maps');
}

// Segue i redirect dei link brevi (maps.app.goo.gl/...) senza scaricare le pagine
async function expandShortUrl(url) {
  let current = url.toString();
  for (let i = 0; i < 6; i++) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
    const location = res.headers.get('location');
    if (!location || res.status < 300 || res.status >= 400) break;
    let next = new URL(location, current);
    // Pagina consenso cookie (UE): la destinazione vera è nel parametro "continue"
    if (next.hostname.startsWith('consent.') && next.searchParams.get('continue')) {
      next = new URL(next.searchParams.get('continue'));
    }
    current = next.toString();
    if (isGoogleMapsUrl(next)) break;
  }
  return new URL(current);
}

// Estrae dall'URL di Google Maps tutto ciò che serve per trovare l'attività
function parseMapsUrl(url) {
  const out = { placeId: null, name: null, location: null };
  let full;
  try { full = decodeURIComponent(url.toString()); } catch { full = url.toString(); }

  const pid = url.searchParams.get('place_id') || url.searchParams.get('query_place_id');
  if (pid && PLACE_ID_RE.test(pid)) out.placeId = pid;

  if (!out.placeId) {
    const m = full.match(/(?:place_id:|!19s|placeid=)(ChIJ[A-Za-z0-9_-]{10,})/) || full.match(/\b(ChIJ[A-Za-z0-9_-]{20,})/);
    if (m) out.placeId = m[1];
  }

  // /maps/place/<Nome>/@lat,lng,...  → il nome è il segmento dopo "place"
  const segments = url.pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('place');
  if (idx !== -1 && segments[idx + 1] && !segments[idx + 1].startsWith('@')) {
    out.name = safeDecode(segments[idx + 1]).replace(/\+/g, ' ').trim();
  }

  if (!out.name) {
    const q = url.searchParams.get('q') || url.searchParams.get('query');
    if (q && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q.trim()) && !q.startsWith('place_id:')) {
      out.name = q.replace(/\+/g, ' ').trim();
    }
  }

  // Coordinate: !3d<lat>!4d<lng> (punto esatto) oppure @lat,lng (centro mappa)
  const exact = full.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const center = full.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const c = exact || center;
  if (c) out.location = { latitude: Number(c[1]), longitude: Number(c[2]) };

  return out;
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/* ---------- Google Places API ---------- */
// Prima la Places API (New); se sul progetto è abilitata solo la versione legacy, si usa quella.

let apiMode = null; // 'new' | 'legacy' — memorizzato per istanza

function isServiceDisabled(status, body) {
  const s = body && body.error && body.error.status;
  return status === 403 && (s === 'PERMISSION_DENIED' || JSON.stringify(body).includes('SERVICE_DISABLED'));
}

function configError(detail) {
  const err = new PublicError('Servizio Google non disponibile: controlla la configurazione della chiave API.', 502);
  err.internal = detail;
  return err;
}

async function newTextSearch(key, text, location) {
  const body = { textQuery: text, languageCode: 'it', pageSize: 1 };
  if (location) body.locationBias = { circle: { center: location, radius: 2000 } };
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: true, status: res.status, data };
  const p = data.places && data.places[0];
  return { place: p ? { placeId: p.id, name: p.displayName && p.displayName.text, address: p.formattedAddress } : null };
}

async function newDetails(key, placeId) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=it`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,formattedAddress' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: true, status: res.status, data };
  return { place: { placeId: data.id, name: data.displayName && data.displayName.text, address: data.formattedAddress } };
}

async function legacyTextSearch(key, text, location) {
  const params = new URLSearchParams({ query: text, language: 'it', key });
  if (location) { params.set('location', `${location.latitude},${location.longitude}`); params.set('radius', '2000'); }
  const data = await (await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`)).json();
  if (data.status === 'OK' && data.results.length) {
    const r = data.results[0];
    return { place: { placeId: r.place_id, name: r.name, address: r.formatted_address } };
  }
  if (data.status === 'ZERO_RESULTS') return { place: null };
  throw configError(`Legacy textsearch: ${data.status} ${data.error_message || ''}`);
}

async function legacyDetails(key, placeId) {
  const params = new URLSearchParams({ place_id: placeId, fields: 'place_id,name,formatted_address', language: 'it', key });
  const data = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`)).json();
  if (data.status === 'OK' && data.result) {
    return { place: { placeId: data.result.place_id || placeId, name: data.result.name, address: data.result.formatted_address } };
  }
  if (data.status === 'NOT_FOUND' || data.status === 'INVALID_REQUEST') return { place: null };
  throw configError(`Legacy details: ${data.status} ${data.error_message || ''}`);
}

async function callPlaces(kind, key, ...args) {
  const fnNew = kind === 'search' ? newTextSearch : newDetails;
  const fnLegacy = kind === 'search' ? legacyTextSearch : legacyDetails;

  if (apiMode !== 'legacy') {
    const r = await fnNew(key, ...args);
    if (!r.error) { apiMode = 'new'; return r.place; }
    if (isServiceDisabled(r.status, r.data)) {
      apiMode = 'legacy';
    } else if (kind === 'details' && (r.status === 404 || r.status === 400) && !/API_KEY/.test(JSON.stringify(r.data))) {
      return null; // place id non valido
    } else {
      throw configError(`Places API (New) ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
    }
  }
  return (await fnLegacy(key, ...args)).place;
}

/* ---------- Funzione principale ---------- */

async function findPlace(rawQuery) {
  if (typeof rawQuery !== 'string' || !rawQuery.trim()) {
    throw new PublicError('Inserisci un nome o un link valido.');
  }
  const query = rawQuery.trim();
  if (query.length > MAX_QUERY_LENGTH) throw new PublicError('Testo troppo lungo.');

  const key = getApiKey();
  let searchText = query;
  let placeId = null;
  let location = null;

  // Un Place ID incollato direttamente
  if (/^ChIJ[A-Za-z0-9_-]{20,}$/.test(query)) placeId = query;

  let url = placeId ? null : toUrl(query);
  if (url) {
    if (isShortHost(url.hostname)) {
      try { url = await expandShortUrl(url); } catch (e) { console.warn('Espansione short link fallita:', e.message); }
    }
    if (isGoogleMapsUrl(url)) {
      const info = parseMapsUrl(url);
      placeId = info.placeId;
      location = info.location;
      if (info.name) searchText = info.name;
      else if (!placeId) throw new PublicError('Non riesco a leggere questo link. Apri l’attività su Google Maps e copia il link "Condividi".', 422);
    } else {
      throw new PublicError('Il link non sembra di Google Maps. Incolla un link di Google Maps o scrivi il nome dell’attività.', 422);
    }
  }

  let place = null;
  if (placeId) place = await callPlaces('details', key, placeId);
  if (!place && (searchText !== query || !placeId)) {
    place = await callPlaces('search', key, searchText, location);
  }
  if (!place || !place.placeId) {
    throw new PublicError('Attività non trovata. Prova con un nome più preciso (es. nome + città).', 404);
  }
  return { ...place, reviewLink: reviewLinkFor(place.placeId) };
}

module.exports = { findPlace, PublicError, parseMapsUrl, toUrl, isGoogleMapsUrl, isShortHost, expandShortUrl, reviewLinkFor };
