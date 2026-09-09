/* ── post-modal.js ────────────────────────────────────────────────────────────
   코스튬 등록 창.

   흐름:
     사진 선택 → Cloudinary 업로드 → DB.addSlot() → 상세 페이지로 이동
     → 동시에 requestAutoReview() 로 서버 자동 검토를 걸어둠

   등록 창은 여러 페이지에서 열리므로, 열 때 캐릭터 목록을 매번 새로 채웁니다.
   ────────────────────────────────────────────────────────────────────────── */

// Shared "add costume post" modal + floating action button.
// Expects the modal/FAB markup (see index.html) to be present on the page.

const MAX_POST_IMAGES = 10;

const postModal = document.getElementById('post-modal');
const postTitleInput = document.getElementById('post-title');
const postCharacterSelect = document.getElementById('post-character');
const postCategorySelect = document.getElementById('post-category');
const postGameCapture = document.getElementById('post-game-capture');
const postImagesInput = document.getElementById('post-images');
const postImagePreview = document.getElementById('post-image-preview');
const postCostumeContainer = document.getElementById('post-costume-fields');
const postAccessoryContainer = document.getElementById('post-accessory-fields');
let postFields = {};
// Files picked so far, across possibly several separate file-picker opens -
// a plain <input type="file"> replaces its .files on every selection, so
// without accumulating them ourselves, picking more images after an
// initial batch would silently discard the first batch.
let pendingPostImages = [];

function rebuildPostFields() {
  const costume = buildPartsFieldGrid(COSTUME_KEYS);
  const accessory = buildPartsFieldGrid(ACCESSORY_KEYS);
  postCostumeContainer.innerHTML = '';
  postCostumeContainer.appendChild(costume.el);
  postAccessoryContainer.innerHTML = '';
  postAccessoryContainer.appendChild(accessory.el);
  postFields = { ...costume.inputs, ...accessory.inputs };
}

const postNotes = document.getElementById('post-notes');
const postNotesCount = document.getElementById('post-notes-count');
const postSubmitBtn = document.getElementById('post-submit');
const globalFab = document.getElementById('global-fab');

function renderPostImagePreview() {
  postImagePreview.innerHTML = '';
  pendingPostImages.forEach((file, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'post-image-thumb';

    const img = document.createElement('img');
    const reader = new FileReader();
    reader.onload = () => (img.src = reader.result);
    reader.readAsDataURL(file);
    thumb.appendChild(img);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-shot';
    removeBtn.title = '삭제';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      pendingPostImages.splice(i, 1);
      renderPostImagePreview();
    });
    thumb.appendChild(removeBtn);

    postImagePreview.appendChild(thumb);
  });
}

function resetPostForm() {
  postTitleInput.value = '';
  postImagesInput.value = '';
  pendingPostImages = [];
  postImagePreview.innerHTML = '';
  rebuildPostFields();
  postNotes.value = '';
  postNotesCount.textContent = '0/200';
  postCategorySelect.value = '일반';
  postGameCapture.checked = false;
}

async function openPostModal(prefillCharacterId) {
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    return;
  }
  if (currentUserProfile && currentUserProfile.blocked) {
    alert('차단된 계정은 게시글을 등록할 수 없습니다.');
    return;
  }
  resetPostForm();
  postCharacterSelect.innerHTML = '<option value="">불러오는 중...</option>';
  postModal.hidden = false;

  const characters = await DB.getCharacters();
  postCharacterSelect.innerHTML = '';
  if (characters.length === 0) {
    postCharacterSelect.innerHTML = '<option value="">등록된 캐릭터가 없습니다</option>';
    postCharacterSelect.disabled = true;
    return;
  }
  postCharacterSelect.disabled = false;
  characters.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    postCharacterSelect.appendChild(opt);
  });
  if (prefillCharacterId) {
    postCharacterSelect.value = prefillCharacterId;
  }
}

function closePostModal() {
  postModal.hidden = true;
}

postImagesInput.addEventListener('change', () => {
  const newFiles = Array.from(postImagesInput.files || []);
  const room = MAX_POST_IMAGES - pendingPostImages.length;
  pendingPostImages = pendingPostImages.concat(newFiles.slice(0, room));
  postImagesInput.value = ''; // so picking the same file(s) again later still fires 'change'
  renderPostImagePreview();
});

postNotes.addEventListener('input', () => {
  postNotesCount.textContent = `${postNotes.value.length}/200`;
});

document.getElementById('post-cancel').addEventListener('click', closePostModal);
postModal.addEventListener('click', (e) => {
  if (e.target === postModal) closePostModal();
});

postSubmitBtn.addEventListener('click', async () => {
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    return;
  }
  const characterId = postCharacterSelect.value;
  if (!characterId) {
    alert('캐릭터를 선택해주세요.');
    return;
  }
  postSubmitBtn.disabled = true;
  postSubmitBtn.textContent = '등록 중...';
  try {
    const images = [];
    for (const file of pendingPostImages) {
      images.push(await uploadImageToCloudinary(file));
    }
    const parts = {};
    PART_KEYS.forEach((k) => (parts[k] = postFields[k].value.trim()));
    const notes = postNotes.value.trim().slice(0, 200);

    const title = postTitleInput.value.trim();
    const newId = await DB.addSlot({
      characterId,
      title,
      images,
      parts,
      notes,
      category: postCategorySelect.value,
      claimedGameCapture: postGameCapture.checked,
    });
    // Fire and forget: the reviewer runs on the server, so leaving the page
    // (or closing the browser) does not stop it.
    requestAutoReview(newId);
    closePostModal();
    location.href = `slot.html?id=${encodeURIComponent(newId)}&cid=${encodeURIComponent(characterId)}`;
  } catch (err) {
    alert('등록에 실패했습니다: ' + err.message);
  } finally {
    postSubmitBtn.disabled = false;
    postSubmitBtn.textContent = '등록';
  }
});

function updateFabVisibility(user) {
  globalFab.hidden = !user || !!(currentUserProfile && currentUserProfile.blocked);
}
authReady.then(updateFabVisibility);
onAuthChange(updateFabVisibility);
onProfileChange(() => updateFabVisibility(currentUser));
