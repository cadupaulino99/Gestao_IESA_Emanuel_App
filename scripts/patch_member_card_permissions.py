#!/usr/bin/env python3
"""Corrige permissões/carga do cartão no portal do membro."""
from pathlib import Path
import re

# ─── firestore.rules ───────────────────────────────────────────────────────
rules = Path('firestore.rules')
rt = rules.read_text()

# Expand isOwnMemberDoc to also match memberId → members/{id}.email
old_own = '''    function isOwnMemberDoc() {
      return isAuthenticated() && (
        (resource.data.keys().hasAll(['memberEmail'])
          && resource.data.memberEmail == request.auth.token.email)
        // v1.14.3: o campo `email` também identifica o dono — documentos com
        // email ligado à conta mas sem memberEmail deixavam de ser legíveis
        // pelo próprio quando a leitura passou a canReadMemberDoc().
        || (resource.data.keys().hasAll(['email'])
          && resource.data.email is string
          && resource.data.email == request.auth.token.email)
      );
    }'''

new_own = '''    function isOwnMemberDoc() {
      return isAuthenticated() && (
        (resource.data.keys().hasAll(['memberEmail'])
          && resource.data.memberEmail is string
          && resource.data.memberEmail == request.auth.token.email)
        || (resource.data.keys().hasAll(['email'])
          && resource.data.email is string
          && resource.data.email == request.auth.token.email)
        // v1.21.26: docs só com memberId — o dono é o email em members/{id}
        || (resource.data.keys().hasAll(['memberId'])
          && resource.data.memberId is string
          && exists(/databases/$(database)/documents/members/$(resource.data.memberId))
          && get(/databases/$(database)/documents/members/$(resource.data.memberId)).data.email is string
          && get(/databases/$(database)/documents/members/$(resource.data.memberId)).data.email == request.auth.token.email)
      );
    }'''

if 'v1.21.26: docs só com memberId' not in rt:
    if old_own in rt:
        rt = rt.replace(old_own, new_own)
        print('isOwnMemberDoc expanded')
    else:
        m = re.search(r'function isOwnMemberDoc\(\) \{[\s\S]*?\n    \}\n', rt)
        if m:
            rt = rt[:m.start()] + new_own + '\n' + rt[m.end():]
            print('isOwnMemberDoc regex replace')
        else:
            print('WARN isOwnMemberDoc not found')
else:
    print('isOwnMemberDoc already expanded')

# isOwnOrLeader: staff (não só financial write)
old_ol = '''    function isOwnOrLeader() {
      return hasFinancialWriteAccess() || isOwnMemberDoc();
    }'''
new_ol = '''    function isOwnOrLeader() {
      // v1.21.26: liderança completa (isStaff) + dono do registo
      return isStaff() || isOwnMemberDoc();
    }'''
if old_ol in rt:
    rt = rt.replace(old_ol, new_ol)
    print('isOwnOrLeader updated')
elif 'return isStaff() || isOwnMemberDoc()' in rt:
    print('isOwnOrLeader already')
else:
    print('WARN isOwnOrLeader')

# canReadMemberDoc: use isStaff for leadership read
rt2 = re.sub(
    r'function canReadMemberDoc\(\) \{\s*return hasFinancialWriteAccess\(\) \|\| isOwnMemberDoc\(\)',
    'function canReadMemberDoc() {\n      return isStaff() || isOwnMemberDoc()',
    rt,
    count=1,
)
if rt2 != rt:
    rt = rt2
    print('canReadMemberDoc uses isStaff')

rules.write_text(rt)

# ─── MemberPortal CardTab: carga tolerante ─────────────────────────────────
mp = Path('src/pages/MemberPortal.tsx')
mt = mp.read_text()

old_effect = None
# Replace the aggressive Promise.all in MemberPortalCardTab
pattern = r'''function MemberPortalCardTab\(\{ member \}: \{ member: any \}\) \{[\s\S]*?^\}'''

# Simpler: replace the async IIFE body that does Promise.all
old_block = '''    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [c, d, t, r, b, co, pa] = await Promise.all([
          getDocs(query(collection(db, "communions"), where("memberId", "==", member.id))),
          getDocs(query(collection(db, "donations"), where("memberId", "==", member.id))),
          getDocs(query(collection(db, "tithes"), where("memberId", "==", member.id))),
          getDocs(query(collection(db, "renewals"), where("memberId", "==", member.id))),
          getDocs(query(collection(db, "member_budgets"), where("memberId", "==", member.id))),
          getDocs(query(collection(db, "contributions"), where("memberId", "==", member.id))),
          getDocs(query(collection(db, "contribution_payments"), where("memberId", "==", member.id))),
        ]);
        if (cancelled) return;
        const pays = pa.docs.map((x) => ({ id: x.id, ...x.data() }) as any);
        const budgets = b.docs.map((x) => x.data() as any).sort((x: any, y: any) => (y.year || 0) - (x.year || 0));
        setData({
          communions: c.docs.map((x) => ({ id: x.id, ...x.data() }) as CommunionMark),
          donations: d.docs.map((x) => ({ id: x.id, ...x.data() }) as Donation),
          tithes: t.docs.map((x) => ({ id: x.id, ...x.data() }) as Tithe),
          renewals: r.docs.map((x) => ({ id: x.id, ...x.data() }) as Renewal),
          budget: budgets[0] ? { year: budgets[0].year, amount: budgets[0].amount } : null,
          contributions: co.docs.map((x) => {
            const cc = x.data() as any;
            const paid = pays.filter((pp: any) => pp.contributionId === x.id).reduce((a: number, bb: any) => a + (Number(bb.amount) || 0), 0);
            return { ...cc, paid, status: computeStatus(cc, paid, cc.amount) };
          }),
        });
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message || "Erro ao carregar o cartão.";
          setErr(msg);
          toast.error("Erro ao carregar o cartão: " + msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();'''

new_block = '''    (async () => {
      setLoading(true);
      setErr(null);
      const mid = member.id;
      const email = String(member.email || '').trim().toLowerCase();

      /** Uma coleção de cada vez — se uma falhar por regras, as outras ainda entram no cartão. */
      const safeQuery = async (col: string) => {
        try {
          // Preferir memberEmail (regras isOwnMemberDoc); fallback memberId
          if (email) {
            try {
              const byEmail = await getDocs(query(collection(db, col), where('memberEmail', '==', email)));
              if (!byEmail.empty) return byEmail.docs.map((x) => ({ id: x.id, ...x.data() }) as any);
            } catch { /* tenta memberId */ }
          }
          const byId = await getDocs(query(collection(db, col), where('memberId', '==', mid)));
          return byId.docs.map((x) => ({ id: x.id, ...x.data() }) as any);
        } catch (e) {
          console.warn('cartão: sem acesso a', col, e);
          return [] as any[];
        }
      };

      try {
        const [communions, donations, tithes, renewals, budgetsRaw, contributionsRaw, pays] = await Promise.all([
          safeQuery('communions'),
          safeQuery('donations'),
          safeQuery('tithes'),
          safeQuery('renewals'),
          safeQuery('member_budgets'),
          safeQuery('contributions'),
          safeQuery('contribution_payments'),
        ]);
        if (cancelled) return;
        const budgets = [...budgetsRaw].sort((x: any, y: any) => (y.year || 0) - (x.year || 0));
        setData({
          communions: communions as CommunionMark[],
          donations: donations as Donation[],
          tithes: tithes as Tithe[],
          renewals: renewals as Renewal[],
          budget: budgets[0] ? { year: budgets[0].year, amount: budgets[0].amount } : null,
          contributions: contributionsRaw.map((cc: any) => {
            const paid = pays.filter((pp: any) => pp.contributionId === cc.id).reduce((a: number, bb: any) => a + (Number(bb.amount) || 0), 0);
            return { ...cc, paid, status: computeStatus(cc, paid, cc.amount) };
          }),
        });
      } catch (e: any) {
        if (!cancelled) {
          // Último recurso: mostrar cartão só com dados do membro (sem histórico)
          setData({ communions: [], donations: [], tithes: [], renewals: [] });
          console.error('cartão carga', e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();'''

if old_block in mt:
    mt = mt.replace(old_block, new_block)
    print('MemberPortalCardTab load fixed')
else:
    # try without tithes in the Promise.all (variants)
    if 'safeQuery' in mt:
        print('CardTab already safeQuery')
    else:
        print('WARN CardTab block not exact — attempting flexible replace')
        m = re.search(
            r'\(async \(\) => \{[\s\S]*?setLoading\(false\);\s*\}\s*\}\)\(\);',
            mt[mt.find('function MemberPortalCardTab'):mt.find('function MemberPortalCardTab')+2500],
        )
        if m:
            start = mt.find('function MemberPortalCardTab') + m.start()
            end = mt.find('function MemberPortalCardTab') + m.end()
            # keep structure: inject inside useEffect only
            print('found async block at', start, end)
        # Fallback: replace setErr pattern so permission errors don't block UI
        mt2 = mt.replace(
            'setErr(msg);\n          toast.error("Erro ao carregar o cartão: " + msg);',
            'console.warn("cartão parcial:", msg);\n          setData({ communions: [], donations: [], tithes: [], renewals: [] });',
        )
        if mt2 != mt:
            mt = mt2
            print('softened error path')
        else:
            print('WARN could not patch CardTab')

mp.write_text(mt)
print('DONE')
