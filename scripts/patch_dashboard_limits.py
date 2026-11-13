#!/usr/bin/env python3
from pathlib import Path

p = Path('src/pages/Dashboard.tsx')
t = p.read_text()

old = '''    queryFn: async () => {
      try {
        const membersSnapshot = await getDocs(collection(db, 'members'));
        const membersData = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let tithes = 0, offerings = 0, expenses = 0;
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
          name: monthNamePT(i + 1, true), Entradas: 0, Saídas: 0, Dízimos: 0, Ofertas: 0, Despesas: 0,
        }));
        let activities: any[] = [];
        let budgetStats: any[] = [];
        let eventsData: any[] = [];
        let tithesSnapshot: any, offeringsSnapshot: any, expensesSnapshot: any, budgetDoc: any;

        if (isFinancialStaff) {
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
        }'''

new = '''    queryFn: async () => {
      try {
        // Limites: igreja local raramente ultrapassa isto; evita descarregar coleções inteiras.
        const MEMBERS_CAP = 500;
        const EVENTS_CAP = 30;
        const membersQ = query(collection(db, 'members'), orderBy('name', 'asc'), limit(MEMBERS_CAP));
        const eventsQ = query(collection(db, 'events'), orderBy('date', 'desc'), limit(EVENTS_CAP));

        let membersSnapshot: any;
        let tithes = 0, offerings = 0, expenses = 0;
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
          name: monthNamePT(i + 1, true), Entradas: 0, Saídas: 0, Dízimos: 0, Ofertas: 0, Despesas: 0,
        }));
        let activities: any[] = [];
        let budgetStats: any[] = [];
        let eventsData: any[] = [];
        let tithesSnapshot: any, offeringsSnapshot: any, expensesSnapshot: any, budgetDoc: any;

        if (isFinancialStaff) {
          // Uma só vaga de rede: membros + eventos + finanças do ano em paralelo
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
        const membersData = membersSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));'''

if old not in t:
    raise SystemExit('dashboard block not found')
t = t.replace(old, new)

# Remove extra 90-day tithes query — reuse year snapshot for inactive/retention
old2 = '''        const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        let inactiveTithers: any[] = [];
        let globalRetentionRate = 0;

        if (isFinancialStaff) {
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
        }'''

new2 = '''        const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
        let inactiveTithers: any[] = [];
        let globalRetentionRate = 0;

        // Usa só os dízimos do ano já carregados (evita 2.ª varredura à coleção tithes)
        if (isFinancialStaff && tithesSnapshot) {
          const yearTithes = tithesSnapshot.docs.map((d: any) => d.data());
          inactiveTithers = membersData.filter((m: any) => {
            if (m.status && m.status !== 'Activo') return false;
            if (!m.createdAt || m.createdAt > threeMonthsAgo) return false;
            return !yearTithes.some((t: any) => t.memberId === m.id && t.createdAt && t.createdAt >= threeMonthsAgo);
          });
          const activeMembersCount = membersData.filter((m: any) => m.status === 'Activo' || !m.status).length;
          const tithedMembersSet = new Set(yearTithes.map((t: any) => t.memberId));
          globalRetentionRate = activeMembersCount > 0 ? Math.round((tithedMembersSet.size / activeMembersCount) * 100) : 0;
        }'''

if old2 not in t:
    raise SystemExit('inactive block not found')
t = t.replace(old2, new2)

p.write_text(t)
print('Dashboard optimized')
