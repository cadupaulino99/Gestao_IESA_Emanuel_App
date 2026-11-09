#!/usr/bin/env python3
from pathlib import Path

js_path = Path('worker/ai-worker.js')
js = js_path.read_text()

if "WORKER_VERSION = '2.12.0'" not in js and 'WORKER_VERSION' in js:
    import re
    js = re.sub(r"const WORKER_VERSION = '[^']+';", "const WORKER_VERSION = '2.12.0';", js, count=1)

old = """    const url = new URL(request.url);
    const path = url.pathname;

    /* --- Diagnostico PUBLICO"""

new = """    const url = new URL(request.url);
    const path = url.pathname;

    /* --- Media pública (cartazes no R2) --- */
    if (request.method === 'GET' && path.startsWith('/media/')) {
      try {
        if (!env.POSTERS_BUCKET) return json({ error: 'R2 não configurado (binding POSTERS_BUCKET).' }, 503);
        const key = decodeURIComponent(path.slice('/media/'.length)).replace(/^\/+/, '');
        if (!key.startsWith('posters/') || key.includes('..')) return json({ error: 'Não encontrado.' }, 404);
        const obj = await env.POSTERS_BUCKET.get(key);
        if (!obj) return json({ error: 'Não encontrado.' }, 404);
        const headers = new Headers(CORS);
        obj.writeHttpMetadata(headers);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(obj.body, { headers });
      } catch (e) {
        return json({ error: 'Falha ao servir media: ' + ((e && e.message) || e) }, 500);
      }
    }

    /* --- Diagnostico PUBLICO"""

if '/admin/upload-poster' not in js:
    if old not in js:
        raise SystemExit('path marker not found in worker')
    js = js.replace(old, new, 1)

    upload_marker = """      if (adminDoc && adminDoc.mustChangePassword) return json({ error: 'Troque a palavra-passe temporaria antes de usar o sistema.', code: 'PASSWORD_CHANGE_REQUIRED' }, 403);

      /* --- gestão de admins: SÓ super admin (servidor, nao so UI) --- */"""

    upload_block = """      if (adminDoc && adminDoc.mustChangePassword) return json({ error: 'Troque a palavra-passe temporaria antes de usar o sistema.', code: 'PASSWORD_CHANGE_REQUIRED' }, 403);

      /* --- Upload de cartaz para R2 (qualquer admin autenticado) --- */
      if (path === '/admin/upload-poster' && request.method === 'POST') {
        if (!adminDoc) return json({ error: 'Só administradores podem enviar cartazes.' }, 403);
        if (!env.POSTERS_BUCKET) {
          return json({
            error: 'Cloudflare R2 não está ligado a este Worker. Crie o bucket «iesa-event-posters» e faça deploy com binding POSTERS_BUCKET.',
            code: 'R2_NOT_CONFIGURED',
          }, 503);
        }
        const ct = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(ct)) {
          return json({ error: 'Tipo inválido. Use JPG, PNG ou WEBP.' }, 400);
        }
        const buf = await request.arrayBuffer();
        if (!buf || buf.byteLength < 32) return json({ error: 'Ficheiro vazio ou inválido.' }, 400);
        if (buf.byteLength > 10 * 1024 * 1024) return json({ error: 'Ficheiro demasiado grande (máx. 10 MB).' }, 400);
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
        const eventHint = (request.headers.get('X-Event-Id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const key = `posters/${eventHint || 'evt'}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        await env.POSTERS_BUCKET.put(key, buf, {
          httpMetadata: { contentType: ct === 'image/jpg' ? 'image/jpeg' : ct },
          customMetadata: { uploadedBy: String(claims.email || ''), at: String(Date.now()) },
        });
        const posterUrl = `${url.origin}/media/${key}`;
        return json({ ok: true, posterUrl, key, bytes: buf.byteLength, workerVersion: WORKER_VERSION });
      }

      if (path === '/admin/delete-poster' && request.method === 'POST') {
        if (!adminDoc) return json({ error: 'Só administradores.' }, 403);
        if (!env.POSTERS_BUCKET) return json({ error: 'R2 não configurado.' }, 503);
        let body = {};
        try { body = await request.json(); } catch (_) {}
        const key = String(body.key || '').replace(/^\/+/, '');
        if (!key.startsWith('posters/') || key.includes('..')) return json({ error: 'Chave inválida.' }, 400);
        await env.POSTERS_BUCKET.delete(key);
        return json({ ok: true });
      }

      /* --- gestão de admins: SÓ super admin (servidor, nao so UI) --- */"""

    if upload_marker not in js:
        raise SystemExit('upload marker not found')
    js = js.replace(upload_marker, upload_block, 1)
    print('worker routes added')
else:
    print('worker routes already present')

# health r2 flag
idx = js.find("path === '/__health'")
if idx > 0 and 'r2:' not in js[idx:idx+800]:
    chunk = js[idx:idx+800]
    if 'version: WORKER_VERSION,' in chunk:
        js = js[:idx] + chunk.replace(
            'version: WORKER_VERSION,',
            'version: WORKER_VERSION,\n          r2: !!env.POSTERS_BUCKET,',
            1,
        ) + js[idx+800:]
        print('health r2')

js_path.write_text(js)
print('worker written', js_path.stat().st_size)

# --- Frontend: types, board, feed, admin, rules ---
types = Path('src/types.ts')
tt = types.read_text()
if 'posterUrl?' not in tt:
    tt = tt.replace(
        "  posterPath?: string | null;\n  posterThumbPath?: string | null;",
        "  posterPath?: string | null;\n  posterThumbPath?: string | null;\n  /** URL público do cartaz (Cloudflare R2 via Worker /media/...). */\n  posterUrl?: string | null;",
    )
    types.write_text(tt)
    print('types ok')

board = Path('src/lib/board.ts')
bt = board.read_text()
if 'posterUrl' not in bt[bt.find('export function normalizeEvent'):bt.find('export function normalizeEvent')+500]:
    bt = bt.replace(
        "    posterPath,\n    posterThumbPath,",
        "    posterPath,\n    posterThumbPath,\n    posterUrl: (typeof raw?.posterUrl === 'string' && raw.posterUrl) || null,",
    )
    board.write_text(bt)
    print('board ok')

efp = Path('src/components/board/EventFeedPost.tsx')
et = efp.read_text()
if 'e.posterUrl' not in et:
    et = et.replace(
        "{(e.posterPath || e.posterThumbPath) && (",
        "{(e.posterUrl || e.posterPath || e.posterThumbPath) && (",
    )
    et = et.replace(
        """          <PosterImg
            path={e.posterThumbPath || e.posterPath}
            altPath={e.posterPath || e.posterThumbPath}
            className="max-h-[480px] w-full object-cover"
            onClick={() => (onFullPoster ? onFullPoster(e) : onOpen?.(e))}
          />""",
        """          {e.posterUrl ? (
            <button type="button" className="block w-full border-0 bg-transparent p-0" onClick={() => (onFullPoster ? onFullPoster(e) : onOpen?.(e))}>
              <img src={e.posterUrl} alt="Cartaz do evento" className="max-h-[480px] w-full object-cover" loading="lazy" />
            </button>
          ) : (
          <PosterImg
            path={e.posterThumbPath || e.posterPath}
            altPath={e.posterPath || e.posterThumbPath}
            className="max-h-[480px] w-full object-cover"
            onClick={() => (onFullPoster ? onFullPoster(e) : onOpen?.(e))}
          />
          )}""",
    )
    efp.write_text(et)
    print('EventFeedPost ok')

# EventsAdmin: save posterUrl
ea = Path('src/components/admin/EventsAdmin.tsx')
eat = ea.read_text()
old_save = """        if (posterFile) {
          const up = await uploadEventPoster(id, posterFile);
          const oldPaths = editing ? [editing.posterPath, editing.posterThumbPath] : [];
          await updateDoc(doc(db, 'events', id), { ...up });
          await deleteEventPoster(oldPaths);
        } else if (removePoster && editing?.posterPath) {
          await updateDoc(doc(db, 'events', id), { posterPath: null, posterThumbPath: null });
          await deleteEventPoster([editing.posterPath, editing.posterThumbPath]);
        }"""
new_save = """        if (posterFile) {
          const up = await uploadEventPoster(id, posterFile);
          const oldPaths = editing ? [editing.posterPath, editing.posterThumbPath] : [];
          await updateDoc(doc(db, 'events', id), {
            posterUrl: up.posterUrl || null,
            posterPath: up.posterPath || null,
            posterThumbPath: up.posterThumbPath || null,
          });
          await deleteEventPoster(oldPaths);
        } else if (removePoster && (editing?.posterPath || editing?.posterUrl)) {
          await updateDoc(doc(db, 'events', id), { posterPath: null, posterThumbPath: null, posterUrl: null });
          await deleteEventPoster([editing.posterPath, editing.posterThumbPath]);
        }"""
if old_save in eat:
    eat = eat.replace(old_save, new_save)
    print('EventsAdmin save ok')
else:
    print('EventsAdmin save block skip')

eat = eat.replace(
    'Cartaz opcional (JPG/PNG/WEBP até 10 MB — comprimido a 1600 px e guardado como ficheiro).',
    'Cartaz opcional (JPG/PNG/WEBP até 10 MB). Preferência: Cloudflare R2 via Worker; se R2 falhar, tenta Firebase Storage.',
)
ea.write_text(eat)

# firestore.rules posterUrl
rules = Path('firestore.rules')
rt = rules.read_text()
needle = "(!hasField(d, 'posterPath') || d.posterPath == null ||\n          (d.posterPath is string && d.posterPath.matches('^posters/[^/]+\\.(jpg|png|webp)$'))) &&\n        (!hasField(d, 'posterThumbPath') || d.posterThumbPath == null ||\n          (d.posterThumbPath is string && d.posterThumbPath.matches('^posters/thumbs/[^/]+\\.(jpg|png|webp)$')));"
# try simpler insertion after posterThumbPath block
if 'posterUrl' not in rt:
    rt = rt.replace(
        "(d.posterThumbPath is string && d.posterThumbPath.matches('^posters/thumbs/[^/]+\\.(jpg|png|webp)$')));",
        "(d.posterThumbPath is string && d.posterThumbPath.matches('^posters/thumbs/[^/]+\\.(jpg|png|webp)$'))) &&\n        (!hasField(d, 'posterUrl') || d.posterUrl == null ||\n          (d.posterUrl is string && d.posterUrl.matches('^https://.+')));",
    )
    rules.write_text(rt)
    print('firestore.rules ok')
else:
    print('firestore already')

print('ALL DONE')
