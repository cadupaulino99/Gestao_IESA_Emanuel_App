#!/usr/bin/env python3
from pathlib import Path

p = Path('src/pages/MemberPortal.tsx')
t = p.read_text()

old = """                    <Button variant="outline" className="w-full justify-between rounded-xl border-blue-100 bg-blue-50/80" onClick={async () => {
                      try { await generateMembershipCard(memberData); toast.success('Cartão descarregado.'); }
                      catch (e: any) { toast.error(e?.message || 'Erro ao gerar cartão.'); }
                    }}>
                      <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Baixar Cartão</span><ChevronRight className="h-4 w-4 opacity-50" />
                    </Button>"""

new = """                    <Button variant="outline" className="w-full justify-between rounded-xl border-blue-100 bg-blue-50/80" disabled={cardBusy} onClick={async () => {
                      setCardBusy(true);
                      try {
                        const pdf = await generateMemberCardPdf(
                          memberData,
                          {
                            tithes,
                            communions: cardData.communions || [],
                            donations: cardData.donations || [],
                            renewals: cardData.renewals || [],
                            budget: (cardData as any).budget || null,
                            contributions: (cardData as any).contributions || [],
                          },
                          CARD_HEADER_DEFAULT,
                        );
                        await savePdf(pdf, `Cartao_${String(memberData.name || 'membro').replace(/\\s+/g, '_')}.pdf`);
                        toast.success('Cartão completo descarregado.');
                      } catch (e: any) {
                        console.error(e);
                        toast.error(e?.message || 'Erro ao gerar o cartão completo.');
                      } finally {
                        setCardBusy(false);
                      }
                    }}>
                      <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> {cardBusy ? 'A gerar…' : 'Baixar Cartão'}</span><ChevronRight className="h-4 w-4 opacity-50" />
                    </Button>"""

if old not in t:
    raise SystemExit('Baixar Cartão button block not found')
t = t.replace(old, new)
# remove unused import if generateMembershipCard no longer used
if 'generateMembershipCard' not in t.replace('generateMembershipCard,', '').replace("generateMembershipCard(", ''):
    pass
if t.count('generateMembershipCard') == 1:
    t = t.replace('generateMembershipCard, ', '')
    print('removed unused generateMembershipCard import')
p.write_text(t)
print('OK')
