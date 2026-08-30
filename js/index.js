const grid = document.getElementById('char-grid');
const modal = document.getElementById('char-modal');
const nameInput = document.getElementById('char-name-input');
const iconInput = document.getElementById('char-icon-input');
const iconPreview = document.getElementById('char-icon-preview');
const searchInput = document.getElementById('char-search');

let pendingIconDataURL = null;
let suppressClick = false;

async function render() {
  const characters = await DB.getCharacters();
  grid.innerHTML = '';

  characters.forEach((c) => {
    const tile = document.createElement('div');
    tile.className = 'char-tile';
    tile.dataset.role = 'item';
    tile.dataset.id = c.id;
    tile.dataset.name = (c.name || '').toLowerCase();
    tile.draggable = true;
    tile.innerHTML = `
      <a href="character.html?id=${c.id}" class="char-avatar">
        ${c.icon ? `<img src="${c.icon}" alt="${c.name}">` : (c.name || '?').slice(0, 1)}
      </a>
      <div class="char-name">${c.name || '이름없음'}</div>
      <button class="char-del" title="삭제">×</button>
    `;
    tile.querySelector('.char-avatar').addEventListener('click', (e) => {
      if (suppressClick) e.preventDefault();
    });
    tile.querySelector('.char-del').addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(`"${c.name}" 캐릭터와 등록된 코스튬을 모두 삭제할까요?`)) {
        await DB.deleteCharacter(c.id);
        render();
      }
    });
    grid.appendChild(tile);
  });

  const addTile = document.createElement('div');
  addTile.className = 'char-tile add-tile';
  addTile.innerHTML = `<div class="char-avatar"><span class="plus">+</span></div><div class="char-name">추가</div>`;
  addTile.addEventListener('click', openModal);
  grid.appendChild(addTile);

  if (characters.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.style.gridColumn = '1 / -1';
    hint.textContent = '등록된 캐릭터가 없어요. + 를 눌러 캐릭터를 추가해보세요.';
    grid.insertBefore(hint, addTile);
  }

  applyFilter();
}

function applyFilter() {
  const q = searchInput.value.trim().toLowerCase();
  grid.querySelectorAll('[data-role="item"]').forEach((tile) => {
    tile.hidden = q.length > 0 && !tile.dataset.name.includes(q);
  });
}

enableDragReorder(grid, '[data-role="item"]', async () => {
  const ids = Array.from(grid.querySelectorAll('[data-role="item"]')).map((el) =>
    Number(el.dataset.id)
  );
  await DB.reorderCharacters(ids);
});

grid.addEventListener('dragstart', (e) => {
  if (e.target.closest('[data-role="item"]')) suppressClick = true;
});
grid.addEventListener('dragend', () => {
  setTimeout(() => (suppressClick = false), 0);
});

searchInput.addEventListener('input', applyFilter);

function openModal() {
  nameInput.value = '';
  iconInput.value = '';
  iconPreview.src = '';
  iconPreview.classList.remove('show');
  pendingIconDataURL = null;
  modal.hidden = false;
  nameInput.focus();
}

function closeModal() {
  modal.hidden = true;
}

iconInput.addEventListener('change', async () => {
  const file = iconInput.files[0];
  if (!file) return;
  pendingIconDataURL = await fileToDataURL(file);
  iconPreview.src = pendingIconDataURL;
  iconPreview.classList.add('show');
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
  await DB.addCharacter({ name, icon: pendingIconDataURL });
  closeModal();
  render();
});

document.getElementById('reset-char').addEventListener('click', () => {
  searchInput.value = '';
  applyFilter();
});

document.getElementById('reset-all').addEventListener('click', async () => {
  if (confirm('등록된 모든 캐릭터와 코스튬 데이터를 삭제할까요? 되돌릴 수 없습니다.')) {
    const characters = await DB.getCharacters();
    for (const c of characters) {
      await DB.deleteCharacter(c.id);
    }
    render();
  }
});

render();
