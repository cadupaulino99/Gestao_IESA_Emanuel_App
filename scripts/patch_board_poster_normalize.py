#!/usr/bin/env python3
from pathlib import Path
import re

board = Path('src/lib/board.ts')
t = board.read_text()
old = '''export function normalizeEvent(raw: any): NormalizedEvent {
  return {
    ...(raw as ChurchEvent),
    status: (['marcado', 'adiado', 'cancelado', 'realizado'] as const).includes(raw?.status) ? raw.status : 'marcado',
    publishStatus: raw?.publishStatus === 'rascunho' ? 'rascunho' : 'publicado',
    location: raw?.location || '',
    responsible: raw?.responsible || '',
    html: raw?.descriptionHtml
      ? sanitizeHtml(raw.descriptionHtml)
      : raw?.description
        ? sanitizeHtml(`<p>${String(raw.description).replace(/\\n/g, '<br>')}</p>`)
        : '',
  };
}'''
new = '''export function normalizeEvent(raw: any): NormalizedEvent {
  const posterPath =
    (typeof raw?.posterPath === 'string' && raw.posterPath) ||
    (typeof raw?.poster === 'string' && raw.poster) ||
    (typeof raw?.imagePath === 'string' && raw.imagePath) ||
    null;
  const posterThumbPath =
    (typeof raw?.posterThumbPath === 'string' && raw.posterThumbPath) ||
    (typeof raw?.posterThumb === 'string' && raw.posterThumb) ||
    null;
  return {
    ...(raw as ChurchEvent),
    status: (['marcado', 'adiado', 'cancelado', 'realizado'] as const).includes(raw?.status) ? raw.status : 'marcado',
    publishStatus: raw?.publishStatus === 'rascunho' ? 'rascunho' : 'publicado',
    location: raw?.location || '',
    responsible: raw?.responsible || '',
    posterPath,
    posterThumbPath,
    html: raw?.descriptionHtml
      ? sanitizeHtml(raw.descriptionHtml)
      : raw?.description
        ? sanitizeHtml(`<p>${String(raw.description).replace(/\\n/g, '<br>')}</p>`)
        : '',
  };
}'''
if old not in t:
    # try without double escape difference
    if 'posterPath' in t and 'normalizeEvent' in t and 'typeof raw?.posterPath' in t:
        print('already patched')
    else:
        raise SystemExit('normalizeEvent block not found')
else:
    board.write_text(t.replace(old, new, 1))
    print('board patched')

# EventFeedPost PosterImg
ef = Path('src/components/board/EventFeedPost.tsx')
et = ef.read_text()
if 'resolvePosterUrl' not in et:
    et = et.replace("import { posterUrl } from '../../lib/posters';", "import { resolvePosterUrl } from '../../lib/posters';")
    et, n = re.subn(
        r'function PosterImg\(\{[\s\S]*?\n\}\n\n/\*\* Tempo relativo',
        '''function PosterImg({\n  path,\n  altPath,\n  className,\n  onClick,\n}: {\n  path?: string | null;\n  altPath?: string | null;\n  className?: string;\n  onClick?: () => void;\n}) {\n  const [url, setUrl] = useState<string | null>(null);\n  useEffect(() => {\n    let alive = true;\n    setUrl(null);\n    resolvePosterUrl(path, altPath)\n      .then((u) => { if (alive) setUrl(u); })\n      .catch(() => { if (alive) setUrl(null); });\n    return () => { alive = false; };\n  }, [path, altPath]);\n  if (!url) {\n    if (!path && !altPath) return null;\n    return (\n      <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 ${className || ''}`}>\n        A carregar cartaz…\n      </div>\n    );\n  }\n  return (\n    <button type="button" onClick={onClick} className="block w-full cursor-pointer border-0 bg-transparent p-0">\n      <img src={url} alt="Cartaz do evento" className={className} loading="lazy" />\n    </button>\n  );\n}\n\n/** Tempo relativo''',
        et,
        count=1,
    )
    if n != 1:
        raise SystemExit(f'PosterImg replace failed {n}')
    et = et.replace(
        '''          <PosterImg\n            path={e.posterPath || e.posterThumbPath}\n            className="max-h-[420px] w-full object-cover"\n            onClick={() => (onFullPoster ? onFullPoster(e) : onOpen?.(e))}\n          />''',
        '''          <PosterImg\n            path={e.posterThumbPath || e.posterPath}\n            altPath={e.posterPath || e.posterThumbPath}\n            className="max-h-[480px] w-full object-cover"\n            onClick={() => (onFullPoster ? onFullPoster(e) : onOpen?.(e))}\n          />''',
    )
    ef.write_text(et)
    print('EventFeedPost patched')
else:
    print('EventFeedPost already')
print('done')
