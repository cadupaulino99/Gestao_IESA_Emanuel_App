#!/usr/bin/env python3
from pathlib import Path

p = Path('.github/workflows/build-android.yml')
t = p.read_text()

marker = '      - name: Build web + sincronizar Capacitor\n'
if marker not in t:
    raise SystemExit('marker not found')

start = t.index(marker)
# end at next step at same indent
rest = t[start + len(marker):]
# find next "\n      - name:"
import re
m = re.search(r'\n      - name: ', rest)
if not m:
    raise SystemExit('next step not found')
end = start + len(marker) + m.start()
block = t[start:end]
if 'VITE_FIREBASE_APPCHECK_SITE_KEY' in block:
    print('already patched')
    raise SystemExit(0)

new_block = '''      - name: Build web + sincronizar Capacitor
        env:
          VITE_FIREBASE_APPCHECK_SITE_KEY: ${{ secrets.VITE_FIREBASE_APPCHECK_SITE_KEY }}
        run: |
          if [ -n "$VITE_FIREBASE_APPCHECK_SITE_KEY" ]; then
            echo "App Check site key presente no build (Android)."
          else
            echo "Sem VITE_FIREBASE_APPCHECK_SITE_KEY — App Check inactivo neste APK."
          fi
          npm run build
          npx cap sync android
'''

t2 = t[:start] + new_block + t[end:]
p.write_text(t2)
print('patched OK')
print(new_block)
