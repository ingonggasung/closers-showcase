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

      <label>탭 분류</label>
      <select id="train-label">
        <option value="일반">일반</option>
        <option value="수영복">수영복</option>
        <option value="성인">성인</option>
      </select>

      <label>인게임 캡처 여부</label>
      <select id="train-capture">
        <option value="인게임">인게임 캡처</option>
        <option value="외부">외부 이미지 (팬아트·합성 등)</option>
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
      <div class="train-verdict" id="test-verdict"></div>

      <h4 class="train-list-head">
        등록된 예시 <span id="train-count"></span>
        <button class="pill" id="train-migrate">예전 데이터 정리</button>
      </h4>
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
          <div class="train-item-controls">
            <select class="row-label" data-id="${s.id}">
              ${['미지정', '일반', '수영복', '성인']
                .map(
                  (v) =>
                    `<option value="${v}"${v === (s.label || '미지정') ? ' selected' : ''}>${v}</option>`
                )
                .join('')}
            </select>
            <select class="row-capture" data-id="${s.id}">
              ${['인게임', '외부']
                .map(
                  (v) =>
                    `<option value="${v}"${v === (s.capture || '인게임') ? ' selected' : ''}>${v}</option>`
                )
                .join('')}
            </select>
          </div>
          <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.url)}</a>
          ${s.note ? `<p class="train-note">${escapeHtml(s.note)}</p>` : ''}
        </div>
        <button class="train-del" title="삭제">×</button>
      </div>`
    )
    .join('');

  list.querySelectorAll('.row-label, .row-capture').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const field = sel.classList.contains('row-label') ? 'label' : 'capture';
      try {
        await DB.updateTrainingSample(sel.dataset.id, { [field]: sel.value });
        invalidateModels();
      } catch (err) {
        alert('수정에 실패했습니다: ' + err.message);
      }
    });
  });

  list.querySelectorAll('.train-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.train-item').dataset.id;
      if (!confirm('이 예시를 삭제할까요?')) return;
      await DB.deleteTrainingSample(id);
      invalidateModels();
      renderTrainList();
    });
  });
}

// --- classification test ---------------------------------------------------
// MobileNet feature vectors + a k-nearest-neighbour vote over the labelled
// samples. Nothing is trained from scratch and nothing runs on a server: the
// model is a stock pretrained one loaded from a CDN, and the "learning" is
// just the example set sitting next to the query in feature space.

const CATEGORY_LABELS = ['일반', '수영복', '성인']; // '미지정' is deliberately out
const CAPTURE_LABELS = ['인게임', '외부'];

let mobilenetModel = null;
// One index for both questions: every image sample embedded once, with its
// labels attached. Comparison is plain cosine similarity - a registered
// example matches itself at 1.0, so a training image is never misjudged.
let sampleIndex = null;

// Editing a sample does not change how many there are, so a count check
// cannot see it. Anything that mutates the set calls this.
function invalidateModels() {
  sampleIndex = null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('스크립트를 불러오지 못했습니다: ' + src));
    document.head.appendChild(el);
  });
}

// Content hash, so re-uploading the same file is caught even though
// Cloudinary would hand it a brand new URL.
async function fileHash(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  status('모델 불러오는 중... (처음 한 번만, 약 15MB)');
  mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 });
}

// --- in-game capture detection ---------------------------------------------
// Every registered example is an in-game screenshot unless it was explicitly
// labelled 외부, so this is a one-class problem: something is "외부" when it
// does not look like anything in the reference set. No counter-examples are
// needed - a picture far enough from every screenshot we know is the answer.

function unit(arr) {
  let n = 0;
  for (const v of arr) n += v * v;
  n = Math.sqrt(n) || 1;
  return arr.map((v) => v / n);
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function embed(url) {
  const img = await loadImage(url);
  const feat = mobilenetModel.infer(img, true);
  const arr = unit(Array.from(await feat.data()));
  feat.dispose();
  return arr;
}

// The cut-off is read off the reference set itself: how similar is each
// screenshot to its nearest neighbour among the others? Anything less typical
// than the bottom 5% of those is treated as not belonging.
function calibrate(refs) {
  if (refs.length < 4) return 0.55; // too few to measure; a deliberately loose default
  const sims = refs.map((r, i) => {
    let best = -1;
    refs.forEach((o, j) => {
      if (i !== j) best = Math.max(best, cosine(r.vec, o.vec));
    });
    return best;
  });
  sims.sort((a, b) => a - b);
  return sims[Math.max(0, Math.floor(sims.length * 0.05))];
}

// Only uploaded images can be indexed: an external link is served without
// CORS headers, so the canvas cannot read its pixels.
async function ensureIndex(status = () => {}) {
  const samples = (await DB.getTrainingSamples()).filter((s) => s.kind === 'image');
  if (sampleIndex && sampleIndex.count === samples.length) return sampleIndex;

  const items = [];
  for (let i = 0; i < samples.length; i++) {
    status(`예시 분석 중... ${i + 1}/${samples.length}`);
    try {
      items.push({
        id: samples[i].id,
        url: samples[i].url,
        label: samples[i].label,
        capture: samples[i].capture === '외부' ? '외부' : '인게임',
        vec: await embed(samples[i].url),
      });
    } catch (err) {
      console.warn('건너뜀:', samples[i].url, err);
    }
  }
  const refs = items.filter((it) => it.capture === '인게임');
  sampleIndex = { items, refs, threshold: calibrate(refs), count: samples.length };
  return sampleIndex;
}

// Nearest neighbour, not a k-vote: with an unbalanced set a vote lets the
// biggest class outnumber the actually-closest example, which is how a
// registered image ended up classified as something else.
function nearest(vec, items) {
  let best = null;
  for (const it of items) {
    const sim = cosine(vec, it.vec);
    if (!best || sim > best.sim) best = { item: it, sim };
  }
  return best;
}

// Returns null when there is nothing to compare against yet.
async function classifyCapture(imageUrl) {
  await ensureModel(() => {});
  const idx = await ensureIndex();
  if (idx.refs.length < 3) return null;
  return captureVerdict(await embed(imageUrl), idx);
}

function captureVerdict(vec, idx) {
  const best = nearest(vec, idx.items);
  const inGame = nearest(vec, idx.refs);
  const simIn = inGame ? inGame.sim : -1;

  // The single closest example decides when it is an explicit 외부 one;
  // otherwise distance to the screenshot set does.
  const isOutside = best.item.capture === '외부' || simIn < idx.threshold;
  const margin = Math.abs(simIn - idx.threshold) / Math.max(0.2, 1 - idx.threshold);
  return {
    label: isOutside ? '외부' : '인게임',
    confidence: Math.min(1, Math.max(0, margin)),
    similarity: simIn,
    threshold: idx.threshold,
    nearest: best,
  };
}

function categoryVerdict(vec, idx) {
  const pool = idx.items.filter((it) => CATEGORY_LABELS.includes(it.label));
  if (!pool.length) return null;
  const best = nearest(vec, pool);
  return { label: best.item.label, similarity: best.sim, nearest: best };
}

// The feed uses this to decide whether the reference set is big enough to
// propose the trial.
async function captureSampleCounts() {
  const samples = (await DB.getTrainingSamples()).filter((s) => s.kind === 'image');
  return {
    인게임: samples.filter((s) => s.capture !== '외부').length,
    외부: samples.filter((s) => s.capture === '외부').length,
  };
}

// The file behind the current test result, so a correction can register it.
let lastTest = null;

// Correcting a wrong call is the only way the set gets better, so the answer
// goes straight back in as a labelled example.
function renderVerdictBox(predCategory, predCapture) {
  const box = document.getElementById('test-verdict');
  if (!box) return;
  if (!lastTest || !lastTest.file) {
    box.innerHTML =
      '<p class="train-hint">링크로 테스트한 이미지는 정답을 등록할 수 없습니다. 파일이나 붙여넣기로 테스트해주세요.</p>';
    return;
  }
  box.innerHTML = `
    <div class="verdict-row">
      <span>이 판정이 맞나요?</span>
      <button class="pill" id="verdict-ok">맞음</button>
      <button class="pill" id="verdict-no">틀림 · 정답 알려주기</button>
    </div>
    <div class="verdict-fix" id="verdict-fix" hidden>
      <select id="verdict-label">
        <option value="일반">일반</option>
        <option value="수영복">수영복</option>
        <option value="성인">성인</option>
      </select>
      <select id="verdict-capture">
        <option value="인게임">인게임 캡처</option>
        <option value="외부">외부 이미지</option>
      </select>
      <button class="pill accent" id="verdict-save">정답으로 등록</button>
    </div>`;

  const fix = box.querySelector('#verdict-fix');
  const labelSel = box.querySelector('#verdict-label');
  const capSel = box.querySelector('#verdict-capture');
  if (predCategory) labelSel.value = predCategory;
  if (predCapture) capSel.value = predCapture;

  async function save(label, capture) {
    box.innerHTML = '<p class="train-hint">등록 중...</p>';
    try {
      const hash = await fileHash(lastTest.file);
      if (await DB.isDuplicateTrainingSample({ hash })) {
        box.innerHTML = '<p class="train-hint">이미 등록된 이미지입니다.</p>';
        return;
      }
      await DB.addTrainingSample({
        url: await uploadImageToCloudinary(lastTest.file),
        kind: 'image',
        label,
        capture,
        note: '테스트 정답 등록',
        hash,
      });
      box.innerHTML = `<p class="train-hint">등록했습니다 — ${escapeHtml(label)} · ${escapeHtml(
        capture
      )}. 다음 테스트부터 반영됩니다.</p>`;
      await renderTrainList();
    } catch (err) {
      box.innerHTML = `<p class="train-hint">등록에 실패했습니다: ${escapeHtml(err.message)}</p>`;
    }
  }

  box.querySelector('#verdict-ok').addEventListener('click', () => {
    if (!predCategory || !predCapture) {
      fix.hidden = false;
      return;
    }
    save(predCategory, predCapture);
  });
  box.querySelector('#verdict-no').addEventListener('click', () => {
    fix.hidden = false;
  });
  box.querySelector('#verdict-save').addEventListener('click', () =>
    save(labelSel.value, capSel.value)
  );
}

async function runTest(src, file) {
  lastTest = { src, file: file || null };
  const box = document.getElementById('test-result');
  const status = (msg) => {
    box.innerHTML = `<p class="train-hint">${escapeHtml(msg)}</p>`;
  };
  try {
    await ensureModel(status);
    const idx = await ensureIndex(status);
    status('분류 중...');
    const vec = await embed(src);

    const lines = [];
    let predCategory = null;
    let predCapture = null;
    let shown = null;

    const cat = categoryVerdict(vec, idx);
    if (!cat) {
      lines.push('<p class="train-note">탭 분류: 예시 부족</p>');
    } else {
      predCategory = cat.label;
      shown = cat.nearest;
      lines.push(
        `<p class="train-note"><span class="train-tag ${
          cat.label === '성인' ? 'adult' : ''
        }">${escapeHtml(cat.label)}</span> 탭 분류 · 유사도 ${cat.similarity.toFixed(2)}</p>`
      );
    }

    if (idx.refs.length < 3) {
      lines.push('<p class="train-note">인게임 여부: 예시 부족 (이미지 3장 이상 필요)</p>');
    } else {
      const cap = captureVerdict(vec, idx);
      predCapture = cap.label;
      shown = shown || cap.nearest;
      lines.push(
        `<p class="train-note"><span class="train-tag ${
          cap.label === '외부' ? 'adult' : ''
        }">${cap.label}</span> 인게임 여부 · 유사도 ${cap.similarity.toFixed(
          2
        )} (기준 ${cap.threshold.toFixed(2)})</p>`
      );
    }

    // Showing what it matched against makes a wrong call diagnosable rather
    // than mysterious.
    const matched = shown
      ? `<p class="train-note">가장 비슷한 예시 (${shown.sim.toFixed(2)}):
         <img class="match-thumb" src="${escapeHtml(shown.item.url)}" alt="" /></p>`
      : '';

    box.innerHTML = `
      <div class="train-test-out">
        <img src="${escapeHtml(src)}" alt="" />
        <div>${lines.join('')}${matched}</div>
      </div>`;
    renderVerdictBox(predCategory, predCapture);
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
  const captureSelect = overlay.querySelector('#train-capture');
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
    let added = 0;
    const skipped = [];
    try {
      for (const file of files) {
        fileName.textContent = `확인 중... ${++done}/${files.length}`;
        // Checked before the upload, so a duplicate never reaches Cloudinary.
        const hash = await fileHash(file);
        if (await DB.isDuplicateTrainingSample({ hash })) {
          skipped.push(file.name);
          continue;
        }
        fileName.textContent = `업로드 중... ${done}/${files.length}`;
        await DB.addTrainingSample({
          url: await uploadImageToCloudinary(file),
          kind: 'image',
          label: labelSelect.value,
          capture: captureSelect.value,
          note: noteInput.value.trim(),
          hash,
        });
        added++;
      }
      if (!files.length && url) {
        await DB.addTrainingSample({
          url,
          kind: 'link',
          label: labelSelect.value,
          capture: captureSelect.value,
          note: noteInput.value.trim(),
        });
        added++;
      }
      fileName.textContent = `${added}건 추가됨` + (skipped.length ? ` · 중복 ${skipped.length}건 제외` : '');
      if (skipped.length) {
        alert('이미 등록된 이미지라 건너뛰었습니다:\n' + skipped.join('\n'));
      }
      noteInput.value = '';
      invalidateModels();
      await renderTrainList();
    } catch (err) {
      fileName.textContent = '';
      alert('추가에 실패했습니다: ' + err.message);
    } finally {
      addBtn.disabled = false;
    }
  }

  onDrop(overlay.querySelector('#train-drop'), addSamples);

  overlay.querySelector('#train-migrate').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const fixed = await DB.migrateTrainingSamples();
      invalidateModels();
      await renderTrainList();
      alert(
        fixed
          ? `${fixed}건을 정리했습니다. 탭이 '미지정'인 항목은 목록에서 직접 지정해주세요.`
          : '정리할 항목이 없습니다.'
      );
    } catch (err) {
      alert('정리에 실패했습니다: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  const testInput = overlay.querySelector('#test-file');
  testInput.addEventListener('change', () => {
    const file = testInput.files[0];
    testInput.value = '';
    if (file) runTest(URL.createObjectURL(file), file);
  });

  onDrop(overlay.querySelector('#test-drop'), (files, url) => {
    if (files.length) runTest(URL.createObjectURL(files[0]), files[0]);
    else if (url) runTest(url); // remote images usually fail CORS; runTest reports it
  });

  // Screenshots usually arrive on the clipboard, not as a file.
  document.addEventListener('paste', (e) => {
    if (overlay.hidden) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    const pasted = item.getAsFile();
    runTest(URL.createObjectURL(pasted), pasted);
  });

  overlay.querySelector('#train-close').addEventListener('click', () => {
    overlay.hidden = true;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });

  addBtn.addEventListener('click', async () => {
    const files = [...fileInput.files];
    const url = urlInput.value.trim();
    if (!files.length && !url) {
      alert('이미지 파일이나 링크 중 하나는 넣어주세요.');
      return;
    }
    addBtn.textContent = '추가 중...';
    // Same path as a drop, so the duplicate check cannot be bypassed here.
    await addSamples(files, url);
    fileInput.value = '';
    urlInput.value = '';
    addBtn.textContent = '추가';
  });

  return overlay;
}

function openTrainPanel() {
  if (!trainOverlay) trainOverlay = buildTrainPanel();
  trainOverlay.hidden = false;
  renderTrainList();
}
