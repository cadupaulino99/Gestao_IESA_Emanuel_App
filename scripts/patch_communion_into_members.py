#!/usr/bin/env python3
"""Move Comunhão standalone into Members tab; replace old CommunionTracker."""
from pathlib import Path
import re

m = Path("src/pages/Members.tsx")
t = m.read_text()
t = t.replace(
    "import CommunionTracker from '../components/members/CommunionTracker';",
    "import CommunionMonthlyAdmin from '../components/admin/CommunionMonthlyAdmin';",
)
if "useLocation" not in t:
    t = t.replace(
        "import { useAuth } from '../context/AuthContext';",
        "import { useLocation } from 'react-router-dom';\nimport { useAuth } from '../context/AuthContext';",
    )
if "const [tab, setTab]" not in t:
    t = t.replace(
        "  const { user, isAdmin, userRole } = useAuth();",
        "  const { user, isAdmin, userRole } = useAuth();\n"
        "  const location = useLocation();\n"
        "  const initialTab = (location.state as { tab?: string } | null)?.tab === 'comunhao' ? 'comunhao' : 'lista';\n"
        "  const [tab, setTab] = useState(initialTab);",
    )
t = t.replace(
    '<Tabs defaultValue="lista" className="space-y-3">',
    '<Tabs value={tab} onValueChange={setTab} className="space-y-3">',
)
pat = r'<TabsContent value="comunhao" className="mt-0">[\s\S]*?</TabsContent>'
repl = (
    '<TabsContent value="comunhao" className="mt-0">\n'
    "          {userRole === 'admin' ? (\n"
    "            <CommunionMonthlyAdmin />\n"
    "          ) : (\n"
    '            <p className="rounded-xl border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">\n'
    "              O registo de comunhão está disponível apenas para administradores.\n"
    "            </p>\n"
    "          )}\n"
    "        </TabsContent>"
)
t2, n = re.subn(pat, repl, t, count=1)
if n != 1:
    raise SystemExit(f"comunhao TabsContent: {n}")
if "CommunionTracker" in t2:
    raise SystemExit("CommunionTracker still referenced")
m.write_text(t2)
print("Members ok")

lay = Path("src/components/Layout.tsx")
lt = lay.read_text()
lt = lt.replace(
    "    ...(userRole === 'admin' ? [{ name: 'Comunhão', path: '/communion', icon: Church }] : []),\n",
    "",
)
lt = re.sub(r",\s*Church\s*}", " }", lt)
lt = re.sub(r"\{\s*Church,\s*", "{ ", lt)
lay.write_text(lt)
print("Layout ok", "Comunhão" in lt, "/communion" in lt)

Path("src/pages/Communion.tsx").write_text(
    "import { Navigate } from 'react-router-dom';\n\n"
    "/** Redireciona para Membros → aba Comunhão (funcionalidade unificada). */\n"
    "export default function Communion() {\n"
    "  return <Navigate to=\"/members\" replace state={{ tab: 'comunhao' }} />;\n"
    "}\n"
)
print("Communion redirect ok")
print("done")
