#!/usr/bin/env python3
from pathlib import Path

files = [
    'src/components/board/EventFeedPost.tsx',
    'src/components/portal/MemberBoard.tsx',
    'src/components/admin/EventsAdmin.tsx',
]

for rel in files:
    p = Path(rel)
    if not p.exists():
        print('skip missing', rel)
        continue
    t = p.read_text()
    orig = t

    # Ensure loading=lazy on cartaz imgs that lack it
    # Pattern: <img src=... alt="Cartaz... without loading=
    import re

    def add_lazy(m):
        tag = m.group(0)
        if 'loading=' in tag:
            if 'decoding=' not in tag:
                tag = tag.replace('/>', ' decoding="async" />').replace('>', ' decoding="async">', 1) if 'decoding=' not in tag else tag
                # careful with self-closing
                if 'decoding=' not in tag:
                    if tag.endswith('/>'):
                        tag = tag[:-2] + ' decoding="async" />'
                    elif tag.endswith('>'):
                        tag = tag[:-1] + ' decoding="async">'
            return tag
        if tag.endswith('/>'):
            return tag[:-2] + ' loading="lazy" decoding="async" />'
        if tag.endswith('>'):
            return tag[:-1] + ' loading="lazy" decoding="async">'
        return tag

    t2 = re.sub(r'<img\b[^>]*>', add_lazy, t)
    # Only touch cartaz-related or all imgs in these files (they're poster-heavy)
    if t2 != orig:
        p.write_text(t2)
        print(rel, 'updated')
    else:
        print(rel, 'no change')

print('DONE')
