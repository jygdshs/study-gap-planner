// 같은 PDF 기억: 올린 문제 PDF를 이 브라우저(IndexedDB)에 저장해 두고 다음엔 목록에서 고르기만 한다.
//  - 서버나 다른 기기로는 가지 않는다. 브라우저 데이터를 지우면 같이 사라진다.
//  - 최근 MAX_FILES개까지만 두고 오래된 것부터 지운다.
//  - 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)에서는 조용히 넘어간다 — 기억만 안 될 뿐 분석은 된다.

const DB_NAME = "study-app";
const STORE = "pdfs";
const MAX_FILES = 8;

export interface StoredPdfMeta {
  name: string;
  size: number;
  pageCount: number;
  savedAt: number;
}
interface StoredPdf extends StoredPdfMeta {
  bytes: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "name" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function listPdfs(): Promise<StoredPdfMeta[]> {
  try {
    const all = await withStore<StoredPdf[]>("readonly", (s) => s.getAll() as IDBRequest<StoredPdf[]>);
    return all
      .map(({ name, size, pageCount, savedAt }) => ({ name, size, pageCount, savedAt }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function getPdf(name: string): Promise<Uint8Array | null> {
  try {
    const row = await withStore<StoredPdf | undefined>("readonly", (s) => s.get(name) as IDBRequest<StoredPdf | undefined>);
    if (!row) return null;
    // 고른 PDF는 최근에 쓴 것으로 올린다
    await savePdf(name, new Uint8Array(row.bytes), row.pageCount);
    return new Uint8Array(row.bytes);
  } catch {
    return null;
  }
}

export async function savePdf(name: string, bytes: Uint8Array, pageCount: number): Promise<void> {
  try {
    const copy = bytes.slice().buffer as ArrayBuffer;
    await withStore("readwrite", (s) => s.put({ name, size: bytes.length, pageCount, savedAt: Date.now(), bytes: copy }));
    const list = await listPdfs();
    for (const old of list.slice(MAX_FILES)) await removePdf(old.name);
  } catch {
    // 저장소를 못 쓰면 기억하지 않는다
  }
}

export async function removePdf(name: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(name));
  } catch {
    // 무시
  }
}
