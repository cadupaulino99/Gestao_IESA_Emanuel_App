#!/usr/bin/env python3
from pathlib import Path
import re

files = [
    'src/components/board/EventFeedPost.tsx',
    'src/components/portal/MemberBoard.tsx',
    'src/components/admin/EventsAdmin.tsx',
]

for rel in files:
    p = Path(rel)
    if not p.exists():
        continue
    t = p.read_text()
    orig = t
    # Fix broken patterns like: decoding="async" / decoding="async"
    t = t.replace(' decoding="async" / decoding="async"', ' decoding="async"')
    t = t.replace(' decoding="async" /decoding="async"', ' decoding="async"')
    t = t.replace('/ decoding="async"', '')
    t = t.replace('loading="lazy"  decoding', 'loading="lazy" decoding')
    # Normalize img self-closing with proper attrs
    def fix_img(m):
        tag = m.group(0)
        # extract src, alt, className roughly
        if 'decoding="async" decoding="async"' in tag:
            tag = tag.replace(' decoding="async"', '', 1)
        # ensure valid self-close
        tag = re.sub(r'\s+/\s+decoding', ' decoding', tag)
        tag = re.sub(r'\s{2,}', ' ', tag)
        # force clean ending
        if 'loading=' not in tag and 'src=' in tag:
            pass
        # Rebuild known broken EventFeedPost lines
        return tag
    t = re.sub(r'<img\b[^>]*>', fix_img, t)
    # Explicit known-good replacements for PosterImg return
    t = re.sub(
        r'<img src=\{url\} alt="Cartaz do evento" className=\{`poster-img \$\{className\}`\}[^>]*>',
        '<img src={url} alt="Cartaz do evento" className={`poster-img ${className || \'\'\'}`} loading="lazy" decoding="async" fetchPriority="low" />',
        t,
    )
    t = re.sub(
        r'<img src=\{url\} alt="Cartaz do evento" className=\{className\}[^>]*>',
        '<img src={url} alt="Cartaz do evento" className={`poster-img ${className || \'\'\'}`} loading="lazy" decoding="async" fetchPriority="low" />',
        t,
    )
    t = re.sub(
        r'<img src=\{e\.posterUrl\} alt="Cartaz do evento"[^>]*>',
        '<img src={e.posterUrl} alt="Cartaz do evento" className="poster-img max-h-[480px] w-full object-cover" loading="lazy" decoding="async" fetchPriority="low" />',
        t,
    )
    # EventsAdmin PosterThumb
    t = re.sub(
        r'<img src=\{url\} alt="Cartaz do evento" className=\{`\$\{className\} rounded border object-cover`\}[^>]*>',
        '<img src={url} alt="Cartaz do evento" className={`poster-img ${className} rounded border object-cover`} loading="lazy" decoding="async" fetchPriority="low" />',
        t,
    )
    # Form previews
    t = t.replace(
        '{posterPreview && <img src={posterPreview} alt="Pré-visualização do cartaz" className="h-16 w-12 rounded border object-cover" />}',
        '{posterPreview && <img src={posterPreview} alt="Pré-visualização do cartaz" className="poster-img h-16 w-12 rounded border object-cover" loading="eager" decoding="async" />}',
    )
    t = t.replace(
        '{!posterPreview && !removePoster && editing?.posterUrl && <img src={editing.posterUrl} alt="Cartaz" className="h-16 w-12 rounded border object-cover" />}',
        '{!posterPreview && !removePoster && editing?.posterUrl && <img src={editing.posterUrl} alt="Cartaz" className="poster-img h-16 w-12 rounded border object-cover" loading="lazy" decoding="async" fetchPriority="low" />}',
    )
    if t != orig:
        p.write_text(t)
        print(rel, 'fixed')
    else:
        print(rel, 'no change')

# CSS
css = Path('src/index.css')
ct = css.read_text()
if '.poster-img' not in ct:
    ct += '''

/* Cartazes: menos trabalho de layout fora do ecrã */
.poster-img {
  content-visibility: auto;
  contain-intrinsic-size: 400px 225px;
  background-color: var(--color-muted, var(--muted));
}
'''
    css.write_text(ct)
    print('css added')
print('DONE')
