#!/usr/bin/env python3
from pathlib import Path

p = Path('src/components/portal/MemberBoard.tsx')
t = p.read_text()

if "resolvePosterUrl" not in t:
    t = t.replace(
        "import { posterUrl } from '../../lib/posters';",
        "import { resolvePosterUrl } from '../../lib/posters';\nimport { buildShareText } from '../../lib/boardEngagement';",
    )

if 'Eye,' not in t and 'Eye }' not in t:
    t = t.replace(
        "MapPin, Pin, UserRound, XCircle, Maximize2,",
        "MapPin, Pin, UserRound, XCircle, Maximize2, Eye, Share2, BookOpen, Heart,",
    )

old = '''function PosterImg({ path, className }: { path?: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (path) posterUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [path]);
  if (!path || !url) return null;
  return <img src={url} alt="Cartaz do evento" className={className} />;
}'''

new = '''function PosterImg({ path, altPath, className }: { path?: string | null; altPath?: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    resolvePosterUrl(path, altPath).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [path, altPath]);
  if (!url) {
    if (!path && !altPath) return null;
    return <div className={`flex items-center justify-center bg-slate-100 text-[11px] text-slate-400 dark:bg-slate-800 ${className || ''}`}>A carregar cartaz…</div>;
  }
  return <img src={url} alt="Cartaz do evento" className={className} loading="lazy" />;
}

function addToCalendar(e: NormalizedEvent) {
  const start = `${(e.date || '').replace(/-/g, '')}T${(e.time || '09:00').replace(':', '')}00`;
  const endDate = (e.dateEnd || e.date || '').replace(/-/g, '');
  const end = `${endDate}T${(e.timeEnd || e.time || '10:00').replace(':', '')}00`;
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title || 'Evento')}&dates=${start}/${end}&details=${encodeURIComponent((e.html || '').replace(/<[^>]+>/g, ' '))}&location=${encodeURIComponent(e.location || '')}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function shareEvent(e: NormalizedEvent) {
  const text = buildShareText({
    kind: 'event',
    title: e.title,
    when: fmtDateTimePT(e.date, e.time),
    location: e.location || undefined,
    bodyPlain: (e.html || '').replace(/<[^>]+>/g, ' ').trim(),
  });
  try {
    if (navigator.share) { await navigator.share({ title: e.title, text }); return; }
  } catch { /* */ }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}'''

if old in t:
    t = t.replace(old, new)
    print('PosterImg replaced')
elif 'resolvePosterUrl' in t:
    print('PosterImg already patched')
else:
    raise SystemExit('PosterImg block missing')

t = t.replace(
    '<PosterImg path={openEvent.posterPath || openEvent.posterThumbPath} className="max-h-72 w-full rounded-lg border object-contain" />',
    '<PosterImg path={openEvent.posterPath || openEvent.posterThumbPath} altPath={openEvent.posterThumbPath || openEvent.posterPath} className="max-h-72 w-full rounded-lg border object-contain" />',
)
t = t.replace(
    '<PosterImg path={fullPoster.posterPath || fullPoster.posterThumbPath} className="max-h-[92dvh] w-auto max-w-full mx-auto rounded-lg" />',
    '<PosterImg path={fullPoster.posterPath || fullPoster.posterThumbPath} altPath={fullPoster.posterThumbPath || fullPoster.posterPath} className="max-h-[92dvh] w-auto max-w-full mx-auto rounded-lg" />',
)

# inject eventFooter before return if missing
if 'eventFooter' not in t:
    t = t.replace(
        '  return (\n    <Tabs defaultValue="feed"',
        '''  const eventFooter = (e: NormalizedEvent) => (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" className="h-8 gap-1 rounded-full bg-[#1557c0] text-xs text-white hover:bg-[#0b3d91]" onClick={() => setOpenEvent(e)}>
        <Eye className="h-3.5 w-3.5" /> Ver Detalhes
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs" onClick={() => void shareEvent(e)}>
        <Share2 className="h-3.5 w-3.5" /> Partilhar
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs" onClick={() => addToCalendar(e)}>
        <CalendarPlus className="h-3.5 w-3.5" /> Adicionar ao Calendário
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
    <Tabs defaultValue="feed"'''
    )
    # close wrapper + footer
    t = t.replace(
        '    </Tabs>\n  );\n}',
        '''    </Tabs>
    <footer className="flex flex-col items-center gap-1 border-t pt-4 text-center text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5 font-medium text-[#1557c0]"><Heart className="h-3.5 w-3.5" /> Juntos na fé, servindo a Deus!</p>
      <p>© IESA Emanuel Xangongo – {new Date().getFullYear()}</p>
    </footer>
    </div>
  );
}'''
    )

# pass footer to EventFeedPost
if 'footer={eventFooter' not in t:
    t = t.replace(
        '''              <EventFeedPost
                key={`e-${item.e.id}`}
                event={item.e}
                now={now}
                expandable
                onOpen={setOpenEvent}
                onFullPoster={setFullPoster}
              />''',
        '''              <EventFeedPost
                key={`e-${item.e.id}`}
                event={item.e}
                now={now}
                expandable
                onOpen={setOpenEvent}
                onFullPoster={setFullPoster}
                footer={eventFooter(item.e)}
              />''',
    )
    t = t.replace(
        '''            <EventFeedPost
              key={e.id}
              event={e}
              now={now}
              expandable
              onOpen={setOpenEvent}
              onFullPoster={setFullPoster}
            />''',
        '''            <EventFeedPost
              key={e.id}
              event={e}
              now={now}
              expandable
              onOpen={setOpenEvent}
              onFullPoster={setFullPoster}
              footer={eventFooter(e)}
            />''',
    )

# sidebar verse on feed
if 'Jeremias 29:11' not in t:
    t = t.replace(
        '''        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {feed.map((item) =>''',
        '''        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-4 overflow-hidden rounded-2xl bg-gradient-to-b from-[#0b3d91] to-[#1557c0] p-5 text-center text-white shadow-md">
              <BookOpen className="mx-auto mb-3 h-10 w-10 opacity-90" />
              <p className="text-sm italic leading-relaxed text-blue-50">
                “Porque eu bem sei os planos que tenho para vós, diz o Senhor, planos de paz, e não de mal, para vos dar um futuro e uma esperança.”
              </p>
              <span className="mt-4 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-[#0b3d91]">Jeremias 29:11</span>
            </div>
          </aside>
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {feed.map((item) =>'''
    )
    t = t.replace(
        '''          )}
        </div>
      </TabsContent>

      <TabsContent value="avisos"''',
        '''          )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="avisos"'''
    )

p.write_text(t)
print('MemberBoard written', p.stat().st_size)
