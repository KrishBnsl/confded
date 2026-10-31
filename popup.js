import { AREAS, formatInstant, loadState, notAnnounced, upcoming } from './shared.js';

const $ = (id) => document.getElementById(id);
let state;
let query = '';

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function ageText(fetchedAt) {
  if (!fetchedAt) return 'no data yet';
  const mins = Math.floor((Date.now() - fetchedAt) / 60000);
  if (mins < 60) return 'updated just now';
  const hours = Math.floor(mins / 60);
  return hours < 48 ? `updated ${hours}h ago` : `updated ${Math.floor(hours / 24)}d ago`;
}

const safeUrl = (u) => (/^https?:\/\//.test(u) ? u : '');

async function saveFilter(patch) {
  state.filter = { ...state.filter, ...patch };
  await chrome.storage.local.set({ filter: state.filter });
  render();
}

function starButton(title) {
  const on = state.filter.starred.includes(title);
  const btn = el('button', { type: 'button', className: 'icon star', textContent: on ? '★' : '☆' });
  btn.title = on ? 'Unstar' : 'Always show this venue';
  btn.setAttribute('aria-pressed', String(on));
  btn.addEventListener('click', () => {
    const starred = on ? state.filter.starred.filter((t) => t !== title) : [...state.filter.starred, title];
    saveFilter({ starred });
  });
  return btn;
}

function titleNode(e) {
  const href = safeUrl(e.link);
  const label = `${e.title} ${e.year}`;
  const name = href ? el('a', { href, target: '_blank', rel: 'noopener', textContent: label }) : label;
  return el('div', { className: 'title' }, name, el('span', { className: 'tag', textContent: [e.rank, e.sub].filter(Boolean).join(' · ') }));
}

function render() {
  const { editions, filter, fetchedAt, lastError } = state;
  const searching = query.trim() !== '';

  $('updated').textContent = ageText(fetchedAt);
  $('error').hidden = !lastError;
  $('error').textContent = lastError ? `Last refresh failed (${lastError}). Showing saved data.` : '';
  $('rank').value = filter.minRank;
  $('chips').hidden = searching;
  $('rank').disabled = searching;

  $('chips').replaceChildren(
    ...Object.entries(AREAS).map(([code, name]) => {
      const chip = el('button', { type: 'button', className: 'chip', textContent: code, title: name });
      chip.setAttribute('aria-pressed', String(filter.areas.includes(code)));
      chip.addEventListener('click', () => {
        const areas = filter.areas.includes(code) ? filter.areas.filter((a) => a !== code) : [...filter.areas, code];
        saveFilter({ areas });
      });
      return chip;
    }),
  );

  const rows = upcoming(editions, filter, query);
  if (!rows.length) {
    $('list').replaceChildren(
      el('div', {
        className: 'empty',
        textContent: !fetchedAt
          ? 'Downloading deadlines… reopen in a moment, or press ↻.'
          : searching ? 'No upcoming deadlines match your search.' : 'No upcoming deadlines for these filters.',
      }),
    );
  } else {
    $('list').replaceChildren(
      ...rows.map((r) =>
        el('div', { className: 'row' },
          el('div', { className: `days${r.days <= 7 ? ' soon' : ''}` },
            el('b', { textContent: String(r.value) }), el('span', { textContent: r.unit })),
          el('div', {},
            titleNode(r),
            el('div', { textContent: `${r.kind} · ${formatInstant(r.at)}` }),
            el('div', { className: 'meta', textContent: [r.note, r.date, r.place].filter(Boolean).join(' · ') }),
          ),
          starButton(r.title),
        ),
      ),
    );
  }

  const tba = notAnnounced(editions, filter, query);
  $('tba').hidden = !tba.length;
  $('tba-count').textContent = `(${tba.length})`;
  $('tba-list').replaceChildren(
    ...tba.map((e) => el('li', {},
      el('div', {}, titleNode(e), el('div', { className: 'meta', textContent: [e.date, e.place].filter(Boolean).join(' · ') })),
      starButton(e.title),
    )),
  );
}

$('search').addEventListener('input', (e) => { query = e.target.value; render(); });
$('rank').addEventListener('change', (e) => saveFilter({ minRank: e.target.value }));
$('refresh').addEventListener('click', async () => {
  $('refresh').classList.add('spin');
  await chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
  state = await loadState();
  $('refresh').classList.remove('spin');
  render();
});

state = await loadState();
render();
