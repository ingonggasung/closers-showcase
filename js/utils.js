// Escapes text before it's interpolated into an innerHTML template.
// Needed anywhere user-supplied content (names, titles) is shown to other visitors.
const PART_KEYS = ['hair', 'lens', 'top', 'bottom', 'shoes', 'gloves'];
const PART_LABELS = {
  hair: '헤어',
  lens: '렌즈',
  top: '상의',
  bottom: '하의',
  shoes: '신발',
  gloves: '장갑',
};

// Short one-line summary used as a grid card label, e.g. "블랙 롱헤어 · 화이트 셔츠".
function slotSummary(slot) {
  const parts = slot.parts || {};
  const values = PART_KEYS.map((k) => parts[k]).filter(Boolean);
  return values.length ? values.join(' · ') : '코스튬';
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
