#!/usr/bin/env python3
from pathlib import Path

# ── posters.ts ─────────────────────────────────────────────────────────────
p = Path('src/lib/posters.ts')
t = p.read_text()

# Improve friendlyStorageError — less misleading «active o storage»
old_friendly = '''function friendlyStorageError(err: unknown): string {
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
}'''

new_friendly = '''function friendlyStorageError(err: unknown): string {
  const m = String((err as any)?.code || (err as any)?.message || err || '');
  if (/esgotou o tempo|timeout/i.test(m)) return m;
  if (/R2_NOT_CONFIGURED|não está ligado|POSTERS_BUCKET/i.test(m)) {
    return 'Cloudflare R2: binding POSTERS_BUCKET em falta no Worker. Confirme o bucket «iesa-event-posters» e faça deploy.';
  }
  if (/Só administradores|Não autenticado|401|403/i.test(m)) {
    return 'Sessão sem permissão para enviar cartaz. Saia e entre de novo como administrador.';
  }
  if (/storage\/unauthorized|permission-denied|PERMISSION_DENIED/i.test(m)) {
    return 'Sem permissão no armazenamento de ficheiros.';
  }
  if (/storage\/bucket-not-found/i.test(m)) {
    return 'Firebase Storage não está activo (não é necessário se o R2 estiver OK).';
  }
  if (/network|Failed to fetch|Load failed/i.test(m)) {
    return 'Falha de rede ao contactar o Worker de cartazes. Verifique a internet e tente novamente.';
  }
  return m || 'Falha desconhecida no carregamento do cartaz.';
}'''

if old_friendly in t:
    t = t.replace(old_friendly, new_friendly)
    print('friendlyStorageError updated')
else:
    print('WARN friendlyStorageError')

# Add retry to uploadPosterToR2 body
old_up = '''  const blob = await withTimeout(fileToJpegBlob(file, 1600, 0.82), 15_000, 'Processamento da imagem');
  const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
  let res: Response;
  try {
    res = await withTimeout(
      fetch(`${WORKER_URL}/admin/upload-poster${qs}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'image/jpeg',
          ...(eventId ? { 'X-Event-Id': String(eventId).slice(0, 40) } : {}),
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
        'Falha de rede ao contactar o Worker de cartazes. Verifique a internet e tente novamente. Se persistir, abra /__health do Worker.',
      );
    }
    throw e;
  }
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const detail = data?.error || data?.code || data?.message || `Erro ${res.status} no upload R2`;
    throw new Error(String(detail));
  }
  if (!data?.posterUrl || typeof data.posterUrl !== 'string' || !data.posterUrl.startsWith('http')) {
    throw new Error('Worker respondeu sem URL de cartaz válida. Confirme o deploy do Worker e o binding R2.');
  }
  return {
    posterUrl: data.posterUrl as string,
    key: data.key as string,
    posterPath: null,
    posterThumbPath: null,
  };'''

new_up = '''  const blob = await withTimeout(fileToJpegBlob(file, 1600, 0.82), 15_000, 'Processamento da imagem');
  const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'image/jpeg',
  };
  if (eventId) headers['X-Event-Id'] = String(eventId).slice(0, 40);

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await withTimeout(
        fetch(`${WORKER_URL}/admin/upload-poster${qs}`, {
          method: 'POST',
          headers,
          body: blob,
        }),
        STORAGE_TIMEOUT_MS,
        'Upload do cartaz (R2)',
      );
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const detail = String(data?.error || data?.code || data?.message || `Erro ${res.status} no upload R2`);
        // 5xx / 503 R2: tentar de novo
        if (res.status >= 500 && attempt < 3) {
          lastErr = new Error(detail);
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        throw new Error(detail);
      }
      if (!data?.posterUrl || typeof data.posterUrl !== 'string' || !data.posterUrl.startsWith('http')) {
        throw new Error('Worker respondeu sem URL de cartaz válida. Confirme o deploy do Worker e o binding R2.');
      }
      return {
        posterUrl: data.posterUrl as string,
        key: data.key as string,
        posterPath: null,
        posterThumbPath: null,
      };
    } catch (e: any) {
      const m = String(e?.message || e || '');
      lastErr = e instanceof Error ? e : new Error(m);
      const retryable = /Failed to fetch|NetworkError|Load failed|esgotou o tempo|503|502|500/i.test(m);
      if (retryable && attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
      if (/Failed to fetch|NetworkError|Load failed|esgotou o tempo/i.test(m)) {
        throw new Error(
          'Falha de rede ao contactar o Worker de cartazes. Verifique a internet e tente novamente.',
        );
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error('Falha no upload do cartaz após 3 tentativas.');'''

if old_up in t:
    t = t.replace(old_up, new_up)
    print('upload retry added')
else:
    print('WARN upload block')

# Remove Firebase fallback — only R2
old_ev = '''/** Tenta R2 (Worker). Só cai para Firebase se o Worker disser que o R2 não está configurado. */
export async function uploadEventPoster(id: string, file: File): Promise<PosterUploadResult> {
  try {
    return await uploadPosterToR2(file, id);
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    const r2Missing = /R2_NOT_CONFIGURED|não está ligado|R2 não configurado|não está configurado/i.test(msg);
    if (r2Missing) {
      try {
        return await uploadEventPosterFirebase(id, file);
      } catch (e2) {
        throw new Error(
          friendlyStorageError(e2) +
            ' · O Worker indica R2 em falta: confirme o binding POSTERS_BUCKET → iesa-event-posters.',
        );
      }
    }
    // Erros de rede/auth/validação: mostrar a causa real (sem pedir «activar Cloudflare» em vão)
    throw new Error(friendlyStorageError(e));
  }
}'''

new_ev = '''/** Upload só via Cloudflare R2 (Worker). Sem fallback Firebase Storage. */
export async function uploadEventPoster(id: string, file: File): Promise<PosterUploadResult> {
  try {
    return await uploadPosterToR2(file, id);
  } catch (e: any) {
    throw new Error(friendlyStorageError(e));
  }
}'''

if old_ev in t:
    t = t.replace(old_ev, new_ev)
    print('removed firebase fallback')
else:
    print('WARN uploadEventPoster')

p.write_text(t)

# ── EventsAdmin: toast longo + aviso persistente ───────────────────────────
ea = Path('src/components/admin/EventsAdmin.tsx')
et = ea.read_text()

# Add posterBanner state if missing
if 'posterBanner' not in et:
    et = et.replace(
        'const [posterFile, setPosterFile] = useState<File | null>(null);',
        "const [posterFile, setPosterFile] = useState<File | null>(null);\n  const [posterBanner, setPosterBanner] = useState<string | null>(null);",
    )
    print('posterBanner state')

# Long duration toasts
et = et.replace(
    'toast.warning(`Evento guardado SEM cartaz: ${posterWarning}.`);',
    "setPosterBanner(`Evento guardado SEM cartaz: ${posterWarning}`);\n        toast.warning(`Evento guardado SEM cartaz: ${posterWarning}`, { duration: 20000 });",
)
et = et.replace(
    "toast.success('Cartaz associado ao evento.');",
    "setPosterBanner(null);\n        toast.success('Cartaz associado ao evento.', { duration: 6000 });",
    1,  # only first occurrence in save path may be wrong - use count carefully
)

# On open form clear banner
if 'setPosterBanner(null)' not in et[et.find('const openNew'):et.find('const openNew')+400]:
    et = et.replace(
        'setPosterFile(null);',
        'setPosterFile(null);\n    setPosterBanner(null);',
        1,
    )

# UI banner above form buttons if posterBanner
if 'posterBanner &&' not in et:
    # insert before dialog footer / submit area - find Carregar cartaz section end
    needle = 'Carregar cartaz (opcional)'
    idx = et.find(needle)
    if idx > 0:
        # find a good place after poster section - look for DialogFooter or Guardar
        g = et.find('type="submit"', idx)
        if g > 0:
            # insert before the submit button's parent
            insert_at = et.rfind('<', 0, g)
            # simpler: after poster file input block - search for removePoster button area
            pass
    # Append banner near toast area by replacing a unique dialog content start of form actions
    marker = '{/* cartaz */}'
    if marker not in et:
        et = et.replace(
            '{posterPreview || editing?.posterPath || editing?.posterUrl ? \'Substituir cartaz\' : \'Carregar cartaz (opcional)\'}',
            "{posterPreview || editing?.posterPath || editing?.posterUrl ? 'Substituir cartaz' : 'Carregar cartaz (opcional)'}",
        )
    # Inject banner before first DialogFooter if any
    if 'DialogFooter' in et and '{posterBanner &&' not in et:
        et = et.replace(
            '<DialogFooter',
            '''{posterBanner && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                {posterBanner}
              </div>
            )}
            <DialogFooter''',
            1,
        )
        print('banner UI')
    elif '{posterBanner &&' not in et:
        # fallback: after setSaving true start of form - inject near title field is hard; skip
        print('WARN no DialogFooter for banner')

ea.write_text(et)
print('DONE')
