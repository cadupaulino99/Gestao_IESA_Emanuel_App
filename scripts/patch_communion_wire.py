#!/usr/bin/env python3
from pathlib import Path
import re

admin = Path("src/pages/Admin.tsx")
t = admin.read_text()
if "CommunionMonthlyAdmin" not in t:
    t = t.replace(
        "import EventsAdmin from '../components/admin/EventsAdmin';",
        "import EventsAdmin from '../components/admin/EventsAdmin';\nimport CommunionMonthlyAdmin from '../components/admin/CommunionMonthlyAdmin';",
    )
if 'value="comunhao"' not in t:
    t = t.replace(
        '<TabsTrigger value="mural"><Bell className="h-4 w-4 mr-2" /> Avisos, Agenda e Eventos</TabsTrigger>',
        '<TabsTrigger value="mural"><Bell className="h-4 w-4 mr-2" /> Avisos, Agenda e Eventos</TabsTrigger>\n          {userRole === \'admin\' && (<TabsTrigger value="comunhao"><Church className="h-4 w-4 mr-2" /> Comunhão</TabsTrigger>)}',
    )
if 'CommunionMonthlyAdmin />' not in t:
    needle = "          <EventsAdmin />\n        </TabsContent>"
    insert = """          <EventsAdmin />
        </TabsContent>
        {userRole === 'admin' && (
          <TabsContent value="comunhao" className="space-y-4">
            <CommunionMonthlyAdmin />
          </TabsContent>
        )}"""
    if needle not in t:
        raise SystemExit("Admin needle missing")
    t = t.replace(needle, insert, 1)
admin.write_text(t)
print("admin wired")

mem = Path("src/pages/Members.tsx")
mt = mem.read_text()
if "userRole" not in mt:
    mt2, n = re.subn(
        r"const \{([^}]+)\} = useAuth\(\)",
        lambda m: ("const { %s, userRole } = useAuth()" % m.group(1).strip()) if "userRole" not in m.group(1) else m.group(0),
        mt,
        count=1,
    )
    if n:
        mt = mt2
old = '<TabsContent value="comunhao" className="mt-0"><CommunionTracker /></TabsContent>'
if old in mt:
    mt = mt.replace(
        old,
        """<TabsContent value=\"comunhao\" className=\"mt-0\">
          {userRole === 'admin' ? (
            <CommunionTracker />
          ) : (
            <p className=\"rounded-xl border bg-muted/40 p-6 text-center text-sm text-muted-foreground\">
              O registo de comunhão está disponível apenas para administradores.
              Use Administração - Comunhão para a presença mensal da Santa Ceia.
            </p>
          )}
        </TabsContent>""",
        1,
    )
    print("members restricted")
elif "presença mensal da Santa Ceia" in mt:
    print("members already")
else:
    print("members unchanged")
mem.write_text(mt)
print("wire done")
