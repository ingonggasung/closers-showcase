// Machine translation for the parts of the page nobody can put in a
// dictionary: post titles, costume names, memos, character names.
//
// Every result is cached in Firestore, so a phrase is paid for once and then
// served for free forever after. Without GOOGLE_TRANSLATE_KEY the endpoint
// reports that it is unconfigured and the client quietly leaves the text in
// Korean - the site keeps working either way.

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

async function translateBatch(texts, target) {
  const key = process.env.GOOGLE_TRANSLATE_KEY;
  const res = await fetch(
    'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(key),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'ko', target, format: 'text' }),
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ? body.error.message : 'translate failed');
  return body.data.translations.map((t) => t.translatedText);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = req.body || {};
    const target = body.target === 'ja' ? 'ja' : 'en';
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
      if (!process.env.GOOGLE_TRANSLATE_KEY) {
        // Whatever was cached is still useful; the rest stays Korean.
        return res.json({ translations: out, unconfigured: true });
      }
      const fresh = await translateBatch(missing, target);
      const batch = db().batch();
      missing.forEach((t, i) => {
        out[t] = fresh[i];
        batch.set(db().collection('translations').doc(cacheId(t, target)), {
          source: t,
          target,
          text: fresh[i],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    res.json({ translations: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
