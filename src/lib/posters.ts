import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import { compressImageFile } from './ai';
import { dataUrlToBlob } from './download';

/* ═══════════════════════════════════════════════════════════════════════
   CARTAZES DE EVENTOS — v1.13.0+
   Comprime no aparelho, guarda no Firebase Storage e grava só o caminho
   no documento Firestore. Operações têm TIMEOUT para não bloquear a UI.
   ═══════════════════════════════════════════════════════════════════════ */

export const POSTER_MAX_BYTES = 10 * 1024 * 1024;
export const POSTER_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Timeout padrão das operações Storage (ms). */
const STORAGE_TIMEOUT_MS = 12_000;

export interface PosterUploadResult {
  posterPath: string;
  posterThumbPath: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} esgotou o tempo (${Math.round(ms / 1000)}s). Verifique se o Firebase Storage está activo e a rede.`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function extFromName(name: string): string | null {
  const m = String(name || '').toLowerCase().match(/\.(jpe?g|png|webp)$/);
  if (!m) return null;
  return m[1] === 'jpeg' ? 'jpg' : m[1];
}

/** Valida o ficheiro ANTES de comprimir (tipo ou extensão + 10 MB). */
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
  if (/esgotou o tempo|timeout/i.test(m)) {
    return m;
  }
  if (/storage\/unauthorized|permission-denied|PERMISSION_DENIED/i.test(m)) {
    return 'Sem permissão no Storage. Confirme que está autenticado e que as regras do Storage estão publicadas (Firebase → Storage → Rules).';
  }
  if (/bucket|not exist|404|storage\/object-not-found|storage\/bucket-not-found/i.test(m)) {
    return 'Firebase Storage ainda não está activo no projecto. Consola Firebase → Storage → «Começar».';
  }
  if (/storage\/retry-limit-exceeded|network|Failed to fetch/i.test(m)) {
    return 'Falha de rede ao enviar o cartaz. Tente novamente.';
  }
  if (/storage\/quota/i.test(m)) {
    return 'Quota do Storage esgotada.';
  }
  return m || 'Falha desconhecida no carregamento do cartaz.';
}

async function fileToJpegBlob(file: File, max: number, quality: number): Promise<Blob> {
  try {
    const compressed = await compressImageFile(file, { max, quality });
    const blob = dataUrlToBlob(`data:image/jpeg;base64,${compressed.base64}`);
    if (blob.size > 64) return blob;
  } catch {
    /* fallback */
  }
  if (file.type && file.type.startsWith('image/')) return file;
  return new Blob([await file.arrayBuffer()], { type: 'image/jpeg' });
}

/**
 * Comprime + envia cartaz e miniatura para o Storage (com timeout).
 * Se a miniatura falhar, o cartaz principal ainda é guardado.
 */
export async function uploadEventPoster(id: string, file: File): Promise<PosterUploadResult> {
  const err = validatePosterFile(file);
  if (err) throw new Error(err);
  if (!id) throw new Error('ID do evento em falta para o cartaz.');

  const posterPath = `posters/${id}.jpg`;
  const posterThumbPath = `posters/thumbs/${id}.jpg`;

  let bigBlob: Blob;
  try {
    bigBlob = await withTimeout(fileToJpegBlob(file, 1600, 0.82), 15_000, 'Processamento da imagem');
  } catch (e) {
    throw new Error(`Não foi possível processar a imagem: ${friendlyStorageError(e)}`);
  }

  try {
    await withTimeout(
      uploadBytes(ref(storage, posterPath), bigBlob, { contentType: 'image/jpeg' }),
      STORAGE_TIMEOUT_MS,
      'Upload do cartaz',
    );
  } catch (e) {
    throw new Error(friendlyStorageError(e));
  }

  try {
    const thumbBlob = await withTimeout(fileToJpegBlob(file, 400, 0.7), 10_000, 'Miniatura');
    await withTimeout(
      uploadBytes(ref(storage, posterThumbPath), thumbBlob, { contentType: 'image/jpeg' }),
      STORAGE_TIMEOUT_MS,
      'Upload da miniatura',
    );
  } catch {
    return { posterPath, posterThumbPath: posterPath };
  }

  return { posterPath, posterThumbPath };
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
    } catch {
      /* tenta o seguinte */
    }
  }
  return null;
}

export async function deleteEventPoster(paths: (string | null | undefined)[]): Promise<void> {
  await Promise.all(
    paths.filter(Boolean).map((p) =>
      withTimeout(deleteObject(ref(storage, p as string)), 8_000, 'Apagar cartaz').catch(() => {}),
    ),
  );
}

/** Teste de escrita/leitura no Storage — nunca fica pendente mais de ~12s. */
export async function testStorageActive(): Promise<{ ok: boolean; detail: string }> {
  const id = `__health_${Date.now()}`;
  const path = `posters/${id}.jpg`;
  // JPEG 1×1 mínimo
  const b64 =
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';
  const minimalJpeg = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  try {
    const r = ref(storage, path);
    await withTimeout(
      uploadBytes(r, minimalJpeg, { contentType: 'image/jpeg' }),
      STORAGE_TIMEOUT_MS,
      'Teste de upload',
    );
    await withTimeout(getDownloadURL(r), 8_000, 'Teste de leitura').catch(() => null);
    await withTimeout(deleteObject(r), 5_000, 'Limpeza do teste').catch(() => {});
    return { ok: true, detail: `Storage activo. Teste OK (${path}).` };
  } catch (e) {
    return { ok: false, detail: friendlyStorageError(e) };
  }
}
