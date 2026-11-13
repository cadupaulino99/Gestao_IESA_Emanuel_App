#!/usr/bin/env python3
from pathlib import Path
import re

# CSS
css = Path('src/index.css')
ct = css.read_text()
if 'poster-img' not in ct:
    ct += '''

/* Cartazes: decodificação assínncrona + menos trabalho de layout fora do ecrã */
.poster-img {
  content-visibility: auto;
  contain-intrinsic-size: 400px 225px;
  background-color: var(--color-muted, var(--muted));
}
'''
    css.write_text(ct)
    print('css poster-img')
else:
    print('css ok')

def optimize_img_tag(tag: str) -> str:
    if 'src=' not in tag:
        return tag
    # skip if already fully optimised
    has_lazy = 'loading=' in tag
    has_dec = 'decoding=' in tag
    has_fp = 'fetchPriority=' in tag or 'fetchpriority=' in tag
    # ensure class poster-img
    if 'poster-img' not in tag:
        if 'className="' in tag:
            tag = tag.replace('className="', 'className="poster-img ', 1)
        elif "className={'" in tag or 'className={`' in tag:
            tag = tag.replace('className={`', 'className={`poster-img ', 1)
            tag = tag.replace("className={'", "className={'poster-img ", 1)
        elif 'className={' in tag and 'cn(' in tag:
            pass
        else:
            # className={className} pattern
            if 'className={className}' in tag:
                tag = tag.replace('className={className}', 'className={`poster-img ${className}`}')
            elif 'className={`${className}' in tag:
                tag = tag.replace('className={`${className}', 'className={`poster-img ${className}')
    attrs = []
    if not has_lazy:
        attrs.append('loading="lazy"')
    if not has_dec:
        attrs.append('decoding="async"')
    if not has_fp:
        attrs.append('fetchPriority="low"')
    if not attrs:
        return tag
    if tag.endswith('/>'):
        return tag[:-2] + ' ' + ' '.join(attrs) + ' />'
    if tag.endswith('>'):
        return tag[:-1] + ' ' + ' '.join(attrs) + '>'
    return tag

for rel in [
    'src/components/board/EventFeedPost.tsx',
    'src/components/portal/MemberBoard.tsx',
    'src/components/admin/EventsAdmin.tsx',
]:
    p = Path(rel)
    if not p.exists():
        print('missing', rel)
        continue
    t = p.read_text()
    t2 = re.sub(r'<img\b[^>]*>', lambda m: optimize_img_tag(m.group(0)), t)
    if t2 != t:
        p.write_text(t2)
        print(rel, 'updated')
    else:
        print(rel, 'unchanged')

print('DONE')
