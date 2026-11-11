#!/usr/bin/env python3
from pathlib import Path
import re

# MemberPortal
mp = Path('src/pages/MemberPortal.tsx')
t = mp.read_text()
if 'const { memberData, signOut, user } = useAuth()' not in t:
    t = t.replace(
        'const { memberData, signOut } = useAuth();',
        'const { memberData, signOut, user } = useAuth();\n  const userEmail = user?.email || memberData?.email || "";',
    )
if 'memberEmail={String(memberData' not in t:
    t = t.replace(
        '<TabsContent value="suporte" className="pt-4"><MemberSupport /></TabsContent>',
        '<TabsContent value="suporte" className="pt-4">\n            <MemberSupport\n              memberEmail={String(memberData?.email || userEmail || \'\').trim().toLowerCase()}\n              memberName={String(memberData?.name || \'Membro\')}\n            />\n          </TabsContent>',
    )
if 'generateMemberCardPdf({ member: memberData' in t:
    t = t.replace(
        'const pdf = await generateMemberCardPdf({ member: memberData, tithes, ...cardData, header: CARD_HEADER_DEFAULT }); await savePdf(pdf, `Cartao_${memberData.name.replace(/\s+/g, "_")}.pdf`);',
        '''if (!memberData) { toast.error('Dados do membro em falta.'); return; }
                const pdf = await generateMemberCardPdf(
                  memberData,
                  { tithes, communions: cardData.communions || [], donations: cardData.donations || [], renewals: cardData.renewals || [] },
                  CARD_HEADER_DEFAULT,
                );
                await savePdf(pdf, `Cartao_${String(memberData.name || 'membro').replace(/\s+/g, "_")}.pdf`);
                toast.success('Cartão gerado.');''',
    )
    # wrap with try/catch if not present around this block
    if 'Erro ao gerar o cartão' not in t:
        t = t.replace(
            'setCardBusy(true);\n              try { if (!memberData)',
            '''setCardBusy(true);
              try {
                if (!memberData)''',
        )
        # add catch before finally if missing
        if 'catch (err: any)' not in t[t.find('Cartão gerado'):t.find('Cartão gerado')+400]:
            t = t.replace(
                "toast.success('Cartão gerado.');\n              finally { setCardBusy(false); }",
                "toast.success('Cartão gerado.');\n              } catch (err: any) {\n                console.error('cartão PDF', err);\n                toast.error(err?.message || 'Erro ao gerar o cartão.');\n              } finally { setCardBusy(false); }",
            )
mp.write_text(t)
print('MemberPortal', 'memberEmail=' in t, 'Cartão gerado' in t)

# MemberSupport
ms = Path('src/components/portal/MemberSupport.tsx')
mst = ms.read_text()
if 'from \'sonner\'' not in mst and 'from "sonner"' not in mst:
    mst = mst.replace(
        "import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';",
        "import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';\nimport { toast } from 'sonner';",
    )
if 'Sem permissão para enviar' not in mst:
    mst = mst.replace(
        '''    } catch (e2: any) {
      // falha — mantém o texto para o utilizador tentar de novo
    } finally {''',
        '''    } catch (e2: any) {
      const msg = String(e2?.message || e2 || '');
      toast.error(/permission/i.test(msg)
        ? 'Sem permissão para enviar. Confirme que está autenticado como membro.'
        : (msg || 'Não foi possível enviar a mensagem.'));
    } finally {''',
    )
if 'if (!memberEmail)' not in mst:
    mst = mst.replace(
        'const t = text.trim();\n    if (!t || sending) return;',
        "const t = text.trim();\n    if (!memberEmail) { toast.error('Email do membro em falta — não é possível abrir o suporte.'); return; }\n    if (!t || sending) return;",
    )
ms.write_text(mst)
print('MemberSupport ok')

# firestore support_messages
rules = Path('firestore.rules')
rt = rules.read_text()
new_sup = '''    match /support_messages/{msgId} {
      // v1.21.25: liderança (isStaff) lê/responde; membro só o próprio fio.
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
m = re.search(r'    match /support_messages/\{msgId\} \{.*?\n    \}', rt, re.S)
if m:
    rt = rt[: m.start()] + new_sup + rt[m.end() :]
    rules.write_text(rt)
    print('rules updated')
else:
    print('rules block not found')
print('DONE')
