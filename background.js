import { DATA_URL, SITE_URL, loadState, normalize, upcoming } from './shared.js';

const NOTIFY_AT = [7, 3, 1, 0]; // days before a deadline (0 = within 24h)
const BADGE_WINDOW = 7; // badge counts deadlines due within this many days
const REFRESH_EVERY_MS = 20 * 3600000;
const STALE_MS = 7 * 86400000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(['items', 'updatedAt']); // v0.1 scraper data
  schedule();
  tick(true);
});
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((a) => a.name === 'tick' && tick());
chrome.storage.onChanged.addListener((c) => (c.filter || c.editions) && refreshBadge());

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'refresh') return;
  tick(true).then(async () => reply({ ok: !(await loadState()).lastError }));
  return true; // async reply
});

chrome.notifications.onClicked.addListener(async (id) => {
  const { editions } = await loadState();
  const eid = id.startsWith('dl|') ? id.split('|')[1] : '';
  chrome.tabs.create({ url: editions.find((e) => e.id === eid)?.link || SITE_URL });
  chrome.notifications.clear(id);
});

function schedule() {
  chrome.alarms.create('tick', { delayInMinutes: 1, periodInMinutes: 360 });
}

// Keeps the previous data if the download or its shape is bad.
async function refreshData(force) {
  const { fetchedAt } = await loadState();
  if (!force && Date.now() - fetchedAt < REFRESH_EVERY_MS) return;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length < 50) throw new Error('unexpected data format');
    await chrome.storage.local.set({ editions: normalize(raw), fetchedAt: Date.now(), lastError: '' });
  } catch (err) {
    await chrome.storage.local.set({ lastError: String(err?.message || err) });
  }
}

async function refreshBadge() {
  const { editions, filter } = await loadState();
  const soon = upcoming(editions, filter).filter((d) => d.days <= BADGE_WINDOW);
  await chrome.action.setBadgeBackgroundColor({ color: '#d9480f' });
  await chrome.action.setBadgeText({ text: soon.length ? String(soon.length) : '' });
}

async function notifyDeadlines() {
  const { editions, filter, notified } = await loadState();
  const now = Date.now();
  for (const [id, at] of Object.entries(notified)) if (at < now) delete notified[id];

  for (const d of upcoming(editions, filter, '', now)) {
    const threshold = Math.min(...NOTIFY_AT.filter((t) => t >= d.days));
    if (!Number.isFinite(threshold)) continue;
    const id = `dl|${d.id}|${d.kind}|${d.at}|${threshold}`;
    if (notified[id]) continue;
    notified[id] = d.at;
    const when = d.days === 0 ? `in ${d.value} h` : d.days === 1 ? 'tomorrow' : `in ${d.days} days`;
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `${d.title} ${d.year}: ${d.kind.toLowerCase()} deadline ${when}`,
      message: [new Date(d.at).toLocaleString(), d.description].filter(Boolean).join(' · '),
    });
  }
  await chrome.storage.local.set({ notified });
}

async function nudgeIfStale() {
  const { fetchedAt, lastError, lastStaleNudge } = await loadState();
  const now = Date.now();
  if (now - fetchedAt < STALE_MS || now - lastStaleNudge < 86400000) return;
  await chrome.storage.local.set({ lastStaleNudge: now });
  chrome.notifications.create('stale', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Conference deadlines may be out of date',
    message: lastError ? `Refresh keeps failing: ${lastError}` : 'No data downloaded yet.',
  });
}

async function tick(force = false) {
  await refreshData(force);
  await refreshBadge();
  await notifyDeadlines();
  await nudgeIfStale();
}
