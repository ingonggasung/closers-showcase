const params = new URLSearchParams(location.search);
const characterId = params.get('id');

if (!characterId) {
  location.href = 'index.html';
}

const slotGrid = document.getElementById('slot-grid');
const slotSearchInput = document.getElementById('slot-search');

let character = null;
let allSlots = [];

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
  allSlots = await DB.getSlotsByCharacter(characterId);
  applySlotFilter();
}

function applySlotFilter() {
  const q = slotSearchInput.value.trim().toLowerCase();
  const canPost = !!currentUser;

  const filtered = allSlots.filter((slot) => {
    const title = `${slotDisplayTitle(slot)} ${slot.characterName || ''}`.toLowerCase();
    return q.length === 0 || title.includes(q);
  });

  const masonry = renderMasonryGrid(slotGrid, getMasonryColumns());

  filtered.forEach((slot) => {
    const card = buildSlotCard(slot, {
      draggable: true,
      onDelete: async (s) => {
        await DB.deleteSlot(s.id);
        render();
      },
    });
    masonry.add(card);
  });

  if (canPost) {
    const addCard = document.createElement('div');
    addCard.className = 'slot-card add-slot';
    addCard.innerHTML = `<span class="plus">+</span><span>코스튬 등록</span>`;
    addCard.addEventListener('click', () => openPostModal(characterId));
    masonry.add(addCard);
  }
}

enableDragReorder(slotGrid, '[data-role="item"]', async () => {
  const ids = Array.from(slotGrid.querySelectorAll('[data-role="item"]')).map(
    (el) => el.dataset.id
  );
  await DB.reorderSlots(ids);
});

slotSearchInput.addEventListener('input', applySlotFilter);
window.addEventListener('resize', debounce(() => applySlotFilter(), 200));

function showLoadError() {
  slotGrid.innerHTML =
    '<div class="empty-hint">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

// Only onAuthChange, not also authReady.then(render): see auth.js -
// onAuthChange already fires once for the initial auth resolution, so
// adding authReady.then(render) here double-fired render() on load (two
// overlapping async renders racing to rebuild the same masonry grid).
onAuthChange(() => render().catch((err) => {
  console.error(err);
  showLoadError();
}));
