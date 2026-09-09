// Whole-page translation without touching any markup: the page is written in
// Korean, and this swaps any text node whose exact text is in the dictionary.
// Keys are the Korean strings themselves, so nothing needs data-i18n
// attributes and an untranslated string simply stays Korean.
//
// Google's website translate widget shuts down 2026-10-01, so this is
// deliberately self-contained. Post content stays in whatever language its
// author wrote - only the site's own wording is translated.

const I18N_KEY = 'closers-lang';

const LANGS = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
};

// [English, Japanese]
const I18N = {
  // header / nav
  'Closers Showcase': ['Closers Showcase', 'Closers Showcase'],
  '게시글 보러가기': ['Browse posts', '投稿を見る'],
  '목록으로': ['Back to list', '一覧へ'],
  '← 목록으로': ['← Back to list', '← 一覧へ'],
  '홈으로': ['Home', 'ホーム'],
  '구글로 로그인': ['Sign in with Google', 'Googleでログイン'],
  '로그아웃': ['Sign out', 'ログアウト'],
  '캐릭터': ['Characters', 'キャラクター'],
  '캐릭터 목록': ['Characters', 'キャラクター一覧'],
  '전체 게시글': ['All posts', 'すべての投稿'],
  '코스튬 게시글': ['Costume posts', 'コスチューム投稿'],
  '내 게시글': ['My posts', '自分の投稿'],
  '내 스크랩': ['My scraps', 'スクラップ'],
  '스크랩': ['Scrap', 'スクラップ'],
  '스크랩 취소': ['Unscrap', 'スクラップ解除'],
  '신고 목록': ['Reports', '通報一覧'],
  '프로필 사진 변경': ['Change photo', 'プロフィール画像を変更'],
  '닉네임 변경': ['Change nickname', 'ニックネーム変更'],
  '내 게시글 확인': ['My posts', '自分の投稿'],

  // tabs / search
  '전체': ['All', 'すべて'],
  '일반': ['Normal', '通常'],
  '수영복': ['Swimsuit', '水着'],
  '성인': ['Adult', 'アダルト'],
  '제목명': ['Title', 'タイトル'],
  '게시자명': ['Author', '投稿者'],
  '코스튬명': ['Costume', 'コスチューム'],
  '게시글 검색': ['Search posts', '投稿を検索'],

  // post modal
  '코스튬 등록': ['New post', 'コスチューム投稿'],
  '캐릭터 추가': ['Add character', 'キャラクター追加'],
  '제목': ['Title', 'タイトル'],
  '캐릭터 선택': ['Choose a character', 'キャラクター選択'],
  '분류': ['Category', 'カテゴリ'],
  '게임 내에서 직접 찍은 이미지입니다': [
    'This is a screenshot I took in-game',
    'ゲーム内で撮影した画像です',
  ],
  '사진 (최대 10장)': ['Photos (up to 10)', '写真（最大10枚）'],
  '사진 선택': ['Choose photos', '写真を選択'],
  '이미지 선택': ['Choose image', '画像を選択'],
  '코스튬': ['Costume', 'コスチューム'],
  '악세서리': ['Accessories', 'アクセサリー'],
  '메모 (염색 코드 등)': ['Notes (dye codes, etc.)', 'メモ（染色コードなど）'],
  '캐릭터 이름': ['Character name', 'キャラクター名'],
  '아이콘 이미지 (여러 장 선택 시 한 번에 여러 캐릭터 추가)': [
    'Icon image (select several to add several characters at once)',
    'アイコン画像（複数選択で一括追加）',
  ],
  '취소': ['Cancel', 'キャンセル'],
  '등록': ['Post', '登録'],
  '추가': ['Add', '追加'],
  '삭제': ['Delete', '削除'],
  '수정': ['Edit', '編集'],
  '완료': ['Done', '完了'],
  '닫기': ['Close', '閉じる'],
  '보기': ['View', '表示'],
  '공유': ['Share', '共有'],
  '신고': ['Report', '通報'],

  // costume part names
  '무기': ['Weapon', '武器'],
  '모자': ['Hat', '帽子'],
  '얼굴 상': ['Face (upper)', '顔上'],
  '얼굴 중': ['Face (middle)', '顔中'],
  '얼굴 하': ['Face (lower)', '顔下'],
  '상의': ['Top', '上衣'],
  '하의': ['Bottom', '下衣'],
  '장갑': ['Gloves', '手袋'],
  '신발': ['Shoes', '靴'],
  '허리': ['Waist', '腰'],
  '등': ['Back', '背中'],
  '팔': ['Arm', '腕'],
  '다리': ['Leg', '脚'],
  '눈동자': ['Eyes', '瞳'],
  '헤어스타일': ['Hairstyle', 'ヘアスタイル'],
  '이펙트': ['Effect', 'エフェクト'],

  // slot page
  '코스튬 상세 정보': ['Costume details', 'コスチューム詳細'],
  '게시글 보기': ['View post', '投稿を見る'],
  '게시글 삭제': ['Delete post', '投稿を削除'],
  '필터 해제': ['Clear filter', 'フィルター解除'],
  '맨 위로': ['Back to top', '上へ'],

  // empty / status
  '불러오는 중...': ['Loading...', '読み込み中...'],
  '아직 등록된 게시글이 없어요.': ['No posts yet.', 'まだ投稿がありません。'],
  '조건에 맞는 게시글이 없어요.': ['No posts match.', '条件に合う投稿がありません。'],
  '아직 등록한 게시글이 없어요.': ["You haven't posted yet.", 'まだ投稿していません。'],
  '아직 스크랩한 게시글이 없어요.': ["You haven't scrapped anything yet.", 'スクラップはまだありません。'],
  '등록된 사진이 없어요.': ['No photos.', '写真がありません。'],
  '등록된 코스튬 정보가 없어요.': ['No costume details.', 'コスチューム情報がありません。'],
  '접수된 신고가 없어요.': ['No reports.', '通報はありません。'],
  '등록된 캐릭터가 없습니다': ['No characters yet', 'キャラクターがいません'],
  '로그인하면 내가 올린 게시글을 볼 수 있어요.': [
    'Sign in to see the posts you made.',
    'ログインすると自分の投稿を見られます。',
  ],
  '로그인하면 스크랩한 게시글을 볼 수 있어요.': [
    'Sign in to see what you scrapped.',
    'ログインするとスクラップを見られます。',
  ],
  '데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.': [
    'Could not load. Please refresh in a moment.',
    '読み込めませんでした。少し後に再読み込みしてください。',
  ],
  '관리자만 볼 수 있는 페이지입니다.': [
    'This page is for the admin only.',
    '管理者専用ページです。',
  ],
  '삭제된 게시글입니다.': ['This post was deleted.', '削除された投稿です。'],
  '로그인이 필요합니다.': ['Please sign in.', 'ログインが必要です。'],

  // footer
  '오류·건의·문의 : nasac0311@gmail.com': [
    'Bugs, ideas, contact: nasac0311@gmail.com',
    '不具合・ご意見・お問い合わせ: nasac0311@gmail.com',
  ],
};

let currentLang = 'ko';

// --- machine translation for free text -------------------------------------
// Post titles, costume names, memos and character names cannot live in a
// dictionary. They go to the serverless translator, which caches every phrase
// server-side; this keeps a local copy too so a repeat visit costs nothing.

const AUTO_ENDPOINT = 'https://closers-showcase.vercel.app/api/translate';
const AUTO_CACHE_KEY = 'closers-autotr';
const HANGUL = /[가-힣]/;

let autoCache = {};
let autoPending = new Set();
let autoTimer = null;
let autoUnavailable = false;

function loadAutoCache() {
  try {
    autoCache = JSON.parse(localStorage.getItem(AUTO_CACHE_KEY) || '{}');
  } catch {
    autoCache = {};
  }
}

function saveAutoCache() {
  try {
    localStorage.setItem(AUTO_CACHE_KEY, JSON.stringify(autoCache));
  } catch {}
}

const autoKey = (text, lang) => lang + '\u0000' + text;

// Nodes waiting on a phrase, so the answer can be dropped straight in.
const autoNodes = new Map();

function queueAuto(node, text, lang) {
  const key = autoKey(text, lang);
  if (autoCache[key] !== undefined) {
    node.nodeValue = node.nodeValue.replace(text, autoCache[key]);
    return;
  }
  if (autoUnavailable) return;
  if (!autoNodes.has(key)) autoNodes.set(key, []);
  autoNodes.get(key).push(node);
  autoPending.add(text);
  clearTimeout(autoTimer);
  autoTimer = setTimeout(flushAuto, 200); // one request per burst of rendering
}

async function flushAuto() {
  const texts = [...autoPending];
  autoPending = new Set();
  if (!texts.length) return;
  const lang = currentLang;
  try {
    const res = await fetch(AUTO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, target: lang }),
    });
    const data = await res.json();
    Object.entries(data.translations || {}).forEach(([src, out]) => {
      const key = autoKey(src, lang);
      autoCache[key] = out;
      (autoNodes.get(key) || []).forEach((node) => {
        if (node.isConnected) node.nodeValue = node.nodeValue.replace(src, out);
      });
      autoNodes.delete(key);
    });
    saveAutoCache();
  } catch {
    autoUnavailable = true;
  }
}

function detectLang() {
  try {
    const saved = localStorage.getItem(I18N_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch {}
  const nav = (navigator.language || 'ko').toLowerCase();
  if (nav.startsWith('ko')) return 'ko';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

function translateOne(text, lang) {
  const entry = I18N[text.trim()];
  if (!entry) return null;
  const out = lang === 'en' ? entry[0] : entry[1];
  return out ? text.replace(text.trim(), out) : null;
}

// The original Korean is kept on the node so switching languages always
// translates from the source rather than from a previous translation.
function applyToNode(node, lang) {
  if (node.__ko === undefined) node.__ko = node.nodeValue;
  if (lang === 'ko') {
    node.nodeValue = node.__ko;
    return;
  }
  const dict = translateOne(node.__ko, lang);
  node.nodeValue = dict || node.__ko;
  // Anything the dictionary does not cover but that is actually Korean is
  // user-written text - send it to the translator.
  if (!dict && HANGUL.test(node.__ko)) queueAuto(node, node.__ko.trim(), lang);
}

const ATTRS = ['placeholder', 'title', 'aria-label'];

function applyToElement(el, lang) {
  ATTRS.forEach((attr) => {
    const val = el.getAttribute(attr);
    if (val === null && !el.__i18nAttrs) return;
    el.__i18nAttrs = el.__i18nAttrs || {};
    if (el.__i18nAttrs[attr] === undefined) el.__i18nAttrs[attr] = val;
    const src = el.__i18nAttrs[attr];
    if (src === null) return;
    el.setAttribute(attr, lang === 'ko' ? src : translateOne(src, lang) || src);
  });
}

function translateTree(root, lang) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.nodeValue.trim()) applyToNode(root, lang);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.closest && root.closest('[data-no-i18n]')) return;
  if (root.closest && root.closest('#train-modal, #auto-banner, .context-menu')) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) texts.push(walker.currentNode);
  texts.forEach((n) => applyToNode(n, lang));

  applyToElement(root, lang);
  root.querySelectorAll('[placeholder], [title], [aria-label]').forEach((el) =>
    applyToElement(el, lang)
  );
}

function setLanguage(lang) {
  currentLang = LANGS[lang] ? lang : 'ko';
  try {
    localStorage.setItem(I18N_KEY, currentLang);
  } catch {}
  document.documentElement.lang = currentLang;
  translateTree(document.body, currentLang);
}

function mountLanguagePicker() {
  if (document.getElementById('lang-picker')) return;
  const sel = document.createElement('select');
  sel.id = 'lang-picker';
  sel.setAttribute('data-no-i18n', '');
  sel.setAttribute('aria-label', 'Language');
  sel.innerHTML = Object.entries(LANGS)
    .map(([k, v]) => `<option value="${k}"${k === currentLang ? ' selected' : ''}>${v}</option>`)
    .join('');
  sel.addEventListener('change', () => setLanguage(sel.value));

  const bar = document.querySelector('.top-bar');
  if (bar) {
    sel.classList.add('lang-inline');
    bar.appendChild(sel);
  } else {
    sel.classList.add('lang-floating');
    document.body.appendChild(sel);
  }
}

// Anything rendered later (the feed, modals, menus) is translated as it lands.
function watchForNewContent() {
  new MutationObserver((records) => {
    if (currentLang === 'ko') return;
    records.forEach((r) =>
      r.addedNodes.forEach((n) => {
        if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) {
          translateTree(n, currentLang);
        }
      })
    );
  }).observe(document.body, { childList: true, subtree: true });
}

(function initI18n() {
  currentLang = detectLang();
  loadAutoCache();
  const start = () => {
    mountLanguagePicker();
    if (currentLang !== 'ko') setLanguage(currentLang);
    watchForNewContent();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
