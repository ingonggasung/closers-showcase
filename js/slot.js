const params = new URLSearchParams(location.search);
const slotId = params.get('id');
const characterId = params.get('cid');

if (!slotId) {
  location.href = 'index.html';
}

document.getElementById('back-link').href = characterId
  ? `character.html?id=${encodeURIComponent(characterId)}`
  : 'index.html';

const imageRow = document.getElementById('image-row');
const imageInput = document.getElementById('image-input');
const titleArea = document.getElementById('slot-title-area');
const ownerLine = document.getElementById('slot-owner');
const detailPanel = document.getElementById('detail-panel');

const MAX_IMAGES = 10;
let currentSlot = null;

mountAuthBar(document.getElementById('auth-bar'));

async function render() {
  currentSlot = await DB.getSlot(slotId);
  if (!currentSlot) {
    location.href = 'index.html';
    return;
  }
  const owner = isOwner(currentSlot);
  document.title = `${currentSlot.title || '코스튬'} - 클로저스 캐릭터 자랑`;
  ownerLine.textContent = `게시자: ${currentSlot.ownerName || '익명'}`;

  renderTitle(owner);
  renderImages(owner);
  renderDetailPanel(owner);
}

function renderTitle(owner) {
  titleArea.innerHTML = '';
  if (owner) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'slot-title-input';
    input.placeholder = '세트 이름';
    input.value = currentSlot.title || '';
    input.addEventListener('change', async () => {
      const title = input.value.trim();
      await DB.updateSlot(slotId, { title });
      currentSlot.title = title;
    });
    titleArea.appendChild(input);
  } else {
    const h1 = document.createElement('h1');
    h1.className = 'slot-title-input';
    h1.style.borderBottom = 'none';
    h1.textContent = currentSlot.title || '(이름 없음)';
    titleArea.appendChild(h1);
  }
}

function renderImages(owner) {
  imageRow.innerHTML = '';
  const images = currentSlot.images || [];

  images.forEach((src, i) => {
    const shot = document.createElement('div');
    shot.className = 'shot';
    shot.innerHTML = `<img src="${escapeHtml(src)}" alt="사진 ${i + 1}">`;
    if (owner) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-shot';
      removeBtn.title = '삭제';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', async () => {
        const next = images.filter((_, idx) => idx !== i);
        await DB.updateSlot(slotId, { images: next });
        currentSlot.images = next;
        renderImages(owner);
      });
      shot.appendChild(removeBtn);
    }
    imageRow.appendChild(shot);
  });

  if (owner && images.length < MAX_IMAGES) {
    const addBtn = document.createElement('button');
    addBtn.className = 'add-shot';
    addBtn.textContent = '+';
    addBtn.title = `사진 추가 (${images.length}/${MAX_IMAGES})`;
    addBtn.addEventListener('click', () => imageInput.click());
    imageRow.appendChild(addBtn);
  }

  if (images.length === 0 && !owner) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = '등록된 사진이 없어요.';
    imageRow.appendChild(hint);
  }
}

imageInput.addEventListener('change', async () => {
  const files = Array.from(imageInput.files || []);
  if (files.length === 0) return;

  const images = currentSlot.images || [];
  const room = MAX_IMAGES - images.length;
  const toAdd = files.slice(0, room);

  const addBtn = imageRow.querySelector('.add-shot');
  if (addBtn) {
    addBtn.disabled = true;
    addBtn.textContent = '업로드 중...';
  }

  try {
    for (const file of toAdd) {
      const url = await uploadImageToCloudinary(file);
      images.push(url);
    }
    await DB.updateSlot(slotId, { images });
    currentSlot.images = images;
    renderImages(true);
  } catch (err) {
    alert('이미지 업로드에 실패했습니다: ' + err.message);
    renderImages(true);
  }
  imageInput.value = '';
});

function renderDetailPanel(owner) {
  detailPanel.innerHTML = '';
  const label = document.createElement('label');
  label.textContent = owner
    ? '어떤 코스튬을 착용했는지 자유롭게 적어주세요 (예: 상의, 하의, 헤어, 악세서리 등)'
    : '코스튬 상세 정보';
  detailPanel.appendChild(label);

  if (owner) {
    const textarea = document.createElement('textarea');
    textarea.id = 'description';
    textarea.placeholder =
      '예) 상의: 여름 이벤트 셔츠\n하의: 화이트 스커트\n헤어: 기본 헤어 + 리본 악세서리';
    textarea.value = currentSlot.description || '';
    detailPanel.appendChild(textarea);

    const saveRow = document.createElement('div');
    saveRow.className = 'save-row';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'pill accent';
    saveBtn.textContent = '저장';
    saveBtn.addEventListener('click', async () => {
      const description = textarea.value;
      await DB.updateSlot(slotId, { description });
      currentSlot.description = description;
      const original = saveBtn.textContent;
      saveBtn.textContent = '저장됨';
      setTimeout(() => (saveBtn.textContent = original), 1000);
    });
    saveRow.appendChild(saveBtn);
    detailPanel.appendChild(saveRow);
  } else {
    const view = document.createElement('div');
    view.className = 'description-view';
    view.textContent = currentSlot.description || '작성된 설명이 없습니다.';
    detailPanel.appendChild(view);
  }
}

function showLoadError() {
  detailPanel.innerHTML =
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
