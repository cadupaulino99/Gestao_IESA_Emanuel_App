#!/usr/bin/env python3
from pathlib import Path

# board.ts — inserir posterPath após responsible
b = Path('src/lib/board.ts')
bt = b.read_text()
needle = "    responsible: raw?.responsible || '',\n    html:"
if 'typeof raw?.posterPath' not in bt:
    if needle not in bt:
        raise SystemExit('board needle missing')
    bt = bt.replace(
        needle,
        "    responsible: raw?.responsible || '',\n"
        "    posterPath: (typeof raw?.posterPath === 'string' && raw.posterPath)\n"
        "      || (typeof raw?.poster === 'string' && raw.poster)\n"
        "      || (typeof raw?.imagePath === 'string' && raw.imagePath)\n"
        "      || null,\n"
        "    posterThumbPath: (typeof raw?.posterThumbPath === 'string' && raw.posterThumbPath)\n"
        "      || (typeof raw?.posterThumb === 'string' && raw.posterThumb)\n"
        "      || null,\n"
        "    html:",
        1,
    )
    b.write_text(bt)
    print('board: poster fields added')
else:
    print('board: already has posterPath mapping')

# EventFeedPost — trocar import e lógica do PosterImg
ef = Path('src/components/board/EventFeedPost.tsx')
et = ef.read_text()
if "resolvePosterUrl" not in et:
    et = et.replace(
        "import { posterUrl } from '../../lib/posters';",
        "import { resolvePosterUrl } from '../../lib/posters';",
    )
    # substituir corpo do useEffect e condição de render
    et = et.replace(
        "    if (path) posterUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));\n    else setUrl(null);",
        "    setUrl(null);\n    resolvePosterUrl(path, (arguments as any)[0]?.altPath).catch(() => null);",
    )
    # Abordagem mais limpa: reescrever função PosterImg inteira por marcadores
    start = et.find('function PosterImg(')
    end = et.find('/** Tempo relativo', start)
    if start < 0 or end < 0:
        raise SystemExit('PosterImg bounds not found')
    replacement = '''function PosterImg({
  path,
  altPath,
  className,
  onClick,
}: {
  path?: string | null;
  altPath?: string | null;
  className?: string;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    resolvePosterUrl(path, altPath)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [path, altPath]);
  if (!url) {
    if (!path && !altPath) return null;
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 ${className || ''}`}>
        A carregar cartaz…
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block w-full cursor-pointer border-0 bg-transparent p-0">
      <img src={url} alt="Cartaz do evento" className={className} loading="lazy" />
    </button>
  );
}

'''
    et = et[:start] + replacement + et[end:]
    et = et.replace(
        'path={e.posterPath || e.posterThumbPath}',
        'path={e.posterThumbPath || e.posterPath}\n            altPath={e.posterPath || e.posterThumbPath}',
    )
    ef.write_text(et)
    print('EventFeedPost patched')
else:
    print('EventFeedPost already')

# MemberBoard
mb = Path('src/components/portal/MemberBoard.tsx')
mt = mb.read_text()
if 'resolvePosterUrl' not in mt:
    mt = mt.replace(
        "import { posterUrl } from '../../lib/posters';",
        "import { resolvePosterUrl } from '../../lib/posters';\nimport { buildShareText } from '../../lib/boardEngagement';",
    )
if 'Eye,' not in mt:
    mt = mt.replace(
        'MapPin, Pin, UserRound, XCircle, Maximize2,',
        'MapPin, Pin, UserRound, XCircle, Maximize2, Eye, Share2, BookOpen, Heart,',
    )
start = mt.find('function PosterImg(')
end = mt.find('function Empty(', start)
if start >= 0 and end > start and 'resolvePosterUrl(path' not in mt[start:end]:
    mt = mt[:start] + '''function PosterImg({ path, altPath, className }: { path?: string | null; altPath?: string | null; className?: string }) {
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
}

''' + mt[end:]
    print('MemberBoard PosterImg replaced')

mt = mt.replace(
    '<PosterImg path={openEvent.posterPath || openEvent.posterThumbPath} className="max-h-72 w-full rounded-lg border object-contain" />',
    '<PosterImg path={openEvent.posterPath || openEvent.posterThumbPath} altPath={openEvent.posterThumbPath || openEvent.posterPath} className="max-h-72 w-full rounded-lg border object-contain" />',
)
mt = mt.replace(
    '<PosterImg path={fullPoster.posterPath || fullPoster.posterThumbPath} className="max-h-[92dvh] w-auto max-w-full mx-auto rounded-lg" />',
    '<PosterImg path={fullPoster.posterPath || fullPoster.posterThumbPath} altPath={fullPoster.posterThumbPath || fullPoster.posterPath} className="max-h-[92dvh] w-auto max-w-full mx-auto rounded-lg" />',
)

if 'eventFooter' not in mt:
    mt = mt.replace(
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
    mt = mt.replace(
        '    </Tabs>\n  );\n}\n\nfunction firstDateOfWeek',
        '''    </Tabs>
    <footer className="flex flex-col items-center gap-1 border-t pt-4 text-center text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5 font-medium text-[#1557c0]"><Heart className="h-3.5 w-3.5" /> Juntos na fé, servindo a Deus!</p>
      <p>© IESA Emanuel Xangongo – {new Date().getFullYear()}</p>
    </footer>
    </div>
  );
}

function firstDateOfWeek'''
    )

if 'footer={eventFooter' not in mt:
    mt = mt.replace(
        'onFullPoster={setFullPoster}\n              />',
        'onFullPoster={setFullPoster}\n                footer={eventFooter(item.e)}\n              />',
    )
    mt = mt.replace(
        'onFullPoster={setFullPoster}\n            />',
        'onFullPoster={setFullPoster}\n              footer={eventFooter(e)}\n            />',
    )

if 'Jeremias 29:11' not in mt:
    mt = mt.replace(
        '<div className="mx-auto flex max-w-xl flex-col gap-4">\n          {feed.map((item) =>',
        '''<div className="grid gap-4 lg:grid-cols-[220px_1fr]">
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
    mt = mt.replace(
        ''')}
        </div>
      </TabsContent>

      <TabsContent value="avisos"''',
        ''')}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="avisos"'''
    )

mb.write_text(mt)
print('MemberBoard written', mb.stat().st_size)
print('ALL OK')
