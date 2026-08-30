// Shared auth state. `authReady` resolves once Firebase has determined the
// initial signed-in/out state, so pages can wait before rendering owner-only UI.
let currentUser = null;
const authChangeListeners = [];

function onAuthChange(fn) {
  authChangeListeners.push(fn);
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

// Renders the login/logout control into `container` and keeps it in sync
// with auth state. Call once per page.
function mountAuthBar(container) {
  function render(user) {
    if (user) {
      container.innerHTML = `
        <div class="auth-user">
          <button class="auth-profile-btn" id="auth-profile-btn">
            ${user.photoURL ? `<img src="${user.photoURL}" class="auth-avatar" alt="">` : ''}
            <span class="auth-name">${user.displayName || user.email || '사용자'}</span>
          </button>
          <button class="pill" id="auth-signout-btn">로그아웃</button>
        </div>
      `;
      document.getElementById('auth-signout-btn').addEventListener('click', () => {
        signOutUser();
      });
      document.getElementById('auth-profile-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        openContextMenu(rect.left, rect.bottom + 4, [
          { label: '스크랩', onClick: () => (location.href = 'scraps.html') },
          { label: '내 게시글 확인', onClick: () => (location.href = 'my-posts.html') },
        ]);
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
}
