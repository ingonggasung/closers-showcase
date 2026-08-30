const params = new URLSearchParams(location.search);
const characterId = Number(params.get('id'));

if (!characterId) {
  location.href = 'index.html';
}

const slotGrid = document.getElementById('slot-grid');
const slotModal = document.getElementById('slot-modal');
const slotTitleInput = document.getElementById('slot-title-input');
const slotSearchInput = document.getElementById('slot-search');

let suppressClick = false;

async function renderHeader() {
  const c = await DB.getCharacter(characterId);
  if (!c) {
    location.href = 'index.html';
    return;
  }
  document.getElementById('char-name').textContent = c.name;
  const icon = document.getElementById('char-icon');
  icon.src = c.icon || '';
  icon.style.display = c.icon ? 'block' : 'none';
  document.title = `${c.name} - 클로저스 캐릭터 자랑`;
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
    frame.innerHTML = `<img src="${src}" alt="${slot.title}">`;
    wrap.appendChild(frame);
  });

  return wrap;
}

async function render() {
  await renderHeader();
  const slots = await DB.getSlotsByCharacter(characterId);
  slotGrid.innerHTML = '';

  slots.forEach((slot) => {
    const card = document.createElement('div');
    card.className = 'slot-card';
    card.dataset.role = 'item';
    card.dataset.id = slot.id;
    card.dataset.title = (slot.title || '').toLowerCase();
    card.draggable = true;

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

    const del = document.createElement('button');
    del.className = 'slot-del';
    del.textContent = '×';
    del.title = '삭제';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`"${slot.title || '이 세트'}"를 삭제할까요?`)) {
        await DB.deleteSlot(slot.id);
        render();
      }
    });
    card.appendChild(del);

    const label = document.createElement('div');
    label.className = 'slot-label';
    label.textContent = slot.title || '(이름 없음)';
    card.appendChild(label);

    card.addEventListener('click', () => {
      if (suppressClick) return;
      location.href = `slot.html?id=${slot.id}&cid=${characterId}`;
    });

    slotGrid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'slot-card add-slot';
  addCard.innerHTML = `<span class="plus">+</span><span>세트 추가</span>`;
  addCard.addEventListener('click', openSlotModal);
  slotGrid.appendChild(addCard);

  applySlotFilter();
}

function applySlotFilter() {
  const q = slotSearchInput.value.trim().toLowerCase();
  slotGrid.querySelectorAll('[data-role="item"]').forEach((card) => {
    card.hidden = q.length > 0 && !card.dataset.title.includes(q);
  });
}

enableDragReorder(slotGrid, '[data-role="item"]', async () => {
  const ids = Array.from(slotGrid.querySelectorAll('[data-role="item"]')).map((el) =>
    Number(el.dataset.id)
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

function openSlotModal() {
  slotTitleInput.value = '';
  slotModal.hidden = false;
  slotTitleInput.focus();
}
function closeSlotModal() {
  slotModal.hidden = true;
}

document.getElementById('slot-cancel').addEventListener('click', closeSlotModal);
slotModal.addEventListener('click', (e) => {
  if (e.target === slotModal) closeSlotModal();
});

document.getElementById('slot-save').addEventListener('click', async () => {
  const title = slotTitleInput.value.trim();
  const newId = await DB.addSlot({ characterId, title, images: [], description: '' });
  closeSlotModal();
  location.href = `slot.html?id=${newId}&cid=${characterId}`;
});

render();
