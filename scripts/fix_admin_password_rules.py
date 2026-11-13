#!/usr/bin/env python3
from pathlib import Path

p = Path('firestore.rules')
t = p.read_text()

old = '''    function isSelfAdminFieldUpdate() {
      return isAuthenticated() &&
             request.auth.token.email == resource.data.email &&
             incoming().keys().hasOnly(['lastLoginAt', 'mustChangePassword']) &&
             (incoming().lastLoginAt is number || incoming().mustChangePassword is bool);
    }'''

new = '''    function isSelfAdminFieldUpdate() {
      // Comparar emails em minúsculas — o token Auth e o campo email do doc
      // podem diferir só na capitalização (senão a troca de senha falhava em silêncio).
      return isAuthenticated() &&
             request.auth.token.email.lower() == resource.data.email.lower() &&
             incoming().keys().hasOnly(['lastLoginAt', 'mustChangePassword']) &&
             (incoming().lastLoginAt is number || incoming().mustChangePassword is bool);
    }'''

if old not in t:
    raise SystemExit('isSelfAdminFieldUpdate not found')
t = t.replace(old, new, 1)
p.write_text(t)
print('firestore.rules OK')
