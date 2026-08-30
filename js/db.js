// IndexedDB wrapper for Closers Showcase
// Stores: characters {id, name, icon(dataURL), order}
//         slots {id, characterId, title, images: [dataURL...] (max 10), description, order}

const DB_NAME = 'closers-showcase';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('characters')) {
        const store = db.createObjectStore('characters', { keyPath: 'id', autoIncrement: true });
        store.createIndex('order', 'order');
      }
      if (!db.objectStoreNames.contains('slots')) {
        const store = db.createObjectStore('slots', { keyPath: 'id', autoIncrement: true });
        store.createIndex('characterId', 'characterId');
        store.createIndex('order', 'order');
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async addCharacter({ name, icon }) {
    const store = await tx('characters', 'readwrite');
    const count = await reqToPromise(store.count());
    return reqToPromise(store.add({ name, icon, order: count }));
  },

  async getCharacters() {
    const store = await tx('characters', 'readonly');
    const all = await reqToPromise(store.getAll());
    return all.sort((a, b) => a.order - b.order);
  },

  async getCharacter(id) {
    const store = await tx('characters', 'readonly');
    return reqToPromise(store.get(id));
  },

  async reorderCharacters(orderedIds) {
    const store = await tx('characters', 'readwrite');
    for (let i = 0; i < orderedIds.length; i++) {
      const rec = await reqToPromise(store.get(orderedIds[i]));
      if (!rec) continue;
      rec.order = i;
      await reqToPromise(store.put(rec));
    }
  },

  async deleteCharacter(id) {
    const slotStore = await tx('slots', 'readwrite');
    const idx = slotStore.index('characterId');
    const slots = await reqToPromise(idx.getAll(IDBKeyRange.only(id)));
    await Promise.all(slots.map((s) => reqToPromise(slotStore.delete(s.id))));
    const charStore = await tx('characters', 'readwrite');
    return reqToPromise(charStore.delete(id));
  },

  async addSlot({ characterId, title, images, description }) {
    const store = await tx('slots', 'readwrite');
    const idx = store.index('characterId');
    const existing = await reqToPromise(idx.getAll(IDBKeyRange.only(characterId)));
    return reqToPromise(
      store.add({
        characterId,
        title: title || '',
        images: images || [],
        description: description || '',
        order: existing.length,
      })
    );
  },

  async getSlotsByCharacter(characterId) {
    const store = await tx('slots', 'readonly');
    const idx = store.index('characterId');
    const all = await reqToPromise(idx.getAll(IDBKeyRange.only(characterId)));
    return all.sort((a, b) => a.order - b.order);
  },

  async getSlot(id) {
    const store = await tx('slots', 'readonly');
    return reqToPromise(store.get(id));
  },

  async updateSlot(id, changes) {
    const store = await tx('slots', 'readwrite');
    const slot = await reqToPromise(store.get(id));
    if (!slot) return;
    Object.assign(slot, changes);
    return reqToPromise(store.put(slot));
  },

  async reorderSlots(orderedIds) {
    const store = await tx('slots', 'readwrite');
    for (let i = 0; i < orderedIds.length; i++) {
      const rec = await reqToPromise(store.get(orderedIds[i]));
      if (!rec) continue;
      rec.order = i;
      await reqToPromise(store.put(rec));
    }
  },

  async deleteSlot(id) {
    const store = await tx('slots', 'readwrite');
    return reqToPromise(store.delete(id));
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
