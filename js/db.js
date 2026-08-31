// Firestore-backed data layer for Closers Showcase.
// Collections:
//   characters: { name, icon(Cloudinary URL), ownerId, ownerName, order, createdAt }
//   slots:      { characterId, characterName, ownerId, ownerName, title, images[](max 10),
//                 parts: {...costume/accessory keys}, notes(<=200 chars),
//                 order, createdAt }
//   scraps:     { userId, slotId, createdAt } - doc id is `${userId}_${slotId}`
//   reports:    { slotId, reporterId, reporterName, reason, createdAt }

function docToObj(doc) {
  return { id: doc.id, ...doc.data() };
}

const DB = {
  async addCharacter({ name, icon }) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    const existing = await firestore.collection('characters').get();
    const ref = await firestore.collection('characters').add({
      name,
      icon: icon || null,
      ownerId: currentUser.uid,
      ownerName: currentUser.displayName || currentUser.email || '사용자',
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

  async addSlot({ characterId, title, images, parts, notes }) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    const [existing, character] = await Promise.all([
      firestore.collection('slots').where('characterId', '==', characterId).get(),
      firestore.collection('characters').doc(characterId).get(),
    ]);
    const ref = await firestore.collection('slots').add({
      characterId,
      characterName: character.exists ? character.data().name : '',
      ownerId: currentUser.uid,
      ownerName: currentUser.displayName || currentUser.email || '사용자',
      title: (title || '').slice(0, 60),
      images: images || [],
      parts: parts || {},
      notes: (notes || '').slice(0, 200),
      order: existing.size,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async getSlotsByCharacter(characterId) {
    const snap = await firestore.collection('slots').where('characterId', '==', characterId).get();
    return snap.docs.map(docToObj).sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  async getAllSlots() {
    const snap = await firestore.collection('slots').orderBy('createdAt', 'desc').get();
    return snap.docs.map(docToObj);
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
      reporterName: currentUser.displayName || currentUser.email || '사용자',
      reason: (reason || '').slice(0, 300),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
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
