/* ── dnd.js ───────────────────────────────────────────────────────────────────
   두 가지 드래그 기능.

   - enableDragReorder() : 캐릭터 아이콘을 끌어 순서를 바꾸는 기능(관리자용).
                           놓는 순간 onReorderDone 으로 새 순서를 넘깁니다.
   - enableDragScroll()  : 게시글 카드의 이미지를 마우스로 끌어 넘기는 기능.
                           터치는 브라우저가 알아서 스크롤하므로 마우스만 처리합니다.
   ────────────────────────────────────────────────────────────────────────── */

// Simple drag-to-reorder for a flat list of sibling elements inside `container`.
// Items must have draggable="true" and match `itemSelector`.
function enableDragReorder(container, itemSelector, onReorderDone) {
  let draggedEl = null;

  container.addEventListener('dragstart', (e) => {
    const item = e.target.closest(itemSelector);
    if (!item) return;
    draggedEl = item;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.id || '');
    requestAnimationFrame(() => item.classList.add('dragging'));
  });

  container.addEventListener('dragover', (e) => {
    if (!draggedEl) return;
    e.preventDefault();
    const item = e.target.closest(itemSelector);
    if (!item || item === draggedEl) return;
    const rect = item.getBoundingClientRect();
    const after =
      e.clientX - rect.left > rect.width / 2 || e.clientY - rect.top > rect.height / 2;
    if (after) {
      item.after(draggedEl);
    } else {
      item.before(draggedEl);
    }
  });

  container.addEventListener('drop', (e) => e.preventDefault());

  container.addEventListener('dragend', () => {
    if (draggedEl) draggedEl.classList.remove('dragging');
    draggedEl = null;
    onReorderDone();
  });
}
