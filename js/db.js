// Firestore-backed data layer for Closers Showcase.
// Collections:
//   characters: { name, icon(Cloudinary URL), ownerId, ownerName, createdAt }
//   slots:      { characterId, ownerId, title, images[](max 10), description, order, createdAt }

function docToObj(doc) {
  return { id: doc.id, ...doc.data() };
}

const DB = {
  async addCharacter({ name, icon }) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    const ref = await firestore.collection('characters').add({
      name,
      icon: icon || null,
      ownerId: currentUser.uid,
      ownerName: currentUser.displayName || currentUser.email || '사용자',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async getCharacters() {
    const snap = await firestore.collection('characters').orderBy('createdAt', 'desc').get();
    return snap.docs.map(docToObj);
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

  async addSlot({ characterId, title, images, description }) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    const existing = await firestore
      .collection('slots')
      .where('characterId', '==', characterId)
      .get();
    const ref = await firestore.collection('slots').add({
      characterId,
      ownerId: currentUser.uid,
      ownerName: currentUser.displayName || currentUser.email || '사용자',
      title: title || '',
      images: images || [],
      description: description || '',
      order: existing.size,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async getSlotsByCharacter(characterId) {
    const snap = await firestore.collection('slots').where('characterId', '==', characterId).get();
    return snap.docs.map(docToObj).sort((a, b) => (a.order || 0) - (b.order || 0));
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
};

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
