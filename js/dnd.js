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
