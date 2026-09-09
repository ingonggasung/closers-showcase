// Machine translation for the parts of the page nobody can put in a
// dictionary: post titles, costume names, memos, character names.
//
// Every result is cached in Firestore, so a phrase is translated once and
// then served for free forever after. That makes the actual volume tiny, so
// the default backend is MyMemory - free, no key, no billing account. If
// GOOGLE_TRANSLATE_KEY is set it is used instead, since it is better; without
// it nothing breaks.

const admin = require('firebase-admin');
const crypto = require('crypto');

const MAX_TEXTS = 128;
const MAX_CHARS = 400; // per string; longer ones are left alone

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

async function readCache(ids) {
  if (!ids.length) return {};
  const out = {};
  // getAll takes refs one by one; chunk to stay well inside limits.
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => db().collection('translations').doc(id));
    const docs = await db().getAll(...refs);
    docs.forEach((d) => {
      if (d.exists) out[d.id] = d.data().text;
    });
  }
  return out;
}

async function translateGoogle(texts, target) {
  const key = process.env.GOOGLE_TRANSLATE_KEY;
  const res = await fetch(
    'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(key),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: texts,
        source: 'ko',
        target: target === 'zh' ? 'zh-CN' : target,
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

async function translateOneMyMemory(text, target) {
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    '&langpair=' +
    encodeURIComponent('ko|' + (target === 'zh' ? 'zh-CN' : target)) +
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

// Returns a map of the ones that worked; a failure drops that phrase rather
// than the whole request.
async function translateBatch(texts, target) {
  if (process.env.GOOGLE_TRANSLATE_KEY) {
    const list = await translateGoogle(texts, target);
    return Object.fromEntries(texts.map((t, i) => [t, list[i]]));
  }
  const out = {};
  const queue = [...texts];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const text = queue.shift();
      try {
        out[text] = await translateOneMyMemory(text, target);
      } catch (err) {
        console.warn('translate skipped:', text, err.message);
      }
    }
  });
  await Promise.all(workers);
  return out;
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
      .filter((t) => t && t.length <= MAX_CHARS)
      .slice(0, MAX_TEXTS);
    if (!texts.length) return res.json({ translations: {} });

    const ids = texts.map((t) => cacheId(t, target));
    const cached = await readCache(ids);

    const out = {};
    const missing = [];
    texts.forEach((t, i) => {
      if (cached[ids[i]] !== undefined) out[t] = cached[ids[i]];
      else missing.push(t);
    });

    if (missing.length) {
      const fresh = await translateBatch(missing, target);
      const done = Object.keys(fresh);
      if (done.length) {
        const batch = db().batch();
        done.forEach((t) => {
          out[t] = fresh[t];
          batch.set(db().collection('translations').doc(cacheId(t, target)), {
            source: t,
            target,
            text: fresh[t],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    res.json({ translations: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
