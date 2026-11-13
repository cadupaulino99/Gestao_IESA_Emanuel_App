#!/usr/bin/env python3
from pathlib import Path

p = Path('src/pages/Dashboard.tsx')
t = p.read_text()

# 1) members full collection -> limited query marker
if "MEMBERS_CAP" not in t:
    t = t.replace(
        "const membersSnapshot = await getDocs(collection(db, 'members'));",
        "const MEMBERS_CAP = 500;\n        const EVENTS_CAP = 30;\n        const membersQ = query(collection(db, 'members'), orderBy('name', 'asc'), limit(MEMBERS_CAP));\n        const eventsQ = query(collection(db, 'events'), orderBy('date', 'desc'), limit(EVENTS_CAP));\n        let membersSnapshot: Awaited<ReturnType<typeof getDocs>>;\n        // preenchido abaixo em paralelo",
        1,
    )
    # Fix - the above leaves membersSnapshot unassigned before use. Do fuller replace.

# Start clean from original patterns on disk
t = Path('src/pages/Dashboard.tsx').read_text()

if "MEMBERS_CAP" in t:
    print('already patched')
    raise SystemExit(0)

a = "        const membersSnapshot = await getDocs(collection(db, 'members'));\n        const membersData = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));"
b = """        const MEMBERS_CAP = 500;
        const EVENTS_CAP = 30;
        const membersQ = query(collection(db, 'members'), orderBy('name', 'asc'), limit(MEMBERS_CAP));
        const eventsQ = query(collection(db, 'events'), orderBy('date', 'desc'), limit(EVENTS_CAP));
        let membersSnapshot: any;
        let membersData: any[] = [];"""
if a not in t:
    raise SystemExit('members load block missing')
t = t.replace(a, b, 1)

a2 = """        if (isFinancialStaff) {
          const [eSnap, tSnap, oSnap, expSnap, bDoc] = await Promise.all([
            getDocs(query(collection(db, 'events'))),
            getDocs(query(collection(db, 'tithes'), where('year', '==', year))),
            getDocs(query(collection(db, 'offerings'), where('year', '==', year))),
            getDocs(query(collection(db, 'expenses'), where('year', '==', year))),
            getDoc(doc(db, 'budgets', year.toString())),
          ]);
          eventsData = eSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
          tithesSnapshot = tSnap; offeringsSnapshot = oSnap; expensesSnapshot = expSnap; budgetDoc = bDoc;
        } else {
          const eSnap = await getDocs(query(collection(db, 'events')));
          eventsData = eSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        }"""

b2 = """        if (isFinancialStaff) {
          const [mSnap, eSnap, tSnap, oSnap, expSnap, bDoc] = await Promise.all([
            getDocs(membersQ),
            getDocs(eventsQ),
            getDocs(query(collection(db, 'tithes'), where('year', '==', year))),
            getDocs(query(collection(db, 'offerings'), where('year', '==', year))),
            getDocs(query(collection(db, 'expenses'), where('year', '==', year))),
            getDoc(doc(db, 'budgets', year.toString())),
          ]);
          membersSnapshot = mSnap;
          eventsData = eSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          tithesSnapshot = tSnap; offeringsSnapshot = oSnap; expensesSnapshot = expSnap; budgetDoc = bDoc;
        } else {
          const [mSnap, eSnap] = await Promise.all([
            getDocs(membersQ),
            getDocs(eventsQ),
          ]);
          membersSnapshot = mSnap;
          eventsData = eSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        }
        membersData = membersSnapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));"""

if a2 not in t:
    raise SystemExit('financial parallel block missing')
t = t.replace(a2, b2, 1)

# Drop extra 90d tithes query
a3 = """        if (isFinancialStaff) {
          const recentTithesSnapshot = await getDocs(query(collection(db, 'tithes'), where('createdAt', '>=', threeMonthsAgo)));
          const uniqueTithesMap = new Map();
          tithesSnapshot.docs.forEach((d: any) => uniqueTithesMap.set(d.id, d.data()));
          recentTithesSnapshot.docs.forEach((d: any) => uniqueTithesMap.set(d.id, d.data()));
          const allTithes = Array.from(uniqueTithesMap.values());
          inactiveTithers = membersData.filter((m: any) => {
            if (m.status && m.status !== 'Activo') return false;
            if (!m.createdAt || m.createdAt > threeMonthsAgo) return false;
            return !allTithes.some((t: any) => t.memberId === m.id && t.createdAt && t.createdAt >= threeMonthsAgo);
          });
          const activeMembersCount = membersData.filter((m: any) => m.status === 'Activo' || !m.status).length;
          const tithedMembersSet = new Set(allTithes.filter((t: any) => t.year === year).map((t: any) => t.memberId));
          globalRetentionRate = activeMembersCount > 0 ? Math.round((tithedMembersSet.size / activeMembersCount) * 100) : 0;
        }"""

b3 = """        if (isFinancialStaff && tithesSnapshot) {
          const yearTithes = tithesSnapshot.docs.map((d: any) => d.data());
          inactiveTithers = membersData.filter((m: any) => {
            if (m.status && m.status !== 'Activo') return false;
            if (!m.createdAt || m.createdAt > threeMonthsAgo) return false;
            return !yearTithes.some((t: any) => t.memberId === m.id && t.createdAt && t.createdAt >= threeMonthsAgo);
          });
          const activeMembersCount = membersData.filter((m: any) => m.status === 'Activo' || !m.status).length;
          const tithedMembersSet = new Set(yearTithes.map((t: any) => t.memberId));
          globalRetentionRate = activeMembersCount > 0 ? Math.round((tithedMembersSet.size / activeMembersCount) * 100) : 0;
        }"""

if a3 not in t:
    raise SystemExit('inactive tithes block missing')
t = t.replace(a3, b3, 1)

p.write_text(t)
print('patched ok')
