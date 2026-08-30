// Shared costume-post card builder, used by both the character page's grid
// and the home page's all-posts feed.

let suppressSlotClick = false;

// Call once per page that enables drag-reordering, so a drag doesn't also
// trigger the card's click-to-navigate.
function setupDragSuppression(container) {
  container.addEventListener('dragstart', (e) => {
    if (e.target.closest('[data-role="item"]')) suppressSlotClick = true;
  });
  container.addEventListener('dragend', () => {
    setTimeout(() => (suppressSlotClick = false), 0);
  });
}

// options:
//   draggable: true to mark the card for drag-reorder (only when it's the
//              viewer's own post within a single character's grid)
//   showCharacterTag: true to prefix the byline with the character's name
//              (used on the cross-character home feed)
//   onDelete: async (slot) => void, called after delete confirmation
function buildSlotCard(slot, { draggable = false, showCharacterTag = false, onDelete } = {}) {
  const card = document.createElement('div');
  card.className = 'slot-card';
  card.dataset.title = `${slotSummary(slot)} ${slot.characterName || ''}`.toLowerCase();

  const mine = isOwner(slot);
  if (mine && draggable) {
    card.dataset.role = 'item';
    card.dataset.id = slot.id;
    card.draggable = true;
  }

  const carousel = document.createElement('div');
  carousel.className = 'slot-carousel';
  if (!slot.images || slot.images.length === 0) {
    const frame = document.createElement('div');
    frame.className = 'frame empty';
    frame.textContent = '이미지 없음';
    carousel.appendChild(frame);
  } else {
    slot.images.forEach((src) => {
      const frame = document.createElement('div');
      frame.className = 'frame';
      frame.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(slotSummary(slot))}">`;
      carousel.appendChild(frame);
    });
  }
  card.appendChild(carousel);

  if (slot.images && slot.images.length > 1) {
    const prev = document.createElement('button');
    prev.className = 'slot-nav prev';
    prev.textContent = '‹';
    prev.addEventListener('click', (e) => {
      e.stopPropagation();
      carousel.scrollBy({ left: -carousel.clientWidth, behavior: 'smooth' });
    });
    const next = document.createElement('button');
    next.className = 'slot-nav next';
    next.textContent = '›';
    next.addEventListener('click', (e) => {
      e.stopPropagation();
      carousel.scrollBy({ left: carousel.clientWidth, behavior: 'smooth' });
    });
    card.appendChild(prev);
    card.appendChild(next);

    const count = document.createElement('div');
    count.className = 'slot-count';
    count.textContent = `${slot.images.length}장`;
    card.appendChild(count);
  }

  if (mine && onDelete) {
    const del = document.createElement('button');
    del.className = 'slot-del';
    del.textContent = '×';
    del.title = '삭제';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('이 게시글을 삭제할까요?')) {
        await onDelete(slot);
      }
    });
    card.appendChild(del);
  }

  const label = document.createElement('div');
  label.className = 'slot-label';
  label.textContent = slotSummary(slot);
  card.appendChild(label);

  const tag = document.createElement('div');
  tag.className = 'slot-owner-tag';
  tag.textContent = showCharacterTag
    ? `${slot.characterName || '캐릭터'} · by ${slot.ownerName || '익명'}`
    : `by ${slot.ownerName || '익명'}`;
  card.appendChild(tag);

  card.addEventListener('click', () => {
    if (suppressSlotClick) return;
    location.href = `slot.html?id=${encodeURIComponent(slot.id)}&cid=${encodeURIComponent(slot.characterId)}`;
  });

  return card;
}
