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

// Feed/slot-grid search, by field: 'title' (default), 'author' (owner
// nickname), or 'costume' (matches if ANY costume/accessory part value
// contains the query - so searching a part name finds every post that has
// it, however many parts get filled in later).
function slotMatchesQuery(slot, query, field) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (field === 'author') {
    return (slot.ownerName || '').toLowerCase().includes(q);
  }
  if (field === 'costume') {
    return Object.values(slot.parts || {}).some(
      (v) => typeof v === 'string' && v.toLowerCase().includes(q)
    );
  }
  return slotDisplayTitle(slot).toLowerCase().includes(q);
}

// Scrolls `el` to `targetLeft` by directly driving scrollLeft every frame,
// instead of the browser's native scrollBy({behavior:'smooth'}).
//
// Tracks one "current animation" token per element so a new call always
// supersedes an in-flight one instead of both fighting over scrollLeft -
// without this, clicking the arrow again before the first animation
// finished could leave the carousel stuck mid-transition between images.
const scrollAnimationTokens = new WeakMap();

function animateScrollTo(el, targetLeft, duration = 260) {
  const startLeft = el.scrollLeft;
  const delta = targetLeft - startLeft;
  const token = {};
  scrollAnimationTokens.set(el, token);

  if (delta === 0) {
    el.classList.remove('dragging-scroll');
    return;
  }

  const startTime = performance.now();
  el.classList.add('dragging-scroll'); // reuse to suspend scroll-snap during the animation

  function step(now) {
    if (scrollAnimationTokens.get(el) !== token) return; // superseded by a newer call
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.scrollLeft = startLeft + delta * eased;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      el.classList.remove('dragging-scroll');
    }
  }
  requestAnimationFrame(step);
}

// Lets a horizontally-scrolling element (image carousel) be dragged with the
// mouse to scroll, like a touch swipe. If the drag moved enough, suppresses
// the next card click so a swipe doesn't also trigger navigation.
// `snapToFrames`: true for the grid card carousel, whose slides are each
// exactly one clientWidth wide - lets drag-release snap to the nearest one
// ourselves. Left false for the slot detail page's image row, where shots
// are a fixed CSS width rather than one-per-clientWidth, so that math
// wouldn't apply.
// Touch input is only handled here (instead of the native overflow-x
// scroll) when snapToFrames is true: native touch-scroll momentum could
// otherwise fling past more than one frame on a fast swipe, whereas
// tracking the pointer ourselves and snapping to the nearest frame on
// release caps movement to what the finger actually dragged. The
// free-width image row is left to scroll natively on touch as before.
function enableDragScroll(el, { snapToFrames = false } = {}) {
  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let moved = false;

  el.addEventListener('pointerdown', (e) => {
    const isTouchHandled = snapToFrames && e.pointerType === 'touch';
    if (!(e.pointerType === 'mouse' || isTouchHandled)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
    if (moved) {
      suppressSlotClick = true;
      setTimeout(() => (suppressSlotClick = false), 0);
    }
    if (moved && snapToFrames) {
      // Snap to the nearest frame ourselves instead of leaning on CSS
      // scroll-snap: re-enabling it here would let the browser's own
      // snap-correction animation run, and that's a native scroll
      // animation just like scrollBy(smooth) - it gets interrupted by
      // the height-update logic the same way, which could leave a nav
      // arrow's hidden state stuck from mid-drag instead of the
      // settled page.
      const width = el.clientWidth || 1;
      const targetIndex = Math.round(el.scrollLeft / width);
      const max = el.scrollWidth - el.clientWidth;
      animateScrollTo(el, Math.max(0, Math.min(max, targetIndex * width)));
    } else {
      el.classList.remove('dragging-scroll');
    }
  }
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

// Column count for the post-card masonry grids, based on viewport width so
// cards aren't squeezed together on narrow/mobile screens.
function getMasonryColumns() {
  const w = window.innerWidth;
  return w < 900 ? 3 : 5;
}

// CSS `column-count` can silently collapse to fewer columns when there's
// little/uneven content (column-fill: balance). Building N real column
// elements and appending into them guarantees the column count.
//
// Cards fill the columns round-robin, which keeps reading order intact:
// slots arrive newest-first, so the newest sits leftmost and each older
// one goes to its right, wrapping down to the next row.
function renderSlotMasonry(container, slots, columns, cardOptions) {
  container.innerHTML = '';
  const cols = [];
  for (let i = 0; i < columns; i++) {
    const col = document.createElement('div');
    col.className = 'masonry-col';
    container.appendChild(col);
    cols.push(col);
  }

  slots.forEach((slot, i) => {
    cols[i % columns].appendChild(buildSlotCard(slot, cardOptions));
  });

  let nextIndex = slots.length;
  return {
    // For an extra tile that isn't one of `slots` (character.html's "add
    // new post" card) - just continues the same round-robin.
    addExtra(el) {
      cols[nextIndex % columns].appendChild(el);
      nextIndex++;
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
  card.dataset.title = displayTitle.toLowerCase();
  card.dataset.characterId = slot.characterId;

  const mine = isOwner(slot);
  if (mine && draggable) {
    card.dataset.role = 'item';
    card.dataset.id = slot.id;
    card.draggable = true;
  }

  // Outer wrapper stays put (position:relative, doesn't scroll) so the nav
  // arrows and delete button - absolutely positioned inside it - stay
  // pinned to the visible edges. They used to live directly inside the
  // scrolling track itself, which meant they scrolled off-screen along
  // with the images (confirmed: the "prev" button measured at x:-98 once
  // scrolled to frame 2, positioned relative to the pre-scroll layout).
  const carouselWrap = document.createElement('div');
  carouselWrap.className = 'slot-carousel';

  const carousel = document.createElement('div');
  carousel.className = 'slot-carousel-track';
  carousel.draggable = false; // don't let the card's own reorder-drag start over the image area

  // Each frame's img is width:100%/height:auto (its own true ratio, EXIF
  // orientation and all - the browser handles that correctly on its own).
  // But the track is a flex row holding every frame at once, so its height
  // defaults to the TALLEST frame, and every shorter frame gets stretched
  // to match with the image just centered inside it - visible as dead
  // space above/below any image that isn't the tallest one in a
  // multi-image post. Measuring the currently-visible frame's *rendered*
  // img height (not recomputing it from naturalWidth/naturalHeight - that
  // math is what caused the previous version of this to size things wrong)
  // and pinning the wrapper to exactly that closes the gap.
  function frameHeight(i) {
    const frame = carousel.children[i];
    const img = frame && frame.querySelector('img');
    if (!img || !img.complete || !img.naturalHeight) return null;
    return img.getBoundingClientRect().height;
  }

  // Interpolated between the two frames either side of the scroll position,
  // so the card grows and shrinks continuously as you drag rather than
  // snapping once a frame passes the halfway mark.
  function syncCarouselHeight() {
    const width = carousel.clientWidth || 1;
    const pos = carousel.scrollLeft / width;
    const i = Math.floor(pos);
    const t = pos - i;
    const a = frameHeight(i);
    if (a == null) return;
    const b = t > 0 ? frameHeight(i + 1) : null;
    carouselWrap.style.height = `${b == null ? a : a + (b - a) * t}px`;
  }

  if (!slot.images || slot.images.length === 0) {
    const frame = document.createElement('div');
    frame.className = 'frame empty';
    frame.textContent = '이미지 없음';
    carousel.appendChild(frame);
  } else {
    slot.images.forEach((src) => {
      const frame = document.createElement('div');
      frame.className = 'frame';
      const img = document.createElement('img');
      // Listener attached before src is set: for an already-cached image,
      // setting src can fire 'load' almost immediately, and attaching the
      // listener a line later would miss it - especially likely here since
      // repeat visits to the same feed hit the same cached image URLs.
      img.addEventListener('load', syncCarouselHeight);
      img.src = src;
      img.alt = displayTitle;
      img.draggable = false;
      frame.appendChild(img);
      carousel.appendChild(frame);
      // Belt-and-suspenders for the cached case: if it somehow finished
      // (synchronously or in a microtask) before the listener line above
      // ran, this catches it once the frame is actually in the DOM.
      if (img.complete) syncCarouselHeight();
    });
  }
  carouselWrap.appendChild(carousel);
  card.appendChild(carouselWrap);

  if (slot.images && slot.images.length > 1) {
    enableDragScroll(carousel, { snapToFrames: true });
    const prev = document.createElement('button');
    prev.className = 'slot-nav prev';
    prev.textContent = '‹';
    prev.addEventListener('click', (e) => {
      e.stopPropagation();
      animateScrollTo(carousel, Math.max(0, carousel.scrollLeft - carousel.clientWidth));
    });
    const next = document.createElement('button');
    next.className = 'slot-nav next';
    next.textContent = '›';
    next.addEventListener('click', (e) => {
      e.stopPropagation();
      const max = carousel.scrollWidth - carousel.clientWidth;
      animateScrollTo(carousel, Math.min(max, carousel.scrollLeft + carousel.clientWidth));
    });
    carouselWrap.appendChild(prev);
    carouselWrap.appendChild(next);
    prev.classList.add('nav-disabled'); // starts on frame 0: only the "next" arrow makes sense

    const dots = document.createElement('div');
    dots.className = 'carousel-dots';
    const dotEls = slot.images.map((_, i) => {
      const d = document.createElement('span');
      d.className = 'dot' + (i === 0 ? ' active' : '');
      d.addEventListener('click', (e) => {
        e.stopPropagation(); // don't also trigger the card's click-to-open
        const width = carousel.clientWidth || 1;
        const max = carousel.scrollWidth - carousel.clientWidth;
        animateScrollTo(carousel, Math.max(0, Math.min(max, i * width)));
      });
      dots.appendChild(d);
      return d;
    });
    let heightRAF = null;
    let settleTimer = null;
    carousel.addEventListener('scroll', () => {
      const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
      dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
      // A CSS-only opacity/pointer-events toggle instead of the `hidden`
      // attribute: toggling display:none<->block on an absolutely
      // positioned nav button inside this masonry layout was observed
      // leaving it positioned off-screen (x: -98) once shown again,
      // seemingly a layout-caching quirk from re-entering flow. Keeping it
      // always in normal flow sidesteps that entirely.
      prev.classList.toggle('nav-disabled', idx <= 0);
      next.classList.toggle('nav-disabled', idx >= slot.images.length - 1);

      // Deferred to the next frame instead of run synchronously here: mutating
      // height inside the scroll event's own callback can interrupt a
      // browser-driven scroll animation in progress (native smooth-scroll or
      // touch momentum).
      if (heightRAF) cancelAnimationFrame(heightRAF);
      heightRAF = requestAnimationFrame(() => {
        heightRAF = null;
        syncCarouselHeight();
      });

      // Touch swipes scroll natively (enableDragScroll only handles mouse),
      // so there's no drag-end hook to snap them - CSS scroll-snap would
      // normally cover that, but it's exactly the kind of browser-driven
      // scroll animation the height updates above can interrupt. Instead,
      // once scrolling has been quiet for a bit, snap to the nearest frame
      // ourselves via the same animateScrollTo used everywhere else.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (carousel.classList.contains('dragging-scroll')) return; // mouse drag handles its own snap on release
        const width = carousel.clientWidth || 1;
        const targetIndex = Math.round(carousel.scrollLeft / width);
        const max = carousel.scrollWidth - carousel.clientWidth;
        const target = Math.max(0, Math.min(max, targetIndex * width));
        if (Math.abs(carousel.scrollLeft - target) > 1) {
          animateScrollTo(carousel, target);
        }
      }, 120);
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
    carouselWrap.appendChild(del);
  }

  const label = document.createElement('div');
  label.className = 'slot-label';
  label.textContent = displayTitle;
  card.appendChild(label);

  // Capture status: everyone sees a confirmed in-game capture; only the
  // admin sees the states that still need a ruling, since they're the only
  // one who can rule on them.
  const capture = document.createElement('div');
  if (slot.verifiedCapture === true) {
    capture.className = 'capture-badge verified';
    capture.textContent = '게임 캡처 확인됨';
  } else if (isAdmin() && slot.verifiedCapture === false) {
    capture.className = 'capture-badge rejected';
    capture.textContent = '게임 캡처 아님';
  } else if (isAdmin()) {
    capture.className = 'capture-badge pending';
    capture.textContent = slot.claimedGameCapture ? '캡처 주장 · 미검토' : '미검토';
  }
  if (capture.className) card.appendChild(capture);

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
