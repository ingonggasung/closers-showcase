// Machine translation for the parts of the page nobody can put in a
// dictionary: post titles, costume names, memos, character names.
//
// Every result is cached in Firestore, so a phrase is translated once and
// then served for free forever after. That makes the actual volume tiny, so
// the default backend is MyMemory - free, no key, no billing account. If
// GOOGLE_TRANSLATE_KEY is set it is used instead, since it is better; without
// it nothing breaks.
//
// Japanese and Chinese are translated from the English rather than straight
// from the Korean. English is the language the admin actually curates, so
// every proper noun fixed there - character names, costume names - carries
// through to the other two instead of being re-invented per language.

const admin = require('firebase-admin');
const crypto = require('crypto');

const MAX_TEXTS = 128;
const MAX_CHARS = 400; // per string; longer ones are left alone
// The source language is Korean, so anything without Hangul is not something
// this endpoint should translate - and caching such a string would pin
// nonsense in the dictionary forever.
const HANGUL = /[가-힣]/;

function db() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

const cacheId = (text, target) =>
  target + '_' + crypto.createHash('sha1').update(text).digest('hex').slice(0, 32);

// Google and MyMemory both want the regional tag for Chinese.
const engineCode = (lang) => (lang === 'zh' ? 'zh-CN' : lang);

async function readCache(texts, target) {
  const out = {};
  const ids = texts.map((t) => cacheId(t, target));
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => db().collection('translations').doc(id));
    const docs = await db().getAll(...refs);
    docs.forEach((d, j) => {
      if (d.exists) out[texts[i + j]] = d.data().text;
    });
  }
  return out;
}

async function writeCache(map, target) {
  const keys = Object.keys(map);
  if (!keys.length) return;
  const batch = db().batch();
  keys.forEach((source) => {
    batch.set(db().collection('translations').doc(cacheId(source, target)), {
      source,
      target,
      text: map[source],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

// --- engines ----------------------------------------------------------------

async function translateGoogle(texts, source, target) {
  const key = process.env.GOOGLE_TRANSLATE_KEY;
  const res = await fetch(
    'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(key),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: texts,
        source: engineCode(source),
        target: engineCode(target),
        format: 'text',
      }),
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ? body.error.message : 'translate failed');
  return body.data.translations.map((t) => t.translatedText);
}

// MyMemory takes one phrase per request, which is fine at this volume: the
// cache means a phrase is only ever fetched once. The contact address raises
// the daily allowance and is the site's own public one.
const MM_CONTACT = process.env.TRANSLATE_CONTACT || 'nasac0311@gmail.com';

async function translateOneMyMemory(text, source, target) {
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    '&langpair=' +
    encodeURIComponent(engineCode(source) + '|' + engineCode(target)) +
    '&de=' +
    encodeURIComponent(MM_CONTACT);
  const res = await fetch(url);
  const body = await res.json();
  const out = body && body.responseData && body.responseData.translatedText;
  // The daily-limit reply comes back as a normal 200 with the warning in the
  // text, so it has to be caught by hand or the warning gets cached forever.
  if (!out || /MYMEMORY WARNING|QUOTA|INVALID/i.test(out)) {
    throw new Error(typeof out === 'string' ? out : 'translate failed');
  }
  return decodeEntities(out);
}

function decodeEntities(t) {
  return t
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Runs the engine over {original, sent} pairs and returns a map keyed by the
// original phrase. A single failure drops that phrase, not the whole request.
async function runEngine(pairs, source, target) {
  if (!pairs.length) return {};
  if (process.env.GOOGLE_TRANSLATE_KEY) {
    const list = await translateGoogle(
      pairs.map((p) => p.sent),
      source,
      target
    );
    return Object.fromEntries(pairs.map((p, i) => [p.original, list[i]]));
  }
  const out = {};
  const queue = [...pairs];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        out[item.original] = await translateOneMyMemory(item.sent, source, target);
      } catch (err) {
        console.warn('translate skipped:', item.original, err.message);
      }
    }
  });
  await Promise.all(workers);
  return out;
}

// --- glossary ---------------------------------------------------------------
// Terms the admin has fixed by hand are reused when a longer phrase contains
// them: with 리아 -> Ria on file, "리아 나이트메어" is sent as "Ria 나이트메어"
// and comes back "Ria Nightmare" instead of whatever the engine invents for a
// name. Machine translation has no memory of its own; this gives it one.

let glossaryCache = {};
let glossaryAt = 0;
const GLOSSARY_TTL_MS = 60 * 1000;

async function getGlossary(target) {
  if (glossaryCache[target] && Date.now() - glossaryAt < GLOSSARY_TTL_MS) {
    return glossaryCache[target];
  }
  // Queried on target alone: adding `locked` would need a composite index for
  // no real gain at this size.
  const snap = await db().collection('translations').where('target', '==', target).get();
  const terms = [];
  snap.docs.forEach((doc) => {
    const d = doc.data();
    if (d.locked && d.source && d.text) terms.push({ source: d.source, text: d.text });
  });
  // Longest first, so a longer term is matched before one of its parts.
  terms.sort((a, b) => b.source.length - a.source.length);
  glossaryCache[target] = terms;
  glossaryAt = Date.now();
  return terms;
}

function applyGlossary(text, terms) {
  let out = text;
  let hit = false;
  for (const t of terms) {
    if (t.source === text) continue;
    if (out.includes(t.source)) {
      out = out.split(t.source).join(' ' + t.text + ' ');
      hit = true;
    }
  }
  return hit ? out.replace(/\s+/g, ' ').trim() : text;
}

// --- pipeline ---------------------------------------------------------------

// Korean -> English, the curated hop. Results are cached under 'en' even when
// the caller asked for another language, so the dictionary fills either way.
async function toEnglish(texts) {
  const cached = await readCache(texts, 'en');
  const missing = texts.filter((t) => cached[t] === undefined);
  if (missing.length) {
    const terms = await getGlossary('en').catch(() => []);
    const pairs = missing.map((t) => ({ original: t, sent: applyGlossary(t, terms) }));
    const fresh = await runEngine(pairs, 'ko', 'en');
    await writeCache(fresh, 'en');
    Object.assign(cached, fresh);
  }
  return cached;
}

async function translateInto(texts, target) {
  if (target === 'en') return toEnglish(texts);

  // An entry the admin wrote directly in this language already came back from
  // the cache before this ran, so whatever is left has no hand-written form
  // and goes through the curated English.
  const english = await toEnglish(texts);
  const pairs = texts.filter((t) => english[t]).map((t) => ({ original: t, sent: english[t] }));
  return runEngine(pairs, 'en', target);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = req.body || {};
    const target = ['ja', 'zh'].includes(body.target) ? body.target : 'en';
    const texts = [...new Set((body.texts || []).filter((t) => typeof t === 'string'))]
      .map((t) => t.trim())
      .filter((t) => t && t.length <= MAX_CHARS && HANGUL.test(t))
      .slice(0, MAX_TEXTS);
    if (!texts.length) return res.json({ translations: {} });

    const out = await readCache(texts, target);
    const missing = texts.filter((t) => out[t] === undefined);

    if (missing.length) {
      const fresh = await translateInto(missing, target);
      await writeCache(fresh, target);
      Object.assign(out, fresh);
    }

    res.json({ translations: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
