#!/usr/bin/env python3
from pathlib import Path

# ── index.css — shimmer keyframes ─────────────────────────────────────────
css = Path('src/index.css')
ct = css.read_text()
if 'iesa-shimmer' not in ct:
    ct += '''

/* Skeletons — brilho lateral (shimmer); desligado se o SO pede menos movimento */
@keyframes iesa-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.skeleton {
  position: relative;
  overflow: hidden;
  background-color: var(--color-muted, var(--muted));
  isolation: isolate;
}
.skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--color-background, var(--background)) 65%, transparent) 50%,
    transparent 100%
  );
  animation: iesa-shimmer 1.35s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton::after { animation: none; }
  .skeleton { opacity: 0.7; }
}
'''
    css.write_text(ct)
    print('index.css shimmer')
else:
    print('index.css already')

# ── Replace animate-pulse bg-muted blocks with skeleton class ─────────────
repls = [
    ('animate-pulse rounded-md bg-muted', 'skeleton rounded-md'),
    ('animate-pulse rounded-xl bg-muted', 'skeleton rounded-xl'),
    ('animate-pulse rounded-full bg-muted', 'skeleton rounded-full'),
    ('animate-pulse rounded bg-muted', 'skeleton rounded'),
    ('bg-muted animate-pulse rounded-full', 'skeleton rounded-full'),
    ('bg-muted animate-pulse rounded', 'skeleton rounded'),
    ('animate-pulse rounded-md bg-muted', 'skeleton rounded-md'),
]

for rel in ('src/App.tsx', 'src/pages/Members.tsx', 'src/pages/Finances.tsx'):
    p = Path(rel)
    if not p.exists():
        print('missing', rel)
        continue
    t = p.read_text()
    n = 0
    for a, b in repls:
        c = t.count(a)
        if c:
            t = t.replace(a, b)
            n += c
    p.write_text(t)
    print(f'{rel}: {n} replacements')

print('DONE')
