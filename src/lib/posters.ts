import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from './firebase';
import { compressImageFile } from './ai';
import { dataUrlToBlob } from './download';

const WORKER_URL = 'https://iesa-ai.cadupaulino99.workers.dev';

export const POSTER_MAX_BYTES = 10 * 1024 * 1024;
export const POSTER_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const STORAGE_TIMEOUT_MS = 12_000;

export interface PosterUploadResult {
  posterUrl?: string | null;
  posterPath?: string | null;
  posterThumbPath?: string | null;
  key?: string | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} esgotou o tempo (${Math.round(ms / 1000)}s).`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function extFromName(name: string): string | null {
  const m = String(name || '').toLowerCase().match(/\.(jpe?g|png|webp)$/);
  if (!m) return null;
  return m[1] === 'jpeg' ? 'jpg' : m[1];
}

export function validatePosterFile(file: File): string | null {
  const type = (file.type || '').toLowerCase();
  const byType = !!POSTER_TYPES[type];
  const byName = !!extFromName(file.name);
  if (!byType && !byName) return 'Formato não aceite — use JPG, PNG ou WEBP.';
  if (file.size > POSTER_MAX_BYTES) {
    return `Ficheiro demasiado grande (${(file.size / 1048576).toFixed(1)} MB) — máximo 10 MB.`;
  }
  if (file.size < 32) return 'Ficheiro de imagem inválido ou vazio.';
  return null;
}

function friendlyStorageError(err: unknown): string {
  const m = String((err as any)?.code || (err as any)?.message || err || '');
  if (/esgotou o tempo|timeout/i.test(m)) return m;
  if (/R2_NOT_CONFIGURED|R2 não/i.test(m)) {
    return 'Cloudflare R2 ainda não está configurado. Crie o bucket «iesa-event-posters» e faça deploy do Worker.';
  }
  if (/storage\/unauthorized|permission-denied|PERMISSION_DENIED/i.test(m)) {
    return 'Sem permissão no armazenamento de ficheiros.';
  }
  if (/bucket|not exist|404|storage\/bucket-not-found/i.test(m)) {
    return 'Armazenamento de ficheiros indisponível (Firebase Storage ou R2).';
  }
  if (/network|Failed to fetch/i.test(m)) return 'Falha de rede ao enviar o cartaz. Tente novamente.';
  return m || 'Falha desconhecida no carregamento do cartaz.';
}

async function fileToJpegBlob(file: File, max: number, quality: number): Promise<Blob> {
  try {
    const compressed = await compressImageFile(file, { max, quality });
    const blob = dataUrlToBlob(`data:image/jpeg;base64,${compressed.base64}`);
    if (blob.size > 64) return blob;
  } catch { /* fallback */ }
  if (file.type && file.type.startsWith('image/')) return file;
  return new Blob([await file.arrayBuffer()], { type: 'image/jpeg' });
}

/** Upload preferencial: Cloudflare Worker → R2. */
export async function uploadPosterToR2(
  file: File,
  eventId?: string,
): Promise<PosterUploadResult> {
  const err = validatePosterFile(file);
  if (err) throw new Error(err);
  if (!WORKER_URL) throw new Error('WORKER_URL não configurado.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sessão terminada — entre novamente.');
  const idToken = await user.getIdToken();

  const blob = await withTimeout(fileToJpegBlob(file, 1600, 0.82), 15_000, 'Processamento da imagem');
  const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
  let res: Response;
  try {
    res = await withTimeout(
      fetch(`${WORKER_URL}/admin/upload-poster${qs}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'image/jpeg',
        },
        body: blob,
      }),
      STORAGE_TIMEOUT_MS,
      'Upload do cartaz (R2)',
    );
  } catch (e: any) {
    const m = String(e?.message || e || '');
    if (/Failed to fetch|NetworkError|Load failed|esgotou o tempo/i.test(m)) {
      throw new Error(
        'Não foi possível contactar o Worker (rede/CORS). Confirme https://iesa-ai.cadupaulino99.workers.dev/__health e o binding R2 POSTERS_BUCKET.',
      );
    }
    throw e;
  }
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(data?.error || data?.code || `Erro ${res.status} no upload R2`);
  }
  return {
    posterUrl: data.posterUrl as string,
    key: data.key as string,
    posterPath: null,
    posterThumbPath: null,
  };
}

async function uploadEventPosterFirebase(id: string, file: File): Promise<PosterUploadResult> {
  const err = validatePosterFile(file);
  if (err) throw new Error(err);
  const posterPath = `posters/${id}.jpg`;
  const posterThumbPath = `posters/thumbs/${id}.jpg`;
  const bigBlob = await withTimeout(fileToJpegBlob(file, 1600, 0.82), 15_000, 'Processamento');
  await withTimeout(
    uploadBytes(ref(storage, posterPath), bigBlob, { contentType: 'image/jpeg' }),
    STORAGE_TIMEOUT_MS,
    'Upload Firebase',
  );
  try {
    const thumbBlob = await fileToJpegBlob(file, 400, 0.7);
    await withTimeout(
      uploadBytes(ref(storage, posterThumbPath), thumbBlob, { contentType: 'image/jpeg' }),
      STORAGE_TIMEOUT_MS,
      'Thumb Firebase',
    );
  } catch {
    return { posterPath, posterThumbPath: posterPath };
  }
  return { posterPath, posterThumbPath };
}

/** Tenta R2 (Worker); se indisponível, tenta Firebase Storage. */
export async function uploadEventPoster(id: string, file: File): Promise<PosterUploadResult> {
  try {
    return await uploadPosterToR2(file, id);
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (/R2|503|não está configurado|não configurado/i.test(msg)) {
      try {
        return await uploadEventPosterFirebase(id, file);
      } catch (e2) {
        throw new Error(
          friendlyStorageError(e2) +
            ' · Active o Cloudflare R2 (bucket iesa-event-posters) e faça deploy do Worker.',
        );
      }
    }
    throw new Error(friendlyStorageError(e));
  }
}

export async function posterUrl(path: string): Promise<string> {
  const p = String(path || '').trim();
  if (!p) throw new Error('caminho vazio');
  if (/^https?:\/\//i.test(p)) return p;
  const clean = p.replace(/^\/+/, '');
  return withTimeout(getDownloadURL(ref(storage, clean)), STORAGE_TIMEOUT_MS, 'Download do cartaz');
}

export async function resolvePosterUrl(
  ...candidates: (string | null | undefined)[]
): Promise<string | null> {
  for (const c of candidates) {
    if (!c) continue;
    try {
      return await posterUrl(c);
    } catch { /* next */ }
  }
  return null;
}

export async function deleteEventPoster(paths: (string | null | undefined)[]): Promise<void> {
  await Promise.all(
    paths.filter(Boolean).map((p) => {
      const s = String(p);
      if (/^https?:\/\//i.test(s)) return Promise.resolve();
      return withTimeout(deleteObject(ref(storage, s)), 8_000, 'Apagar').catch(() => {});
    }),
  );
}

/** Teste R2 via Worker. */
export async function testStorageActive(): Promise<{ ok: boolean; detail: string }> {
  try {
    const b64 =
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'health.jpg', { type: 'image/jpeg' });
    const up = await uploadPosterToR2(file, 'health');
    return { ok: true, detail: `R2 activo. Teste OK (${up.posterUrl}).` };
  } catch (e) {
    return { ok: false, detail: friendlyStorageError(e) };
  }
}
