#!/usr/bin/env python3
from pathlib import Path
import re

# ─── posters.ts: não cair em Firebase por qualquer erro com «R2» ────────────
p = Path('src/lib/posters.ts')
t = p.read_text()

old = '''/** Tenta R2 (Worker); se indisponível, tenta Firebase Storage. */
export async function uploadEventPoster(id: string, file: File): Promise<PosterUploadResult> {
  try {
    return await uploadPosterToR2(file, id);
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (/R2|503|não está configurado|não configurado/i.test(msg)) {
      try {
        return await uploadEventPosterFirebase(id, file);
      } catch (e2) {
        throw new Error(
          friendlyStorageError(e2) +
            ' · Active o Cloudflare R2 (bucket iesa-event-posters) e faça deploy do Worker.',
        );
      }
    }
    throw new Error(friendlyStorageError(e));
  }
}'''

new = '''/** Tenta R2 (Worker). Só cai para Firebase se o Worker disser que o R2 não está configurado. */
export async function uploadEventPoster(id: string, file: File): Promise<PosterUploadResult> {
  try {
    return await uploadPosterToR2(file, id);
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    const r2Missing = /R2_NOT_CONFIGURED|não está ligado|R2 não configurado|não está configurado/i.test(msg);
    if (r2Missing) {
      try {
        return await uploadEventPosterFirebase(id, file);
      } catch (e2) {
        throw new Error(
          friendlyStorageError(e2) +
            ' · O Worker indica R2 em falta: confirme o binding POSTERS_BUCKET → iesa-event-posters.',
        );
      }
    }
    // Erros de rede/auth/validação: mostrar a causa real (sem pedir «activar Cloudflare» em vão)
    throw new Error(friendlyStorageError(e));
  }
}'''

if old in t:
    t = t.replace(old, new)
    print('posters uploadEventPoster fixed')
else:
    print('WARN posters block')

# Longer timeout for mobile
t = t.replace('const STORAGE_TIMEOUT_MS = 12_000;', 'const STORAGE_TIMEOUT_MS = 45_000;')

# Improve network error message
t = t.replace(
    "'Não foi possível contactar o Worker (rede/CORS). Confirme https://iesa-ai.cadupaulino99.workers.dev/__health e o binding R2 POSTERS_BUCKET.'",
    "'Falha de rede ao contactar o Worker de cartazes. Verifique a internet e tente novamente. Se persistir, abra /__health do Worker.'",
)
p.write_text(t)
print('posters.ts done')

# ─── MemberPortal: aba Cartão usa o mesmo MemberCardView que o admin ───────
mp = Path('src/pages/MemberPortal.tsx')
mt = mp.read_text()

# Ensure MemberCardData import type is used correctly
if 'MemberCardView, { type MemberCardData }' not in mt and 'MemberCardData' not in mt:
    mt = mt.replace(
        'import MemberCardView, { type MemberCardData } from "../components/members/MemberCardView";',
        'import MemberCardView, { type MemberCardData } from "../components/members/MemberCardView";',
    )

# Replace the cartao TabsContent entirely
# Find from TabsContent value="cartao" to closing TabsContent
m = re.search(
    r'<TabsContent value="cartao" className="pt-4">[\s\S]*?</TabsContent>',
    mt,
)
if not m:
    raise SystemExit('cartao TabsContent not found')

new_cartao = r'''<TabsContent value="cartao" className="pt-4">
            <MemberPortalCardTab member={memberData} />
          </TabsContent>'''

mt = mt[: m.start()] + new_cartao + mt[m.end() :]

# Add helper component before export default or after imports
if 'function MemberPortalCardTab' not in mt:
    helper = r'''
/** Cartão do portal — mesma vista que a liderança (MemberCardView), só leitura. */
function MemberPortalCardTab({ member }: { member: any }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<MemberCardData>({
    communions: [], donations: [], tithes: [], renewals: [],
  });

  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    (async () => {
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
    })();
    return () => { cancelled = true; };
  }, [member?.id]);

  const onDownload = async () => {
    setBusy(true);
    try {
      const pdf = await generateMemberCardPdf(member, data, CARD_HEADER_DEFAULT);
      await savePdf(pdf, `Cartao_${String(member.name || "membro").replace(/\s+/g, "_")}.pdf`);
      toast.success("Cartão PDF gerado.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao gerar o PDF do cartão.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">A carregar o cartão…</p>;
  }
  if (err) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
        Não foi possível carregar o cartão. {err}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">O seu cartão de membro (mesmo formato da liderança).</p>
        <Button onClick={onDownload} disabled={busy} className="gap-2 rounded-xl">
          <CreditCard className="h-4 w-4" /> {busy ? "A gerar…" : "Descarregar PDF"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white p-2 shadow-sm dark:bg-card">
        <MemberCardView member={member} data={data} header={CARD_HEADER_DEFAULT} />
      </div>
    </div>
  );
}

'''
    # Insert before export default function MemberPortal
    mt = mt.replace(
        'export default function MemberPortal() {',
        helper + 'export default function MemberPortal() {',
    )
    print('helper inserted')

# Clean unused card state if it causes issues - leave for now (home tab still uses tithes)

mp.write_text(mt)
print('MemberPortal cartao tab fixed')
print('DONE')
