/**
 * Offline drafts: save articles/MCQs/flashcards to IndexedDB when offline,
 * auto-sync when back online.
 */

const DB_NAME = "ompath_offline";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

export interface OfflineDraft {
  id: string;
  type: "article" | "mcqs" | "flashcards" | "story";
  title: string;
  content: string;
  category: string;
  created_at: string;
  synced: boolean;
  payload: Record<string, any>; // full payload for upload
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("synced", "synced", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft(draft: OfflineDraft): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDrafts(): Promise<OfflineDraft[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getUnsyncedDrafts(): Promise<OfflineDraft[]> {
  const all = await getDrafts();
  return all.filter(d => !d.synced);
}

export async function markSynced(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) {
        req.result.synced = true;
        store.put(req.result);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Sync all unsynced drafts when online */
export async function syncDrafts(
  uploadFn: (draft: OfflineDraft) => Promise<void>
): Promise<{ synced: number; failed: number }> {
  const unsynced = await getUnsyncedDrafts();
  let synced = 0, failed = 0;
  for (const draft of unsynced) {
    try {
      await uploadFn(draft);
      await markSynced(draft.id);
      synced++;
    } catch {
      failed++;
    }
  }
  return { synced, failed };
}
