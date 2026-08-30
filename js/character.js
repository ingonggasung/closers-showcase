const params = new URLSearchParams(location.search);
const characterId = params.get('id');

if (!characterId) {
  location.href = 'index.html';
}

const slotGrid = document.getElementById('slot-grid');
const slotSearchInput = document.getElementById('slot-search');

let suppressClick = false;
let character = null;

mountAuthBar(document.getElementById('auth-bar'));

document
  .getElementById('global-fab')
  .addEventListener('click', () => openPostModal(characterId));

async function renderHeader() {
  character = await DB.getCharacter(characterId);
  if (!character) {
    location.href = 'index.html';
    return;
  }
  document.getElementById('char-name').textContent = character.name;
  const icon = document.getElementById('char-icon');
  icon.src = character.icon || '';
  icon.style.display = character.icon ? 'block' : 'none';
  document.title = `${character.name} - 클로저스 캐릭터 자랑`;
}

function buildCarousel(slot) {
  const wrap = document.createElement('div');
  wrap.className = 'slot-carousel';

  if (!slot.images || slot.images.length === 0) {
    const frame = document.createElement('div');
    frame.className = 'frame empty';
    frame.textContent = '이미지 없음';
    wrap.appendChild(frame);
    return wrap;
  }

  slot.images.forEach((src) => {
    const frame = document.createElement('div');
    frame.className = 'frame';
    frame.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(slotSummary(slot))}">`;
    wrap.appendChild(frame);
  });

  return wrap;
}

async function render() {
  await renderHeader();
  const canPost = !!currentUser;
  const slots = await DB.getSlotsByCharacter(characterId);
  slotGrid.innerHTML = '';

  slots.forEach((slot) => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.dataset.title = slotSummary(slot).toLowerCase();

    const mine = isOwner(slot);
    if (mine) {
      card.dataset.role = 'item';
      card.dataset.id = slot.id;
      card.draggable = true;
    }

    const carousel = buildCarousel(slot);
    card.appendChild(carousel);

    if (slot.images && slot.images.length > 1) {
      const prev = document.createElement('button');
      prev.className = 'slot-nav prev';
      prev.textContent = '‹';
      prev.addEventListener('click', (e) => {
        e.stopPropagation();
        carousel.scrollBy({ left: -carousel.clientWidth, behavior: 'smooth' });
      });
      const next = document.createElement('button');
      next.className = 'slot-nav next';
      next.textContent = '›';
      next.addEventListener('click', (e) => {
        e.stopPropagation();
        carousel.scrollBy({ left: carousel.clientWidth, behavior: 'smooth' });
      });
      card.appendChild(prev);
      card.appendChild(next);

      const count = document.createElement('div');
      count.className = 'slot-count';
      count.textContent = `${slot.images.length}장`;
      card.appendChild(count);
    }

    if (mine) {
      const del = document.createElement('button');
      del.className = 'slot-del';
      del.textContent = '×';
      del.title = '삭제';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('이 게시글을 삭제할까요?')) {
          await DB.deleteSlot(slot.id);
          render();
        }
      });
      card.appendChild(del);
    }

    const label = document.createElement('div');
    label.className = 'slot-label';
    label.textContent = slotSummary(slot);
    card.appendChild(label);

    const ownerTag = document.createElement('div');
    ownerTag.className = 'slot-owner-tag';
    ownerTag.textContent = `by ${slot.ownerName || '익명'}`;
    card.appendChild(ownerTag);

    card.addEventListener('click', () => {
      if (suppressClick) return;
      location.href = `slot.html?id=${encodeURIComponent(slot.id)}&cid=${encodeURIComponent(characterId)}`;
    });

    slotGrid.appendChild(card);
  });

  if (canPost) {
    const addCard = document.createElement('div');
    addCard.className = 'slot-card add-slot';
    addCard.innerHTML = `<span class="plus">+</span><span>코스튬 등록</span>`;
    addCard.addEventListener('click', () => openPostModal(characterId));
    slotGrid.appendChild(addCard);
  }

  applySlotFilter();
}

function applySlotFilter() {
  const q = slotSearchInput.value.trim().toLowerCase();
  slotGrid.querySelectorAll('.slot-card:not(.add-slot)').forEach((card) => {
    card.hidden = q.length > 0 && !card.dataset.title.includes(q);
  });
}

enableDragReorder(slotGrid, '[data-role="item"]', async () => {
  const ids = Array.from(slotGrid.querySelectorAll('[data-role="item"]')).map(
    (el) => el.dataset.id
  );
  await DB.reorderSlots(ids);
});

slotGrid.addEventListener('dragstart', (e) => {
  if (e.target.closest('[data-role="item"]')) suppressClick = true;
});
slotGrid.addEventListener('dragend', () => {
  setTimeout(() => (suppressClick = false), 0);
});

slotSearchInput.addEventListener('input', applySlotFilter);

function showLoadError() {
  slotGrid.innerHTML =
    '<div class="empty-hint">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

authReady.then(render).catch((err) => {
  console.error(err);
  showLoadError();
});
onAuthChange(() => render().catch((err) => {
  console.error(err);
  showLoadError();
}));
