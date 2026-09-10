/* ── db.js ────────────────────────────────────────────────────────────────────
   Firestore 접근을 전부 모아둔 계층. 화면 코드는 여기를 통해서만 DB를 만집니다.

   컬렉션 구조는 바로 아래 주석에 정리돼 있습니다. 읽을 때 알아두면 좋은 것:

   - 함수 안의 isAdmin() 검사는 "실수 방지"용입니다. 진짜 방어선은
     firestore.rules 이고, 브라우저 코드는 얼마든지 우회될 수 있습니다.
   - verifiedCapture : 관리자의 최종 판정. auto* 필드보다 항상 우선합니다.
   - auto* 필드      : 자동 검토(AI)가 쓴 값. 관리자가 판정하면 무시됩니다.
   - translations    : 번역 캐시이자 관리자가 고치는 번역 사전. 같은 문서입니다.
   ────────────────────────────────────────────────────────────────────────── */

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

// Firestore 문서를 { id, ...필드 } 형태의 평범한 객체로 바꿔줍니다.
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

  // 학습 예시 추가. label = 탭 분류, capture = 인게임/외부.
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

  // 이 이미지로 만든 학습 예시의 탭 분류를 함께 고칩니다. 검토 내역에서 분류를
  // 바꿨을 때 학습 예시가 옛 분류로 남아 있으면 다음 판정이 어긋납니다.
  async setTrainingLabelByUrl(url, label) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    const snap = await firestore
      .collection('trainingSamples')
      .where('url', '==', url)
      .limit(1)
      .get();
    if (snap.empty) return false;
    await snap.docs[0].ref.update({ label });
    return true;
  },

  // 학습 예시 전체를 최신순으로.
  async getTrainingSamples() {
    const snap = await firestore
      .collection('trainingSamples')
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(docToObj);
  },

  // The browser already embeds every sample to run its own test; storing the
  // vector means the serverless reviewer can skip that work entirely.
  async saveSampleEmbedding(id, embedding) {
    if (!isAdmin()) return;
    await firestore.collection('trainingSamples').doc(id).update({ embedding });
  },

  // 예시의 분류나 인게임 여부를 고칩니다 (목록에서 바로 수정할 때).
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

  // 예시 삭제.
  async deleteTrainingSample(id) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('trainingSamples').doc(id).delete();
  },

  // Same verdict, but written by the post's own author right after posting,
  // so a new post is judged in seconds instead of waiting for the admin to
  // visit. The author could in principle lie here - the rules only check
  // ownership - but the admin's ruling always overrides, and the admin's
  // sweep re-checks anything suspicious.
  // ponytail: trust ceiling of running this client-side; move to a Vercel
  // function if that ever matters.
  async setAutoFlagSelf(slotId, flagged, confidence, similarity) {
    if (!currentUser) return;
    await firestore.collection('slots').doc(slotId).update({
      autoChecked: true,
      autoFlag: !!flagged,
      autoConfidence: confidence,
      autoSimilarity: similarity === undefined ? null : similarity,
      autoBy: 'owner',
      autoCheckedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  // Auto-review verdict on one post. Written by the admin's browser only -
  // there is no server, so the classifier runs where the admin is.
  async setAutoFlag(slotId, flagged, confidence, similarity) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('slots').doc(slotId).update({
      autoChecked: true,
      autoFlag: !!flagged,
      autoConfidence: confidence,
      autoSimilarity: similarity === undefined ? null : similarity,
      autoCheckedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  // Translation cache, doubling as the editable dictionary. Written by the
  // serverless translator; the admin edits the same documents to override a
  // machine translation permanently (see dict-panel.js).
  async getTranslations(target) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    const snap = await firestore
      .collection('translations')
      .where('target', '==', target)
      .get();
    return snap.docs
      .map(docToObj)
      .sort((a, b) => (a.source || '').localeCompare(b.source || '', 'ko'));
  },

  // 번역 하나를 저장/수정. locked = 관리자가 직접 고친 값.
  async setTranslation(id, fields) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('translations').doc(id).set(fields, { merge: true });
  },

  // 번역 삭제. 다음에 그 문구가 나오면 다시 기계번역됩니다.
  async deleteTranslation(id) {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore.collection('translations').doc(id).delete();
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

  // 자동 삭제 보관함 목록.
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

  // 3일 자동 숨김 테스트 시작.
  async startAutoModerationTrial() {
    if (!isAdmin()) throw new Error('관리자만 가능합니다.');
    await firestore
      .collection('config')
      .doc('autoModeration')
      .set({ trialStartedAt: firebase.firestore.FieldValue.serverTimestamp() });
  },

  // 자동 삭제 켜기.
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

  // 자동 삭제 끄기.
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

  // 캐릭터 추가 (관리자).
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

  // 캐릭터 목록을 정해진 순서대로.
  async getCharacters() {
    const snap = await firestore.collection('characters').get();
    return snap.docs.map(docToObj).sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  // 캐릭터 순서 저장 (드래그로 바꾼 뒤).
  async reorderCharacters(orderedIds) {
    const batch = firestore.batch();
    orderedIds.forEach((id, i) => {
      batch.update(firestore.collection('characters').doc(id), { order: i });
    });
    await batch.commit();
  },

  // 캐릭터 한 명.
  async getCharacter(id) {
    const doc = await firestore.collection('characters').doc(id).get();
    return doc.exists ? docToObj(doc) : null;
  },

  // 캐릭터와 그 캐릭터의 게시글을 함께 삭제.
  async deleteCharacter(id) {
    const slotsSnap = await firestore.collection('slots').where('characterId', '==', id).get();
    const batch = firestore.batch();
    slotsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(firestore.collection('characters').doc(id));
    await batch.commit();
  },

  // 게시글 등록. verifiedCapture 는 반드시 null 로 시작합니다(관리자만 정할 수 있는 값).
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

  // 캐릭터별 게시글.
  async getSlotsByCharacter(characterId) {
    const snap = await firestore.collection('slots').where('characterId', '==', characterId).get();
    return snap.docs.map(docToObj).sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  // 전체 게시글을 최신순으로.
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

  // 게시글 하나.
  async getSlot(id) {
    const doc = await firestore.collection('slots').doc(id).get();
    return doc.exists ? docToObj(doc) : null;
  },

  // 게시글 수정.
  async updateSlot(id, changes) {
    await firestore.collection('slots').doc(id).update(changes);
  },

  // 게시글 삭제.
  async deleteSlot(id) {
    await firestore.collection('slots').doc(id).delete();
  },

  // 게시글 순서 저장.
  async reorderSlots(orderedIds) {
    const batch = firestore.batch();
    orderedIds.forEach((id, i) => {
      batch.update(firestore.collection('slots').doc(id), { order: i });
    });
    await batch.commit();
  },

  // 이 게시글을 내가 스크랩했는지.
  async isScrapped(slotId) {
    if (!currentUser) return false;
    const doc = await firestore.collection('scraps').doc(`${currentUser.uid}_${slotId}`).get();
    return doc.exists;
  },

  // 스크랩 추가. 문서 번호를 "내아이디_게시글아이디"로 만들어 중복을 막습니다.
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

  // 스크랩 취소.
  async removeScrap(slotId) {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    await firestore.collection('scraps').doc(`${currentUser.uid}_${slotId}`).delete();
  },

  // 내가 스크랩한 게시글들.
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

  // 내가 쓴 게시글들.
  async getMySlots() {
    if (!currentUser) return [];
    const snap = await firestore.collection('slots').where('ownerId', '==', currentUser.uid).get();
    return snap.docs.map(docToObj).sort((a, b) => {
      const at = a.createdAt ? a.createdAt.seconds : 0;
      const bt = b.createdAt ? b.createdAt.seconds : 0;
      return bt - at;
    });
  },

  // 신고 접수.
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

  // 신고 목록 (관리자).
  async getReports() {
    const snap = await firestore.collection('reports').orderBy('createdAt', 'desc').get();
    return snap.docs.map(docToObj);
  },

  // 신고 기록 삭제.
  async deleteReport(id) {
    await firestore.collection('reports').doc(id).delete();
  },

  // 이용자 프로필(닉네임·사진).
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

  // 가입 이용자 수.
  async countUsers() {
    const snap = await firestore.collection('users').get();
    return snap.size;
  },

  // 프로필 사진 변경.
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

  // 닉네임 변경.
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

// 파일을 미리보기용 data URL 로 읽습니다.
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

updateFaviconBadge();
