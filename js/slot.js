const params = new URLSearchParams(location.search);
const slotId = Number(params.get('id'));
const characterId = Number(params.get('cid'));

if (!slotId) {
  location.href = 'index.html';
}

document.getElementById('back-link').href = characterId
  ? `character.html?id=${characterId}`
  : 'index.html';

const imageRow = document.getElementById('image-row');
const imageInput = document.getElementById('image-input');
const titleInput = document.getElementById('slot-title');
const descInput = document.getElementById('description');

const MAX_IMAGES = 10;
let currentSlot = null;

async function render() {
  currentSlot = await DB.getSlot(slotId);
  if (!currentSlot) {
    location.href = 'index.html';
    return;
  }
  titleInput.value = currentSlot.title || '';
  descInput.value = currentSlot.description || '';
  document.title = `${currentSlot.title || '코스튬'} - 클로저스 캐릭터 자랑`;
  renderImages();
}

function renderImages() {
  imageRow.innerHTML = '';
  const images = currentSlot.images || [];

  images.forEach((src, i) => {
    const shot = document.createElement('div');
    shot.className = 'shot';
    shot.innerHTML = `
      <img src="${src}" alt="사진 ${i + 1}">
      <button class="remove-shot" title="삭제">×</button>
    `;
    shot.querySelector('.remove-shot').addEventListener('click', async () => {
      const next = images.filter((_, idx) => idx !== i);
      await DB.updateSlot(slotId, { images: next });
      currentSlot.images = next;
      renderImages();
    });
    imageRow.appendChild(shot);
  });

  if (images.length < MAX_IMAGES) {
    const addBtn = document.createElement('button');
    addBtn.className = 'add-shot';
    addBtn.textContent = '+';
    addBtn.title = `사진 추가 (${images.length}/${MAX_IMAGES})`;
    addBtn.addEventListener('click', () => imageInput.click());
    imageRow.appendChild(addBtn);
  }
}

imageInput.addEventListener('change', async () => {
  const files = Array.from(imageInput.files || []);
  if (files.length === 0) return;

  const images = currentSlot.images || [];
  const room = MAX_IMAGES - images.length;
  const toAdd = files.slice(0, room);

  for (const file of toAdd) {
    const dataURL = await fileToDataURL(file);
    images.push(dataURL);
  }

  await DB.updateSlot(slotId, { images });
  currentSlot.images = images;
  renderImages();
  imageInput.value = '';
});

titleInput.addEventListener('change', async () => {
  const title = titleInput.value.trim();
  await DB.updateSlot(slotId, { title });
  currentSlot.title = title;
});

document.getElementById('save-desc').addEventListener('click', async () => {
  const description = descInput.value;
  await DB.updateSlot(slotId, { description });
  currentSlot.description = description;
  const btn = document.getElementById('save-desc');
  const original = btn.textContent;
  btn.textContent = '저장됨';
  setTimeout(() => (btn.textContent = original), 1000);
});

render();
