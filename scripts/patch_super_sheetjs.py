#!/usr/bin/env python3
from pathlib import Path

# firestore.rules
p = Path("firestore.rules")
t = p.read_text()
if "Endurecido (2026-11-05)" in t and "data.role in ['admin', 'pastor', 'treasurer']" in t:
    print("rules already")
else:
    old_boot = (
        "    // Bootstrap AUTO-EXTINGUÍVEL: enquanto não existir admins/<email do fundador>,\n"
        "    // esse email pode criar o PRÓPRIO documento (uma vez). Depois morre para sempre.\n"
        "    function isBootstrapCreate(adminId) {\n"
        "      return isAuthenticated() &&\n"
        '        (request.auth.token.email == "Cadupaulino99@gmail.com" ||\n'
        '         request.auth.token.email == "cadupaulino99@gmail.com") &&\n'
        "        adminId == request.auth.token.email &&\n"
        "        !exists(/databases/$(database)/documents/admins/$(request.auth.token.email));\n"
        "    }"
    )
    new_boot = (
        "    // Bootstrap AUTO-EXTINGUÍVEL: enquanto não existir admins/<email do fundador>,\n"
        "    // esse email pode criar o PRÓPRIO documento (uma vez). Depois morre para sempre.\n"
        "    // Endurecido (2026-11-05): obriga role=admin, isSuper=true e email = token\n"
        "    // (evita o fundador criar um doc fraco ou com papel errado na 1.ª escrita).\n"
        "    function isBootstrapCreate(adminId) {\n"
        "      return isAuthenticated() &&\n"
        '        (request.auth.token.email == "Cadupaulino99@gmail.com" ||\n'
        '         request.auth.token.email == "cadupaulino99@gmail.com") &&\n'
        "        adminId == request.auth.token.email &&\n"
        "        !exists(/databases/$(database)/documents/admins/$(request.auth.token.email)) &&\n"
        "        incoming().keys().hasAll(['email', 'role', 'createdAt', 'isSuper']) &&\n"
        "        incoming().email == request.auth.token.email &&\n"
        "        incoming().role == 'admin' &&\n"
        "        incoming().isSuper == true;\n"
        "    }"
    )
    if old_boot not in t:
        raise SystemExit("bootstrap block missing")
    t = t.replace(old_boot, new_boot, 1)
    old_valid = (
        "    function isValidAdmin(data) {\n"
        "      return data.keys().hasAll(['email', 'role', 'createdAt']) && data.keys().size() <= 10 &&\n"
        "             data.email is string && data.email.size() <= 200 && data.email.size() > 0 &&\n"
        "             data.role is string &&\n"
        "             data.createdAt is number;\n"
        "    }"
    )
    new_valid = (
        "    function isValidAdmin(data) {\n"
        "      return data.keys().hasAll(['email', 'role', 'createdAt']) && data.keys().size() <= 12 &&\n"
        "             data.email is string && data.email.size() <= 200 && data.email.size() > 0 &&\n"
        "             data.role is string && data.role in ['admin', 'pastor', 'treasurer'] &&\n"
        "             data.createdAt is number &&\n"
        "             (!('isSuper' in data.keys()) || data.isSuper is bool) &&\n"
        "             (!('disabled' in data.keys()) || data.disabled is bool) &&\n"
        "             (!('mustChangePassword' in data.keys()) || data.mustChangePassword is bool);\n"
        "    }"
    )
    if old_valid not in t:
        raise SystemExit("isValidAdmin missing")
    t = t.replace(old_valid, new_valid, 1)
    p.write_text(t)
    print("rules patched")

ap = Path("src/pages/Admin.tsx")
at = ap.read_text()
old = "const isSuperRow = u.isSuper === true || u.id.toLowerCase() === 'cadupaulino99@gmail.com';"
new = "const isSuperRow = u.isSuper === true;"
if old in at:
    ap.write_text(at.replace(old, new, 1))
    print("badge patched")
elif new in at:
    print("badge already")
else:
    raise SystemExit("badge pattern missing")

docs = Path("docs/DEPENDENCIAS-EXTERNAS.md")
docs.parent.mkdir(parents=True, exist_ok=True)
docs.write_text(
    """# Dependencias externas criticas

## SheetJS (`xlsx` 0.20.3)

- Origem: tarball oficial `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
  (nao usar o pacote abandonado do npm registry com CVEs conhecidos).
- Integridade: `package-lock.json` fixa
  `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`.
- Uso: exportacoes Excel (Financas, Relatorios, Membros, Admin) via `import('xlsx')` + `saveXlsx`.
- Riscos: `npm ci` depende do CDN SheetJS; sem rede a instalacao falha.
- Mitigacoes: manter lockfile; espelho interno do `.tgz` em CI offline; nao voltar ao `xlsx` npm antigo.

## Bootstrap de super administrador

- Super = apenas `admins/<email>.isSuper == true`.
- Bootstrap auto-extinguivel: email fundador, uma vez, com `role: admin` e `isSuper: true`.
- Worker e UI deixam de usar email hardcoded como fonte de autoridade.
"""
)
print("docs written")
print("done")
