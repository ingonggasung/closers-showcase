// Escapes text before it's interpolated into an innerHTML template.
// Needed anywhere user-supplied content (names, titles) is shown to other visitors.
const COSTUME_KEYS = ['weapon', 'hair', 'top', 'bottom', 'gloves', 'shoes'];
const ACCESSORY_KEYS = [
  'hat',
  'faceTop',
  'faceMid',
  'faceBottom',
  'back',
  'arm',
  'waist',
  'leg',
  'effect',
  'eyes',
];
const PART_KEYS = [...COSTUME_KEYS, ...ACCESSORY_KEYS];
const PART_LABELS = {
  weapon: '무기',
  hair: '헤어스타일',
  top: '상의',
  bottom: '하의',
  gloves: '장갑',
  shoes: '신발',
  hat: '모자',
  faceTop: '얼굴 상',
  faceMid: '얼굴 중',
  faceBottom: '얼굴 하',
  back: '등',
  arm: '팔',
  waist: '허리',
  leg: '다리',
  effect: '이펙트',
  eyes: '눈동자',
};

// Short one-line summary used as a grid card label, e.g. "블랙 롱헤어 · 화이트 셔츠".
function slotSummary(slot) {
  const parts = slot.parts || {};
  const values = PART_KEYS.map((k) => parts[k]).filter(Boolean);
  return values.length ? values.join(' · ') : '코스튬';
}

// Builds a grid of labeled text inputs for the given part keys.
// Returns { el, inputs } where inputs maps key -> the created <input>.
function buildPartsFieldGrid(keys, values) {
  const el = document.createElement('div');
  el.className = 'post-parts-grid';
  const inputs = {};
  keys.forEach((key) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = PART_LABELS[key];
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.value = (values && values[key]) || '';
    inputs[key] = input;
    wrap.appendChild(label);
    wrap.appendChild(input);
    el.appendChild(wrap);
  });
  return { el, inputs };
}

const LAST_SEEN_POST_KEY = 'ccs_last_seen_post_ts';

const FAVICON_PLAIN =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="78" font-size="70" text-anchor="middle">👗</text></svg>'
  );
const FAVICON_NEW_POST =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="78" font-size="70" text-anchor="middle">👗</text><circle cx="82" cy="20" r="16" fill="#ff3d3d" stroke="#17181c" stroke-width="4"/></svg>'
  );

// Swaps the browser-tab favicon to a version with a red dot when a post
// exists that's newer than the last one this browser has "seen". Call on
// every page load; index.js additionally marks posts as seen once its feed
// has actually loaded, which is the only place the dot gets cleared.
async function updateFaviconBadge() {
  const link = document.getElementById('favicon-link');
  if (!link) return;
  try {
    const latest = (await DB.getLatestSlotTimestamp()) || 0;
    const lastSeen = Number(localStorage.getItem(LAST_SEEN_POST_KEY) || 0);
    link.href = latest > lastSeen ? FAVICON_NEW_POST : FAVICON_PLAIN;
  } catch {
    link.href = FAVICON_PLAIN;
  }
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

// Scroll-to-top button, shown once the page is scrolled down. No-ops on
// pages that don't include the button (id="scroll-top-btn").
(function setupScrollTopButton() {
  const btn = document.getElementById('scroll-top-btn');
  if (!btn) return;
  window.addEventListener(
    'scroll',
    () => {
      btn.hidden = window.scrollY <= 10;
    },
    { passive: true }
  );
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
