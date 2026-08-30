// Right-click (desktop) / long-press (touch) context menu for posts:
// 스크랩 (scrap/bookmark), 공유 (share), and 삭제 (delete, owner/admin only).

let activeContextMenu = null;

function closeContextMenu() {
  if (!activeContextMenu) return;
  activeContextMenu.remove();
  activeContextMenu = null;
  document.removeEventListener('click', closeContextMenu);
  document.removeEventListener('scroll', closeContextMenu, true);
  document.removeEventListener('keydown', onContextMenuKeydown);
}

function onContextMenuKeydown(e) {
  if (e.key === 'Escape') closeContextMenu();
}

function openContextMenu(x, y, items) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.danger) btn.classList.add('danger');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      item.onClick();
    });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  activeContextMenu = menu;
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu);
    document.addEventListener('scroll', closeContextMenu, true);
    document.addEventListener('keydown', onContextMenuKeydown);
  }, 0);
}

function slotShareUrl(slot) {
  const base = location.href.slice(0, location.href.lastIndexOf('/') + 1);
  return `${base}slot.html?id=${encodeURIComponent(slot.id)}&cid=${encodeURIComponent(slot.characterId)}`;
}

async function shareSlot(slot) {
  const url = slotShareUrl(slot);
  const title = slotDisplayTitle(slot);
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    alert('링크가 복사되었습니다.');
  } catch (err) {
    prompt('아래 링크를 복사하세요:', url);
  }
}

// Attaches right-click / long-press handling to `el` for the given post.
// `slotOrGetter` is either the post object, or a function returning the
// current post (for pages that reload the same element's data over time).
// onDelete(slot) is called only after the confirm dialog, and only if the
// viewer is the post's owner or the admin.
function attachContextMenu(el, slotOrGetter, onDelete) {
  function getSlot() {
    return typeof slotOrGetter === 'function' ? slotOrGetter() : slotOrGetter;
  }

  async function buildItems() {
    const slot = getSlot();
    const canDelete = isOwner(slot) || isAdmin();
    let scrapped = false;
    if (currentUser) {
      try {
        scrapped = await DB.isScrapped(slot.id);
      } catch (err) {
        console.error('isScrapped failed:', err);
      }
    }

    const items = [
      {
        label: scrapped ? '스크랩 취소' : '스크랩',
        onClick: async () => {
          if (!currentUser) {
            alert('로그인이 필요합니다.');
            return;
          }
          try {
            if (scrapped) await DB.removeScrap(slot.id);
            else await DB.addScrap(slot.id);
          } catch (err) {
            alert('처리에 실패했습니다: ' + err.message);
          }
        },
      },
      { label: '공유', onClick: () => shareSlot(slot) },
    ];

    if (canDelete && onDelete) {
      items.push({
        label: '삭제',
        danger: true,
        onClick: async () => {
          if (confirm('이 게시글을 삭제할까요?')) {
            await onDelete(slot);
          }
        },
      });
    }

    return items;
  }

  el.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    try {
      const items = await buildItems();
      openContextMenu(e.clientX, e.clientY, items);
    } catch (err) {
      console.error('Failed to build context menu:', err);
    }
  });

  let pressTimer = null;
  let startX = 0;
  let startY = 0;

  el.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      pressTimer = setTimeout(async () => {
        pressTimer = null;
        suppressSlotClick = true;
        setTimeout(() => (suppressSlotClick = false), 500);
        if (navigator.vibrate) navigator.vibrate(10);
        try {
          const items = await buildItems();
          openContextMenu(startX, startY, items);
        } catch (err) {
          console.error('Failed to build context menu:', err);
        }
      }, 500);
    },
    { passive: true }
  );

  el.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
        clearTimeout(pressTimer);
      }
    },
    { passive: true }
  );

  el.addEventListener('touchend', () => clearTimeout(pressTimer));
  el.addEventListener('touchcancel', () => clearTimeout(pressTimer));
}
