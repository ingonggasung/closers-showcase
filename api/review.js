// Serverless auto-review. The browser only hands over a slot id; everything
// that decides the verdict is read here, so a post is judged even when nobody
// has the site open, and the author cannot dictate the answer.
//
// Reference embeddings are NOT computed here - the admin's browser stores them
// on each training sample (see saveSampleEmbedding). A cold start would never
// finish embedding a hundred images inside the function's time limit.

const admin = require('firebase-admin');
const tf = require('@tensorflow/tfjs');
const mobilenet = require('@tensorflow-models/mobilenet');
const jpeg = require('jpeg-js');

const FLAG_MIN_CONFIDENCE = 0.3; // matches the client-side rule
const MIN_REFERENCES = 3;

// Reused across warm invocations; a cold start pays for these once.
let model = null;
let cachedIndex = null;
let cachedAt = 0;
const INDEX_TTL_MS = 5 * 60 * 1000;

function db() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

async function getModel() {
  if (!model) model = await mobilenet.load({ version: 2, alpha: 1.0 });
  return model;
}

// Cloudinary resizes and re-encodes for us, so decoding is one small JPEG
// rather than whatever the user happened to upload.
function thumbUrl(url) {
  return url.includes('/image/upload/')
    ? url.replace('/image/upload/', '/image/upload/f_jpg,c_fill,w_224,h_224/')
    : url;
}

async function embed(url) {
  const res = await fetch(thumbUrl(url));
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const { width, height, data } = jpeg.decode(Buffer.from(await res.arrayBuffer()), {
    useTArray: true,
  });
  // jpeg-js gives RGBA; MobileNet wants RGB.
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  const input = tf.tensor3d(rgb, [height, width, 3]);
  const feat = (await getModel()).infer(input, true);
  const arr = Array.from(await feat.data());
  input.dispose();
  feat.dispose();
  return unit(arr);
}

function unit(arr) {
  let n = 0;
  for (const v of arr) n += v * v;
  n = Math.sqrt(n) || 1;
  return arr.map((v) => v / n);
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Same rule as the browser: the cut-off is the 5th percentile of how similar
// each reference is to its nearest neighbour among the others.
function calibrate(refs) {
  if (refs.length < 4) return 0.55;
  const sims = refs.map((r, i) => {
    let best = -1;
    refs.forEach((o, j) => {
      if (i !== j) best = Math.max(best, cosine(r.vec, o.vec));
    });
    return best;
  });
  sims.sort((a, b) => a - b);
  return sims[Math.max(0, Math.floor(sims.length * 0.05))];
}

async function getIndex() {
  if (cachedIndex && Date.now() - cachedAt < INDEX_TTL_MS) return cachedIndex;
  const snap = await db().collection('trainingSamples').get();
  const items = [];
  snap.docs.forEach((doc) => {
    const d = doc.data();
    if (!Array.isArray(d.embedding) || !d.embedding.length) return;
    items.push({
      label: d.label,
      capture: d.capture === '외부' ? '외부' : '인게임',
      vec: d.embedding,
    });
  });
  const refs = items.filter((it) => it.capture === '인게임');
  cachedIndex = { items, refs, threshold: calibrate(refs) };
  cachedAt = Date.now();
  return cachedIndex;
}

function nearest(vec, items) {
  let best = null;
  for (const it of items) {
    const sim = cosine(vec, it.vec);
    if (!best || sim > best.sim) best = { item: it, sim };
  }
  return best;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const slotId = (req.body && req.body.slotId) || '';
    if (!slotId) return res.status(400).json({ error: 'slotId required' });

    const ref = db().collection('slots').doc(String(slotId));
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'slot not found' });

    const slot = doc.data();
    const url = (slot.images || [])[0];
    if (!url) return res.json({ skipped: 'no image' });
    // The admin's own ruling always wins; never overwrite it.
    if (slot.verifiedCapture != null) return res.json({ skipped: 'already ruled' });

    const idx = await getIndex();
    if (idx.refs.length < MIN_REFERENCES) {
      return res.json({ skipped: 'not enough references', references: idx.refs.length });
    }

    const vec = await embed(url);
    const best = nearest(vec, idx.items);
    const inGame = nearest(vec, idx.refs);
    const similarity = inGame ? inGame.sim : -1;
    const isOutside = best.item.capture === '외부' || similarity < idx.threshold;
    const confidence = Math.min(1, Math.abs(similarity - idx.threshold) / 0.15);
    const flagged = isOutside && confidence >= FLAG_MIN_CONFIDENCE;

    await ref.update({
      autoChecked: true,
      autoFlag: flagged,
      autoConfidence: confidence,
      autoSimilarity: similarity,
      autoBy: 'server',
      autoCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      label: isOutside ? '외부' : '인게임',
      flagged,
      confidence,
      similarity,
      threshold: idx.threshold,
      references: idx.refs.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
