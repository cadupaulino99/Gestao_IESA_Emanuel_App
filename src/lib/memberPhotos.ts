import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { dataUrlToBlob } from './download';

/* ═══════════════════════════════════════════════════════════════════════
   FOTOGRAFIAS DE MEMBRO NO STORAGE (v1.17.0, P1 «fotos»)
   ───────────────────────────────────────────────────────────────────────
   Antes: base64 (~40-80 KB) DENTRO do documento do membro — documentos
   inchados e listas lentas. Agora: ficheiro em `member-photos/<id>.<ext>`
   e só o CAMINHO no documento (photoPath), como nos cartazes.
   RESILIÊNCIA: se o bucket do Storage ainda não estiver activado, o upload
   falha e o chamador mantém o base64 (photoBase64) — nada parte.
   ═══════════════════════════════════════════════════════════════════════ */

const EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };

/** Envia a foto (já comprimida a 400 px/q0.8 pelo chamador) → devolve o caminho. */
export async function uploadMemberPhoto(memberId: string, base64: string, mime = 'image/jpeg'): Promise<string> {
  const ext = EXT[mime] || 'jpg';
  const path = `member-photos/${memberId}.${ext}`;
  await uploadBytes(ref(storage, path), dataUrlToBlob(`data:${mime};base64,${base64}`), { contentType: mime });
  return path;
}

/** URL de apresentação: photoPath (Storage) tem prioridade; fallback base64. */
export async function memberPhotoUrl(member: {
  photoPath?: string | null;
  photoBase64?: string | null;
} | null | undefined): Promise<string | null> {
  if (member?.photoPath) {
    try {
      return await getDownloadURL(ref(storage, member.photoPath));
    } catch {
      /* sem bucket/sessão: cai no base64 se existir */
    }
  }
  return member?.photoBase64 ? `data:image/jpeg;base64,${member.photoBase64}` : null;
}
