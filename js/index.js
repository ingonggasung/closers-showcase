const grid = document.getElementById('char-grid');
const modal = document.getElementById('char-modal');
const nameInput = document.getElementById('char-name-input');
const iconInput = document.getElementById('char-icon-input');
const iconPreview = document.getElementById('char-icon-preview');
const feedGrid = document.getElementById('feed-grid');
const feedSearchInput = document.getElementById('feed-search');
const feedHeading = document.getElementById('feed-heading');
const filterToggle = document.getElementById('filter-toggle');
const filterSection = document.getElementById('filter-section');

let pendingIconFile = null;
let selectedCharacters = new Map(); // id -> name, multi-select filter

mountAuthBar(document.getElementById('auth-bar'));

document.getElementById('global-fab').addEventListener('click', () => openPostModal());

const FILTER_MAX_HEIGHT = 2000; // generous cap; real content settles well under this

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
window.addEventListener(
  'scroll',
  () => {
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

async function render() {
  await Promise.all([renderCharacters(), renderFeed()]);
}

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

async function renderFeed() {
  allSlots = await DB.getAllSlots();

  if (allSlots.length === 0) {
    feedGrid.innerHTML = '<div class="empty-hint">아직 등록된 게시글이 없어요.</div>';
    return;
  }

  applyFeedFilter();
}

function applyFeedFilter() {
  const q = feedSearchInput.value.trim().toLowerCase();

  const filtered = allSlots.filter((slot) => {
    const title = slotDisplayTitle(slot).toLowerCase();
    const matchesSearch = q.length === 0 || title.includes(q);
    const matchesChar = selectedCharacters.size === 0 || selectedCharacters.has(slot.characterId);
    return matchesSearch && matchesChar;
  });

  if (filtered.length === 0) {
    feedGrid.innerHTML = '<div class="empty-hint">조건에 맞는 게시글이 없어요.</div>';
    return;
  }

  const masonry = renderMasonryGrid(feedGrid, getMasonryColumns());
  filtered.forEach((slot) => {
    const card = buildSlotCard(slot, {
      showCharacterTag: true,
      onDelete: async (s) => {
        await DB.deleteSlot(s.id);
        renderFeed();
      },
    });
    masonry.add(card);
  });
}

window.addEventListener('resize', debounce(() => applyFeedFilter(), 200));

function clearCharacterFilter(id) {
  selectedCharacters.delete(id);
  const tile = grid.querySelector(`.char-tile[data-char-id="${CSS.escape(id)}"]`);
  if (tile) tile.classList.remove('selected');
  updateFeedHeading();
  applyFeedFilter();
}

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

function openModal() {
  nameInput.value = '';
  iconInput.value = '';
  iconPreview.src = '';
  iconPreview.classList.remove('show');
  pendingIconFile = null;
  modal.hidden = false;
  nameInput.focus();
}

function closeModal() {
  modal.hidden = true;
}

iconInput.addEventListener('change', () => {
  const file = iconInput.files[0];
  if (!file) return;
  pendingIconFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    iconPreview.src = reader.result;
    iconPreview.classList.add('show');
  };
  reader.readAsDataURL(file);
});

document.getElementById('char-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.getElementById('char-save').addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  const saveBtn = document.getElementById('char-save');
  saveBtn.disabled = true;
  saveBtn.textContent = '추가 중...';
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
    saveBtn.disabled = false;
    saveBtn.textContent = '추가';
  }
});

function showCharError() {
  grid.innerHTML =
    '<div class="empty-hint" style="grid-column:1/-1">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

function showFeedError() {
  feedGrid.innerHTML =
    '<div class="empty-hint">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

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
