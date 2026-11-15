#!/usr/bin/env python3
from pathlib import Path
p = Path('.github/workflows/build-android.yml')
t = p.read_text()
if 'VITE_FIREBASE_APPCHECK_SITE_KEY' in t and 'Build web + sincronizar Capacitor' in t:
    # already has key somewhere near build — check step
    idx = t.find('Build web + sincronizar Capacitor')
    snippet = t[idx:idx+400]
    if 'VITE_FIREBASE_APPCHECK_SITE_KEY' in snippet:
        print('already patched')
        raise SystemExit(0)

old = """      - name: Build web + sincronizar Capacitor
        run: |
          npm run build
          npx cap sync android
"""
new = """      - name: Build web + sincronizar Capacitor
        env:
          VITE_FIREBASE_APPCHECK_SITE_KEY: ${{ secrets.VITE_FIREBASE_APPCHECK_SITE_KEY }}
        run: |
          if [ -n \"$VITE_FIREBASE_APPCHECK_SITE_KEY\" ]; then
            echo \"App Check site key presente no build (Android).\"
          else
            echo \"Sem VITE_FIREBASE_APPCHECK_SITE_KEY — App Check inactivo neste APK.\"
          fi
          npm run build
          npx cap sync android
"""
if old not in t:
    raise SystemExit('build step pattern not found:\n' + repr(t[t.find('Build web'):t.find('Build web')+200]))
p.write_text(t.replace(old, new, 1))
print('patched OK')
