import express from 'express';
import { createServer as createViteServer } from 'vite';
import { ai } from './src/server/gemini';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: AI Assistant for Church Management (Pastor, Treasurer, Secretary queries, pastoral draft messages, financial insights)
  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const { prompt, context } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const systemInstruction = `
Você é o Assistente Inteligente Especialista da Igreja Evangélica Sinodal de Angola (IESA) - Igreja Local de Emanuel em Xangongo.
A sua missão é apoiar a liderança da igreja (Pastores, Tesoureiros, Secretários e Administradores) com alta sabedoria, precisão e cordialidade cristã.

Suas competências incluem:
1. Análise financeira e orçamental (Dízimos, Ofertas Gerais, Fundo de Construção, Obrigações Sinodais em Kwanzas - AOA).
2. Orientação pastoral e bíblica para mensagens de saudação a membros, aniversariantes, orações ou exortações amáveis.
3. Sugestões de gestão de células, acolhimento de novos membros e relatórios para a assembleia ou sínodo.
4. Respostas claras, estruturadas com formatação limpa e encorajadora.

Sempre que responder, seja profissional, caloroso e focado na realidade de Angola e da igreja local.
`;

      const contents = context 
        ? `[Contexto dos Dados Atuais da Igreja:\n${context}]\n\nPergunta ou Pedido:\n${prompt}`
        : prompt;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
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
      const { financialSummary } = req.body;
      const prompt = `Analise os dados financeiros da igreja e forneça um resumo executivo com 3 pontos fortes e 2 recomendações prudentes para a tesouraria:\n\n${JSON.stringify(financialSummary, null, 2)}`;

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
      const { memberName, occasion, tone } = req.body;
      const prompt = `Escreva uma mensagem pastoral inspiradora e bíblica para o membro "${memberName}", por ocasião de "${occasion}". O tom deve ser "${tone || 'afetuoso e inspirador'}". Inclua um versículo bíblico apropriado e felicitações em nome da Igreja Emanuel - Xangongo.`;

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
