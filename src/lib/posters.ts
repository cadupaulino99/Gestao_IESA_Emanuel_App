import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import { compressImageFile } from './ai';
import { dataUrlToBlob } from './download';

/* ═══════════════════════════════════════════════════════════════════════
   CARTAZES DE EVENTOS — v1.13.0+
   Comprime no aparelho, guarda no Firebase Storage e grava só o caminho
   no documento Firestore. Leitura/escrita exige sessão (storage.rules).
   ═══════════════════════════════════════════════════════════════════════ */

export const POSTER_MAX_BYTES = 10 * 1024 * 1024;
export const POSTER_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface PosterUploadResult {
  posterPath: string;      // posters/<id>.jpg
  posterThumbPath: string; // posters/thumbs/<id>.jpg
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
  if (/storage\/unauthorized|permission-denied|PERMISSION_DENIED/i.test(m)) {
    return 'Sem permissão no Storage. Confirme que está autenticado e que as regras do Storage estão publicadas (Firebase → Storage → Rules).';
  }
  if (/bucket|not exist|404|storage\/object-not-found|storage\/bucket-not-found/i.test(m)) {
    return 'Firebase Storage ainda não está activo no projecto. Consola Firebase → Storage → «Começar».';
  }
  if (/storage\/retry-limit-exceeded|network|Failed to fetch|timeout/i.test(m)) {
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
    /* fallback abaixo */
  }
  // Fallback: enviar o ficheiro original (ou forçar type)
  if (file.type && file.type.startsWith('image/')) return file;
  return new Blob([await file.arrayBuffer()], { type: 'image/jpeg' });
}

/**
 * Comprime + envia cartaz e miniatura para o Storage.
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
    bigBlob = await fileToJpegBlob(file, 1600, 0.82);
  } catch (e) {
    throw new Error(`Não foi possível processar a imagem: ${friendlyStorageError(e)}`);
  }

  try {
    await uploadBytes(ref(storage, posterPath), bigBlob, { contentType: 'image/jpeg' });
  } catch (e) {
    throw new Error(friendlyStorageError(e));
  }

  // Miniatura: melhor esforço — não invalida o cartaz principal
  try {
    const thumbBlob = await fileToJpegBlob(file, 400, 0.7);
    await uploadBytes(ref(storage, posterThumbPath), thumbBlob, { contentType: 'image/jpeg' });
  } catch {
    // Reutiliza o cartaz principal como «thumb» no documento
    return { posterPath, posterThumbPath: posterPath };
  }

  return { posterPath, posterThumbPath };
}

/** URL de apresentação (exige sessão; o token do URL não é público). */
export async function posterUrl(path: string): Promise<string> {
  const p = String(path || '').trim();
  if (!p) throw new Error('caminho vazio');
  if (/^https?:\/\//i.test(p)) return p;
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
