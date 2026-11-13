#!/usr/bin/env python3
from pathlib import Path

p = Path('firestore.rules')
t = p.read_text()

# 1) Inserir authEmail() e reescrever getRole / isSuperAdmin / isBootstrapCreate
old_block = '''    function isAuthenticated() {
      return request.auth != null;
    }

    function getRole() {
      return exists(/databases/$(database)/documents/admins/$(request.auth.token.email)) 
        ? get(/databases/$(database)/documents/admins/$(request.auth.token.email)).data.role 
        : null;
    }

    // Check if the current user is an admin.
    // O papel vem UNICAMENTE do documento admins/<email> (auditoria 2026-10-24).
    function isAdmin() {
      return isAuthenticated() && getRole() == 'admin';
    }

    // Super admin: APENAS a flag isSuper no documento admins/<email>.
    // v1.14.5 (auditoria P1): removido o fallback de email hardcoded — era
    // uma porta permanente (quem comprometesse a conta Gmail herdava super).
    // Flag isSuper:true confirmada no documento pelo proprietário (2026-10-27).
    // Recuperação se o documento for destruído: bootstrap auto-extinguível
    // abaixo + consola do Firestore.
    function isSuperAdmin() {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/admins/$(request.auth.token.email)) &&
        get(/databases/$(database)/documents/admins/$(request.auth.token.email)).data.isSuper == true;
    }

    // Bootstrap AUTO-EXTINGUÍVEL: enquanto não existir admins/<email do fundador>,
    // esse email pode criar o PRÓPRIO documento (uma vez). Depois morre para sempre.
    // Endurecido (2026-11-05): obriga role=admin, isSuper=true e email = token
    // (evita o fundador criar um doc fraco ou com papel errado na 1.ª escrita).
    function isBootstrapCreate(adminId) {
      return isAuthenticated() &&
        (request.auth.token.email == "Cadupaulino99@gmail.com" ||
         request.auth.token.email == "cadupaulino99@gmail.com") &&
        adminId == request.auth.token.email &&
        !exists(/databases/$(database)/documents/admins/$(request.auth.token.email)) &&
        incoming().keys().hasAll(['email', 'role', 'createdAt', 'isSuper']) &&
        incoming().email == request.auth.token.email &&
        incoming().role == 'admin' &&
        incoming().isSuper == true;
    }'''

new_block = '''    function isAuthenticated() {
      return request.auth != null;
    }

    // Email do token sempre em minúsculas — os docs admins/<id> usam id em minúsculas.
    // Sem isto, Auth com capitalização diferente não encontrava o papel (isAdmin/isSuper).
    function authEmail() {
      return request.auth.token.email.lower();
    }

    function getRole() {
      return exists(/databases/$(database)/documents/admins/$(authEmail()))
        ? get(/databases/$(database)/documents/admins/$(authEmail())).data.role
        : null;
    }

    // Check if the current user is an admin.
    // O papel vem UNICAMENTE do documento admins/<email> (auditoria 2026-10-24).
    function isAdmin() {
      return isAuthenticated() && getRole() == 'admin';
    }

    // Super admin: APENAS a flag isSuper no documento admins/<email>.
    // v1.14.5 (auditoria P1): removido o fallback de email hardcoded — era
    // uma porta permanente (quem comprometesse a conta Gmail herdava super).
    // Flag isSuper:true confirmada no documento pelo proprietário (2026-10-27).
    // Recuperação se o documento for destruído: bootstrap auto-extinguível
    // abaixo + consola do Firestore.
    function isSuperAdmin() {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/admins/$(authEmail())) &&
        get(/databases/$(database)/documents/admins/$(authEmail())).data.isSuper == true;
    }

    // Bootstrap AUTO-EXTINGUÍVEL: enquanto não existir admins/<email do fundador>,
    // esse email pode criar o PRÓPRIO documento (uma vez). Depois morre para sempre.
    // Endurecido (2026-11-05): obriga role=admin, isSuper=true e email = token
    // (evita o fundador criar um doc fraco ou com papel errado na 1.ª escrita).
    // adminId e email do documento têm de estar em minúsculas (authEmail()).
    function isBootstrapCreate(adminId) {
      return isAuthenticated() &&
        authEmail() == "cadupaulino99@gmail.com" &&
        adminId == authEmail() &&
        !exists(/databases/$(database)/documents/admins/$(authEmail())) &&
        incoming().keys().hasAll(['email', 'role', 'createdAt', 'isSuper']) &&
        incoming().email.lower() == authEmail() &&
        incoming().role == 'admin' &&
        incoming().isSuper == true;
    }'''

if old_block not in t:
    raise SystemExit('top helpers block not found')
t = t.replace(old_block, new_block, 1)

# 2) Leitura de admins/{adminId}: comparar com email normalizado
old_read = '''    match /admins/{adminId} {
      // ler a si próprio (login/portal) ou ao super; listar: só super
      allow read: if isAuthenticated() && (request.auth.token.email == adminId || isSuperAdmin());'''

new_read = '''    match /admins/{adminId} {
      // ler a si próprio (login/portal) ou ao super; listar: só super
      // adminId deve ser o email em minúsculas (como grava a app)
      allow read: if isAuthenticated() && (authEmail() == adminId.lower() || isSuperAdmin());'''

if old_read not in t:
    raise SystemExit('admins read rule not found')
t = t.replace(old_read, new_read, 1)

p.write_text(t)
print('firestore.rules authEmail() OK')
