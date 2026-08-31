// Shared auth state. `authReady` resolves once Firebase has determined the
// initial signed-in/out state, so pages can wait before rendering owner-only UI.
let currentUser = null;
let currentUserProfile = null; // custom profile fields the user set themselves, e.g. { photoURL }
const authChangeListeners = [];
const profileChangeListeners = [];

function onAuthChange(fn) {
  authChangeListeners.push(fn);
}

// Fires whenever the signed-in user's custom profile (photo) changes, so
// every mounted auth bar can refresh without waiting for an auth event.
function onProfileChange(fn) {
  profileChangeListeners.push(fn);
}

async function refreshUserProfile(uid) {
  currentUserProfile = uid ? await DB.getUserProfile(uid).catch(() => null) : null;
  profileChangeListeners.forEach((fn) => fn());
}

const authReady = new Promise((resolve) => {
  let first = true;
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (first) {
      first = false;
      resolve(user);
    }
    authChangeListeners.forEach((fn) => fn(user));
    refreshUserProfile(user ? user.uid : null);
  });
});

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(provider);
}

function signOutUser() {
  return auth.signOut();
}

function isOwner(record) {
  return !!currentUser && !!record && record.ownerId === currentUser.uid;
}

function isAdmin() {
  return !!currentUser && currentUser.email === ADMIN_EMAIL;
}

// The photo to display for the given signed-in user: a custom one they
// uploaded, falling back to their Google account photo.
function displayPhotoURL(user) {
  return (currentUserProfile && currentUserProfile.photoURL) || (user && user.photoURL) || null;
}

async function changeProfilePhoto(file) {
  const url = await uploadImageToCloudinary(file);
  await DB.setUserPhoto(url);
  currentUserProfile = { ...(currentUserProfile || {}), photoURL: url };
  profileChangeListeners.forEach((fn) => fn());
}

const LAST_SEEN_POST_KEY = 'ccs_last_seen_post_ts';

// Renders the login/logout control into `container` and keeps it in sync
// with auth state. Call once per page.
function mountAuthBar(container) {
  let latestPostTs = 0; // newest known post timestamp, refreshed each render

  // Shows a red dot on the profile icon when a post exists that's newer
  // than the last one this browser has "seen" (cleared on opening the menu).
  async function refreshNewPostBadge() {
    const dot = document.getElementById('auth-notif-dot');
    if (!dot) return;
    try {
      latestPostTs = (await DB.getLatestSlotTimestamp()) || 0;
      const lastSeen = Number(localStorage.getItem(LAST_SEEN_POST_KEY) || 0);
      dot.hidden = latestPostTs <= lastSeen;
    } catch {
      dot.hidden = true;
    }
  }

  function render(user) {
    if (user) {
      const photo = displayPhotoURL(user);
      container.innerHTML = `
        <div class="auth-user">
          <button class="auth-profile-btn" id="auth-profile-btn">
            ${photo ? `<img src="${photo}" class="auth-avatar" alt="">` : ''}
            <span class="auth-name">${user.displayName || user.email || '사용자'}</span>
            <span class="notif-dot" id="auth-notif-dot" hidden></span>
          </button>
          <button class="pill" id="auth-signout-btn">로그아웃</button>
        </div>
        <input type="file" id="auth-photo-input" accept="image/*" hidden>
      `;
      document.getElementById('auth-signout-btn').addEventListener('click', () => {
        signOutUser();
      });
      const photoInput = document.getElementById('auth-photo-input');
      photoInput.addEventListener('change', async () => {
        const file = photoInput.files[0];
        photoInput.value = '';
        if (!file) return;
        try {
          await changeProfilePhoto(file);
        } catch (err) {
          alert('프로필 사진 변경에 실패했습니다: ' + err.message);
        }
      });
      document.getElementById('auth-profile-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          localStorage.setItem(LAST_SEEN_POST_KEY, String(latestPostTs || Math.floor(Date.now() / 1000)));
        } catch {}
        const dot = document.getElementById('auth-notif-dot');
        if (dot) dot.hidden = true;
        const rect = e.currentTarget.getBoundingClientRect();
        const menuItems = [
          { label: '프로필 사진 변경', onClick: () => photoInput.click() },
          { label: '스크랩', onClick: () => (location.href = 'scraps.html') },
          { label: '내 게시글 확인', onClick: () => (location.href = 'my-posts.html') },
        ];
        if (isAdmin()) {
          menuItems.push({ label: '신고 목록', onClick: () => (location.href = 'reports.html') });
        }
        openContextMenu(rect.left, rect.bottom + 4, menuItems);
      });
      refreshNewPostBadge();
    } else {
      container.innerHTML = `<button class="pill accent" id="auth-signin-btn">구글로 로그인</button>`;
      document.getElementById('auth-signin-btn').addEventListener('click', () => {
        signInWithGoogle().catch((err) => {
          console.error(err);
          alert('로그인에 실패했습니다: ' + err.message);
        });
      });
    }
  }

  render(currentUser);
  onAuthChange(render);
  onProfileChange(() => render(currentUser));
}
