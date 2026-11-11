#!/usr/bin/env python3
"""Aplica papéis IESA em access, Layout, Admin, firestore.rules e Worker."""
from pathlib import Path
import re

# ─── access.ts ─────────────────────────────────────────────────────────────
access = Path('src/lib/access.ts')
access.write_text(
'''/**
 * Decisões de acesso do AuthContext (funções puras / testáveis).
 * Papéis canónicos: ver src/lib/roles.ts
 */
import {
  ALL_ROLE_CODES,
  isStaffRole,
  isFullAccessRole,
  type AppRoleCode,
} from './roles';

/** Papéis que acedem à área de liderança (não-membro). */
export const LEADERSHIP_ROLES = ALL_ROLE_CODES;
export type LeadershipRole = AppRoleCode;

/** Papel a partir do documento admins/<email>. */
export function resolveRole(adminDocExists: boolean, roleField: unknown): string | null {
  if (!adminDocExists) return null;
  if (typeof roleField === 'string' && roleField && isStaffRole(roleField)) {
    return roleField;
  }
  // Legado: documento sem role válido conta como admin
  return 'admin';
}

/** Qualquer staff (grupos A/B/C). */
export function isLeadership(role: string | null): role is LeadershipRole {
  return isStaffRole(role);
}

/** Acesso total operacional (grupo A ou super). */
export function isFullLeadership(role: string | null, isSuper = false): boolean {
  return isFullAccessRole(role, isSuper);
}

/** Primeiro documento de uma lista (portal do membro) ou null. */
export function firstMemberOrNone<T>(docs: T[]): T | null {
  return docs.length ? docs[0] : null;
}
'''
)
print('access.ts rewritten')

# ─── Layout.tsx ────────────────────────────────────────────────────────────
layout = Path('src/components/Layout.tsx')
lt = layout.read_text()
if "from '../lib/roles'" not in lt and 'from "../lib/roles"' not in lt:
    # add import after useAuth import line
    lt = lt.replace(
        "import { useAuth } from '../context/AuthContext';",
        "import { useAuth } from '../context/AuthContext';\nimport { getPermissions, roleShortLabel } from '../lib/roles';",
    )

lt = lt.replace(
    "const { user, signOut, isAdmin, userRole } = useAuth();",
    "const { user, signOut, isAdmin, userRole, isSuperAdmin } = useAuth();\n  const perms = getPermissions(userRole, isSuperAdmin);",
)

# Replace navItems construction
old_nav = re.search(
    r"const navItems = \[.*?\];",
    lt,
    re.S,
)
if not old_nav:
    raise SystemExit('navItems not found')

new_nav = '''const navItems = [
    { name: 'Início', path: '/', icon: PieChart, show: true },
    { name: 'Membros', path: '/members', icon: Users, show: perms.members },
    { name: 'Finanças', path: '/finances', icon: Wallet, show: perms.financesRead },
    { name: 'Obrigações', path: '/obligations', icon: HeartHandshake, show: perms.financesRead },
    { name: 'Fundo de Construção', path: '/building-fund', icon: Building2, show: perms.financesRead },
    { name: 'Património', path: '/assets', icon: Landmark, show: perms.financesRead },
    { name: 'Orçamento', path: '/budget', icon: BarChart, show: perms.financesRead },
    { name: 'Relatórios', path: '/reports', icon: ReceiptText, show: perms.financesRead },
    { name: 'Contribuições', path: '/contributions', icon: HandCoins, show: perms.financesRead },
    { name: 'Rádio Maranata', path: '/radio', icon: RadioIcon, show: perms.radio },
    { name: 'Administração', path: '/admin', icon: Shield, show: perms.adminPanel },
  ].filter((i) => i.show);'''

lt = lt[: old_nav.start()] + new_nav + lt[old_nav.end() :]

# Role labels in sidebar
lt = re.sub(
    r"\{userRole === 'admin' \? 'Administrador Geral' : userRole === 'pastor' \? 'Pastor' : userRole === 'treasurer' \? 'Tesoureiro' : 'Acesso Restrito'\}",
    "{isSuperAdmin ? 'Super administrador' : roleShortLabel(userRole)}",
    lt,
)
layout.write_text(lt)
print('Layout.tsx updated')

# ─── Admin.tsx ─────────────────────────────────────────────────────────────
admin = Path('src/pages/Admin.tsx')
at = admin.read_text()
if "from '../lib/roles'" not in at:
    at = at.replace(
        "import { useAuth } from '../context/AuthContext';",
        "import { useAuth } from '../context/AuthContext';\nimport { ROLE_SELECT_OPTIONS, getPermissions, roleLabel } from '../lib/roles';",
    )

# Ensure isSuperAdmin from useAuth - check
if 'isSuperAdmin' not in at.split('useAuth()')[0][-200:] and 'isSuperAdmin' not in re.search(r'const \{[^}]+\} = useAuth\(\)', at).group(0):
    at = re.sub(
        r'const \{([^}]+)\} = useAuth\(\)',
        lambda m: m.group(0) if 'isSuperAdmin' in m.group(1) else f"const {{{m.group(1).rstrip()}, isSuperAdmin}} = useAuth()",
        at,
        count=1,
    )

if 'const perms = getPermissions' not in at:
    at = at.replace(
        'const { user, userRole',
        'const perms = getPermissions(userRole, isSuperAdmin);\n  // placeholder\n  const { user, userRole',
    )
    # fix order - useAuth first then perms
    at = at.replace(
        'const perms = getPermissions(userRole, isSuperAdmin);\n  // placeholder\n  const { user, userRole',
        'const { user, userRole',
    )
    # insert after useAuth line
    m = re.search(r'const \{[^}]+\} = useAuth\(\);\n', at)
    if m:
        at = at[: m.end()] + '  const perms = getPermissions(userRole, isSuperAdmin);\n' + at[m.end() :]

# Route gate
at = at.replace(
    "if (userRole !== 'admin') {\n    return <Navigate to=\"/\" />;\n  }",
    "if (!perms.adminPanel) {\n    return <Navigate to=\"/\" />;\n  }",
)

# Signups tab: staff
at = at.replace(
    "{userRole === 'admin' && (<TabsTrigger value=\"signups\"><UserPlus className=\"h-4 w-4 mr-2\" /> Cadastros Pendentes</TabsTrigger>)}",
    "{perms.adminSignups && (<TabsTrigger value=\"signups\"><UserPlus className=\"h-4 w-4 mr-2\" /> Cadastros Pendentes</TabsTrigger>)}",
)

# Church / data / trash / audit tabs only full access
for tab, perm in [
    ('church', 'adminChurchData'),
    ('data', 'adminDataTools'),
    ('trash', 'adminDataTools'),
    ('audit', 'adminAudit'),
]:
    # TabsTrigger value="church"
    pattern = rf'(<TabsTrigger value="{tab}")'
    if re.search(pattern, at) and f'perms.{perm}' not in at[at.find(f'value="{tab}"') - 40 : at.find(f'value="{tab}"') + 10]:
        at = re.sub(
            rf'<TabsTrigger value="{tab}"',
            f'{{perms.{perm} && (<TabsTrigger value="{tab}"',
            at,
            count=1,
        )
        # close TabsTrigger - find matching close after value
        # Simpler: wrap already opened - need closing )}
        # Find the TabsTrigger line end
        idx = at.find(f'value="{tab}"')
        close = at.find('</TabsTrigger>', idx)
        if close > 0 and not at[close : close + 20].startswith('</TabsTrigger>)}'):
            at = at[: close + len('</TabsTrigger>')] + ')}' + at[close + len('</TabsTrigger>') :]

# Role select options
old_select = '''                            <SelectContent>
                              <SelectItem value="admin">Administrador Geral</SelectItem>
                              <SelectItem value="pastor">Pastor</SelectItem>
                              <SelectItem value="treasurer">Tesoureiro</SelectItem>
                            </SelectContent>'''
new_select = '''                            <SelectContent>
                              {ROLE_SELECT_OPTIONS.map((r) => (
                                <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>'''
if old_select in at:
    at = at.replace(old_select, new_select)
    print('Admin role select updated')
else:
    print('WARN: role select block not exact')

# Export Excel Papel column use roleLabel if easy - skip

admin.write_text(at)
print('Admin.tsx updated')

# ─── firestore.rules ───────────────────────────────────────────────────────
rules = Path('firestore.rules')
rt = rules.read_text()

# Expand helper functions after isPastor
old_fn = '''    function isPastor() {
       return isAuthenticated() && getRole() == 'pastor';
    }
    function hasFinancialWriteAccess() {
       return isAdmin() || isTreasurer() || isPastor();
    }'''

new_fn = '''    function isPastor() {
       return isAuthenticated() && getRole() == 'pastor';
    }
    // v1.21.25 — matriz de papéis IESA
    function isSpiritual() {
      return isAuthenticated() && getRole() in ['pastor', 'evangelista', 'catequista'];
    }
    function isOffice() {
      return isAuthenticated() && getRole() in ['secretario', 'diacono'];
    }
    function isFullAccess() {
      return isSuperAdmin() || isAdmin() || isTreasurer();
    }
    function isStaff() {
      return isFullAccess() || isSpiritual() || isOffice();
    }
    function canManageMembers() {
      return isStaff();
    }
    // Escrita financeira: só grupo A (admin / tesoureiro / super)
    function hasFinancialWriteAccess() {
       return isFullAccess();
    }
    // Leitura financeira: grupo A + liderança espiritual
    function hasFinancialReadAccess() {
       return isFullAccess() || isSpiritual();
    }'''

if 'function isSpiritual()' not in rt:
    if old_fn not in rt:
        # tolerant whitespace
        m = re.search(
            r'function isPastor\(\)\s*\{[^}]+\}\s*function hasFinancialWriteAccess\(\)\s*\{[^}]+\}',
            rt,
        )
        if not m:
            raise SystemExit('isPastor/hasFinancialWriteAccess block not found')
        rt = rt[: m.start()] + new_fn + rt[m.end() :]
    else:
        rt = rt.replace(old_fn, new_fn)
    print('firestore role helpers')
else:
    print('firestore helpers already')

# canPublishBoard -> isStaff
rt = rt.replace(
    '''    function canPublishBoard() {
      return hasFinancialWriteAccess();
    }''',
    '''    function canPublishBoard() {
      return isStaff();
    }''',
)

# expenses/tithes read: use hasFinancialReadAccess for read,list where only write was used
# Conservative: replace "allow read, list: if hasFinancialWriteAccess()" in finance-ish area
rt = rt.replace(
    'allow read, list: if hasFinancialWriteAccess();',
    'allow read, list: if hasFinancialReadAccess();',
)

# Admin role validation list
rt = rt.replace(
    "data.role is string && data.role in ['admin', 'pastor', 'treasurer']",
    "data.role is string && data.role in ['admin', 'pastor', 'treasurer', 'evangelista', 'catequista', 'secretario', 'diacono']",
)

# Members / leadership writes that used only isAdmin() for create on member-related
# Expand isAdmin() on members collection carefully - read file section
# Replace common pattern for members allow create/update with canManageMembers when isAdmin only
# Too broad to replace all isAdmin() - target match /members
members_idx = rt.find('match /members/')
if members_idx > 0:
    # next match after members block - approximate 80 lines
    chunk = rt[members_idx : members_idx + 2500]
    chunk2 = chunk.replace('if isAdmin()', 'if canManageMembers()')
    rt = rt[:members_idx] + chunk2 + rt[members_idx + len(chunk) :]
    print('members rules expanded to canManageMembers')

rules.write_text(rt)
print('firestore.rules updated')

# ─── Worker leadership list ───────────────────────────────────────────────
js = Path('worker/ai-worker.js')
jt = js.read_text()
old_w = "if (!role || !['admin', 'pastor', 'treasurer'].includes(role))"
new_w = "if (!role || !['admin', 'pastor', 'treasurer', 'evangelista', 'catequista', 'secretario', 'diacono'].includes(role))"
if old_w in jt:
    jt = jt.replace(old_w, new_w)
    js.write_text(jt)
    print('worker leadership roles expanded')
else:
    print('worker role list skip')

print('ALL DONE')
