/* ── index.js ─────────────────────────────────────────────────────────────────
   게시글 목록 페이지(posts.html)의 두뇌. 이 프로젝트에서 가장 큰 파일입니다.

   맡은 일:
     1. 캐릭터 필터   - 아이콘 목록, 다중 선택, 관리자의 추가·삭제·순서 변경
     2. 게시글 목록   - 불러오기, 검색, 분류 탭, 벽돌식 배치
     3. 자동 검토     - 관리자 접속 시 밀린 게시글을 분류기에 넘김
     4. 자동 조치     - 3일 숨김 테스트 → 결과 확인 → 자동 삭제 켜기

   읽는 순서 추천:
     renderFeed()        게시글을 불러와 화면에 뿌리는 시작점
     applyFeedFilter()   검색·캐릭터·분류·숨김 조건을 걸러 실제로 그리는 곳
     autoReviewPosts()   AI 자동 검토
     updateAutoBanner()  관리자에게 보이는 안내 배너 (테스트 제안/결과/자동삭제)
   ────────────────────────────────────────────────────────────────────────── */

const grid = document.getElementById('char-grid');
const modal = document.getElementById('char-modal');
const nameInput = document.getElementById('char-name-input');
const iconInput = document.getElementById('char-icon-input');
const iconPreview = document.getElementById('char-icon-preview');
const feedGrid = document.getElementById('feed-grid');
const feedSearchInput = document.getElementById('feed-search');
const feedSearchField = document.getElementById('feed-search-field');
const categoryTabs = document.getElementById('category-tabs');
const reviewProgress = document.getElementById('review-progress');
let selectedCategory = ''; // '' = 전체
const feedHeading = document.getElementById('feed-heading');
const filterToggle = document.getElementById('filter-toggle');
const filterSection = document.getElementById('filter-section');

let pendingIconFile = null;
let selectedCharacters = new Map(); // id -> name, multi-select filter

mountAuthBar(document.getElementById('auth-bar'));

document.getElementById('global-fab').addEventListener('click', () => openPostModal());

const FILTER_MAX_HEIGHT = 2000; // generous cap; real content settles well under this

// 캐릭터 필터를 펼치거나 접습니다 (좁은 화면에서 스크롤할 때 자동으로 접힘).
function setFilterExpanded(expanded) {
  filterToggle.setAttribute('aria-expanded', String(expanded));
  if (expanded) {
    filterSection.classList.remove('collapsed');
    filterSection.style.maxHeight = FILTER_MAX_HEIGHT + 'px';
  } else {
    // Lock in the current real height first so the collapse transition
    // animates from an exact value instead of jumping straight to 0.
    filterSection.style.maxHeight = filterSection.scrollHeight + 'px';
    // Force a synchronous layout flush so the browser registers that
    // height as the transition's starting point before we change it
    // again. A requestAnimationFrame alone isn't reliable for this right
    // after page load (the main thread is busy with startup work), which
    // is why the very first auto-collapse could skip the animation while
    // later ones worked fine.
    void filterSection.offsetHeight;
    filterSection.classList.add('collapsed');
  }
}

filterToggle.addEventListener('click', () => {
  const expanded = filterToggle.getAttribute('aria-expanded') === 'true';
  setFilterExpanded(!expanded);
});

// Auto-collapse the filter once the user has scrolled far enough that the
// post feed is starting to show - not on a fixed tiny pixel amount, so a
// tall character grid (many rows on narrow/mobile screens) can still be
// scrolled through and fully seen before it collapses. On desktop, where
// the grid is usually short enough to already fit above the feed, this
// falls back to the original "collapse on the first bit of scrolling"
// behavior via the 10px floor. The toggle bar itself stays pinned via
// .sticky-header so it's always reachable to re-expand.
// Above this width the filter lives in the side gutter (see #filter-section
// in style.css) instead of the document flow, so it never needs to make
// room for the feed and should just stay put while scrolling.
const DESKTOP_SIDEBAR_QUERY = '(min-width: 1300px)';

window.addEventListener(
  'scroll',
  () => {
    if (window.matchMedia(DESKTOP_SIDEBAR_QUERY).matches) return;
    if (filterToggle.getAttribute('aria-expanded') !== 'true') return;
    const feedTop = feedHeading.getBoundingClientRect().top + window.scrollY;
    const boundary = Math.max(10, feedTop - window.innerHeight);
    if (window.scrollY > boundary) {
      setFilterExpanded(false);
    }
  },
  { passive: true }
);

let suppressCharClick = false;
grid.addEventListener('dragstart', (e) => {
  if (e.target.closest('[data-role="item"]')) suppressCharClick = true;
});
grid.addEventListener('dragend', () => {
  setTimeout(() => (suppressCharClick = false), 0);
});
enableDragReorder(grid, '[data-role="item"]', async () => {
  const ids = Array.from(grid.querySelectorAll('[data-role="item"]')).map((el) => el.dataset.id);
  await DB.reorderCharacters(ids);
});

// 페이지 첫 진입: 캐릭터 목록과 게시글을 함께 불러옵니다.
async function render() {
  await Promise.all([renderCharacters(), renderFeed()]);
}

// 캐릭터 아이콘 격자를 그립니다. 관리자에게는 추가·삭제·순서 변경이 붙습니다.
async function renderCharacters() {
  const characters = await DB.getCharacters();
  grid.innerHTML = '';

  characters.forEach((c) => {
    const tile = document.createElement('div');
    tile.className = 'char-tile';
    tile.dataset.charId = c.id;
    if (selectedCharacters.has(c.id)) tile.classList.add('selected');
    if (isAdmin()) {
      tile.dataset.role = 'item';
      tile.dataset.id = c.id;
      tile.draggable = true;
    }
    tile.innerHTML = `
      <button type="button" class="char-avatar">
        ${c.icon ? `<img src="${escapeHtml(c.icon)}" alt="${escapeHtml(c.name)}">` : escapeHtml((c.name || '?').slice(0, 1))}
      </button>
      <div class="char-name">${escapeHtml(c.name || '이름없음')}</div>
      ${isAdmin() ? '<button class="char-del" title="삭제">×</button>' : ''}
    `;
    tile.querySelector('.char-avatar').addEventListener('click', () => {
      if (suppressCharClick) return;
      if (selectedCharacters.has(c.id)) {
        selectedCharacters.delete(c.id);
        tile.classList.remove('selected');
      } else {
        selectedCharacters.set(c.id, c.name || '');
        tile.classList.add('selected');
      }
      updateFeedHeading();
      applyFeedFilter();
    });
    if (isAdmin()) {
      tile.querySelector('.char-del').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`"${c.name}" 캐릭터와 등록된 코스튬을 모두 삭제할까요?`)) {
          await DB.deleteCharacter(c.id);
          render();
        }
      });
    }
    grid.appendChild(tile);
  });

  if (isAdmin()) {
    const addTile = document.createElement('div');
    addTile.className = 'char-tile add-tile';
    addTile.innerHTML = `<div class="char-avatar"><span class="plus">+</span></div><div class="char-name">추가</div>`;
    addTile.addEventListener('click', openModal);
    grid.appendChild(addTile);
  }

  if (characters.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.style.gridColumn = '1 / -1';
    hint.textContent = isAdmin()
      ? '등록된 캐릭터가 없어요. + 를 눌러 캐릭터를 추가해보세요.'
      : '등록된 캐릭터가 없어요. 관리자가 캐릭터를 등록하면 여기에 표시됩니다.';
    grid.insertBefore(hint, grid.firstChild);
  }
}

let allSlots = [];

// TEMP: local-only layout testing aid. Clones the first real slot into 20
// fake ones so the feed has enough height to test scroll/sidebar behavior,
// without ever writing anything to Firestore. Gated on hostname so it can
// never fire for a real visitor even if this file ships as-is; remove once
// the layout work is done.
const LOCAL_DUMMY_COUNT = 20;
// 로컬에서 열었을 때만 쓰는 더미 게시글. 배포본에는 영향이 없습니다.
function withLocalDummies(slots) {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isLocal || slots.length === 0) return slots;
  const base = slots[0];
  const dummies = Array.from({ length: LOCAL_DUMMY_COUNT }, (_, i) => ({
    ...base,
    id: `dummy-${i + 1}`,
    title: `더미 ${i + 1}`,
  }));
  return [...dummies, ...slots];
}

// 게시글을 불러오고, 자동 조치 설정을 읽고, 화면을 그린 뒤 자동 검토를 겁니다.
async function renderFeed() {
  allSlots = withLocalDummies(await DB.getAllSlots());

  // Visiting the feed counts as having seen the newest post - clears the
  // favicon's new-post dot (see utils.js).
  const newestTs = allSlots[0] && allSlots[0].createdAt ? allSlots[0].createdAt.seconds : 0;
  const lastSeen = Number(localStorage.getItem(LAST_SEEN_POST_KEY) || 0);
  if (newestTs > lastSeen) {
    try {
      localStorage.setItem(LAST_SEEN_POST_KEY, String(newestTs));
    } catch {}
    updateFaviconBadge();
  }

  autoModeration = await DB.getAutoModeration().catch(() => ({}));
  updateReviewProgress();

  if (allSlots.length === 0) {
    feedGrid.innerHTML = '<div class="empty-hint">아직 등록된 게시글이 없어요.</div>';
    return;
  }

  applyFeedFilter();
  autoReviewPosts();
}

// The 성인 category stays admin-only until there is a real
// adult-verification flow, which needs a paid 본인확인기관 contract.
// Flip adultVisible() to open it up. 수영복 is public.
const ADULT_CATEGORY = '성인';
// 성인 탭을 볼 수 있는가. 지금은 관리자만. 성인인증이 생기면 이 함수만 바꾸면 됩니다.
function adultVisible() {
  return isAdmin();
}

// 성인 탭과 등록 시 성인 선택지를 보이거나 숨깁니다.
function updateAdultGate() {
  const visible = adultVisible();
  const tab = categoryTabs.querySelector(`.tab[data-category="${ADULT_CATEGORY}"]`);
  if (tab) {
    tab.hidden = !visible;
    if (!visible && selectedCategory === ADULT_CATEGORY) {
      selectedCategory = '';
      categoryTabs
        .querySelectorAll('.tab')
        .forEach((t) => t.classList.toggle('active', !t.dataset.category));
    }
  }
  // Nobody should be able to file a post into a category they cannot see.
  const opt = document.querySelector(`#post-category option[value="${ADULT_CATEGORY}"]`);
  if (opt) opt.hidden = !visible;
}

// --- auto-review -----------------------------------------------------------
// The classifier flags posts that do not look like in-game captures. A flag is
// never a deletion: it puts the post in the admin's 삭제 대기 list. Once the
// admin starts the trial, flagged posts are hidden from other users for three
// days instead - still no deletion, so a wrong call costs nothing permanent.
// 0.3 on the fixed scale is a ~0.045 similarity gap - small, but the cost of
// a flag is only that the admin looks at it.
const AUTO_FLAG_MIN_CONF = 0.3;
const CAPTURE_TARGET = 30; // examples per label before proposing the trial
const TRIAL_DAYS = 3;
const AUTO_REVIEW_BATCH = 20; // per page load, so opening the feed stays quick

let autoModeration = {};

// 3일 테스트 시작 시각(밀리초). 시작 안 했으면 0.
function trialStartedMs() {
  const t = autoModeration.trialStartedAt;
  return t && t.toMillis ? t.toMillis() : 0;
}

// 3일 테스트가 진행 중인가.
function trialActive() {
  const start = trialStartedMs();
  return start > 0 && Date.now() - start < TRIAL_DAYS * 86400000;
}

// 관리자 접속 시 밀린 게시글을 분류기에 넘깁니다 (한 번에 최대 20건).
async function autoReviewPosts() {
  if (!isAdmin()) return;
  const pending = allSlots.filter(
    (s) =>
      !s.autoChecked &&
      s.verifiedCapture == null &&
      (s.images || []).length &&
      !String(s.id).startsWith('dummy-')
  );
  if (!pending.length) return;
  for (const slot of pending.slice(0, AUTO_REVIEW_BATCH)) {
    let verdict;
    try {
      verdict = await classifyCapture(slot.images[0]);
    } catch (err) {
      console.warn('자동 검토 실패:', slot.id, err);
      continue;
    }
    if (!verdict) return; // not enough examples yet - stop, don't spin
    const flagged = verdict.label === '외부' && verdict.confidence >= AUTO_FLAG_MIN_CONF;
    slot.autoSimilarity = verdict.similarity;
    try {
      if (flagged && autoModeration.autoDelete) {
        // Removed, but archived to autoDeleted first - see DB.autoDeleteSlot.
        await DB.autoDeleteSlot(slot, verdict.confidence);
        allSlots = allSlots.filter((s) => s.id !== slot.id);
      } else {
        await DB.setAutoFlag(slot.id, flagged, verdict.confidence, verdict.similarity);
        Object.assign(slot, { autoChecked: true, autoFlag: flagged });
      }
    } catch (err) {
      console.warn('자동 검토 저장 실패:', slot.id, err);
    }
  }
  updateReviewProgress();
  applyFeedFilter();
}

// 검색어·캐릭터·분류·숨김 조건을 모두 걸러 실제로 카드를 그립니다.
function applyFeedFilter() {
  updateAdultGate();
  const q = feedSearchInput.value;
  const field = feedSearchField.value;

  const filtered = allSlots.filter((slot) => {
    const matchesSearch = slotMatchesQuery(slot, q, field);
    const matchesChar = selectedCharacters.size === 0 || selectedCharacters.has(slot.characterId);
    // Posts predating categories have no field; they read as 일반.
    const matchesCategory =
      !selectedCategory || (slot.category || '일반') === selectedCategory;
    const allowed = adultVisible() || (slot.category || '일반') !== ADULT_CATEGORY;
    // A flagged post is hidden from everyone but the admin, both during the
    // trial and once auto-deletion is on (deletion itself waits for the
    // admin's sweep, but it should not stay visible in the meantime).
    const gateOn = trialActive() || autoModeration.autoDelete;
    const notHidden = isAdmin() || !(gateOn && slot.autoFlag);
    return matchesSearch && matchesChar && matchesCategory && allowed && notHidden;
  });

  if (filtered.length === 0) {
    // 필터를 걸었는데 결과가 없을 때. 빈 화면에 한 줄만 있는 것보다 낫습니다.
    feedGrid.innerHTML = `
      <div class="empty-illustrated">
        <p>아직 게시된게 없어요</p>
        <img src="img/empty-tris.webp?v=129" alt="" />
      </div>`;
    return;
  }

  renderSlotMasonry(feedGrid, filtered, getMasonryColumns(), {
    showCharacterTag: true,
    onDelete: async (s) => {
      await DB.deleteSlot(s.id);
      renderFeed();
    },
  });
}

window.addEventListener('resize', debounce(() => applyFeedFilter(), 200));

// 선택된 캐릭터 필터 하나를 해제합니다.
function clearCharacterFilter(id) {
  selectedCharacters.delete(id);
  const tile = grid.querySelector(`.char-tile[data-char-id="${CSS.escape(id)}"]`);
  if (tile) tile.classList.remove('selected');
  updateFeedHeading();
  applyFeedFilter();
}

// Posts needed before a classifier trained on the admin's rulings would
// have enough labelled examples to be worth building.
const TRAINING_TARGET = 50;

// Admin-only: how far the labelled set has come. There is no model and no
// training running yet - this counts the rulings that would feed one.
function updateReviewProgress() {
  if (!isAdmin()) {
    reviewProgress.hidden = true;
    return;
  }
  const real = allSlots.filter((s) => !String(s.id).startsWith('dummy-'));
  const ruled = real.filter((s) => s.verifiedCapture === true || s.verifiedCapture === false);
  const confirmed = real.filter((s) => s.verifiedCapture === true).length;
  reviewProgress.hidden = false;
  reviewProgress.textContent =
    `학습 데이터 ${ruled.length}/${TRAINING_TARGET}건 · 미검토 ${real.length - ruled.length}건 · 캡처 확인 ${confirmed}건` +
    (ruled.length >= TRAINING_TARGET ? ' · 분류기 학습 가능' : '');

  const waiting = real.filter((s) => s.autoFlag && s.verifiedCapture == null).length;
  if (waiting) reviewProgress.textContent += ` · 자동 삭제 대기 ${waiting}건`;
  if (trialActive()) {
    const left = Math.ceil((trialStartedMs() + TRIAL_DAYS * 86400000 - Date.now()) / 86400000);
    reviewProgress.textContent += ` · 자동 숨김 테스트 진행 중 (${left}일 남음)`;
  }
  if (autoModeration.autoDelete) reviewProgress.textContent += ' · 자동 삭제 켜짐';

  DB.countUsers()
    .then((n) => {
      reviewProgress.textContent += ` · 가입 이용자 ${n}명`;
    })
    .catch(() => {});

  updateAutoBanner();
}

// 3일 테스트가 끝났는가.
function trialEnded() {
  return trialStartedMs() > 0 && !trialActive();
}

// 관리자 안내 배너를 만들거나 이미 있는 것을 돌려줍니다.
function autoBannerBox() {
  let box = document.getElementById('auto-banner');
  if (!box) {
    box = document.createElement('div');
    box.id = 'auto-banner';
    box.className = 'trial-offer';
    reviewProgress.insertAdjacentElement('afterend', box);
  }
  return box;
}

// 자동 조치 설정을 다시 읽고 화면을 갱신합니다.
async function refreshAuto() {
  autoModeration = await DB.getAutoModeration();
  updateReviewProgress();
  applyFeedFilter();
}

// One banner, three states: propose the trial, report on the finished trial,
// or say that auto-deletion is live.
async function updateAutoBanner() {
  const existing = document.getElementById('auto-banner');
  if (!isAdmin()) {
    if (existing) existing.remove();
    return;
  }

  if (autoModeration.autoDelete) {
    const box = autoBannerBox();
    box.innerHTML = `
      <span>자동 삭제가 <b>켜져 있습니다</b>. 삭제된 게시글은 되살릴 수 있도록 보관됩니다.</span>
      <button class="pill" id="auto-off">끄기</button>`;
    document.getElementById('auto-off').addEventListener('click', async () => {
      if (!confirm('자동 삭제를 끌까요?')) return;
      await DB.disableAutoDelete();
      refreshAuto();
    });
    return;
  }

  if (trialEnded()) {
    // What the trial actually did: posts it hid, and how the admin ruled on them.
    const hidden = allSlots.filter((s) => s.autoFlag);
    const wrong = hidden.filter((s) => s.verifiedCapture === true).length;
    const right = hidden.filter((s) => s.verifiedCapture === false).length;
    const box = autoBannerBox();
    box.innerHTML = `
      <span>${TRIAL_DAYS}일 자동 숨김 테스트가 끝났습니다 —
      숨긴 게시글 ${hidden.length}건 · 관리자 확인 결과 맞음 ${right}건 · 잘못 숨김 ${wrong}건.
      결과가 만족스러우면 자동 <b>삭제</b>를 켜세요.</span>
      <button class="pill accent" id="auto-enable">자동 삭제 켜기</button>
      <button class="pill" id="auto-again">${TRIAL_DAYS}일 더 지켜보기</button>`;
    document.getElementById('auto-enable').addEventListener('click', async () => {
      if (!confirm('자동 삭제를 켤까요? 이후 외부 이미지로 판정된 게시글은 자동으로 삭제됩니다.')) return;
      await DB.enableAutoDelete();
      refreshAuto();
    });
    document.getElementById('auto-again').addEventListener('click', async () => {
      await DB.startAutoModerationTrial();
      refreshAuto();
    });
    return;
  }

  if (trialActive()) {
    if (existing) existing.remove();
    return;
  }

  // Not started yet: offer the trial once there are enough examples.
  let counts;
  try {
    counts = await captureSampleCounts();
  } catch {
    return;
  }
  if (counts['인게임'] < CAPTURE_TARGET) {
    if (existing) existing.remove();
    return;
  }
  const box = autoBannerBox();
  box.innerHTML = `
    <span>학습 예시가 충분히 모였습니다 (인게임 ${counts['인게임']}장 · 외부 ${counts['외부']}장).
    ${TRIAL_DAYS}일간 자동으로 <b>숨기기</b> 테스트를 시작할까요? 삭제는 하지 않습니다.</span>
    <button class="pill accent" id="trial-start">테스트 시작</button>`;
  document.getElementById('trial-start').addEventListener('click', async () => {
    if (!confirm(`${TRIAL_DAYS}일간 자동 숨김 테스트를 시작할까요?`)) return;
    await DB.startAutoModerationTrial();
    refreshAuto();
  });
}

// 목록 위 제목을 현재 필터에 맞게 바꿉니다.
function updateFeedHeading() {
  feedHeading.innerHTML = '';
  feedHeading.append('전체 게시글');
  if (selectedCharacters.size === 0) return;

  feedHeading.append(' · ');
  selectedCharacters.forEach((name, id) => {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.textContent = name;
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '×';
    clearBtn.title = '필터 해제';
    clearBtn.addEventListener('click', () => clearCharacterFilter(id));
    chip.appendChild(clearBtn);
    feedHeading.appendChild(chip);
  });
}

feedSearchInput.addEventListener('input', applyFeedFilter);
feedSearchField.addEventListener('change', applyFeedFilter);
categoryTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  selectedCategory = tab.dataset.category;
  categoryTabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  applyFeedFilter();
});

const charSingleFields = document.getElementById('char-single-fields');
const charBulkList = document.getElementById('char-bulk-list');
const charSaveBtn = document.getElementById('char-save');
let pendingBulkEntries = []; // [{ file, name }] - used when multiple icons are picked at once

// Best-effort guess at a character name from a reference-art filename like
// "결전기컷_씬-윤리아.jpg" or "결전기컷_루시-Photoroom.png" -> takes the
// last non-ASCII-only segment, since these filenames tend to end with the
// character's name. Just a starting point - the admin can edit it before
// saving.
function guessNameFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const parts = base.split(/[_\-]+/).filter(Boolean);
  const meaningful = parts.filter((p) => !/^[A-Za-z0-9]+$/.test(p));
  return (meaningful.length ? meaningful[meaningful.length - 1] : parts[parts.length - 1]) || base;
}

// 캐릭터 추가 창의 버튼 문구 (한 명 / 여러 명).
function updateSaveButtonLabel() {
  charSaveBtn.textContent = pendingBulkEntries.length > 1 ? `${pendingBulkEntries.length}명 추가` : '추가';
}

// 여러 캐릭터를 한 번에 추가할 때의 미리보기 목록.
function renderBulkList() {
  charBulkList.innerHTML = '';
  pendingBulkEntries.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'char-bulk-row';

    const img = document.createElement('img');
    img.className = 'char-bulk-thumb';
    const reader = new FileReader();
    reader.onload = () => (img.src = reader.result);
    reader.readAsDataURL(entry.file);
    row.appendChild(img);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = entry.name;
    input.placeholder = '캐릭터 이름';
    input.addEventListener('input', () => (entry.name = input.value));
    row.appendChild(input);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-row';
    removeBtn.title = '제외';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      pendingBulkEntries.splice(i, 1);
      renderBulkList();
      updateSaveButtonLabel();
    });
    row.appendChild(removeBtn);

    charBulkList.appendChild(row);
  });
}

// 캐릭터 추가 창 열기.
function openModal() {
  nameInput.value = '';
  iconInput.value = '';
  iconPreview.src = '';
  iconPreview.classList.remove('show');
  pendingIconFile = null;
  pendingBulkEntries = [];
  charSingleFields.hidden = false;
  charBulkList.innerHTML = '';
  updateSaveButtonLabel();
  modal.hidden = false;
  nameInput.focus();
}

// 캐릭터 추가 창 닫기.
function closeModal() {
  modal.hidden = true;
}

iconInput.addEventListener('change', () => {
  const files = Array.from(iconInput.files || []);
  if (files.length === 0) return;

  if (files.length === 1) {
    pendingIconFile = files[0];
    pendingBulkEntries = [];
    charSingleFields.hidden = false;
    charBulkList.innerHTML = '';
    const reader = new FileReader();
    reader.onload = () => {
      iconPreview.src = reader.result;
      iconPreview.classList.add('show');
    };
    reader.readAsDataURL(pendingIconFile);
  } else {
    pendingIconFile = null;
    pendingBulkEntries = files.map((file) => ({ file, name: guessNameFromFilename(file.name) }));
    charSingleFields.hidden = true;
    renderBulkList();
  }
  updateSaveButtonLabel();
});

document.getElementById('char-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

charSaveBtn.addEventListener('click', async () => {
  if (pendingBulkEntries.length > 1) {
    const entries = pendingBulkEntries.filter((entry) => entry.name.trim());
    if (entries.length === 0) {
      alert('이름을 입력해주세요.');
      return;
    }
    charSaveBtn.disabled = true;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      charSaveBtn.textContent = `추가 중... (${i + 1}/${entries.length})`;
      try {
        const iconUrl = await uploadImageToCloudinary(entry.file);
        await DB.addCharacter({ name: entry.name.trim(), icon: iconUrl });
      } catch (err) {
        alert(`"${entry.name}" 추가에 실패했습니다: ${err.message}`);
      }
    }
    charSaveBtn.disabled = false;
    closeModal();
    render();
    return;
  }

  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  charSaveBtn.disabled = true;
  charSaveBtn.textContent = '추가 중...';
  try {
    let iconUrl = null;
    if (pendingIconFile) {
      iconUrl = await uploadImageToCloudinary(pendingIconFile);
    }
    await DB.addCharacter({ name, icon: iconUrl });
    closeModal();
    render();
  } catch (err) {
    alert('캐릭터 추가에 실패했습니다: ' + err.message);
  } finally {
    charSaveBtn.disabled = false;
    updateSaveButtonLabel();
  }
});

// 캐릭터 목록을 못 불러왔을 때의 안내.
function showCharError() {
  grid.innerHTML =
    '<div class="empty-hint" style="grid-column:1/-1">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

// 게시글을 못 불러왔을 때의 안내.
function showFeedError() {
  feedGrid.innerHTML =
    '<div class="empty-hint">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

// 캐릭터와 게시글을 모두 다시 그립니다.
function renderAll() {
  renderCharacters().catch((err) => {
    console.error(err);
    showCharError();
  });
  renderFeed().catch((err) => {
    console.error(err);
    showFeedError();
  });
}

// Only onAuthChange, not also authReady.then(renderAll): see auth.js -
// onAuthChange already fires once for the initial auth resolution, so
// adding authReady.then(renderAll) here double-fired it on load.
onAuthChange(renderAll);
