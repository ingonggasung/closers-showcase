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

function slotDisplayTitle(slot) {
  return slot.title || slotSummary(slot);
}

// Lets a horizontally-scrolling element (image carousel) be dragged with the
// mouse to scroll, like a touch swipe. Touch/pen input is left alone since
// it already scrolls natively via overflow-x. If the drag moved enough,
// suppresses the next card click so a swipe doesn't also trigger navigation.
function enableDragScroll(el) {
  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let moved = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('button')) return; // let nav/delete buttons handle their own clicks
    isDown = true;
    moved = false;
    startX = e.clientX;
    startScrollLeft = el.scrollLeft;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging-scroll');
  });

  el.addEventListener('pointermove', (e) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    el.scrollLeft = startScrollLeft - dx;
  });

  function endDrag() {
    if (!isDown) return;
    isDown = false;
    el.classList.remove('dragging-scroll');
    if (moved) {
      suppressSlotClick = true;
      setTimeout(() => (suppressSlotClick = false), 0);
    }
  }
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

// CSS `column-count` can silently collapse to fewer columns when there's
// little/uneven content (column-fill: balance). Building N real column
// elements and round-robin-appending into them guarantees the column count.
function renderMasonryGrid(container, count) {
  container.innerHTML = '';
  const cols = [];
  for (let i = 0; i < count; i++) {
    const col = document.createElement('div');
    col.className = 'masonry-col';
    container.appendChild(col);
    cols.push(col);
  }
  let i = 0;
  return {
    add(el) {
      cols[i % count].appendChild(el);
      i++;
    },
  };
}

// options:
//   draggable: true to mark the card for drag-reorder (only when it's the
//              viewer's own post within a single character's grid)
//   showCharacterTag: true to prefix the byline with the character's name
//              (used on the cross-character home feed)
//   onDelete: async (slot) => void, called after delete confirmation
function buildSlotCard(slot, { draggable = false, showCharacterTag = false, onDelete } = {}) {
  const displayTitle = slotDisplayTitle(slot);

  const card = document.createElement('div');
  card.className = 'slot-card';
  card.dataset.title = `${displayTitle} ${slot.characterName || ''}`.toLowerCase();
  card.dataset.characterId = slot.characterId;

  const mine = isOwner(slot);
  if (mine && draggable) {
    card.dataset.role = 'item';
    card.dataset.id = slot.id;
    card.draggable = true;
  }

  const carousel = document.createElement('div');
  carousel.className = 'slot-carousel';
  carousel.draggable = false; // don't let the card's own reorder-drag start over the image area

  // Height per frame, in px, filled in as each image loads (index -> height).
  // The carousel's own height is interpolated live between these as you
  // scroll/swipe, so it tracks whichever image is currently in view instead
  // of staying pinned to the tallest one.
  const frameHeights = [];
  function applyFrameHeight(i, img) {
    const width = carousel.clientWidth || card.clientWidth || 300;
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5;
    frameHeights[i] = width / ratio;
    if (i === 0) carousel.style.height = `${frameHeights[0]}px`;
  }
  function updateCarouselHeight() {
    if (frameHeights.length === 0) return;
    const width = carousel.clientWidth || 1;
    const raw = carousel.scrollLeft / width;
    const i0 = Math.max(0, Math.min(frameHeights.length - 1, Math.floor(raw)));
    const i1 = Math.min(i0 + 1, frameHeights.length - 1);
    const t = raw - i0;
    const h0 = frameHeights[i0];
    const h1 = frameHeights[i1];
    if (h0 == null) return;
    carousel.style.height = `${h0 + ((h1 ?? h0) - h0) * t}px`;
  }

  if (!slot.images || slot.images.length === 0) {
    const frame = document.createElement('div');
    frame.className = 'frame empty';
    frame.textContent = '이미지 없음';
    carousel.appendChild(frame);
  } else {
    slot.images.forEach((src, i) => {
      const frame = document.createElement('div');
      frame.className = 'frame';
      const img = document.createElement('img');
      img.src = src;
      img.alt = displayTitle;
      img.draggable = false;
      img.addEventListener('load', () => applyFrameHeight(i, img));
      frame.appendChild(img);
      carousel.appendChild(frame);
    });
  }
  card.appendChild(carousel);

  if (slot.images && slot.images.length > 1) {
    enableDragScroll(carousel);
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
    carousel.appendChild(prev);
    carousel.appendChild(next);

    const dots = document.createElement('div');
    dots.className = 'carousel-dots';
    const dotEls = slot.images.map((_, i) => {
      const d = document.createElement('span');
      d.className = 'dot' + (i === 0 ? ' active' : '');
      dots.appendChild(d);
      return d;
    });
    carousel.addEventListener('scroll', () => {
      const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
      dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
      updateCarouselHeight();
    });
    card.appendChild(dots);
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
    carousel.appendChild(del);
  }

  const label = document.createElement('div');
  label.className = 'slot-label';
  label.textContent = displayTitle;
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

  attachContextMenu(card, slot, onDelete);

  return card;
}
