#!/usr/bin/env python3
from pathlib import Path
p = Path('.github/workflows/build-android.yml')
t = p.read_text()
old = '''      - name: Build web + sincronizar Capacitor
        run: |
          npm run build
          npx cap sync android'''
new = '''      - name: Build web + sincronizar Capacitor
        env:
          VITE_FIREBASE_APPCHECK_SITE_KEY: ${{ secrets.VITE_FIREBASE_APPCHECK_SITE_KEY }}
        run: |
          if [ -n "$VITE_FIREBASE_APPCHECK_SITE_KEY" ]; then
            echo "App Check site key presente no build (Android)."
          else
            echo "Sem VITE_FIREBASE_APPCHECK_SITE_KEY — App Check inactivo neste APK."
          fi
          npm run build
          npx cap sync android'''
if old not in t:
    if 'VITE_FIREBASE_APPCHECK_SITE_KEY' in t:
        print('already patched')
    else:
        raise SystemExit('build step not found')
else:
    p.write_text(t.replace(old, new, 1))
    print('build-android App Check env OK')
