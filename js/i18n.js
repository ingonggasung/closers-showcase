// Whole-page translation without touching any markup: the page is written in
// Korean, and this swaps any text node whose exact text is in the dictionary.
// Keys are the Korean strings themselves, so nothing needs data-i18n
// attributes and an untranslated string simply stays Korean.
//
// Google's website translate widget shuts down 2026-10-01, so this is
// deliberately self-contained. Free text the dictionary cannot cover - post
// titles, memos, character names - goes to /api/translate instead.

const I18N_KEY = 'closers-lang';

// Each language is written in itself; a picker that renames 한국어 to
// "Korea Language" is useless to the person looking for their own language.
const LANGS = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '中文',
};

const LANG_ORDER = ['en', 'ja', 'zh']; // index into the dictionary values

// [English, 日本語, 中文]
const I18N = {
  // header / nav
  '게시글 보러가기': ['Browse posts', '投稿を見る', '浏览帖子'],
  '목록으로': ['Back to list', '一覧へ', '返回列表'],
  '← 목록으로': ['← Back to list', '← 一覧へ', '← 返回列表'],
  '홈으로': ['Home', 'ホーム', '首页'],
  '구글로 로그인': ['Sign in with Google', 'Googleでログイン', '使用 Google 登录'],
  '로그아웃': ['Sign out', 'ログアウト', '登出'],
  '캐릭터': ['Characters', 'キャラクター', '角色'],
  '캐릭터 목록': ['Characters', 'キャラクター一覧', '角色列表'],
  '전체 게시글': ['All posts', 'すべての投稿', '全部帖子'],
  '코스튬 게시글': ['Costume posts', 'コスチューム投稿', '时装帖子'],
  '내 게시글': ['My posts', '自分の投稿', '我的帖子'],
  '내 스크랩': ['My scraps', 'スクラップ', '我的收藏'],
  '스크랩': ['Scrap', 'スクラップ', '收藏'],
  '스크랩 취소': ['Unscrap', 'スクラップ解除', '取消收藏'],
  '신고 목록': ['Reports', '通報一覧', '举报列表'],
  '프로필 사진 변경': ['Change photo', 'プロフィール画像を変更', '更换头像'],
  '닉네임 변경': ['Change nickname', 'ニックネーム変更', '修改昵称'],
  '내 게시글 확인': ['My posts', '自分の投稿', '我的帖子'],

  // tabs / search
  '전체': ['All', 'すべて', '全部'],
  '일반': ['Normal', '通常', '普通'],
  '수영복': ['Swimsuit', '水着', '泳装'],
  '성인': ['Adult', 'アダルト', '成人'],
  '제목명': ['Title', 'タイトル', '标题'],
  '게시자명': ['Author', '投稿者', '发布者'],
  '코스튬명': ['Costume', 'コスチューム', '时装名'],
  '게시글 검색': ['Search posts', '投稿を検索', '搜索帖子'],
  '게시자:': ['Posted by', '投稿者:', '发布者：'],
  '익명': ['Anonymous', '匿名', '匿名'],

  // post modal
  '코스튬 등록': ['New post', 'コスチューム投稿', '发布时装'],
  '캐릭터 추가': ['Add character', 'キャラクター追加', '添加角色'],
  '제목': ['Title', 'タイトル', '标题'],
  '캐릭터 선택': ['Choose a character', 'キャラクター選択', '选择角色'],
  '분류': ['Category', 'カテゴリ', '分类'],
  '게임 내에서 직접 찍은 이미지입니다': [
    'This is a screenshot I took in-game',
    'ゲーム内で撮影した画像です',
    '这是我在游戏内截取的图片',
  ],
  '사진 (최대 10장)': ['Photos (up to 10)', '写真（最大10枚）', '照片（最多10张）'],
  '사진 선택': ['Choose photos', '写真を選択', '选择照片'],
  '이미지 선택': ['Choose image', '画像を選択', '选择图片'],
  '코스튬': ['Costume', 'コスチューム', '时装'],
  '악세서리': ['Accessories', 'アクセサリー', '配饰'],
  '메모 (염색 코드 등)': ['Notes (dye codes, etc.)', 'メモ（染色コードなど）', '备注（染色代码等）'],
  '캐릭터 이름': ['Character name', 'キャラクター名', '角色名'],
  '아이콘 이미지 (여러 장 선택 시 한 번에 여러 캐릭터 추가)': [
    'Icon image (select several to add several characters at once)',
    'アイコン画像（複数選択で一括追加）',
    '图标图片（可多选，一次添加多个角色）',
  ],
  '취소': ['Cancel', 'キャンセル', '取消'],
  '등록': ['Post', '登録', '发布'],
  '추가': ['Add', '追加', '添加'],
  '삭제': ['Delete', '削除', '删除'],
  '수정': ['Edit', '編集', '编辑'],
  '완료': ['Done', '完了', '完成'],
  '닫기': ['Close', '閉じる', '关闭'],
  '보기': ['View', '表示', '查看'],
  '공유': ['Share', '共有', '分享'],
  '신고': ['Report', '通報', '举报'],

  // costume part names
  '무기': ['Weapon', '武器', '武器'],
  '모자': ['Hat', '帽子', '帽子'],
  '얼굴 상': ['Face (upper)', '顔（上）', '面部（上）'],
  '얼굴 중': ['Face (middle)', '顔（中）', '面部（中）'],
  '얼굴 하': ['Face (lower)', '顔（下）', '面部（下）'],
  '상의': ['Top', '上衣', '上衣'],
  '하의': ['Bottom', '下衣', '下装'],
  '장갑': ['Gloves', '手袋', '手套'],
  '신발': ['Shoes', '靴', '鞋子'],
  '허리': ['Waist', '腰', '腰部'],
  '등': ['Back', '背中', '背部'],
  '팔': ['Arm', '腕', '手臂'],
  '다리': ['Leg', '脚', '腿部'],
  '눈동자': ['Eyes', '瞳', '瞳孔'],
  '헤어스타일': ['Hairstyle', 'ヘアスタイル', '发型'],
  '이펙트': ['Effect', 'エフェクト', '特效'],

  // slot page
  '코스튬 상세 정보': ['Costume details', 'コスチューム詳細', '时装详情'],
  '게시글 보기': ['View post', '投稿を見る', '查看帖子'],
  '게시글 삭제': ['Delete post', '投稿を削除', '删除帖子'],
  '필터 해제': ['Clear filter', 'フィルター解除', '清除筛选'],
  '맨 위로': ['Back to top', '上へ', '回到顶部'],

  // empty / status
  '불러오는 중...': ['Loading...', '読み込み中...', '加载中...'],
  '아직 등록된 게시글이 없어요.': ['No posts yet.', 'まだ投稿がありません。', '还没有帖子。'],
  '조건에 맞는 게시글이 없어요.': [
    'No posts match.',
    '条件に合う投稿がありません。',
    '没有符合条件的帖子。',
  ],
  '아직 등록한 게시글이 없어요.': [
    "You haven't posted yet.",
    'まだ投稿していません。',
    '你还没有发布过帖子。',
  ],
  '아직 스크랩한 게시글이 없어요.': [
    "You haven't scrapped anything yet.",
    'スクラップはまだありません。',
    '你还没有收藏任何帖子。',
  ],
  '등록된 사진이 없어요.': ['No photos.', '写真がありません。', '没有照片。'],
  '등록된 코스튬 정보가 없어요.': [
    'No costume details.',
    'コスチューム情報がありません。',
    '没有时装信息。',
  ],
  '접수된 신고가 없어요.': ['No reports.', '通報はありません。', '没有举报。'],
  '등록된 캐릭터가 없습니다': ['No characters yet', 'キャラクターがいません', '还没有角色'],
  '로그인하면 내가 올린 게시글을 볼 수 있어요.': [
    'Sign in to see the posts you made.',
    'ログインすると自分の投稿を見られます。',
    '登录后可以查看自己发布的帖子。',
  ],
  '로그인하면 스크랩한 게시글을 볼 수 있어요.': [
    'Sign in to see what you scrapped.',
    'ログインするとスクラップを見られます。',
    '登录后可以查看收藏的帖子。',
  ],
  '데이터를 불러오지 못했어요. 잠시 후 새로고침해주세요.': [
    'Could not load. Please refresh in a moment.',
    '読み込めませんでした。少し後に再読み込みしてください。',
    '加载失败，请稍后刷新。',
  ],
  '관리자만 볼 수 있는 페이지입니다.': [
    'This page is for the admin only.',
    '管理者専用ページです。',
    '此页面仅管理员可见。',
  ],
  '삭제된 게시글입니다.': ['This post was deleted.', '削除された投稿です。', '该帖子已被删除。'],
  '로그인이 필요합니다.': ['Please sign in.', 'ログインが必要です。', '需要登录。'],

  // footer
  '오류·건의·문의 : nasac0311@gmail.com': [
    'Bugs, ideas, contact: nasac0311@gmail.com',
    '不具合・ご意見・お問い合わせ: nasac0311@gmail.com',
    '错误、建议、咨询：nasac0311@gmail.com',
  ],
};

let currentLang = 'ko';

// --- machine translation for free text -------------------------------------
// Post titles, costume names, memos and character names cannot live in a
// dictionary. They go to the serverless translator, which caches every phrase
// in Firestore - and that cache is also the admin's editable dictionary.

const AUTO_ENDPOINT = 'https://closers-showcase.vercel.app/api/translate';
const HANGUL = /[가-힣]/;

// Kept across visits, but only briefly: a permanent copy would keep serving
// a translation the admin has since corrected, and no copy at all makes every
// page load wait on the network.
const AUTO_CACHE_KEY = 'closers-autotr';
const AUTO_CACHE_TTL = 2 * 60 * 1000;

let autoCache = {};
let autoPending = new Set();
let autoTimer = null;
let autoUnavailable = false;

const autoKey = (text, lang) => lang + ' ' + text;

function loadAutoCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(AUTO_CACHE_KEY) || '{}');
    if (Date.now() - (raw.savedAt || 0) < AUTO_CACHE_TTL) autoCache = raw.entries || {};
  } catch {}
}

// Called after the admin edits the dictionary: without this their own
// browser would keep showing the old wording until the cache expired.
function clearTranslationCache() {
  autoCache = {};
  try {
    localStorage.removeItem(AUTO_CACHE_KEY);
  } catch {}
}

function saveAutoCache() {
  try {
    localStorage.setItem(
      AUTO_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), entries: autoCache })
    );
  } catch {}
}

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
  autoTimer = setTimeout(flushAuto, 60); // one request per burst of rendering
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
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

function translateOne(text, lang) {
  const entry = I18N[text.trim()];
  if (!entry) return null;
  const out = entry[LANG_ORDER.indexOf(lang)];
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

// Surfaces that must never be touched: the picker itself (its options are
// language names, which stay in their own language), and the admin tooling.
const SKIP = '[data-no-i18n], #lang-picker, #train-modal, #auto-banner, .context-menu';

function skipped(el) {
  return !!(el && el.closest && el.closest(SKIP));
}

function applyToElement(el, lang) {
  if (skipped(el)) return;
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
    if (root.nodeValue.trim() && !skipped(root.parentElement)) applyToNode(root, lang);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (skipped(root)) return;

  // The filter has to run per node, not just on the root: one walk from
  // document.body would otherwise reach straight into the skipped subtrees,
  // which is how the picker's own language names got translated.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (skipped(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach((n) => applyToNode(n, lang));

  applyToElement(root, lang);
  root
    .querySelectorAll('[placeholder], [title], [aria-label]')
    .forEach((el) => applyToElement(el, lang));
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
