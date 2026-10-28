import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/* ═══════════════════════════════════════════════════════════════════════
   v1.17.0 (P1 «chat») — SUPORTE membro ↔ liderança.
   O membro escreve para a liderança a partir do Portal; a liderança responde
   na página Suporte (aba Equipa → conversas por membro). Fio identificado
   por memberEmail; as regras garantem que cada membro só lê o SEU fio.
   Sem SMS/WhatsApp — só dentro do sistema.
   ═══════════════════════════════════════════════════════════════════════ */

interface Msg {
  id: string;
  text: string;
  senderId?: string;
  senderName?: string;
  senderRole?: 'member' | 'leader';
  createdAt: number;
}

export default function MemberSupport({ memberEmail, memberName }: { memberEmail: string; memberName: string }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      // sem orderBy no servidor (evita índice composto) — ordena no cliente
      const snap = await getDocs(query(collection(db, 'support_messages'), where('memberEmail', '==', memberEmail)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Msg);
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setMsgs(list);
    } catch {
      /* regras por publicar / sem rede: mantém a lista actual */
    } finally {
      setLoading(false);
    }
  }, [memberEmail]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000); // respostas da liderança
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'support_messages'), {
        threadId: memberEmail,
        memberEmail,
        senderId: user?.uid || '',
        senderName: memberName || 'Membro',
        senderRole: 'member',
        text: t.slice(0, 2000),
        createdAt: Date.now(),
      });
      setText('');
      await load();
    } catch (e2: any) {
      // falha — mantém o texto para o utilizador tentar de novo
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-blue-500" /> Suporte — falar com a liderança
        </CardTitle>
        <CardDescription className="text-xs">
          Escreva a sua dúvida ou pedido. A liderança responde aqui dentro da aplicação
          (sem SMS/WhatsApp). Só você e a liderança vêem esta conversa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-[45dvh] min-h-[120px] overflow-y-auto space-y-3 rounded-lg border bg-muted/20 p-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar conversa…
            </div>
          ) : msgs.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Ainda não há mensagens. Escreva abaixo para começar.
            </p>
          ) : (
            msgs.map((m) => {
              const mine = m.senderRole === 'member';
              return (
                <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-medium">{mine ? 'Você' : m.senderName || 'Liderança'}</span>
                    <span>{new Date(m.createdAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-xs ${mine ? 'rounded-tr-xs bg-primary text-primary-foreground' : 'rounded-tl-xs bg-muted'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva a sua mensagem…"
            maxLength={2000}
            className="flex-1"
            disabled={sending}
          />
          <Button type="submit" disabled={sending || !text.trim()} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
