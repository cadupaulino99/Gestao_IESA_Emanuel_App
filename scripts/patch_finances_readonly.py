#!/usr/bin/env python3
from pathlib import Path
import re

# ─── Finances.tsx ──────────────────────────────────────────────────────────
p = Path('src/pages/Finances.tsx')
t = p.read_text()

if "from '../lib/roles'" not in t:
    t = t.replace(
        "import { useAuth } from '../context/AuthContext';",
        "import { useAuth } from '../context/AuthContext';\nimport { getPermissions } from '../lib/roles';",
    )

t = t.replace(
    "const { user, isAdmin, userRole } = useAuth();",
    "const { user, isAdmin, userRole, isSuperAdmin } = useAuth();\n  const canWriteFinances = getPermissions(userRole, isSuperAdmin).financesWrite;",
)

# isClosed includes read-only roles
old_closed = "const isClosed = (isMonthClosed || isYearClosed) && userRole !== 'admin';"
new_closed = "const periodClosed = (isMonthClosed || isYearClosed) && userRole !== 'admin';\n  const isClosed = periodClosed || !canWriteFinances;"
if old_closed in t:
    t = t.replace(old_closed, new_closed)
    print('isClosed updated')
else:
    print('WARN isClosed')

# Better toasts
t = t.replace(
    "toast.error('Mês/ano encerrado. Apenas administradores podem registar.');",
    "toast.error(!canWriteFinances\n      ? 'O seu papel tem acesso só de leitura às finanças.'\n      : 'Mês/ano encerrado. Apenas administradores podem registar.');",
)

# Banner after header area - insert near first major return content
# Look for "Nova Receita" buttons and wrap
if 'Modo só leitura' not in t:
    # Prepend banner before the action buttons row containing Nova Receita
    marker = 'Nova Receita'
    idx = t.find(marker)
    if idx > 0:
        # find start of button line
        line_start = t.rfind('\n', 0, idx)
        banner = '''
      {!canWriteFinances && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Modo só leitura.</strong> O seu papel permite consultar finanças, mas não criar, editar nem apagar registos.
        </div>
      )}
'''
        t = t[:line_start] + banner + t[line_start:]
        print('banner added')

# Hide write shortcut buttons when read-only: disable openNova handlers already toast;
# also disable buttons visually by changing onClick cards
# Nova Receita / Nova Despesa buttons use onClick={openNova...} - disabled via open functions

# Guard toggleMonthStatus / critical writes at start of handlers if easy
for fn in ['const toggleMonthStatus', 'const toggleYearStatus']:
    if fn in t and 'canWriteFinances' not in t[t.find(fn):t.find(fn)+200]:
        pass

# openNova already checks isClosed

p.write_text(t)
print('Finances.tsx done', len(t))

# ─── Helper for other pages ────────────────────────────────────────────────
def patch_page(path: str, auth_pattern: str, auth_replace: str):
    fp = Path(path)
    if not fp.exists():
        print('skip missing', path)
        return
    s = fp.read_text()
    if 'canWriteFinances' in s:
        print(path, 'already')
        return
    if "from '../lib/roles'" not in s and 'from "../lib/roles"' not in s:
        s = s.replace(
            "import { useAuth } from '../context/AuthContext';",
            "import { useAuth } from '../context/AuthContext';\nimport { getPermissions } from '../lib/roles';",
        )
    if auth_pattern in s:
        s = s.replace(auth_pattern, auth_replace)
    else:
        print('WARN auth', path)

    # Guard common write entry points
    # Inject at start of functions that call addDoc - harder.
    # Simpler: hide primary "Adicionar" buttons if present
    if 'canWriteFinances' in s and '{canWriteFinances &&' not in s:
        # Add banner after export default function opening return - skip if complex
        pass

    # At the beginning of component after canWrite, wrap isAdmin checks
    # For pages that use isAdmin for showing forms:
    s = s.replace('isAdmin &&', '(isAdmin && canWriteFinances) &&')
    s = s.replace('isAdmin ?', '(isAdmin && canWriteFinances) ?')

    fp.write_text(s)
    print('patched', path)

patch_page(
    'src/pages/BuildingFund.tsx',
    "const { user, isAdmin } = useAuth();",
    "const { user, isAdmin, userRole, isSuperAdmin } = useAuth();\n  const canWriteFinances = getPermissions(userRole, isSuperAdmin).financesWrite;",
)
patch_page(
    'src/pages/Assets.tsx',
    "const { user, isAdmin } = useAuth();",
    "const { user, isAdmin, userRole, isSuperAdmin } = useAuth();\n  const canWriteFinances = getPermissions(userRole, isSuperAdmin).financesWrite;",
)
patch_page(
    'src/pages/Contributions.tsx',
    "const { user, userRole, isAdmin } = useAuth();",
    "const { user, userRole, isAdmin, isSuperAdmin } = useAuth();\n  const canWriteFinances = getPermissions(userRole, isSuperAdmin).financesWrite;",
)

# Contributions/BuildingFund/Assets: add early return guards in handleSave if found
for path in ['src/pages/BuildingFund.tsx', 'src/pages/Assets.tsx', 'src/pages/Contributions.tsx']:
    fp = Path(path)
    if not fp.exists():
        continue
    s = fp.read_text()
    # insert guard into first async save-like function
    if 'if (!canWriteFinances)' not in s:
        s2 = re.sub(
            r'(const handleSave\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)',
            r"\1\n    if (!canWriteFinances) { toast.error('O seu papel tem acesso só de leitura às finanças.'); return; }",
            s,
            count=1,
        )
        if s2 == s:
            s2 = re.sub(
                r'(const onSubmit\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)',
                r"\1\n    if (!canWriteFinances) { toast.error('O seu papel tem acesso só de leitura às finanças.'); return; }",
                s,
                count=1,
            )
        s = s2
        if 'toast' in s and "from 'sonner'" not in s and 'from "sonner"' not in s:
            s = s.replace(
                "import { useAuth } from '../context/AuthContext';",
                "import { useAuth } from '../context/AuthContext';\nimport { toast } from 'sonner';",
            )
        fp.write_text(s)
        print('guards', path)

print('ALL DONE')
