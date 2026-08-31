const scrapGrid = document.getElementById('scrap-grid');

mountAuthBar(document.getElementById('auth-bar'));

async function render() {
  if (!currentUser) {
    scrapGrid.innerHTML = '<div class="empty-hint">로그인하면 스크랩한 게시글을 볼 수 있어요.</div>';
    return;
  }

  const slots = await DB.getScrappedSlots();
  if (slots.length === 0) {
    scrapGrid.innerHTML = '<div class="empty-hint">아직 스크랩한 게시글이 없어요.</div>';
    return;
  }

  const masonry = renderMasonryGrid(scrapGrid, 3);
  slots.forEach((slot) => {
    const card = buildSlotCard(slot, {
      showCharacterTag: true,
      onDelete: async (s) => {
        await DB.deleteSlot(s.id);
        render();
      },
    });
    masonry.add(card);
  });
}

function showLoadError() {
  scrapGrid.innerHTML =
    '<div class="empty-hint">데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.</div>';
}

// Only onAuthChange, not also authReady.then(render): see auth.js -
// onAuthChange already fires once for the initial auth resolution, so
// adding authReady.then(render) here double-fired render() on load.
onAuthChange(() => render().catch((err) => {
  console.error(err);
  showLoadError();
}));
