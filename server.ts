import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { ai } from './src/server/gemini';

function sanitizeUserText(input: unknown, maxLen = 4000): string {
  let s = String(input ?? '');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)\b/gi, '[filtrado]');
  s = s.replace(/\b(system\s*:|assistant\s*:|developer\s*:)\s*/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function anonymizeFinancialSummary(raw: unknown) {
  const s = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    // cêntimos → Kz arredondados; valores já em Kz passam quase iguais se < 1e9
    const kz = Math.abs(n) >= 1000 && Number.isInteger(n) ? Math.round(n / 100) : Math.round(n);
    return kz;
  };
  return {
    year: typeof s.year === 'number' || typeof s.year === 'string' ? s.year : null,
    totalTithesKz: num(s.totalTithes),
    totalOfferingsKz: num(s.totalOfferings),
    totalExpensesKz: num(s.totalExpenses),
    balanceKz: num(s.balance),
    totalMembers: typeof s.totalMembers === 'number' ? s.totalMembers : null,
    activeMembers: typeof s.activeMembers === 'number' ? s.activeMembers : null,
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Route: AI Assistant Chat
  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const prompt = sanitizeUserText(req.body?.prompt, 4000);
      const context = req.body?.context != null ? sanitizeUserText(req.body.context, 6000) : '';
      if (!prompt) {
        return res.status(400).json({ error: 'O prompt é obrigatório' });
      }

      const fullPrompt = context
        ? `[Contexto dos Dados Atuais da Igreja:\n${context}]\n\nPergunta ou Pedido:\n${prompt}`
        : prompt;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: fullPrompt,
        config: {
          systemInstruction: 'Você é o assistente inteligente da Igreja de Emanuel em Xangongo. Responda de forma clara, profissional e cristã, sempre em português de Angola. Foque em gestão eclesiástica, finanças da igreja e aconselhamento pastoral moderado.',
        },
      });

      return res.json({ text: response.text });
    } catch (error: any) {
      console.error('Error in /api/assistant/chat:', error);
      return res.status(500).json({ error: error.message || 'Falha ao processar solicitação de IA' });
    }
  });

  // API Route: AI Financial & Pastoral Insights Generator
  app.post('/api/assistant/financial-insights', async (req, res) => {
    try {
      const financialSummary = anonymizeFinancialSummary(req.body?.financialSummary);
      const prompt = `Analise os totais agregados (sem nomes nem identificadores pessoais) e forneça um resumo executivo com 3 pontos fortes e 2 recomendações prudentes para a tesouraria:\n\n${JSON.stringify(financialSummary, null, 2)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: 'Você é um consultor financeiro cristão experiente em gestão eclesiástica em Angola.',
        },
      });

      return res.json({ text: response.text });
    } catch (error: any) {
      console.error('Error in /api/assistant/financial-insights:', error);
      return res.status(500).json({ error: error.message || 'Erro ao gerar análise' });
    }
  });

  // API Route: AI Pastoral Message Generator (WhatsApp / SMS para membros ou aniversariantes)
  app.post('/api/assistant/draft-message', async (req, res) => {
    try {
      const memberName = sanitizeUserText(req.body?.memberName, 120);
      const occasion = sanitizeUserText(req.body?.occasion, 200);
      const tone = sanitizeUserText(req.body?.tone || 'afetuoso e inspirador', 80);
      const prompt = `Escreva uma mensagem pastoral inspiradora e bíblica para o membro "${memberName}", por ocasião de "${occasion}". O tom deve ser "${tone}". Inclua um versículo bíblico apropriado e felicitações em nome da Igreja Emanuel - Xangongo.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: 'Você é o pastor da Igreja Evangélica Sinodal de Angola (Emanuel em Xangongo). Escreva com elegância, calor e brevidade para WhatsApp.',
        },
      });

      return res.json({ text: response.text });
    } catch (error: any) {
      console.error('Error in /api/assistant/draft-message:', error);
      return res.status(500).json({ error: error.message || 'Erro ao gerar mensagem pastoral' });
    }
  });

  // Mount Vite dev middlewares
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
