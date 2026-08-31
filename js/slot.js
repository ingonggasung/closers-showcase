const params = new URLSearchParams(location.search);
const slotId = params.get('id');
const characterId = params.get('cid');

if (!slotId) {
  location.href = 'index.html';
}

const imageRow = document.getElementById('image-row');
const imageInput = document.getElementById('image-input');
const titleArea = document.getElementById('slot-title-area');
const ownerLine = document.getElementById('slot-owner');
const detailPanel = document.getElementById('detail-panel');

const MAX_IMAGES = 10;
let currentSlot = null;

mountAuthBar(document.getElementById('auth-bar'));
enableDragScroll(imageRow);

document.getElementById('global-fab').addEventListener('click', () => {
  openPostModal(currentSlot ? currentSlot.characterId : characterId);
});

attachContextMenu(imageRow, () => currentSlot, async (slot) => {
  await DB.deleteSlot(slot.id);
  location.href = slot.characterId
    ? `character.html?id=${encodeURIComponent(slot.characterId)}`
    : 'index.html';
});

async function render() {
  currentSlot = await DB.getSlot(slotId);
  if (!currentSlot) {
    location.href = 'index.html';
    return;
  }
  const owner = isOwner(currentSlot);
  document.title = `${slotDisplayTitle(currentSlot)} - 클로저스 캐릭터 자랑`;
  ownerLine.textContent = `게시자: ${currentSlot.ownerName || '익명'}`;

  titleArea.innerHTML = '';
  if (owner) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'slot-title-input';
    input.maxLength = 60;
    input.placeholder = '제목 (예: 여름 이벤트 코스튬)';
    input.value = currentSlot.title || '';
    input.addEventListener('change', async () => {
      const title = input.value.trim();
      await DB.updateSlot(slotId, { title });
      currentSlot.title = title;
      document.title = `${slotDisplayTitle(currentSlot)} - 클로저스 캐릭터 자랑`;
    });
    titleArea.appendChild(input);
  } else {
    const h1 = document.createElement('h1');
    h1.className = 'slot-title-input';
    h1.style.borderBottom = 'none';
    h1.textContent = slotDisplayTitle(currentSlot);
    titleArea.appendChild(h1);
  }

  renderImages(owner);
  renderDetailPanel(owner);
}

function renderImages(owner) {
  imageRow.innerHTML = '';
  const images = currentSlot.images || [];

  images.forEach((src, i) => {
    const shot = document.createElement('div');
    shot.className = 'shot';
    shot.innerHTML = `<img src="${escapeHtml(src)}" alt="사진 ${i + 1}" draggable="false">`;
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
  const parts = currentSlot.parts || {};

  if (owner) {
    const costume = buildPartsFieldGrid(COSTUME_KEYS, parts);
    const accessory = buildPartsFieldGrid(ACCESSORY_KEYS, parts);
    const fieldInputs = { ...costume.inputs, ...accessory.inputs };

    const costumeLabel = document.createElement('label');
    costumeLabel.textContent = '코스튬';
    detailPanel.appendChild(costumeLabel);
    detailPanel.appendChild(costume.el);

    const accessoryLabel = document.createElement('label');
    accessoryLabel.textContent = '악세서리';
    detailPanel.appendChild(accessoryLabel);
    detailPanel.appendChild(accessory.el);

    const notesLabelRow = document.createElement('div');
    notesLabelRow.className = 'field-label-row';
    const notesLabel = document.createElement('label');
    notesLabel.textContent = '메모 (염색 코드 등)';
    const notesCount = document.createElement('span');
    notesCount.textContent = `${(currentSlot.notes || '').length}/200`;
    notesLabelRow.appendChild(notesLabel);
    notesLabelRow.appendChild(notesCount);
    detailPanel.appendChild(notesLabelRow);

    const notesArea = document.createElement('textarea');
    notesArea.maxLength = 200;
    notesArea.rows = 3;
    notesArea.value = currentSlot.notes || '';
    notesArea.addEventListener('input', () => {
      notesCount.textContent = `${notesArea.value.length}/200`;
    });
    detailPanel.appendChild(notesArea);

    const saveRow = document.createElement('div');
    saveRow.className = 'save-row';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'pill accent';
    saveBtn.textContent = '저장';
    saveBtn.addEventListener('click', async () => {
      const newParts = {};
      PART_KEYS.forEach((key) => (newParts[key] = fieldInputs[key].value.trim()));
      const notes = notesArea.value.trim().slice(0, 200);
      await DB.updateSlot(slotId, { parts: newParts, notes });
      currentSlot.parts = newParts;
      currentSlot.notes = notes;
      const original = saveBtn.textContent;
      saveBtn.textContent = '저장됨';
      setTimeout(() => (saveBtn.textContent = original), 1000);
    });
    saveRow.appendChild(saveBtn);
    detailPanel.appendChild(saveRow);
  } else {
    function buildPartsView(keys) {
      const grid = document.createElement('div');
      grid.className = 'parts-grid';
      keys.forEach((key) => {
        if (!parts[key]) return;
        const p = document.createElement('div');
        p.className = 'part';
        const k = document.createElement('span');
        k.className = 'k';
        k.textContent = `${PART_LABELS[key]}:`;
        const v = document.createElement('span');
        v.className = 'v';
        v.textContent = parts[key];
        p.appendChild(k);
        p.appendChild(v);
        grid.appendChild(p);
      });
      return grid;
    }

    const anyPart = PART_KEYS.some((k) => parts[k]);
    if (anyPart) {
      if (COSTUME_KEYS.some((k) => parts[k])) {
        const costumeLabel = document.createElement('label');
        costumeLabel.textContent = '코스튬';
        detailPanel.appendChild(costumeLabel);
        detailPanel.appendChild(buildPartsView(COSTUME_KEYS));
      }
      if (ACCESSORY_KEYS.some((k) => parts[k])) {
        const accessoryLabel = document.createElement('label');
        accessoryLabel.textContent = '악세서리';
        detailPanel.appendChild(accessoryLabel);
        detailPanel.appendChild(buildPartsView(ACCESSORY_KEYS));
      }
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-hint';
      empty.textContent = '등록된 코스튬 정보가 없어요.';
      detailPanel.appendChild(empty);
    }

    if (currentSlot.notes) {
      const notesView = document.createElement('div');
      notesView.className = 'notes-view';
      notesView.textContent = currentSlot.notes;
      detailPanel.appendChild(notesView);
    }
  }
}

function showLoadError() {
  detailPanel.innerHTML =
    '<div class="empty-hint">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

// Only onAuthChange, not also authReady.then(render): see auth.js -
// onAuthChange already fires once for the initial auth resolution, so
// adding authReady.then(render) here double-fired render() on load.
onAuthChange(() => render().catch((err) => {
  console.error(err);
  showLoadError();
}));
