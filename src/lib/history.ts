"use client";

export type HistorySummary = {
  operator: string | null;
  technology: string | null;
  downloadBytes: number | null;
  durationS: number;
  routePoints: number;
  startUtc: string;
};

export type HistoryMeta = {
  id: string;
  name: string;
  size: number;
  createdAt: number;
  openedAt: number;
  summary: HistorySummary;
};

const DB = "tems-lab";
const META = "meta";
const BLOBS = "blobs";
const MAX_FILES = 20;
const MAX_BYTES = 500 * 1024 * 1024;

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, body: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out: T;
    Promise.resolve(body(t)).then((v) => (out = v)).catch(reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function fileId(data: ArrayBuffer, name: string, size: number): Promise<string> {
  try {
    if (crypto?.subtle) {
      const h = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {}
  const bytes = new Uint8Array(data);
  let h = 5381;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) h = (h * 33) ^ bytes[i];
  return `f${size}-${(h >>> 0).toString(16)}-${name.length}`;
}

export async function requestPersist(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {}
}

export async function listMeta(): Promise<HistoryMeta[]> {
  if (!available()) return [];
  try {
    const db = await openDb();
    const all = await tx(db, [META], "readonly", (t) => reqP(t.objectStore(META).getAll() as IDBRequest<HistoryMeta[]>));
    db.close();
    return all.sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export async function getData(id: string): Promise<ArrayBuffer | null> {
  if (!available()) return null;
  try {
    const db = await openDb();
    const data = await tx(db, [BLOBS], "readonly", (t) => reqP(t.objectStore(BLOBS).get(id) as IDBRequest<ArrayBuffer | undefined>));
    db.close();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function touch(id: string): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    await tx(db, [META], "readwrite", async (t) => {
      const s = t.objectStore(META);
      const m = await reqP(s.get(id) as IDBRequest<HistoryMeta | undefined>);
      if (m) {
        m.openedAt = Date.now();
        s.put(m);
      }
    });
    db.close();
  } catch {}
}

export async function saveFile(data: ArrayBuffer, name: string, summary: HistorySummary): Promise<HistoryMeta | null> {
  if (!available()) return null;
  try {
    const size = data.byteLength;
    const id = await fileId(data, name, size);
    const now = Date.now();
    const db = await openDb();
    const meta = await tx(db, [META, BLOBS], "readwrite", async (t) => {
      const ms = t.objectStore(META);
      const existing = await reqP(ms.get(id) as IDBRequest<HistoryMeta | undefined>);
      const m: HistoryMeta = existing
        ? { ...existing, name, size, openedAt: now, summary }
        : { id, name, size, createdAt: now, openedAt: now, summary };
      ms.put(m);
      if (!existing) t.objectStore(BLOBS).put(data, id);
      return m;
    });
    db.close();
    await evict();
    return meta;
  } catch {
    return null;
  }
}

export async function deleteFile(id: string): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    await tx(db, [META, BLOBS], "readwrite", (t) => {
      t.objectStore(META).delete(id);
      t.objectStore(BLOBS).delete(id);
    });
    db.close();
  } catch {}
}

export async function clearAll(): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    await tx(db, [META, BLOBS], "readwrite", (t) => {
      t.objectStore(META).clear();
      t.objectStore(BLOBS).clear();
    });
    db.close();
  } catch {}
}

export async function purgeExpired(maxAgeMs: number): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  const metas = await listMeta();
  for (const m of metas) if (m.createdAt < cutoff) await deleteFile(m.id);
}

async function evict(): Promise<void> {
  const metas = await listMeta();
  let total = metas.reduce((n, m) => n + m.size, 0);
  const byAge = [...metas].sort((a, b) => a.openedAt - b.openedAt);
  let count = metas.length;
  for (const m of byAge) {
    if (count <= MAX_FILES && total <= MAX_BYTES) break;
    await deleteFile(m.id);
    total -= m.size;
    count--;
  }
}
