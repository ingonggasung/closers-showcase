// Admin-only log of what the auto-review did: every post it looked at, its
// verdict, and the archive of anything auto-deletion removed (with a restore,
// because a classifier's mistake should be undoable).

let reviewOverlay = null;

function reviewLogMarkup() {
  return `
    <div class="modal-box modal-box-wide">
      <h3>AI 검토 내역</h3>

      <h4 class="train-list-head">확인 대기 <span id="rv-count"></span></h4>
      <div class="train-list" id="rv-list">불러오는 중...</div>

      <h4 class="train-list-head">
        확인 완료 <span id="rv-done-count"></span>
        <button class="pill" id="rv-toggle-done">펼치기</button>
      </h4>
      <div class="train-list" id="rv-done-list" hidden></div>

      <h4 class="train-list-head">자동 삭제 보관함 <span id="rv-del-count"></span></h4>
      <div class="train-list" id="rv-del-list">불러오는 중...</div>

      <div class="modal-actions">
        <button class="pill" id="rv-close">닫기</button>
      </div>
    </div>
  `;
}

function verdictTag(slot) {
  return slot.autoFlag
    ? '<span class="train-tag adult">외부로 판정</span>'
    : '<span class="train-tag">인게임으로 판정</span>';
}

function rulingText(slot) {
  if (slot.verifiedCapture === true) return '관리자 확인: 인게임 맞음';
  if (slot.verifiedCapture === false) return '관리자 확인: 인게임 아님';
  return '관리자 미검토';
}

// Ruling on a verdict does two things: it records the admin's answer on the
// post, and it feeds that post's image back in as a labelled example. Every
// correction makes the next review better - that is the whole point.
async function judgeReview(slot, aiWasRight) {
  const reallyIngame = slot.autoFlag ? !aiWasRight : aiWasRight;
  await DB.setCaptureVerdict(slot.id, reallyIngame);
  const url = (slot.images || [])[0];
  if (url) {
    try {
      await DB.addTrainingSample({
        url,
        kind: 'image',
        label: slot.category || '일반',
        capture: reallyIngame ? '인게임' : '외부',
        note: '검토 내역에서 확인',
      });
    } catch (err) {
      // Already registered is fine; anything else means the correction did
      // not become training data, which the admin needs to know.
      if (!/이미 등록된/.test(err.message)) {
        console.warn(err);
        alert('판정은 저장했지만 학습 데이터 추가에 실패했습니다: ' + err.message);
      }
    }
  }
  if (typeof invalidateModels === 'function') invalidateModels();
}

function reviewRow(s) {
  return `
    <div class="train-item">
      ${(s.images || [])[0] ? `<img src="${escapeHtml(s.images[0])}" alt="" />` : ''}
      <div class="train-item-body">
        <div>${verdictTag(s)} <b>${escapeHtml(s.title || '(제목 없음)')}</b></div>
        <p class="train-note">
          확신도 ${Math.round((s.autoConfidence || 0) * 100)}%${
            s.autoSimilarity != null ? ` (유사도 ${s.autoSimilarity.toFixed(2)})` : ''
          } ·
          ${escapeHtml(rulingText(s))} · ${escapeHtml(s.ownerName || '')}
        </p>
      </div>
      <div class="rv-actions">
        <a class="pill" href="slot.html?id=${encodeURIComponent(s.id)}">보기</a>
        <button class="pill rv-ok" data-id="${s.id}">맞음</button>
        <button class="pill rv-no" data-id="${s.id}">틀림</button>
      </div>
    </div>`;
}

function wireJudgeButtons(container, byId) {
  container.querySelectorAll('.rv-ok, .rv-no').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slot = byId[btn.dataset.id];
      const right = btn.classList.contains('rv-ok');
      btn.disabled = true;
      try {
        await judgeReview(slot, right);
        await renderReviewLog();
      } catch (err) {
        alert('처리에 실패했습니다: ' + err.message);
        btn.disabled = false;
      }
    });
  });
}

// Split by whether the admin has ruled: a post that has been judged leaves the
// queue, so working through the list actually looks like progress.
async function renderReviewLog() {
  const list = document.getElementById('rv-list');
  const doneList = document.getElementById('rv-done-list');
  try {
    const slots = await DB.getAutoReviewed();
    const pending = slots.filter((s) => s.verifiedCapture == null);
    const done = slots.filter((s) => s.verifiedCapture != null);
    const byId = Object.fromEntries(slots.map((s) => [s.id, s]));

    document.getElementById('rv-count').textContent = `${pending.length}건`;
    document.getElementById('rv-done-count').textContent = `${done.length}건`;

    list.innerHTML = pending.length
      ? pending.map(reviewRow).join('')
      : '<div class="empty-hint">확인할 게시글이 없어요.</div>';
    doneList.innerHTML = done.length
      ? done.map(reviewRow).join('')
      : '<div class="empty-hint">아직 확인한 게시글이 없어요.</div>';

    wireJudgeButtons(list, byId);
    wireJudgeButtons(doneList, byId);
  } catch (err) {
    list.textContent = '불러오지 못했습니다: ' + err.message;
  }
}

async function renderDeletedLog() {
  const list = document.getElementById('rv-del-list');
  const count = document.getElementById('rv-del-count');
  try {
    const rows = await DB.getAutoDeleted();
    count.textContent = `${rows.length}건`;
    list.innerHTML = rows.length
      ? rows
          .map(
            (r) => `
        <div class="train-item" data-id="${r.id}">
          ${(r.images || [])[0] ? `<img src="${escapeHtml(r.images[0])}" alt="" />` : ''}
          <div class="train-item-body">
            <div><b>${escapeHtml(r.title || '(제목 없음)')}</b></div>
            <p class="train-note">
              확신도 ${Math.round((r.confidence || 0) * 100)}% · ${escapeHtml(r.ownerName || '')}
            </p>
          </div>
          <button class="pill accent rv-restore">복구</button>
        </div>`
          )
          .join('')
      : '<div class="empty-hint">자동 삭제된 게시글이 없어요.</div>';

    list.querySelectorAll('.rv-restore').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.train-item').dataset.id;
        if (!confirm('이 게시글을 되살릴까요? 인게임 캡처로 확인 처리됩니다.')) return;
        btn.disabled = true;
        try {
          await DB.restoreAutoDeleted(id);
          await renderDeletedLog();
        } catch (err) {
          alert('복구에 실패했습니다: ' + err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    list.textContent = '불러오지 못했습니다: ' + err.message;
  }
}

function openReviewLog() {
  if (!reviewOverlay) {
    reviewOverlay = document.createElement('div');
    reviewOverlay.className = 'modal-overlay';
    reviewOverlay.hidden = true;
    reviewOverlay.innerHTML = reviewLogMarkup();
    document.body.appendChild(reviewOverlay);
    reviewOverlay.querySelector('#rv-close').addEventListener('click', () => {
      reviewOverlay.hidden = true;
    });
    reviewOverlay.addEventListener('click', (e) => {
      if (e.target === reviewOverlay) reviewOverlay.hidden = true;
    });
    const toggle = reviewOverlay.querySelector('#rv-toggle-done');
    toggle.addEventListener('click', () => {
      const box = reviewOverlay.querySelector('#rv-done-list');
      box.hidden = !box.hidden;
      toggle.textContent = box.hidden ? '펼치기' : '접기';
    });
  }
  reviewOverlay.hidden = false;
  renderReviewLog();
  renderDeletedLog();
}
