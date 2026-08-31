const reportList = document.getElementById('report-list');

mountAuthBar(document.getElementById('auth-bar'));

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleString('ko-KR');
}

async function render() {
  if (!currentUser) {
    reportList.innerHTML = '<div class="empty-hint">로그인이 필요합니다.</div>';
    return;
  }
  if (!isAdmin()) {
    reportList.innerHTML = '<div class="empty-hint">관리자만 볼 수 있는 페이지입니다.</div>';
    return;
  }

  const reports = await DB.getReports();
  if (reports.length === 0) {
    reportList.innerHTML = '<div class="empty-hint">접수된 신고가 없어요.</div>';
    return;
  }

  reportList.innerHTML = '';
  for (const report of reports) {
    const slot = await DB.getSlot(report.slotId).catch(() => null);
    const ownerProfile = slot ? await DB.getUserProfile(slot.ownerId).catch(() => null) : null;
    const warningCount = (ownerProfile && ownerProfile.warningCount) || 0;

    const item = document.createElement('div');
    item.className = 'report-item';

    const postBox = document.createElement('div');
    postBox.className = 'report-post';
    if (slot) {
      const thumb = document.createElement('img');
      thumb.className = 'report-thumb';
      thumb.src = (slot.images && slot.images[0]) || '';
      thumb.alt = slotDisplayTitle(slot);
      postBox.appendChild(thumb);

      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'report-post-title';
      title.textContent = `${slotDisplayTitle(slot)} (${slot.characterName || '캐릭터'})`;
      const link = document.createElement('a');
      link.href = `slot.html?id=${encodeURIComponent(slot.id)}&cid=${encodeURIComponent(slot.characterId)}`;
      link.textContent = '게시글 보기 →';
      link.className = 'report-link';
      info.appendChild(title);
      info.appendChild(link);
      postBox.appendChild(info);
    } else {
      const info = document.createElement('div');
      info.className = 'report-post-title';
      info.textContent = '삭제된 게시글입니다.';
      postBox.appendChild(info);
    }
    item.appendChild(postBox);

    const meta = document.createElement('div');
    meta.className = 'report-meta';
    meta.innerHTML = `
      <div><span class="k">신고자</span> ${escapeHtml(report.reporterName || '익명')}</div>
      <div><span class="k">사유</span> ${escapeHtml(report.reason || '(작성 안 함)')}</div>
      <div><span class="k">일시</span> ${escapeHtml(formatDate(report.createdAt))}</div>
      ${slot ? `<div><span class="k">누적 경고</span> ${warningCount}회</div>` : ''}
    `;
    item.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'report-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'pill';
    deleteBtn.textContent = '게시글 삭제';
    deleteBtn.disabled = !slot;
    deleteBtn.addEventListener('click', async () => {
      if (!slot || !confirm('이 게시글을 삭제할까요?')) return;
      await DB.deleteSlot(slot.id);
      await DB.deleteReport(report.id);
      render();
    });
    actions.appendChild(deleteBtn);

    const warnBtn = document.createElement('button');
    warnBtn.className = 'pill';
    warnBtn.textContent = '유저 경고';
    warnBtn.disabled = !slot;
    warnBtn.addEventListener('click', async () => {
      if (!slot) return;
      if (!confirm(`${slot.ownerName || '이 유저'}에게 경고를 주고 게시글을 삭제할까요? (경고 누적 3회 시 자동 차단됩니다.)`)) return;
      const count = await DB.warnUser(slot.ownerId);
      await DB.deleteSlot(slot.id);
      await DB.deleteReport(report.id);
      if (count >= 3) alert(`경고 누적 ${count}회로 자동 차단되었습니다.`);
      render();
    });
    actions.appendChild(warnBtn);

    const blockBtn = document.createElement('button');
    blockBtn.className = 'pill danger';
    blockBtn.textContent = '유저 차단';
    blockBtn.disabled = !slot;
    blockBtn.addEventListener('click', async () => {
      if (!slot) return;
      if (!confirm(`${slot.ownerName || '이 유저'}를 차단하고 이 유저의 게시글을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
      await DB.blockUser(slot.ownerId);
      await DB.deleteReport(report.id);
      render();
    });
    actions.appendChild(blockBtn);

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'pill';
    dismissBtn.textContent = '신고 삭제';
    dismissBtn.addEventListener('click', async () => {
      if (confirm('이 신고 내역을 삭제할까요?')) {
        await DB.deleteReport(report.id);
        render();
      }
    });
    actions.appendChild(dismissBtn);

    item.appendChild(actions);

    reportList.appendChild(item);
  }
}

function showLoadError() {
  reportList.innerHTML =
    '<div class="empty-hint">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

// Only onAuthChange, not also authReady.then(render): onAuthChange already
// fires once for the initial auth resolution (see auth.js), so adding
// authReady.then(render) here double-fired render() on every page load -
// two overlapping async renders that could both append the same document
// (this is what caused reports to show up twice).
onAuthChange(() => render().catch((err) => {
  console.error(err);
  showLoadError();
}));
