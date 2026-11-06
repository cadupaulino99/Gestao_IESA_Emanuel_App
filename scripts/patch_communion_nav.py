#!/usr/bin/env python3
from pathlib import Path
import re

Path("src/pages/Communion.tsx").write_text("""import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CommunionMonthlyAdmin from '../components/admin/CommunionMonthlyAdmin';

/** Aba própria: Presença na Comunhão / Santa Ceia (somente admin). */
export default function Communion() {
  const { userRole } = useAuth();
  if (userRole !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <CommunionMonthlyAdmin />
    </div>
  );
}
""")
print("page written")

app = Path("src/App.tsx")
at = app.read_text()
if "path=\"communion\"" not in at:
    if "const Communion" not in at:
        m = re.search(r"const Finances = lazy\([^;]+;", at)
        if not m:
            raise SystemExit("Finances lazy not found")
        at = at[:m.end()] + "\nconst Communion = lazy(() => import('./pages/Communion'));" + at[m.end():]
    at = at.replace(
        '<Route path="finances" element={<Finances />} />',
        '<Route path="finances" element={<Finances />} />\n                      <Route path="communion" element={<Communion />} />',
        1,
    )
    app.write_text(at)
    print("app routed")
else:
    print("app already")

lay = Path("src/components/Layout.tsx")
lt = lay.read_text()
if "HandCoins, Church" not in lt and ", Church }" not in lt:
    if "HandCoins } from 'lucide-react'" in lt:
        lt = lt.replace("HandCoins } from 'lucide-react'", "HandCoins, Church } from 'lucide-react'")
    elif "} from 'lucide-react';" in lt:
        lt = lt.replace("} from 'lucide-react';", ", Church } from 'lucide-react';", 1)
if "path: '/communion'" not in lt:
    lt = lt.replace(
        "{ name: 'Finanças', path: '/finances', icon: Wallet },\n    { name: 'Obrigações'",
        "{ name: 'Finanças', path: '/finances', icon: Wallet },\n    ...(userRole === 'admin' ? [{ name: 'Comunhão', path: '/communion', icon: Church }] : []),\n    { name: 'Obrigações'",
    )
    lt = lt.replace(
        "{ name: 'Finanças', path: '/finances', icon: Wallet },\n    { name: 'Rádio'",
        "{ name: 'Finanças', path: '/finances', icon: Wallet },\n    ...(userRole === 'admin' ? [{ name: 'Comunhão', path: '/communion', icon: Church }] : []),\n    { name: 'Rádio'",
    )
    lay.write_text(lt)
    print("layout nav")
else:
    print("layout already")

adm = Path("src/pages/Admin.tsx")
at = adm.read_text()
n = 0
for old in [
    "import CommunionMonthlyAdmin from '../components/admin/CommunionMonthlyAdmin';\n",
    "          {userRole === 'admin' && (<TabsTrigger value=\"comunhao\"><Church className=\"h-4 w-4 mr-2\" /> Comunhão</TabsTrigger>)}\n",
    "        {userRole === 'admin' && (\n          <TabsContent value=\"comunhao\" className=\"space-y-4\">\n            <CommunionMonthlyAdmin />\n          </TabsContent>\n        )}\n",
]:
    if old in at:
        at = at.replace(old, "")
        n += 1
adm.write_text(at)
print("admin removed blocks", n)
print("done")
