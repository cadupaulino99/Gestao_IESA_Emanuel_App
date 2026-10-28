import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { aiChat, runAiDiagnostics, WORKER_URL } from '../lib/ai';
import { 
  Bot, 
  User as UserIcon, 
  Send, 
  Sparkles, 
  MessageSquare, 
  HelpCircle, 
  FileText, 
  Church, 
  Copy, 
  Check, 
  RotateCw,
  Lightbulb,
  HeartHandshake,
  Stethoscope
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export default function Support() {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'ai' | 'team' | 'diag'>('ai');

  // Diagnóstico da ligação de IA (Worker + Gemini + papel do utilizador)
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagLines, setDiagLines] = useState<string[]>([]);
  const [diagOk, setDiagOk] = useState<boolean | null>(null);

  // Human Team Chat State
  const [teamMessage, setTeamMessage] = useState('');
  /* v1.17 (P1 «chat»): conversas por membro — null = canal interno da equipa;
     string (memberEmail) = fio com esse membro (Portal → Suporte). */
  const [thread, setThread] = useState<string | null>(null);

  // AI Assistant Chat State
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [aiChatHistory, setAiChatHistory] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'welcome',
        sender: 'assistant',
        text: 'Paz do Senhor! Sou o Assistente Inteligente da IESA Emanuel em Xangongo. Posso ajudar com orientações pastorais, redação de saudações e cartas para membros, análise de dízimos e ofertas, ou tirar dúvidas sobre o uso do aplicativo. Como posso servir hoje?',
        timestamp: Date.now(),
      },
    ];
  });

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChatHistory, aiLoading]);

  // Query human messages from Firestore
  const { data: messages, isLoading: isLoadingTeam } = useQuery({
    queryKey: ['supportMessages'],
    refetchInterval: 20_000,   // mensagens dos membros chegam sem refrescar
    queryFn: async () => {
      try {
        const snap = await getDocs(query(collection(db, 'support_messages'), orderBy('createdAt', 'asc')));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'support_messages');
        throw e;
      }
    },
  });

  // Human message mutation
  const teamMutation = useMutation({
    mutationFn: async (msg: string) => {
      await addDoc(collection(db, 'support_messages'), {
        text: msg,
        senderId: user?.uid,
        senderName: user?.displayName || user?.email || 'Utilizador',
        role: userRole,
        senderRole: 'leader',                       // v1.17
        threadId: thread || 'geral',                // v1.17
        memberEmail: thread || null,                // v1.17
        createdAt: Date.now(),
      });
    },
    onSuccess: () => {
      setTeamMessage('');
      queryClient.invalidateQueries({ queryKey: ['supportMessages'] });
    },
    onError: (e) => {
      toast.error('Erro ao enviar mensagem.');
      handleFirestoreError(e, OperationType.WRITE, 'support_messages');
    },
  });

  /* v1.17: agrupar por fio — mensagens sem memberEmail = canal interno */
  const threadOf = (m: any): string | null => (m?.memberEmail ? String(m.memberEmail) : null);
  const memberThreads = Array.from(new Set(((messages || []) as any[]).map(threadOf).filter(Boolean))) as string[];
  const lastOf = (t: string) => Math.max(0, ...((messages || []) as any[]).filter((m) => threadOf(m) === t).map((m) => Number(m.createdAt) || 0));
  memberThreads.sort((a, b) => lastOf(b) - lastOf(a));
  const shownMessages = ((messages || []) as any[]).filter((m) => threadOf(m) === thread);
  const awaitingOf = (t: string) => {
    const list = ((messages || []) as any[]).filter((m) => threadOf(m) === t);
    return list.length > 0 && list[list.length - 1].senderRole === 'member';
  };

  const handleSendTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (teamMessage.trim().length === 0) return;
    teamMutation.mutate(teamMessage);
  };

  const handleSendAi = async (textToSend?: string) => {
    const queryText = (textToSend || aiInput).trim();
    if (!queryText || aiLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: Date.now(),
    };

    setAiChatHistory((prev) => [...prev, userMsg]);
    setAiInput('');
    setAiLoading(true);

    try {
      const text = await aiChat(
        queryText,
        `Utilizador autenticado: ${user?.displayName || 'Membro/Líder'} (Função: ${userRole || 'membro'}). Igreja: IESA Emanuel Xangongo.`
      );
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: 'assistant',
        text: text || 'Não consegui obter uma resposta adequada. Por favor, tente reformular.',
        timestamp: Date.now(),
      };

      setAiChatHistory((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      toast.error('Assistente IA: ' + (err?.message || 'falha desconhecida.'));
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: 'Desculpe, ocorreu um imprevisto ao processar a resposta. Verifique a ligação ou contacte o administrador.',
        timestamp: Date.now(),
      };
      setAiChatHistory((prev) => [...prev, errorMsg]);
    } finally {
      setAiLoading(false);
    }
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Mensagem copiada para a área de transferência!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const runDiag = async () => {
    setDiagBusy(true);
    try {
      const r = await runAiDiagnostics();
      setDiagLines(r.lines);
      setDiagOk(r.ok);
    } finally {
      setDiagBusy(false);
    }
  };

  // Corre o diagnóstico automaticamente ao abrir o separador (uma vez)
  useEffect(() => {
    if (activeTab === 'diag' && diagLines.length === 0 && !diagBusy) void runDiag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const suggestedPrompts = [
    'Elaborar mensagem pastoral de boas-vindas a um novo membro.',
    'Como registar devidamente uma oferta especial ou de construção?',
    'Mensagem bíblica de aniversário para enviar via WhatsApp a um irmão da igreja.',
    'Dicas para organizar e fechar o mês financeiro na tesouraria.',
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-amber-500" />
            Suporte & Assistência Eclesiástica
          </h2>
          <p className="text-muted-foreground text-sm">
            Tire dúvidas operacionais, redija mensagens pastorais com IA ou envie comunicados à liderança.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-auto">
          <TabsList className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <TabsTrigger value="ai" className="gap-2">
              <Bot className="h-4 w-4 text-purple-500" />
              Assistente IA
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              Equipa Interna
            </TabsTrigger>
            <TabsTrigger value="diag" className="gap-2">
              <Stethoscope className="h-4 w-4 text-emerald-500" />
              <span className="hidden sm:inline">Diagnóstico IA</span>
              <span className="sm:hidden">IA</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === 'ai' ? (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-slate-50/50 dark:bg-slate-900/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-purple-600/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Assistente Pastoral & de Gestão IESA
                  <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/50">
                    Gemini 3.8 Flash
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Respostas instantâneas com sabedoria bíblica, gestão financeira e apoio local
                </CardDescription>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAiChatHistory([
                  {
                    id: 'welcome',
                    sender: 'assistant',
                    text: 'Paz do Senhor! Em que posso ser útil neste momento?',
                    timestamp: Date.now(),
                  },
                ]);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCw className="h-3.5 w-3.5 mr-1" />
              Limpar Conversa
            </Button>
          </CardHeader>

          <CardContent className="p-4 space-y-4">
            {aiChatHistory.map((m) => {
              const isAi = m.sender === 'assistant';
              return (
                <div key={m.id} className={`flex gap-3 ${isAi ? 'justify-start' : 'justify-end'}`}>
                  {isAi && (
                    <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div className={`relative group max-w-[85%] rounded-2xl px-4 py-3 shadow-xs ${
                    isAi 
                      ? 'bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-tl-xs border border-slate-200/50 dark:border-slate-800' 
                      : 'bg-primary text-primary-foreground rounded-tr-xs'
                  }`}>
                    <div className="flex items-center justify-between gap-4 mb-1 border-b border-black/5 dark:border-white/5 pb-1">
                      <span className="text-[11px] font-semibold opacity-75">
                        {isAi ? 'Assistente IESA' : user?.displayName || 'Você'}
                      </span>
                      {isAi && (
                        <button
                          onClick={() => copyToClipboard(m.id, m.text)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-black/5 rounded text-xs"
                          title="Copiar texto"
                        >
                          {copiedId === m.id ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</div>
                  </div>

                  {!isAi && (
                    <div className="h-8 w-8 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center shrink-0 mt-1 font-semibold text-xs">
                      {user?.displayName?.charAt(0) || <UserIcon className="h-4 w-4" />}
                    </div>
                  )}
                </div>
              );
            })}

            {aiLoading && (
              <div className="flex gap-3 justify-start">
                <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0 mt-1 animate-pulse">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl rounded-tl-xs px-4 py-3 border border-slate-200/50 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 animate-spin text-purple-500" />
                    <span>A formular resposta com sabedoria...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </CardContent>

          {/* Quick Suggestions */}
          {aiChatHistory.length <= 2 && (
            <div className="px-4 py-2 border-t bg-slate-50/50 dark:bg-slate-950/30 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Sugestões rápidas:
              </span>
              {suggestedPrompts.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendAi(s)}
                  className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-3 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* AI Input Form */}
          <div className="p-4 bg-background border-t">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAi();
              }}
              className="flex gap-2"
            >
              <Input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="Pergunte ao Assistente (Ex: Como elaborar carta de recomendação de membro?)..."
                className="flex-1"
                disabled={aiLoading}
              />
              <Button type="submit" disabled={aiLoading || aiInput.trim().length === 0} className="gap-2">
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Enviar</span>
              </Button>
            </form>
          </div>
        </Card>
      ) : activeTab === 'team' ? (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-slate-50/50 dark:bg-slate-900/40">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              {thread ? `Suporte — ${thread}` : 'Canal de Mensagens da Equipa Local'}
            </CardTitle>
            <CardDescription className="text-xs">
              {thread
                ? 'Conversa com o membro (ele escreve pelo Portal → Suporte; só você/liderança e ele a vêem).'
                : 'Comunique com outros administradores, tesoureiros e equipa pastoral da congregação.'}
            </CardDescription>
          </CardHeader>
          {/* v1.17: selector de conversas */}
          <div className="flex flex-wrap gap-1.5 border-b px-4 py-2 bg-slate-50/50 dark:bg-slate-900/40">
            <button
              type="button"
              onClick={() => setThread(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${thread === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
            >
              Equipa (interno)
            </button>
            {memberThreads.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setThread(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors flex items-center gap-1.5 ${thread === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
              >
                {awaitingOf(t) && <span className="h-1.5 w-1.5 rounded-full bg-red-500" title="À espera de resposta" />}
                {t}
              </button>
            ))}
          </div>
          <CardContent className="p-4 space-y-4">
            {isLoadingTeam ? (
              <div className="text-center py-4 text-sm text-muted-foreground">A carregar mensagens...</div>
            ) : shownMessages.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {thread ? 'Ainda não há mensagens com este membro.' : 'Nenhuma mensagem interna registada ainda. Escreva abaixo para começar.'}
              </div>
            ) : (
              shownMessages.map((m: any) => {
                const isMine = m.senderId === user?.uid;
                const isAdmin = m.role === 'admin';
                return (
                  <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{isMine ? 'Você' : m.senderName}</span>
                      {isAdmin && !isMine && (
                        <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                          Admin
                        </span>
                      )}
                      {m.senderRole === 'member' && !isMine && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                          Membro
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(m.createdAt).toLocaleDateString('pt-AO')}{' '}
                        {new Date(m.createdAt).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div
                      className={`px-4 py-2.5 rounded-2xl max-w-[80%] shadow-xs text-sm ${
                        isMine ? 'bg-primary text-primary-foreground rounded-tr-xs' : 'bg-muted rounded-tl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
          <div className="p-4 bg-background border-t">
            <form onSubmit={handleSendTeam} className="flex gap-2">
              <Input
                value={teamMessage}
                onChange={(e) => setTeamMessage(e.target.value)}
                placeholder={thread ? `Responder a ${thread}…` : "Escreva uma mensagem interna para a equipa..."}
                className="flex-1"
                disabled={teamMutation.isPending}
              />
              <Button type="submit" disabled={teamMutation.isPending || teamMessage.trim().length === 0} className="gap-2">
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Enviar</span>
              </Button>
            </form>
          </div>
        </Card>
      ) : (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-slate-50/50 dark:bg-slate-900/40 flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Diagnóstico da ligação de IA</CardTitle>
                <CardDescription className="text-xs">
                  Verifica o servidor (Cloudflare Worker), os segredos, o seu papel e o Gemini.
                  Use antes de reportar uma falha na leitura do BI, de comprovativos ou do assistente.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={runDiag} disabled={diagBusy} className="gap-2 shrink-0">
              <RotateCw className={`h-4 w-4 ${diagBusy ? 'animate-spin' : ''}`} />
              Repetir
            </Button>
          </CardHeader>

          <CardContent className="p-4 space-y-3">
            {diagBusy && diagLines.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Sparkles className="h-4 w-4 animate-spin text-emerald-500" /> A testar a ligação…
              </div>
            ) : (
              <>
                <div
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                    diagOk
                      ? 'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200'
                  }`}
                >
                  {diagOk
                    ? '✓ Tudo operacional — a leitura de documentos por fotografia deve funcionar.'
                    : '⚠ Há algo a corrigir. Siga as indicações com "→" abaixo.'}
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3">
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {diagLines.join('\n') || 'Sem resultado ainda — carregue em "Repetir".'}
                  </pre>
                </div>

                <div className="text-[11px] text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">Servidor:</span>
                    <code className="break-all">{WORKER_URL}</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(`${WORKER_URL}/__health`);
                        toast.success('Link de diagnóstico copiado.');
                      }}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Copy className="h-3 w-3" /> copiar /__health
                    </button>
                  </div>
                  <p>
                    O mesmo teste está disponível dentro do leitor de documentos
                    (Membros → Novo → 🪪 Bilhete de Identidade → <b>Testar ligação</b>).
                  </p>
                  <p>
                    Fora da app: <code>npm run worker:health</code> (versão do servidor) e{' '}
                    <code>npm run test:bi</code> (teste de OCR direto ao Gemini). Guia completo em{' '}
                    <code>docs/FIX-LEITURA-BI.md</code>.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
