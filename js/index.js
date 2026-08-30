const grid = document.getElementById('char-grid');
const modal = document.getElementById('char-modal');
const nameInput = document.getElementById('char-name-input');
const iconInput = document.getElementById('char-icon-input');
const iconPreview = document.getElementById('char-icon-preview');
const searchInput = document.getElementById('char-search');
const feedGrid = document.getElementById('feed-grid');
const feedSearchInput = document.getElementById('feed-search');

let pendingIconFile = null;

mountAuthBar(document.getElementById('auth-bar'));

function isAdmin() {
  return !!currentUser && currentUser.email === ADMIN_EMAIL;
}

document.getElementById('global-fab').addEventListener('click', () => openPostModal());

async function render() {
  await Promise.all([renderCharacters(), renderFeed()]);
}

async function renderCharacters() {
  const characters = await DB.getCharacters();
  grid.innerHTML = '';

  characters.forEach((c) => {
    const tile = document.createElement('div');
    tile.className = 'char-tile';
    tile.dataset.name = (c.name || '').toLowerCase();
    tile.innerHTML = `
      <a href="character.html?id=${encodeURIComponent(c.id)}" class="char-avatar">
        ${c.icon ? `<img src="${escapeHtml(c.icon)}" alt="${escapeHtml(c.name)}">` : escapeHtml((c.name || '?').slice(0, 1))}
      </a>
      <div class="char-name">${escapeHtml(c.name || '이름없음')}</div>
      ${isAdmin() ? '<button class="char-del" title="삭제">×</button>' : ''}
    `;
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

  applyFilter();
}

function applyFilter() {
  const q = searchInput.value.trim().toLowerCase();
  grid.querySelectorAll('.char-tile:not(.add-tile)').forEach((tile) => {
    tile.hidden = q.length > 0 && !tile.dataset.name.includes(q);
  });
}

searchInput.addEventListener('input', applyFilter);

async function renderFeed() {
  const slots = await DB.getAllSlots();

  if (slots.length === 0) {
    feedGrid.innerHTML = '<div class="empty-hint">아직 등록된 게시글이 없어요.</div>';
    return;
  }

  const masonry = renderMasonryGrid(feedGrid, 3);
  slots.forEach((slot) => {
    const card = buildSlotCard(slot, {
      showCharacterTag: true,
      onDelete: async (s) => {
        await DB.deleteSlot(s.id);
        renderFeed();
      },
    });
    masonry.add(card);
  });

  applyFeedFilter();
}

function applyFeedFilter() {
  const q = feedSearchInput.value.trim().toLowerCase();
  feedGrid.querySelectorAll('.slot-card').forEach((card) => {
    card.hidden = q.length > 0 && !card.dataset.title.includes(q);
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

document.getElementById('reset-char').addEventListener('click', () => {
  searchInput.value = '';
  applyFilter();
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

authReady.then(renderAll);
onAuthChange(renderAll);
