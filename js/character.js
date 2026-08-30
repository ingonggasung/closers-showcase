const params = new URLSearchParams(location.search);
const characterId = params.get('id');

if (!characterId) {
  location.href = 'index.html';
}

const slotGrid = document.getElementById('slot-grid');
const slotSearchInput = document.getElementById('slot-search');

let character = null;

mountAuthBar(document.getElementById('auth-bar'));
setupDragSuppression(slotGrid);

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

async function render() {
  await renderHeader();
  const canPost = !!currentUser;
  const slots = await DB.getSlotsByCharacter(characterId);
  slotGrid.innerHTML = '';

  slots.forEach((slot) => {
    const card = buildSlotCard(slot, {
      draggable: true,
      onDelete: async (s) => {
        await DB.deleteSlot(s.id);
        render();
      },
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
