// Firestore-backed data layer for Closers Showcase.
// Collections:
//   characters: { name, icon(Cloudinary URL), ownerId, ownerName, order, createdAt }
//   slots:      { characterId, characterName, ownerId, ownerName, title, images[](max 10),
//                 parts: {...costume/accessory keys}, notes(<=200 chars),
//                 order, createdAt }
//   scraps:     { userId, slotId, createdAt } - doc id is `${userId}_${slotId}`
//   reports:    { slotId, reporterId, reporterName, reason, createdAt }
//   trainingSamples: { url, kind('image'|'link'), label(탭 분류), capture('인게임'|'외부'),
//                      note, hash, addedBy, createdAt }
//               - admin-only labelled examples, see train-panel.js
//   config/autoModeration: { trialStartedAt } - see setAutoFlag/startAutoModerationTrial
//   users:      { photoURL(Cloudinary URL), nickname, warningCount, blocked, blockedAt,
//               updatedAt } - doc id is the user's uid; a user may only self-write
//               photoURL/nickname/updatedAt on their own doc (see Firestore rules) -
//               warningCount/blocked are only ever written by the admin, via
//               warnUser/blockUser below

// Post categories. 19+ is deliberately absent: hosting it would trigger the
// 청소년보호법 age-verification duty, which needs a real 본인확인기관 contract
// and a server - neither of which this static site can satisfy.
const SLOT_CATEGORIES = ['일반', '수영복', '성인'];

function docToObj(doc) {
  return { id: doc.id, ...doc.data() };
}

const DB = {
  // Labelled reference material for future auto-classification. Admin-only,
  // both here and in the Firestore rules.
  // ponytail: exact-bytes dedup via SHA-256. A re-encoded or resized copy of
  // the same picture still gets through - swap in a perceptual hash if that
  // starts happening often.
  async isDuplicateTrainingSample({ url, hash }) {
    const col = firestore.collection('trainingSamples');
    if (hash) {
      const byHash = await col.where('hash', '==', hash).limit(1).get();
      if (!byHash.empty) return true;
    }
    if (!url) return false;
    const byUrl = await col.where('url', '==', url).limit(1).get();
    return !byUrl.empty;
  },

  async addTrainingSample({ url, kind, label, capture, note, hash }) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    if (await DB.isDuplicateTrainingSample({ url, hash })) {
      throw new Error('이미 등록된 이미지입니다.');
    }
    const ref = await firestore.collection('trainingSamples').add({
      url,
      kind,
      label,
      // Absent on older samples, which were all screenshots - so undefined
      // reads as 인게임 everywhere this is used.
      capture: capture || '인게임',
      hash: hash || null,
      note: note || '',
      addedBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async getTrainingSamples() {
    const snap = await firestore
      .collection('trainingSamples')
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(docToObj);
  },

  async updateTrainingSample(id, fields) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('trainingSamples').doc(id).update(fields);
  },

  // Older samples predate the label/capture split: they carried one label,
  // and '외부' lived in it. Without this they would read as 인게임 - the exact
  // opposite of what they were registered as.
  async migrateTrainingSamples() {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    const snap = await firestore.collection('trainingSamples').get();
    const batch = firestore.batch();
    let fixed = 0;
    snap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.capture) return;
      batch.update(doc.ref, {
        capture: d.label === '외부' ? '외부' : '인게임',
        // The tab was never recorded for those, so it stays unset rather than
        // being guessed - 미지정 samples are skipped by the tab classifier.
        label: d.label === '외부' ? '미지정' : d.label,
      });
      fixed++;
    });
    if (fixed) await batch.commit();
    return fixed;
  },

  async deleteTrainingSample(id) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('trainingSamples').doc(id).delete();
  },

  // Auto-review verdict on one post. Written by the admin's browser only -
  // there is no server, so the classifier runs where the admin is.
  async setAutoFlag(slotId, flagged, confidence) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('slots').doc(slotId).update({
      autoChecked: true,
      autoFlag: !!flagged,
      autoConfidence: confidence,
      autoCheckedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  // Everything the auto-review has looked at. Sorted here rather than in the
  // query, so no composite index is needed.
  async getAutoReviewed() {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    const snap = await firestore.collection('slots').where('autoChecked', '==', true).get();
    return snap.docs
      .map(docToObj)
      .sort((a, b) => (b.autoCheckedAt?.seconds || 0) - (a.autoCheckedAt?.seconds || 0));
  },

  async getAutoDeleted() {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    const snap = await firestore.collection('autoDeleted').get();
    return snap.docs
      .map(docToObj)
      .sort((a, b) => (b.deletedAt?.seconds || 0) - (a.deletedAt?.seconds || 0));
  },

  // Puts the post back and marks it as a confirmed capture, so the review
  // will not pick it up and delete it a second time.
  async restoreAutoDeleted(archiveId) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    const doc = await firestore.collection('autoDeleted').doc(archiveId).get();
    if (!doc.exists) throw new Error('보관 항목을 찾을 수 없습니다.');
    const d = doc.data();
    await firestore
      .collection('slots')
      .doc(d.slotId)
      .set({
        characterId: d.characterId || '',
        ownerId: d.ownerId || '',
        ownerName: d.ownerName || '',
        title: d.title || '',
        images: d.images || [],
        category: d.category || '일반',
        verifiedCapture: true,
        autoChecked: true,
        autoFlag: false,
        restoredAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    await doc.ref.delete();
  },

  // config/autoModeration: { trialStartedAt } - the admin's go-ahead for the
  // 3-day hide-instead-of-delete trial.
  async getAutoModeration() {
    const doc = await firestore.collection('config').doc('autoModeration').get();
    return doc.exists ? doc.data() : {};
  },

  async startAutoModerationTrial() {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore
      .collection('config')
      .doc('autoModeration')
      .set({ trialStartedAt: firebase.firestore.FieldValue.serverTimestamp() });
  },

  async enableAutoDelete() {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('config').doc('autoModeration').set(
      {
        autoDelete: true,
        autoDeleteStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  },

  async disableAutoDelete() {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore
      .collection('config')
      .doc('autoModeration')
      .set({ autoDelete: false }, { merge: true });
  },

  // Auto-deletion keeps a copy of what it removed. A classifier's mistake
  // should cost a restore, not the post.
  async autoDeleteSlot(slot, confidence) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('autoDeleted').add({
      slotId: slot.id,
      title: slot.title || '',
      ownerId: slot.ownerId || '',
      ownerName: slot.ownerName || '',
      characterId: slot.characterId || '',
      images: slot.images || [],
      category: slot.category || '일반',
      confidence,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await firestore.collection('slots').doc(slot.id).delete();
  },

  async addCharacter({ name, icon }) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    const existing = await firestore.collection('characters').get();
    const ref = await firestore.collection('characters').add({
      name,
      icon: icon || null,
      ownerId: currentUser.uid,
      ownerName: displayName(currentUser),
      order: existing.size,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async getCharacters() {
    const snap = await firestore.collection('characters').get();
    return snap.docs.map(docToObj).sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  async reorderCharacters(orderedIds) {
    const batch = firestore.batch();
    orderedIds.forEach((id, i) => {
      batch.update(firestore.collection('characters').doc(id), { order: i });
    });
    await batch.commit();
  },

  async getCharacter(id) {
    const doc = await firestore.collection('characters').doc(id).get();
    return doc.exists ? docToObj(doc) : null;
  },

  async deleteCharacter(id) {
    const slotsSnap = await firestore.collection('slots').where('characterId', '==', id).get();
    const batch = firestore.batch();
    slotsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(firestore.collection('characters').doc(id));
    await batch.commit();
  },

  async addSlot({ characterId, title, images, parts, notes, category, claimedGameCapture }) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    const [existing, character] = await Promise.all([
      firestore.collection('slots').where('characterId', '==', characterId).get(),
      firestore.collection('characters').doc(characterId).get(),
    ]);
    const ref = await firestore.collection('slots').add({
      characterId,
      characterName: character.exists ? character.data().name : '',
      ownerId: currentUser.uid,
      ownerName: displayName(currentUser),
      title: (title || '').slice(0, 60),
      images: images || [],
      parts: parts || {},
      notes: (notes || '').slice(0, 200),
      category: SLOT_CATEGORIES.includes(category) ? category : SLOT_CATEGORIES[0],
      claimedGameCapture: !!claimedGameCapture,
      verifiedCapture: null, // admin's own verdict; see setCaptureVerdict
      order: existing.size,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  // The admin's ruling on whether a post really is an in-game capture.
  // Kept as a stored field rather than just acted on, so the accumulated
  // rulings become the labelled set a classifier can be built from later.
  async setCaptureVerdict(slotId, verdict) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('slots').doc(slotId).update({
      verifiedCapture: verdict,
      verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  async getSlotsByCharacter(characterId) {
    const snap = await firestore.collection('slots').where('characterId', '==', characterId).get();
    return snap.docs.map(docToObj).sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  async getAllSlots() {
    const snap = await firestore.collection('slots').orderBy('createdAt', 'desc').get();
    return snap.docs.map(docToObj);
  },

  // Just the newest post's timestamp (seconds), for the "new posts" badge.
  // Cheap by design: limit(1) instead of pulling every slot.
  async getLatestSlotTimestamp() {
    const snap = await firestore.collection('slots').orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) return null;
    const ts = snap.docs[0].data().createdAt;
    return ts ? ts.seconds : null;
  },

  async getSlot(id) {
    const doc = await firestore.collection('slots').doc(id).get();
    return doc.exists ? docToObj(doc) : null;
  },

  async updateSlot(id, changes) {
    await firestore.collection('slots').doc(id).update(changes);
  },

  async deleteSlot(id) {
    await firestore.collection('slots').doc(id).delete();
  },

  async reorderSlots(orderedIds) {
    const batch = firestore.batch();
    orderedIds.forEach((id, i) => {
      batch.update(firestore.collection('slots').doc(id), { order: i });
    });
    await batch.commit();
  },

  async isScrapped(slotId) {
    if (!currentUser) return false;
    const doc = await firestore.collection('scraps').doc(`${currentUser.uid}_${slotId}`).get();
    return doc.exists;
  },

  async addScrap(slotId) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    await firestore
      .collection('scraps')
      .doc(`${currentUser.uid}_${slotId}`)
      .set({
        userId: currentUser.uid,
        slotId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
  },

  async removeScrap(slotId) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    await firestore.collection('scraps').doc(`${currentUser.uid}_${slotId}`).delete();
  },

  async getScrappedSlots() {
    if (!currentUser) return [];
    const scrapsSnap = await firestore
      .collection('scraps')
      .where('userId', '==', currentUser.uid)
      .get();
    const slotIds = scrapsSnap.docs.map((d) => d.data().slotId);
    if (slotIds.length === 0) return [];

    const chunks = [];
    for (let i = 0; i < slotIds.length; i += 10) chunks.push(slotIds.slice(i, i + 10));
    const results = [];
    for (const chunk of chunks) {
      const snap = await firestore
        .collection('slots')
        .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      results.push(...snap.docs.map(docToObj));
    }
    return results;
  },

  async getMySlots() {
    if (!currentUser) return [];
    const snap = await firestore.collection('slots').where('ownerId', '==', currentUser.uid).get();
    return snap.docs.map(docToObj).sort((a, b) => {
      const at = a.createdAt ? a.createdAt.seconds : 0;
      const bt = b.createdAt ? b.createdAt.seconds : 0;
      return bt - at;
    });
  },

  async addReport(slotId, reason) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    await firestore.collection('reports').add({
      slotId,
      reporterId: currentUser.uid,
      reporterName: displayName(currentUser),
      reason: (reason || '').slice(0, 300),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  async getReports() {
    const snap = await firestore.collection('reports').orderBy('createdAt', 'desc').get();
    return snap.docs.map(docToObj);
  },

  async deleteReport(id) {
    await firestore.collection('reports').doc(id).delete();
  },

  async getUserProfile(uid) {
    const doc = await firestore.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
  },

  // Marks that this account has signed in. Only writes updatedAt, so it
  // stays inside what the Firestore rules let a user write about themselves.
  async touchUser() {
    if (!currentUser) return;
    await firestore
      .collection('users')
      .doc(currentUser.uid)
      .set({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  },

  async countUsers() {
    const snap = await firestore.collection('users').get();
    return snap.size;
  },

  async setUserPhoto(photoURL) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    await firestore
      .collection('users')
      .doc(currentUser.uid)
      .set(
        { photoURL, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
  },

  async setNickname(nickname) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    await firestore
      .collection('users')
      .doc(currentUser.uid)
      .set(
        { nickname, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
  },

  // Adds one warning ("yellow card") to a user and auto-blocks them once
  // they reach 3. Returns the resulting warning count.
  async warnUser(uid) {
    const ref = firestore.collection('users').doc(uid);
    const newCount = await firestore.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const current = (doc.exists && doc.data().warningCount) || 0;
      const next = current + 1;
      tx.set(ref, { warningCount: next }, { merge: true });
      return next;
    });
    if (newCount >= 3) {
      await DB.blockUser(uid);
    }
    return newCount;
  },

  // Blocks a user (they can no longer create posts, enforced by the
  // Firestore rules on `slots`) and deletes every post they've made.
  async blockUser(uid) {
    await firestore
      .collection('users')
      .doc(uid)
      .set(
        { blocked: true, blockedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    const slotsSnap = await firestore.collection('slots').where('ownerId', '==', uid).get();
    const batch = firestore.batch();
    slotsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  },
};

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

updateFaviconBadge();
