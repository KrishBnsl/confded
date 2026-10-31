// Data helpers shared by the background worker and the popup. Nothing here
// touches the network; only loadState() uses chrome.* APIs.

export const DATA_URL = 'https://ccfddl.com/conference/allconf.json';
export const SITE_URL = 'https://ccfddl.com/';

export const AREAS = {
  AI: 'Artificial Intelligence',
  DB: 'Databases, Data Mining, IR',
  CG: 'Graphics & Multimedia',
  HI: 'Human-Computer Interaction',
  SE: 'Software Eng., Systems, PL',
  DS: 'Architecture, Parallel, Storage',
  NW: 'Networks',
  SC: 'Security',
  CT: 'Theory',
  MX: 'Interdisciplinary',
};

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const KEEP_PAST_MS = 30 * DAY_MS;
const RANK_ORDER = { 'A*': 3, A: 2, B: 1, C: 0 };

export const DEFAULTS = {
  editions: [],
  fetchedAt: 0,
  lastError: '',
  filter: { areas: [], minRank: 'A', starred: [] },
  notified: {},
  lastStaleNudge: 0,
};

export async function loadState() {
  const s = await chrome.storage.local.get(DEFAULTS);
  s.filter = { ...DEFAULTS.filter, ...s.filter };
  return s;
}

// Hours offset from UTC for a zone label used in the dataset:
// "AoE", "UTC", "UTC+8", "UTC-7", "UTC+5:30", "PT".
function offsetHours(zone, naiveUtcMs) {
  if (!zone || zone === 'UTC') return 0;
  if (zone === 'AoE') return -12;
  if (zone === 'PT') {
    // US Pacific, daylight saving aware.
    const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' })
      .formatToParts(new Date(naiveUtcMs + 8 * HOUR_MS))
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = part?.match(/GMT([+-]\d+)/);
    return m ? Number(m[1]) : -8;
  }
  const m = zone.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3] || 0) / 60);
}

// "2026-11-10 23:59:59" in `zone` -> epoch ms, or null (e.g. "TBD").
export function toInstant(str, zone) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(String(str || ''));
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return naive - offsetHours(zone, naive) * HOUR_MS;
}

function effectiveRank(rank) {
  for (const r of [rank?.core, rank?.ccf]) if (r && r !== 'N') return r;
  return '';
}

// allconf.json -> flat list of conference editions worth keeping:
// those with a deadline in the future (or the last 30 days), plus editions
// whose deadline is explicitly "TBD".
export function normalize(raw, now = Date.now()) {
  const thisYear = new Date(now).getFullYear();
  const out = [];
  for (const c of raw) {
    for (const e of c.confs || []) {
      const deadlines = [];
      let tbd = false;
      for (const t of e.timeline || []) {
        for (const [field, kind] of [['abstract_deadline', 'Abstract'], ['deadline', 'Paper']]) {
          if (t[field] === 'TBD') tbd = true;
          const at = toInstant(t[field], e.timezone);
          if (at !== null) deadlines.push({ kind, at, note: t.comment || '' });
        }
      }
      const recent = deadlines.some((d) => d.at >= now - KEEP_PAST_MS);
      const pending = !deadlines.length && tbd && e.year >= thisYear;
      if (!recent && !pending) continue;
      out.push({
        id: e.id || `${c.title}${e.year}`.toLowerCase(),
        title: c.title,
        description: c.description || '',
        sub: c.sub || '',
        rank: effectiveRank(c.rank),
        link: e.link || '',
        year: e.year,
        date: e.date || '',
        place: e.place || '',
        deadlines: deadlines.sort((a, b) => a.at - b.at),
        tbd: pending,
      });
    }
  }
  return out;
}

function matches(e, f) {
  if (f.starred.includes(e.title)) return true;
  if (f.areas.length && !f.areas.includes(e.sub)) return false;
  if (f.minRank === 'all') return true;
  const need = f.minRank === 'A*' ? 3 : 2;
  return (RANK_ORDER[e.rank] ?? -1) >= need;
}

function searchMatch(e, q) {
  return `${e.title} ${e.description}`.toLowerCase().includes(q);
}

// A non-empty search ignores the area/rank filters so any venue can be found.
function select(editions, filter, query) {
  const q = (query || '').trim().toLowerCase();
  return editions.filter((e) => (q ? searchMatch(e, q) : matches(e, filter)));
}

// One row per future deadline, soonest first.
export function upcoming(editions, filter, query = '', now = Date.now()) {
  const rows = [];
  for (const e of select(editions, filter, query)) {
    for (const d of e.deadlines) {
      if (d.at < now) continue;
      rows.push({ ...e, kind: d.kind, at: d.at, note: d.note, ...countdown(d.at, now) });
    }
  }
  return rows.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title));
}

export function notAnnounced(editions, filter, query = '') {
  return select(editions, filter, query)
    .filter((e) => e.tbd)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function countdown(at, now = Date.now()) {
  const ms = at - now;
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return { days, value: days, unit: days === 1 ? 'day' : 'days' };
  const hours = Math.max(0, Math.floor(ms / HOUR_MS));
  return { days: 0, value: hours, unit: hours === 1 ? 'hour' : 'hours' };
}

export function formatInstant(at) {
  return new Date(at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
