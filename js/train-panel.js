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
      <div class="drop-zone" id="train-drop">
        <input type="file" id="train-file" accept="image/*" multiple hidden />
        <label class="pill file-btn" for="train-file">사진 선택</label>
        <span class="drop-hint">여기로 끌어다 놓아도 됩니다 (여러 장 가능)</span>
        <span class="train-file-name" id="train-file-name"></span>
      </div>

      <label>또는 링크 (이미지 · 영상 · 게시글 주소)</label>
      <input type="text" id="train-url" placeholder="https://..." />

      <label>이 예시는 어느 분류인가</label>
      <select id="train-label">
        <option value="일반">일반</option>
        <option value="수영복">수영복</option>
        <option value="성인">성인</option>
      </select>

      <label>메모 (선택)</label>
      <input type="text" id="train-note" maxlength="100" placeholder="예: 상의만 수영복, 조합으로 속옷처럼 보임" />

      <div class="modal-actions">
        <button class="pill" id="train-close">닫기</button>
        <button class="pill accent" id="train-add">추가</button>
      </div>

      <h4 class="train-list-head">분류 테스트</h4>
      <p class="train-hint">
        모아둔 예시를 기준으로 이미지를 분류해봅니다. 결과는 저장되지 않습니다.
        이미지를 붙여넣기(Ctrl+V)해도 됩니다.
      </p>
      <div class="drop-zone" id="test-drop">
        <input type="file" id="test-file" accept="image/*" hidden />
        <label class="pill file-btn" for="test-file">이미지 선택</label>
        <span class="drop-hint">여기로 끌어다 놓거나 Ctrl+V</span>
      </div>
      <div class="train-test" id="test-result"></div>

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
          <span class="train-tag ${s.label === '성인' ? 'adult' : ''}">${escapeHtml(s.label)}</span>
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

// --- classification test ---------------------------------------------------
// MobileNet feature vectors + a k-nearest-neighbour vote over the labelled
// samples. Nothing is trained from scratch and nothing runs on a server: the
// model is a stock pretrained one loaded from a CDN, and the "learning" is
// just the example set sitting next to the query in feature space.

let mobilenetModel = null;
let knn = null;
let knnSampleCount = -1;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('스크립트를 불러오지 못했습니다: ' + src));
    document.head.appendChild(el);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다'));
    img.src = src;
  });
}

async function ensureModel(status) {
  if (mobilenetModel) return;
  status('라이브러리 불러오는 중...');
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js');
  await loadScript(
    'https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.4/dist/knn-classifier.min.js'
  );
  status('모델 불러오는 중... (처음 한 번만, 약 15MB)');
  mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 });
}

// Only uploaded images can be used: a pasted arca.live/외부 link is served
// without CORS headers, so the canvas cannot read its pixels.
async function ensureKnn(status) {
  const samples = (await DB.getTrainingSamples()).filter((s) => s.kind === 'image');
  if (knn && knnSampleCount === samples.length) return samples;

  knn = knnClassifier.create();
  knnSampleCount = samples.length;
  for (let i = 0; i < samples.length; i++) {
    status(`예시 학습 중... ${i + 1}/${samples.length}`);
    try {
      const img = await loadImage(samples[i].url);
      const feat = mobilenetModel.infer(img, true);
      knn.addExample(feat, samples[i].label);
      feat.dispose();
    } catch (err) {
      console.warn('건너뜀:', samples[i].url, err);
    }
  }
  return samples;
}

async function runTest(src) {
  const box = document.getElementById('test-result');
  const status = (msg) => {
    box.innerHTML = `<p class="train-hint">${escapeHtml(msg)}</p>`;
  };
  try {
    await ensureModel(status);
    const samples = await ensureKnn(status);
    const counts = knn.getClassExampleCount();
    const labels = Object.keys(counts);
    if (labels.length < 2) {
      const have = labels.length
        ? labels.map((l) => `${l} ${counts[l]}장`).join(', ')
        : '0장';
      status(
        `판정하려면 서로 다른 분류의 이미지 예시가 필요합니다. 현재 사용 가능: ${have}. ` +
          '링크로 등록한 예시는 외부 사이트의 보안정책(CORS) 때문에 읽을 수 없어 제외됩니다 - ' +
          '이미지 파일로 올려주세요.'
      );
      return;
    }
    status('분류 중...');
    const img = await loadImage(src);
    const feat = mobilenetModel.infer(img, true);
    const result = await knn.predictClass(feat, Math.min(5, samples.length));
    feat.dispose();

    const pct = Math.round((result.confidences[result.label] || 0) * 100);
    box.innerHTML = `
      <div class="train-test-out">
        <img src="${escapeHtml(src)}" alt="" />
        <div>
          <span class="train-tag ${result.label === '성인' ? 'adult' : ''}">${escapeHtml(result.label)}</span>
          <p class="train-note">확신도 ${pct}% · 예시 ${samples.length}장 기준</p>
        </div>
      </div>`;
  } catch (err) {
    status('테스트에 실패했습니다: ' + err.message);
  }
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

  // Dropping is the whole point of this panel being tedious otherwise: a drop
  // of files adds every one of them at the currently selected 분류.
  function onDrop(zone, handler) {
    ['dragenter', 'dragover'].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.add('over');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.remove('over');
      })
    );
    zone.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      handler(files, url.trim());
    });
  }

  async function addSamples(files, url) {
    if (!files.length && !url) return;
    addBtn.disabled = true;
    let done = 0;
    try {
      for (const file of files) {
        fileName.textContent = `업로드 중... ${++done}/${files.length}`;
        await DB.addTrainingSample({
          url: await uploadImageToCloudinary(file),
          kind: 'image',
          label: labelSelect.value,
          note: noteInput.value.trim(),
        });
      }
      if (!files.length && url) {
        await DB.addTrainingSample({
          url,
          kind: 'link',
          label: labelSelect.value,
          note: noteInput.value.trim(),
        });
      }
      fileName.textContent = `${files.length || 1}건 추가됨`;
      noteInput.value = '';
      await renderTrainList();
    } catch (err) {
      fileName.textContent = '';
      alert('추가에 실패했습니다: ' + err.message);
    } finally {
      addBtn.disabled = false;
    }
  }

  onDrop(overlay.querySelector('#train-drop'), addSamples);

  const testInput = overlay.querySelector('#test-file');
  testInput.addEventListener('change', () => {
    const file = testInput.files[0];
    testInput.value = '';
    if (file) runTest(URL.createObjectURL(file));
  });

  onDrop(overlay.querySelector('#test-drop'), (files, url) => {
    if (files.length) runTest(URL.createObjectURL(files[0]));
    else if (url) runTest(url); // remote images usually fail CORS; runTest reports it
  });

  // Screenshots usually arrive on the clipboard, not as a file.
  document.addEventListener('paste', (e) => {
    if (overlay.hidden) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    runTest(URL.createObjectURL(item.getAsFile()));
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
