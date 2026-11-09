#!/usr/bin/env python3
from pathlib import Path

# Worker CORS
js = Path('worker/ai-worker.js')
t = js.read_text()
old_cors = "'Access-Control-Allow-Headers': 'Content-Type, Authorization',"
new_cors = "'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Event-Id',"
if old_cors in t:
    t = t.replace(old_cors, new_cors)
    print('CORS headers updated')
elif 'X-Event-Id' in t[t.find('Access-Control-Allow-Headers'):t.find('Access-Control-Allow-Headers')+120]:
    print('CORS already has X-Event-Id')
else:
    raise SystemExit('CORS line not found')

# Accept event id from query as well
if "url.searchParams.get('eventId')" not in t:
    t = t.replace(
        "const eventHint = (request.headers.get('X-Event-Id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);",
        "const eventHint = (request.headers.get('X-Event-Id') || url.searchParams.get('eventId') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);",
    )
    print('eventId query accepted')

js.write_text(t)

# Frontend: avoid custom header (use query); better errors
p = Path('src/lib/posters.ts')
pt = p.read_text()

old = '''  const res = await withTimeout(
    fetch(`${WORKER_URL}/admin/upload-poster`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'image/jpeg',
        ...(eventId ? { 'X-Event-Id': eventId } : {}),
      },
      body: blob,
    }),
    STORAGE_TIMEOUT_MS,
    'Upload do cartaz (R2)',
  );
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(data?.error || `Erro ${res.status} no upload R2`);
  }'''

new = '''  const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
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
  }'''

if old in pt:
    pt = pt.replace(old, new)
    print('posters.ts upload fixed')
else:
    if 'eventId=${encodeURIComponent' in pt:
        print('posters already patched')
    else:
        raise SystemExit('posters upload block not found')

p.write_text(pt)
print('done')
