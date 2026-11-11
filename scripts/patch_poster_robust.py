#!/usr/bin/env python3
from pathlib import Path
import re

# ─── posters.ts: header X-Event-Id + mensagens mais claras ─────────────────
p = Path('src/lib/posters.ts')
t = p.read_text()
old_fetch = """      fetch(`${WORKER_URL}/admin/upload-poster${qs}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'image/jpeg',
        },
        body: blob,
      }),"""
new_fetch = """      fetch(`${WORKER_URL}/admin/upload-poster${qs}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'image/jpeg',
          ...(eventId ? { 'X-Event-Id': String(eventId).slice(0, 40) } : {}),
        },
        body: blob,
      }),"""
if old_fetch in t:
    t = t.replace(old_fetch, new_fetch)
    print('posters fetch headers')
else:
    print('WARN posters fetch')

old_err = """  if (!res.ok) {
    throw new Error(data?.error || data?.code || `Erro ${res.status} no upload R2`);
  }"""
new_err = """  if (!res.ok) {
    const detail = data?.error || data?.code || data?.message || `Erro ${res.status} no upload R2`;
    throw new Error(String(detail));
  }
  if (!data?.posterUrl || typeof data.posterUrl !== 'string' || !data.posterUrl.startsWith('http')) {
    throw new Error('Worker respondeu sem URL de cartaz válida. Confirme o deploy do Worker e o binding R2.');
  }"""
if old_err in t:
    t = t.replace(old_err, new_err)
    print('posters error handling')
p.write_text(t)

# ─── EventsAdmin: após gravar, se houver posterUrl, confirma; se upload falhou, 2ª tentativa pós-save ─
ea = Path('src/components/admin/EventsAdmin.tsx')
et = ea.read_text()

# After setDoc/updateDoc success block for poster toast, add fallback upload
marker = """      if (posterWarning) {
        toast.warning(`Evento guardado SEM cartaz: ${posterWarning}.`);
      } else if (posterFile && data.posterUrl) {
        toast.success('Cartaz associado ao evento.');
      }"""

replacement = """      // 2ª tentativa: se o upload pré-gravação falhou, tenta de novo já com o id do evento
      if (posterFile && !data.posterUrl && !posterWarning) {
        try {
          const up2 = await uploadEventPoster(id, posterFile);
          if (up2.posterUrl) {
            data.posterUrl = up2.posterUrl;
            await updateDoc(doc(db, 'events', id), { posterUrl: up2.posterUrl, posterPath: null, posterThumbPath: null });
            toast.success('Cartaz associado ao evento.');
          }
        } catch (pe2: any) {
          posterWarning = String(pe2?.message || pe2 || 'falha no carregamento do cartaz');
        }
      } else if (posterFile && data.posterUrl) {
        // Garantir que o URL ficou no documento (update parcial — regras isValidEventDoc)
        try {
          await updateDoc(doc(db, 'events', id), {
            posterUrl: data.posterUrl,
            posterPath: data.posterPath ?? null,
            posterThumbPath: data.posterThumbPath ?? null,
          });
        } catch (ue: any) {
          posterWarning = 'cartaz enviado mas o Firestore recusou gravar a URL: ' + String(ue?.message || ue);
        }
      }

      if (posterWarning) {
        toast.warning(`Evento guardado SEM cartaz: ${posterWarning}.`);
      } else if (posterFile && data.posterUrl) {
        toast.success('Cartaz associado ao evento.');
      }"""

if marker in et:
    et = et.replace(marker, replacement)
    print('EventsAdmin fallback')
else:
    print('WARN EventsAdmin marker')
ea.write_text(et)

# ─── Worker: versão + rotas no health ───────────────────────────────────────
w = Path('worker/ai-worker.js')
wt = w.read_text()
wt2 = wt.replace(
    "const WORKER_VERSION = '2.12.0';",
    "const WORKER_VERSION = '2.13.0';",
)
wt2 = wt2.replace(
    "const WORKER_BUILD = '2026-11-05 (P1: sanitizar prompts, anonimizar financas, auth/rate/audit)';",
    "const WORKER_BUILD = '2026-11-11 (R2 cartazes /admin/upload-poster + /media)';",
)
# Add routes to health listing if present as array
if '/admin/upload-poster' not in wt2.split('routes')[1][:500] if 'routes' in wt2 else '':
    wt2 = wt2.replace(
        '"/admin/delete-signup-account"]',
        '"/admin/delete-signup-account","/admin/upload-poster","/media/*"]',
    )
w.write_text(wt2)
print('worker version', '2.13.0' in wt2)
print('DONE')
