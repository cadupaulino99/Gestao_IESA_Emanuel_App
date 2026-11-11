#!/usr/bin/env python3
"""Corrige: suporte membro, cartão PDF, RichTextEditor, regras support_messages."""
from pathlib import Path
import re

# ─── 1. RichTextEditor: não reescrever innerHTML a cada tecla ───────────────
rt = Path('src/components/richtext/RichTextEditor.tsx')
t = rt.read_text()
old_emit = '''  const emit = () => {
    const el = ref.current;
    if (!el) return;
    let clean = sanitizeHtml(el.innerHTML);
    if (richTextPlainLength(clean) === 0) clean = '';
    if (el.innerHTML !== clean) el.innerHTML = clean;
    onChange(clean);
  };'''
new_emit = '''  const emit = () => {
    const el = ref.current;
    if (!el) return;
    /* Não reescrever innerHTML aqui — partia o cursor e impedia escrever. */
    let clean = sanitizeHtml(el.innerHTML);
    if (richTextPlainLength(clean) === 0) clean = '';
    onChange(clean);
  };'''
if old_emit in t:
    t = t.replace(old_emit, new_emit)
    print('RichTextEditor emit fixed')
elif 'Não reescrever innerHTML' in t:
    print('RichTextEditor already fixed')
else:
    print('WARN RichTextEditor emit block')
rt.write_text(t)

# ─── 2. MemberPortal: props do suporte + PDF do cartão ─────────────────────
mp = Path('src/pages/MemberPortal.tsx')
mt = mp.read_text()

mt = mt.replace(
    '<TabsContent value="suporte" className="pt-4"><MemberSupport /></TabsContent>',
    '''<TabsContent value="suporte" className="pt-4">
            <MemberSupport
              memberEmail={String(memberData?.email || userEmail || '').trim().toLowerCase()}
              memberName={String(memberData?.name || 'Membro')}
            />
          </TabsContent>''',
)

# userEmail may not exist - use useAuth
if 'memberEmail={String(memberData' in mt and 'const { memberData, signOut }' in mt:
    mt = mt.replace(
        'const { memberData, signOut } = useAuth();',
        'const { memberData, signOut, user } = useAuth();\n  const userEmail = user?.email || memberData?.email || "";',
    )

# Fix PDF call
old_pdf = '''            <MemberCardView member={memberData} tithes={tithes} {...cardData} busy={cardBusy} onDownload={async () => {
              setCardBusy(true);
              try { const pdf = await generateMemberCardPdf({ member: memberData, tithes, ...cardData, header: CARD_HEADER_DEFAULT }); await savePdf(pdf, `Cartao_${memberData.name.replace(/\s+/g, "_")}.pdf`); }
              finally { setCardBusy(false); }
            }} />'''

new_pdf = '''            <MemberCardView member={memberData} tithes={tithes} {...cardData} busy={cardBusy} onDownload={async () => {
              setCardBusy(true);
              try {
                if (!memberData) { toast.error('Dados do membro em falta.'); return; }
                const pdf = await generateMemberCardPdf(
                  memberData,
                  { tithes, communions: cardData.communions || [], donations: cardData.donations || [], renewals: cardData.renewals || [] },
                  CARD_HEADER_DEFAULT,
                );
                await savePdf(pdf, `Cartao_${String(memberData.name || 'membro').replace(/\s+/g, "_")}.pdf`);
                toast.success('Cartão gerado.');
              } catch (err: any) {
                console.error('cartão PDF', err);
                toast.error(err?.message || 'Erro ao gerar o cartão.');
              } finally { setCardBusy(false); }
            }} />'''

if old_pdf in mt:
    mt = mt.replace(old_pdf, new_pdf)
    print('MemberPortal PDF fixed')
elif 'generateMemberCardPdf(' in mt and 'memberData,' in mt:
    print('MemberPortal PDF maybe already ok')
else:
    # try looser replace
    if 'generateMemberCardPdf({ member: memberData' in mt:
        mt = mt.replace(
            'const pdf = await generateMemberCardPdf({ member: memberData, tithes, ...cardData, header: CARD_HEADER_DEFAULT }); await savePdf(pdf, `Cartao_${memberData.name.replace(/\s+/g, "_")}.pdf`);',
            '''const pdf = await generateMemberCardPdf(memberData, { tithes, communions: cardData.communions || [], donations: cardData.donations || [], renewals: cardData.renewals || [] }, CARD_HEADER_DEFAULT);
                await savePdf(pdf, `Cartao_${String(memberData.name || 'membro').replace(/\s+/g, "_")}.pdf`);
                toast.success('Cartão gerado.');''',
        )
        print('MemberPortal PDF loose fix')
    else:
        print('WARN MemberPortal PDF')

# Also fix generateMembershipCard button errors
if 'generateMembershipCard(memberData)' in mt and 'toast.error' not in mt[mt.find('generateMembershipCard'):mt.find('generateMembershipCard')+200]:
    mt = mt.replace(
        'onClick={() => generateMembershipCard(memberData)}',
        '''onClick={async () => {
                      try { await generateMembershipCard(memberData); toast.success('Cartão descarregado.'); }
                      catch (e: any) { toast.error(e?.message || 'Erro ao gerar cartão.'); }
                    }}''',
    )
    print('membership card toast')

mp.write_text(mt)
print('MemberPortal updated')

# ─── 3. MemberSupport: toast on error ──────────────────────────────────────
ms = Path('src/components/portal/MemberSupport.tsx')
mst = ms.read_text()
if "import { toast }" not in mst:
    mst = mst.replace(
        "import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';",
        "import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';\nimport { toast } from 'sonner';",
    )
mst = mst.replace(
    '''    } catch (e2: any) {
      // falha — mantém o texto para o utilizador tentar de novo
    } finally {''',
    '''    } catch (e2: any) {
      const msg = String(e2?.message || e2 || '');
      toast.error(msg.includes('permission') || msg.includes('Permission')
        ? 'Sem permissão para enviar. Confirme que está autenticado como membro.'
        : (msg || 'Não foi possível enviar a mensagem.'));
    } finally {''',
)
# Guard empty email
if 'if (!memberEmail)' not in mst:
    mst = mst.replace(
        'const t = text.trim();\n    if (!t || sending) return;',
        '''const t = text.trim();
    if (!memberEmail) { toast.error('Email do membro em falta — não é possível abrir o suporte.'); return; }
    if (!t || sending) return;''',
    )
ms.write_text(mst)
print('MemberSupport updated')

# ─── 4. firestore.rules: support_messages usa isStaff ───────────────────────
rules = Path('firestore.rules')
rt = rules.read_text()
old_sup = '''    match /support_messages/{msgId} {
      // v1.17 (P1 «chat»): conversas por fio (memberEmail). Liderança lê tudo;
      // membro só lê o SEU fio. Antes: qualquer sessão lia TODAS as mensagens.
      allow read, list: if hasFinancialWriteAccess() ||
        (isAuthenticated() && resource.data.keys().hasAll(['memberEmail']) &&
         resource.data.memberEmail == request.auth.token.email);
      allow create: if isAuthenticated() &&
        incoming().senderId == request.auth.uid &&
        incoming().text is string && incoming().text.size() > 0 && incoming().text.size() <= 2000 &&
        (hasFinancialWriteAccess() ||
         (incoming().keys().hasAll(['memberEmail']) &&
          incoming().memberEmail == request.auth.token.email &&
          incoming().senderRole == 'member'));
      allow update, delete: if isAdmin();
    }'''

new_sup = '''    match /support_messages/{msgId} {
      // v1.17 / v1.21.25: conversas por fio (memberEmail).
      // Liderança (isStaff = A/B/C) lê tudo; membro só o SEU fio.
      allow read, list: if isStaff() ||
        (isAuthenticated() && resource.data.keys().hasAll(['memberEmail']) &&
         resource.data.memberEmail == request.auth.token.email);
      allow create: if isAuthenticated() &&
        incoming().senderId == request.auth.uid &&
        incoming().text is string && incoming().text.size() > 0 && incoming().text.size() <= 2000 &&
        (
          (isStaff() && incoming().senderRole == 'leader') ||
          (incoming().keys().hasAll(['memberEmail']) &&
           incoming().memberEmail == request.auth.token.email &&
           incoming().senderRole == 'member')
        );
      allow update, delete: if isFullAccess();
    }'''

if 'isStaff() ||' in rt and 'support_messages' in rt and rt[rt.find('support_messages'):rt.find('support_messages')+400].count('isStaff()') >= 1:
    print('support rules maybe already')
elif old_sup in rt:
    rt = rt.replace(old_sup, new_sup)
    rules.write_text(rt)
    print('support_messages rules updated')
else:
    # looser
    m = re.search(r'match /support_messages/\{msgId\} \{.*?allow update, delete: if isAdmin\(\);\s*\}', rt, re.S)
    if m:
        rt = rt[:m.start()] + new_sup + rt[m.end():]
        rules.write_text(rt)
        print('support_messages rules loose replace')
    else:
        print('WARN support rules block not found')

print('ALL DONE')
