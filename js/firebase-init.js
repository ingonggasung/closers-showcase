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
