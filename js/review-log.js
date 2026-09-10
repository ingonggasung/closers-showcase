/* ── review-log.js ────────────────────────────────────────────────────────────
   관리자용 "AI 검토 내역" 창.

   - 확인 대기 : 자동 검토는 끝났지만 관리자가 아직 맞다/틀리다를 안 한 게시글
   - 확인 완료 : 판정을 마친 것 (접혀 있음)
   - 자동 삭제 보관함 : 자동 삭제가 지운 게시글. [복구]로 되살릴 수 있습니다.

   맞음/틀림을 누르면 두 가지가 동시에 일어납니다.
     1) 그 게시글에 관리자 판정을 기록
     2) 그 이미지를 정답 라벨과 함께 학습 예시로 추가
   즉 틀린 판정을 고칠수록 다음 판정이 좋아집니다.
   ────────────────────────────────────────────────────────────────────────── */

let reviewOverlay = null;

// 창의 HTML 뼈대.
function reviewLogMarkup() {
  return `
    <div class="modal-box modal-box-wide">
      <h3>AI 검토 내역</h3>

      <h4 class="train-list-head">확인 대기 <span id="rv-count"></span></h4>

      <div class="rv-bulk" id="rv-bulk">
        <label class="rv-all"><input type="checkbox" id="rv-all" /> 전체 선택</label>
        <span class="train-note" id="rv-selected">0건 선택</span>
        <span class="rv-bulk-group">
          인게임 여부
          <button class="pill rv-bulk-btn" data-capture="in">인게임</button>
          <button class="pill rv-bulk-btn" data-capture="out">외부</button>
        </span>
        <span class="rv-bulk-group">
          탭
          <button class="pill rv-bulk-btn" data-cat="일반">일반</button>
          <button class="pill rv-bulk-btn" data-cat="수영복">수영복</button>
          <button class="pill rv-bulk-btn" data-cat="성인">성인</button>
        </span>
      </div>

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

// 자동 검토가 뭐라고 했는지 표시하는 딱지.
function verdictTag(slot) {
  return slot.autoFlag
    ? '<span class="train-tag adult">외부로 판정</span>'
    : '<span class="train-tag">인게임으로 판정</span>';
}

// 관리자가 판정했는지, 뭐라고 했는지.
function rulingText(slot) {
  if (slot.verifiedCapture === true) return '관리자 확인: 인게임 맞음';
  if (slot.verifiedCapture === false) return '관리자 확인: 인게임 아님';
  return '관리자 미검토';
}

// Ruling on a verdict does two things: it records the admin's answer on the
// post, and it feeds that post's image back in as a labelled example. Every
// correction makes the next review better - that is the whole point.
async function judgeReview(slot, aiWasRight) {
  // 맞음/틀림은 AI 가 뭐라고 했는지에 대한 상대적인 답이라, 절대값으로 바꿔서
  // 일괄 처리와 같은 함수를 타게 합니다.
  return applyCaptureVerdict(slot, slot.autoFlag ? !aiWasRight : aiWasRight);
}

// 인게임 여부 확정. 게시글에 판정을 남기고, 그 이미지를 정답 라벨과 함께
// 학습 예시로 넣습니다.
async function applyCaptureVerdict(slot, reallyIngame, quiet) {
  await DB.setCaptureVerdict(slot.id, reallyIngame);
  slot.verifiedCapture = reallyIngame;
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
      if (/이미 등록된/.test(err.message)) {
        // 이미 예시로 있는 이미지면 라벨만 지금 답으로 맞춰줍니다.
        await DB.setTrainingCaptureByUrl(url, reallyIngame ? '인게임' : '외부');
      } else {
        console.warn(err);
        if (!quiet) alert('판정은 저장했지만 학습 데이터 추가에 실패했습니다: ' + err.message);
        else throw err;
      }
    }
  }
  if (typeof invalidateModels === 'function') invalidateModels();
}

// 목록의 한 줄.
function reviewRow(s) {
  return `
    <div class="train-item">
      <input type="checkbox" class="rv-pick" data-id="${s.id}" />
      ${(s.images || [])[0] ? `<img src="${escapeHtml(s.images[0])}" alt="" />` : ''}
      <div class="train-item-body">
        <div>${verdictTag(s)} <b>${escapeHtml(s.title || '(제목 없음)')}</b></div>
        <div class="rv-cat-row">
          <span class="train-note">탭</span>
          <select class="rv-cat" data-id="${s.id}">
            ${['일반', '수영복', '성인']
              .map(
                (v) =>
                  `<option value="${v}"${v === (s.category || '일반') ? ' selected' : ''}>${v}</option>`
              )
              .join('')}
          </select>
        </div>
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

// 맞음/틀림 버튼 연결.
// 지금 체크된 줄들의 게시글.
function selectedSlots(byId) {
  return [...document.querySelectorAll('.rv-pick:checked')]
    .map((el) => byId[el.dataset.id])
    .filter(Boolean);
}

function updateSelectedCount() {
  const n = document.querySelectorAll('.rv-pick:checked').length;
  document.getElementById('rv-selected').textContent = `${n}건 선택`;
  document
    .querySelectorAll('.rv-bulk-btn')
    .forEach((b) => (b.disabled = n === 0));
}

// 체크한 게시글들에 같은 답을 한 번에 적용합니다. 인게임 여부와 탭은 서로
// 독립이라, 한쪽만 고치고 다른 쪽은 건드리지 않을 수 있습니다.
function wireBulkActions(byId, rerender) {
  const bar = document.getElementById('rv-bulk');
  const all = document.getElementById('rv-all');

  all.onchange = () => {
    document.querySelectorAll('#rv-list .rv-pick').forEach((el) => (el.checked = all.checked));
    updateSelectedCount();
  };
  document
    .querySelectorAll('.rv-pick')
    .forEach((el) => el.addEventListener('change', updateSelectedCount));

  bar.querySelectorAll('.rv-bulk-btn').forEach((btn) => {
    btn.onclick = async () => {
      const slots = selectedSlots(byId);
      if (!slots.length) return;
      const capture = btn.dataset.capture;
      const cat = btn.dataset.cat;
      const what = capture ? (capture === 'in' ? '인게임' : '외부') : cat;
      if (!confirm(`선택한 ${slots.length}건을 "${what}" 으로 처리할까요?`)) return;

      bar.querySelectorAll('.rv-bulk-btn').forEach((b) => (b.disabled = true));
      const failed = [];
      for (const slot of slots) {
        try {
          if (capture) {
            await applyCaptureVerdict(slot, capture === 'in', true);
          } else {
            await DB.updateSlot(slot.id, { category: cat });
            slot.category = cat;
            const url = (slot.images || [])[0];
            if (url) await DB.setTrainingLabelByUrl(url, cat);
          }
        } catch (err) {
          console.warn(err);
          failed.push(slot.title || slot.id);
        }
      }
      if (typeof invalidateModels === 'function') invalidateModels();
      if (failed.length) alert('일부 처리에 실패했습니다:\n' + failed.join('\n'));
      await rerender();
    };
  });

  updateSelectedCount();
}

// 분류 선택칸 연결. 게시글의 탭과, 그 이미지로 만든 학습 예시를 함께 고칩니다.
function wireCategorySelects(container, byId) {
  container.querySelectorAll('.rv-cat').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const slot = byId[sel.dataset.id];
      const value = sel.value;
      sel.disabled = true;
      try {
        await DB.updateSlot(slot.id, { category: value });
        slot.category = value;
        const url = (slot.images || [])[0];
        if (url) await DB.setTrainingLabelByUrl(url, value);
        if (typeof invalidateModels === 'function') invalidateModels();
      } catch (err) {
        alert('분류 변경에 실패했습니다: ' + err.message);
      } finally {
        sel.disabled = false;
      }
    });
  });
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
    wireCategorySelects(list, byId);
    wireCategorySelects(doneList, byId);
    document.getElementById('rv-all').checked = false;
    wireBulkActions(byId, renderReviewLog);
  } catch (err) {
    list.textContent = '불러오지 못했습니다: ' + err.message;
  }
}

// 자동 삭제 보관함. 각 줄에 복구 버튼이 붙습니다.
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

// 창 열기.
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
