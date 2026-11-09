import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import { compressImageFile } from './ai';
import { dataUrlToBlob } from './download';

/* ═══════════════════════════════════════════════════════════════════════
   CARTAZES DE EVENTOS — v1.13.0
   Mesmas regras definidas para imagens: comprimir no aparelho (1600 px,
   qualidade ~80%), aceitar JPG/PNG/WEBP, rejeitar > 10 MB, guardar como
   FICHEIRO (Firebase Storage) e gravar só o CAMINHO no documento, com
   miniatura. Nunca base64 na base de dados. As imagens exigem sessão
   iniciada (storage.rules).
   ═══════════════════════════════════════════════════════════════════════ */

export const POSTER_MAX_BYTES = 10 * 1024 * 1024;
export const POSTER_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface PosterUploadResult {
  posterPath: string;      // posters/<id>.<ext>
  posterThumbPath: string; // posters/thumbs/<id>.<ext>
}

/** Valida o ficheiro ANTES de comprimir (tipo + 10 MB). */
export function validatePosterFile(file: File): string | null {
  if (!POSTER_TYPES[file.type]) return 'Formato não aceite — use JPG, PNG ou WEBP.';
  if (file.size > POSTER_MAX_BYTES) return `Ficheiro demasiado grande (${(file.size / 1048576).toFixed(1)} MB) — máximo 10 MB.`;
  return null;
}

/**
 * Comprime (1600 px, q0.8) + miniatura (400 px, q0.7) e envia para o Storage.
 * `id` = id do evento (o documento guarda só os caminhos).
 */
export async function uploadEventPoster(id: string, file: File): Promise<PosterUploadResult> {
  const err = validatePosterFile(file);
  if (err) throw new Error(err);

  const big = await compressImageFile(file, { max: 1600, quality: 0.8 });
  const thumb = await compressImageFile(file, { max: 400, quality: 0.7 });
  // Sempre JPEG no Storage (compressão canvas → image/jpeg)
  const mime = 'image/jpeg';
  const ext = 'jpg';

  const posterPath = `posters/${id}.${ext}`;
  const posterThumbPath = `posters/thumbs/${id}.${ext}`;
  const bigBlob = dataUrlToBlob(`data:${mime};base64,${big.base64}`);
  const thumbBlob = dataUrlToBlob(`data:${mime};base64,${thumb.base64}`);
  await uploadBytes(ref(storage, posterPath), bigBlob, { contentType: mime });
  await uploadBytes(ref(storage, posterThumbPath), thumbBlob, { contentType: mime });
  return { posterPath, posterThumbPath };
}

/** URL de apresentação (exige sessão; o token do URL não é público). */
export async function posterUrl(path: string): Promise<string> {
  const p = String(path || '').trim();
  if (!p) throw new Error('caminho vazio');
  // Já é URL completa (legado / partilha)
  if (/^https?:\/\//i.test(p)) return p;
  // Normalizar caminhos relativos
  const clean = p.replace(/^\/+/, '');
  return getDownloadURL(ref(storage, clean));
}

/** Tenta vários caminhos (cartaz completo e miniatura) até um resolver. */
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

/** Apaga os ficheiros do cartaz (falha silenciosa — órfãos não bloqueiam). */
export async function deleteEventPoster(paths: (string | null | undefined)[]): Promise<void> {
  await Promise.all(
    paths.filter(Boolean).map((p) => deleteObject(ref(storage, p as string)).catch(() => {}))
  );
}
