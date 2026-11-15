#!/usr/bin/env python3
"""Injeta VITE_FIREBASE_APPCHECK_SITE_KEY no passo de build do Android."""
from pathlib import Path
import re

p = Path('.github/workflows/build-android.yml')
t = p.read_text()

# Evitar escrever ${{ }} em strings de workflow YAML (interpolação). Aqui é .py — literal OK.
secret_ref = '${{ secrets.VITE_FIREBASE_APPCHECK_SITE_KEY }}'

if f'VITE_FIREBASE_APPCHECK_SITE_KEY: {secret_ref}' in t:
    print('already patched')
    raise SystemExit(0)

pat = re.compile(
    r'      - name: Build web \+ sincronizar Capacitor\n'
    r'        run: \|\n'
    r'          npm run build\n'
    r'          npx cap sync android\n'
)
m = pat.search(t)
if not m:
    i = t.find('Build web')
    print('DEBUG:', repr(t[i:i + 200]))
    raise SystemExit('pattern not found')

new = (
    '      - name: Build web + sincronizar Capacitor\n'
    '        env:\n'
    f'          VITE_FIREBASE_APPCHECK_SITE_KEY: {secret_ref}\n'
    '        run: |\n'
    '          if [ -n "$VITE_FIREBASE_APPCHECK_SITE_KEY" ]; then\n'
    '            echo "App Check site key presente no build (Android)."\n'
    '          else\n'
    '            echo "Sem VITE_FIREBASE_APPCHECK_SITE_KEY — App Check inactivo neste APK."\n'
    '          fi\n'
    '          npm run build\n'
    '          npx cap sync android\n'
)

p.write_text(t[: m.start()] + new + t[m.end() :])
print('patched OK')
