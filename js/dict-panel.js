/* ── dict-panel.js ────────────────────────────────────────────────────────────
   관리자용 "번역 사전" 창.

   기계번역 결과는 이미 Firestore(translations)에 저장되고 있는데, 이 창은
   그 저장분을 직접 고칩니다. 별도의 사전이 아니라 캐시 그 자체를 고치는 것이라,
   한 번 고치면 그 뒤로는 계속 그 값이 나갑니다.

   고친 항목(locked)은 두 가지로 쓰입니다:
     1. 그 문구가 나올 때 그대로 사용
     2. 새 문구를 번역할 때 참고 사전 - 예: "리아 → Ria" 를 넣어두면
        "리아 나이트메어" 는 "Ria Nightmare" 로 번역됩니다.

   기계번역이 고유명사를 모른다는 게 이 창이 있는 이유입니다.
   ────────────────────────────────────────────────────────────────────────── */

let dictOverlay = null;
let dictLang = 'en';

const DICT_LANGS = { en: 'English', ja: '日本語', zh: '中文' };

// Must match cacheId() in api/translate.js or the edit lands on a different
// document than the one the translator reads.
async function translationDocId(text, target) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return target + '_' + hex.slice(0, 32);
}

function dictMarkup() {
  return `
    <div class="modal-box modal-box-wide" data-no-i18n>
      <h3>번역 사전</h3>
      <p class="train-hint">
        기계번역 결과를 직접 고칩니다. 여기서 저장한 값이 항상 우선하고,
        <b>새 문구를 번역할 때도 참고 사전으로 쓰입니다</b> — 예를 들어
        &quot;리아 → Ria&quot;를 넣어두면 &quot;리아 나이트메어&quot;는
        &quot;Ria Nightmare&quot;로 번역됩니다. 고유명사는 짧은 단위로
        넣어둘수록 잘 걸립니다.
      </p>

      <label>언어</label>
      <select id="dict-lang">
        ${Object.entries(DICT_LANGS)
          .map(([k, v]) => `<option value="${k}"${k === dictLang ? ' selected' : ''}>${v}</option>`)
          .join('')}
      </select>

      <label>새 항목</label>
      <div class="dict-new">
        <input type="text" id="dict-new-src" placeholder="원문 (예: 모아 디바인 패스트)" />
        <input type="text" id="dict-new-out" placeholder="번역 (예: Moa Divine Past)" />
        <button class="pill accent" id="dict-add">추가</button>
      </div>

      <h4 class="train-list-head">등록된 번역 <span id="dict-count"></span></h4>
      <input type="text" id="dict-filter" class="search-input" placeholder="원문으로 찾기" />
      <div class="train-list" id="dict-list">불러오는 중...</div>

      <div class="modal-actions">
        <button class="pill" id="dict-close">닫기</button>
        <button class="pill accent" id="dict-reload">저장하고 새로고침</button>
      </div>
    </div>
  `;
}

let dictRows = [];

function renderDictRows() {
  const list = document.getElementById('dict-list');
  const filter = document.getElementById('dict-filter').value.trim();
  const rows = dictRows.filter((r) => !filter || (r.source || '').includes(filter));
  document.getElementById('dict-count').textContent = `${rows.length}건`;

  if (!rows.length) {
    list.innerHTML = '<div class="empty-hint">등록된 번역이 없어요.</div>';
    return;
  }
  list.innerHTML = rows
    .map(
      (r) => `
      <div class="dict-item" data-id="${r.id}">
        <span class="dict-src">${escapeHtml(r.source || '')}</span>
        <input type="text" class="dict-out" value="${escapeHtml(r.text || '')}" />
        ${r.locked ? '<span class="train-tag">고정</span>' : ''}
        <button class="train-del" title="삭제">×</button>
      </div>`
    )
    .join('');

  list.querySelectorAll('.dict-out').forEach((input) => {
    const row = input.closest('.dict-item');
    const save = async () => {
      const value = input.value.trim();
      const entry = dictRows.find((r) => r.id === row.dataset.id);
      if (!entry || value === entry.text) return;
      try {
        await DB.setTranslation(row.dataset.id, { text: value, locked: true });
        entry.text = value;
        entry.locked = true;
        clearTranslationCache();
        input.classList.add('saved');
        setTimeout(() => input.classList.remove('saved'), 900);
      } catch (err) {
        alert('저장에 실패했습니다: ' + err.message);
      }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  });

  list.querySelectorAll('.train-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.dict-item').dataset.id;
      if (!confirm('이 번역을 삭제할까요? 다음에 다시 기계번역됩니다.')) return;
      try {
        await DB.deleteTranslation(id);
        clearTranslationCache();
        dictRows = dictRows.filter((r) => r.id !== id);
        renderDictRows();
      } catch (err) {
        alert('삭제에 실패했습니다: ' + err.message);
      }
    });
  });
}

async function loadDict() {
  const list = document.getElementById('dict-list');
  try {
    dictRows = await DB.getTranslations(dictLang);
    renderDictRows();
  } catch (err) {
    list.textContent = '불러오지 못했습니다: ' + err.message;
  }
}

function buildDictPanel() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = dictMarkup();
  document.body.appendChild(overlay);

  overlay.querySelector('#dict-close').addEventListener('click', () => (overlay.hidden = true));
  // A page already showing the old wording only picks up the fix on reload -
  // the translated text is in the DOM, not re-fetched.
  overlay.querySelector('#dict-reload').addEventListener('click', () => {
    clearTranslationCache();
    location.reload();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
  overlay.querySelector('#dict-lang').addEventListener('change', (e) => {
    dictLang = e.target.value;
    loadDict();
  });
  overlay.querySelector('#dict-filter').addEventListener('input', renderDictRows);

  overlay.querySelector('#dict-add').addEventListener('click', async () => {
    const src = overlay.querySelector('#dict-new-src').value.trim();
    const out = overlay.querySelector('#dict-new-out').value.trim();
    if (!src || !out) {
      alert('원문과 번역을 모두 입력해주세요.');
      return;
    }
    try {
      const id = await translationDocId(src, dictLang);
      await DB.setTranslation(id, { source: src, target: dictLang, text: out, locked: true });
      clearTranslationCache();
      overlay.querySelector('#dict-new-src').value = '';
      overlay.querySelector('#dict-new-out').value = '';
      await loadDict();
    } catch (err) {
      alert('추가에 실패했습니다: ' + err.message);
    }
  });

  return overlay;
}

function openDictPanel() {
  if (!dictOverlay) dictOverlay = buildDictPanel();
  dictOverlay.hidden = false;
  loadDict();
}
