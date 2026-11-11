#!/usr/bin/env python3
from pathlib import Path

# posters.ts — only treat explicit R2_NOT_CONFIGURED code as missing binding
p = Path('src/lib/posters.ts')
t = p.read_text()
old = '''  if (/R2_NOT_CONFIGURED|não está ligado|POSTERS_BUCKET/i.test(m)) {
    return 'Cloudflare R2: binding POSTERS_BUCKET em falta no Worker. Confirme o bucket «iesa-event-posters» e faça deploy.';
  }'''
new = '''  // Só esta mensagem se o Worker devolver o código explícito
  if (/R2_NOT_CONFIGURED/i.test(m)) {
    return 'Worker sem binding R2 (código R2_NOT_CONFIGURED). No painel Cloudflare → Worker iesa-ai → Settings → confirme POSTERS_BUCKET → iesa-event-posters.';
  }'''
if old in t:
    t = t.replace(old, new)
    print('friendlyStorageError narrowed')
else:
    print('WARN friendly')
p.write_text(t)

# EventsAdmin — second try always when no posterUrl yet
ea = Path('src/components/admin/EventsAdmin.tsx')
et = ea.read_text()

old_block = '''      // 2ª tentativa: se o upload pré-gravação falhou, tenta de novo já com o id do evento
      if (posterFile && !data.posterUrl && !posterWarning) {
        try {
          const up2 = await uploadEventPoster(id, posterFile);
          if (up2.posterUrl) {
            data.posterUrl = up2.posterUrl;
            await updateDoc(doc(db, 'events', id), { posterUrl: up2.posterUrl, posterPath: null, posterThumbPath: null });
            setPosterBanner(null);
        toast.success('Cartaz associado ao evento.', { duration: 6000 });
          }
        } catch (pe2: any) {
          posterWarning = String(pe2?.message || pe2 || 'falha no carregamento do cartaz');
        }
      } else if (posterFile && data.posterUrl) {'''

new_block = '''      // 2ª tentativa SEMPRE se ainda não há posterUrl (a 1ª falha já não bloqueia)
      if (posterFile && !data.posterUrl) {
        try {
          const up2 = await uploadEventPoster(id, posterFile);
          if (up2.posterUrl) {
            data.posterUrl = up2.posterUrl;
            await updateDoc(doc(db, 'events', id), { posterUrl: up2.posterUrl, posterPath: null, posterThumbPath: null });
            posterWarning = null;
            setPosterBanner(null);
            toast.success('Cartaz associado ao evento (2ª tentativa).', { duration: 8000 });
          }
        } catch (pe2: any) {
          posterWarning = String(pe2?.message || pe2 || 'falha no carregamento do cartaz');
        }
      } else if (posterFile && data.posterUrl) {'''

if old_block in et:
    et = et.replace(old_block, new_block)
    print('second try fixed')
else:
    # looser
    if 'if (posterFile && !data.posterUrl && !posterWarning)' in et:
        et = et.replace(
            'if (posterFile && !data.posterUrl && !posterWarning)',
            'if (posterFile && !data.posterUrl)',
        )
        print('second try condition fixed loose')
    else:
        print('WARN second try block')

ea.write_text(et)
print('DONE')
