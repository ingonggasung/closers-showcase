/* ── firebase-init.js ─────────────────────────────────────────────────────────
   모든 페이지가 가장 먼저 읽는 설정 파일.

   - Firebase 프로젝트 연결 (auth = 로그인, firestore = 데이터베이스)
   - ADMIN_EMAIL : 이 이메일로 로그인한 사람만 관리자. 화면에서의 관리자 판정과
     Firestore 보안 규칙(firestore.rules)의 isAdmin() 이 같은 값을 씁니다.
   - uploadImageToCloudinary() : 이미지를 Cloudinary에 올리고 URL을 돌려줍니다.
     'unsigned' 방식이라 비밀키가 필요 없고, 그래서 이 값들이 공개돼도 안전합니다.

   여기 있는 apiKey는 비밀번호가 아닙니다. 누가 봐도 되는 값이고, 실제 접근
   권한은 전부 firestore.rules 가 결정합니다.
   ────────────────────────────────────────────────────────────────────────── */

// Firebase project config (safe to be public — access is controlled by Firestore security rules).
const firebaseConfig = {
  apiKey: "AIzaSyDRCDIZUMUYfQzQviqBTRMdoGx6WCessyY",
  authDomain: "closers-showcase.firebaseapp.com",
  projectId: "closers-showcase",
  storageBucket: "closers-showcase.firebasestorage.app",
  messagingSenderId: "945931056484",
  appId: "1:945931056484:web:9151a0f48034d66b89f671",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();

// Only this account may create/edit/delete the base character roster.
const ADMIN_EMAIL = 'tnals1870@gmail.com';

// Cloudinary unsigned upload (no API secret needed/used client-side).
const CLOUDINARY_CLOUD_NAME = 'jt919jxx';
const CLOUDINARY_UPLOAD_PRESET = 'closers-showcase';

async function uploadImageToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('이미지 업로드에 실패했습니다.');
  const data = await res.json();
  return data.secure_url;
}
