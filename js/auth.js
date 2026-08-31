// Shared auth state. `authReady` resolves once Firebase has determined the
// initial signed-in/out state, so pages can wait before rendering owner-only UI.
let currentUser = null;
let currentUserProfile = null; // custom profile fields the user set themselves, e.g. { photoURL }
let authResolved = false; // true once the very first onAuthStateChanged callback has run
let profileResolved = false; // true once the profile fetch for the current user (if any) has settled
const authChangeListeners = [];
const profileChangeListeners = [];

// Registers fn to run on every future auth change. Crucially, if auth has
// ALREADY resolved by the time this is called, fn also runs immediately
// with the current state - without this, a listener registered even a few
// milliseconds after Firebase's (sometimes very fast) initial resolution
// would never run at all, since onAuthStateChanged only fires again on an
// actual sign-in/out. That race is exactly what caused pages to
// intermittently render nothing on load, with no error, fixed only by a
// refresh (which re-rolls the race) - a plain array+forEach has no way to
// "catch up" a late subscriber the way an already-settled Promise would.
function onAuthChange(fn) {
  authChangeListeners.push(fn);
  if (authResolved) fn(currentUser);
}

// Fires whenever the signed-in user's custom profile (photo) changes, so
// every mounted auth bar can refresh without waiting for an auth event.
// Same late-subscriber catch-up as onAuthChange, for the same reason.
function onProfileChange(fn) {
  profileChangeListeners.push(fn);
  if (profileResolved) fn();
}

async function refreshUserProfile(uid) {
  profileResolved = false;
  currentUserProfile = uid ? await DB.getUserProfile(uid).catch(() => null) : null;
  profileResolved = true;
  profileChangeListeners.forEach((fn) => fn());
}

const authReady = new Promise((resolve) => {
  let first = true;
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    authResolved = true;
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

// The name to display/attribute posts to: a custom nickname they set,
// falling back to their Google account name.
function displayName(user) {
  return (
    (currentUserProfile && currentUserProfile.nickname) ||
    (user && user.displayName) ||
    (user && user.email) ||
    '사용자'
  );
}

async function changeProfilePhoto(file) {
  const url = await uploadImageToCloudinary(file);
  await DB.setUserPhoto(url);
  currentUserProfile = { ...(currentUserProfile || {}), photoURL: url };
  profileChangeListeners.forEach((fn) => fn());
}

async function changeNickname(nickname) {
  await DB.setNickname(nickname);
  currentUserProfile = { ...(currentUserProfile || {}), nickname };
  profileChangeListeners.forEach((fn) => fn());
}

// Renders the login/logout control into `container` and keeps it in sync
// with auth state. Call once per page.
function mountAuthBar(container) {
  function render(user) {
    if (user) {
      const photo = displayPhotoURL(user);
      container.innerHTML = `
        <div class="auth-user">
          <button class="auth-profile-btn" id="auth-profile-btn">
            ${photo ? `<img src="${photo}" class="auth-avatar" alt="">` : ''}
            <span class="auth-name">${escapeHtml(displayName(user))}</span>
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
        const rect = e.currentTarget.getBoundingClientRect();
        const menuItems = [
          { label: '프로필 사진 변경', onClick: () => photoInput.click() },
          {
            label: '닉네임 변경',
            onClick: async () => {
              const input = prompt('사용할 닉네임을 입력해주세요 (최대 20자):', displayName(user));
              if (input === null) return; // cancelled
              const nickname = input.trim().slice(0, 20);
              if (!nickname) {
                alert('닉네임을 입력해주세요.');
                return;
              }
              try {
                await changeNickname(nickname);
              } catch (err) {
                alert('닉네임 변경에 실패했습니다: ' + err.message);
              }
            },
          },
          { label: '스크랩', onClick: () => (location.href = 'scraps.html') },
          { label: '내 게시글 확인', onClick: () => (location.href = 'my-posts.html') },
        ];
        if (isAdmin()) {
          menuItems.push({ label: '신고 목록', onClick: () => (location.href = 'reports.html') });
        }
        openContextMenu(rect.left, rect.bottom + 4, menuItems);
      });
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
