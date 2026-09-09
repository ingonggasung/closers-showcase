// Admin-only panel for collecting labelled reference material: an image, a
// video or a page link, tagged with the category it should be sorted into.
// Nothing is trained in the browser - this builds the labelled set a
// classifier (or a moderation API's threshold) would later be calibrated on.

let trainOverlay = null;

function trainPanelMarkup() {
  return `
    <div class="modal-box modal-box-wide">
      <h3>AI 학습 데이터</h3>
      <p class="train-hint">
        예시를 분류와 함께 모아둡니다. 모아둔 예시는 이후 자동 분류의 기준으로 씁니다.
      </p>

      <label>이미지 파일</label>
      <input type="file" id="train-file" accept="image/*" hidden />
      <label class="pill file-btn" for="train-file">사진 선택</label>
      <span class="train-file-name" id="train-file-name"></span>

      <label>또는 링크 (이미지 · 영상 · 게시글 주소)</label>
      <input type="text" id="train-url" placeholder="https://..." />

      <label>이 예시는 어느 분류인가</label>
      <select id="train-label">
        <option value="일반">일반</option>
        <option value="수영복">성인</option>
      </select>

      <label>메모 (선택)</label>
      <input type="text" id="train-note" maxlength="100" placeholder="예: 상의만 수영복, 조합으로 속옷처럼 보임" />

      <div class="modal-actions">
        <button class="pill" id="train-close">닫기</button>
        <button class="pill accent" id="train-add">추가</button>
      </div>

      <h4 class="train-list-head">등록된 예시 <span id="train-count"></span></h4>
      <div class="train-list" id="train-list">불러오는 중...</div>
    </div>
  `;
}

async function renderTrainList() {
  const list = document.getElementById('train-list');
  const count = document.getElementById('train-count');
  let samples;
  try {
    samples = await DB.getTrainingSamples();
  } catch (err) {
    list.textContent = '불러오지 못했습니다: ' + err.message;
    return;
  }
  count.textContent = `${samples.length}건`;
  if (samples.length === 0) {
    list.innerHTML = '<div class="empty-hint">아직 등록된 예시가 없어요.</div>';
    return;
  }
  list.innerHTML = samples
    .map(
      (s) => `
      <div class="train-item" data-id="${s.id}">
        ${
          s.kind === 'image'
            ? `<img src="${escapeHtml(s.url)}" alt="" />`
            : '<span class="train-item-icon">🔗</span>'
        }
        <div class="train-item-body">
          <span class="train-tag ${s.label === '수영복' ? 'adult' : ''}">${
            s.label === '수영복' ? '성인' : '일반'
          }</span>
          <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.url)}</a>
          ${s.note ? `<p class="train-note">${escapeHtml(s.note)}</p>` : ''}
        </div>
        <button class="train-del" title="삭제">×</button>
      </div>`
    )
    .join('');

  list.querySelectorAll('.train-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.train-item').dataset.id;
      if (!confirm('이 예시를 삭제할까요?')) return;
      await DB.deleteTrainingSample(id);
      renderTrainList();
    });
  });
}

function buildTrainPanel() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'train-modal';
  overlay.hidden = true;
  overlay.innerHTML = trainPanelMarkup();
  document.body.appendChild(overlay);

  const fileInput = overlay.querySelector('#train-file');
  const fileName = overlay.querySelector('#train-file-name');
  const urlInput = overlay.querySelector('#train-url');
  const labelSelect = overlay.querySelector('#train-label');
  const noteInput = overlay.querySelector('#train-note');
  const addBtn = overlay.querySelector('#train-add');

  fileInput.addEventListener('change', () => {
    fileName.textContent = fileInput.files[0] ? fileInput.files[0].name : '';
  });

  overlay.querySelector('#train-close').addEventListener('click', () => {
    overlay.hidden = true;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });

  addBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const url = urlInput.value.trim();
    if (!file && !url) {
      alert('이미지 파일이나 링크 중 하나는 넣어주세요.');
      return;
    }
    addBtn.disabled = true;
    addBtn.textContent = '추가 중...';
    try {
      await DB.addTrainingSample({
        url: file ? await uploadImageToCloudinary(file) : url,
        kind: file ? 'image' : 'link',
        label: labelSelect.value,
        note: noteInput.value.trim(),
      });
      fileInput.value = '';
      fileName.textContent = '';
      urlInput.value = '';
      noteInput.value = '';
      await renderTrainList();
    } catch (err) {
      alert('추가에 실패했습니다: ' + err.message);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = '추가';
    }
  });

  return overlay;
}

function openTrainPanel() {
  if (!trainOverlay) trainOverlay = buildTrainPanel();
  trainOverlay.hidden = false;
  renderTrainList();
}
