import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

admin.initializeApp();
const db = admin.firestore();

// ---------------------------------------------------------------------------
// IA (Gemini) — a chave vive NO SERVIDOR (secret GEMINI_API_KEY), nunca no APK.
// Definir com:  firebase functions:secrets:set GEMINI_API_KEY
// ---------------------------------------------------------------------------
function ai(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'A chave GEMINI_API_KEY não está configurada no servidor. Execute: firebase functions:secrets:set GEMINI_API_KEY'
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

const SYSTEM_ASSISTANT = `
Você é o Assistente Inteligente Especialista da Igreja Evangélica Sinodal de Angola (IESA) - Igreja Local de Emanuel em Xangongo.
A sua missão é apoiar a liderança da igreja (Pastores, Tesoureiros, Secretários e Administradores) com alta sabedoria, precisão e cordialidade cristã.

Suas competências incluem:
1. Análise financeira e orçamental (Dízimos, Ofertas Gerais, Fundo de Construção, Obrigações Sinodais em Kwanzas - AOA).
2. Orientação pastoral e bíblica para mensagens de saudação a membros, aniversariantes, orações ou exortações amáveis.
3. Sugestões de gestão de células, acolhimento de novos membros e relatórios para a assembleia ou sínodo.
4. Respostas claras, estruturadas com formatação limpa e encorajadora.

Sempre que responder, seja profissional, caloroso e focado na realidade de Angola e da igreja local.
`;

async function requireLeader(context: functions.https.CallableContext): Promise<string> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Tem de iniciar sessão para usar esta função.');
  }
  const email = (context.auth.token.email || '').toLowerCase();
  if (!email) {
    throw new functions.https.HttpsError('permission-denied', 'Conta sem email verificado.');
  }
  const snap = await db.collection('admins').doc(email).get();
  const role = snap.exists ? snap.data()?.role : null;
  if (!role) {
    throw new functions.https.HttpsError('permission-denied', 'Apenas a liderança (admin, pastor, tesoureiro) pode usar esta função.');
  }
  return role || 'admin';
}

// --- Assistente conversacional (página Suporte) -----------------------------
export const assistantChat = functions.https.onCall(async (data: { prompt?: string; context?: string }, context) => {
  await requireLeader(context);
  const prompt = data?.prompt;
  if (!prompt) {
    throw new functions.https.HttpsError('invalid-argument', 'Prompt é obrigatório.');
  }
  const contents = data.context
    ? `[Contexto dos Dados Atuais da Igreja:\n${data.context}]\n\nPergunta ou Pedido:\n${prompt}`
    : prompt;
  try {
    const response = await ai().models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: { systemInstruction: SYSTEM_ASSISTANT },
    });
    return { text: response.text };
  } catch (error: any) {
    console.error('assistantChat:', error);
    throw new functions.https.HttpsError('internal', 'Falha ao processar solicitação de IA.');
  }
});

// --- Parecer executivo financeiro -------------------------------------------
export const assistantFinancialInsights = functions.https.onCall(async (data: { financialSummary?: unknown }, context) => {
  await requireLeader(context);
  const prompt = `Analise os dados financeiros da igreja e forneça um resumo executivo com 3 pontos fortes e 2 recomendações prudentes para a tesouraria:\n\n${JSON.stringify(data.financialSummary, null, 2)}`;
  try {
    const response = await ai().models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Você é um consultor financeiro cristão experiente em gestão eclesiástica em Angola.',
      },
    });
    return { text: response.text };
  } catch (error: any) {
    console.error('assistantFinancialInsights:', error);
    throw new functions.https.HttpsError('internal', 'Erro ao gerar análise.');
  }
});

// --- Mensagem pastoral (WhatsApp/SMS) ----------------------------------------
export const assistantDraftMessage = functions.https.onCall(async (data: { memberName?: string; occasion?: string; tone?: string }, context) => {
  await requireLeader(context);
  if (!data.memberName || !data.occasion) {
    throw new functions.https.HttpsError('invalid-argument', 'memberName e occasion são obrigatórios.');
  }
  const prompt = `Escreva uma mensagem pastoral inspiradora e bíblica para o membro "${data.memberName}", por ocasião de "${data.occasion}". O tom deve ser "${data.tone || 'afetuoso e inspirador'}". Inclua um versículo bíblico apropriado e felicitações em nome da Igreja Emanuel - Xangongo.`;
  try {
    const response = await ai().models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Você é o pastor da Igreja Evangélica Sinodal de Angola (Emanuel em Xangongo). Escreva com elegância, calor e brevidade para WhatsApp.',
      },
    });
    return { text: response.text };
  } catch (error: any) {
    console.error('assistantDraftMessage:', error);
    throw new functions.https.HttpsError('internal', 'Erro ao gerar mensagem pastoral.');
  }
});

// --- Criação de contas Auth por admins ---------------------------------------
// Permite que o administrador crie o acesso (email + palavra-passe temporária)
// de pastores/tesoureiros sem precisarem de conta Google.
export const createAuthAccount = functions.https.onCall(
  async (data: { email?: string; displayName?: string; tempPassword?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Tem de iniciar sessão.');
    }
    const callerEmail = (context.auth.token.email || '').toLowerCase();
    const callerSnap = await db.collection('admins').doc(callerEmail).get();
    const callerRole = callerSnap.exists ? callerSnap.data()?.role : null;
    if (callerRole !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Apenas administradores podem criar contas.');
    }
    const email = (data.email || '').trim().toLowerCase();
    if (!email.includes('@')) {
      throw new functions.https.HttpsError('invalid-argument', 'Email inválido.');
    }
    const tempPassword =
      data.tempPassword || crypto.randomBytes(6).toString('base64url');

    try {
      const existing = await admin.auth().getUserByEmail(email).catch(() => null);
      if (existing) {
        // Já existe: repõe a palavra-passe temporária.
        await admin.auth().updateUser(existing.uid, { password: tempPassword });
        return { ok: true, created: false, tempPassword };
      }
      await admin.auth().createUser({
        email,
        password: tempPassword,
        displayName: data.displayName || email.split('@')[0],
      });
      return { ok: true, created: true, tempPassword };
    } catch (error: any) {
      console.error('createAuthAccount:', error);
      throw new functions.https.HttpsError('internal', 'Não foi possível criar a conta: ' + (error?.message || 'erro desconhecido'));
    }
  }
);

// ---------------------------------------------------------------------------
// Triggers de sincronização de resumos financeiros (inalterados)
// ---------------------------------------------------------------------------
async function handleFinancialUpdate(
  change: functions.Change<functions.firestore.DocumentSnapshot>,
  type: 'tithes' | 'offerings' | 'expenses'
) {
  const before = change.before.data();
  const after = change.after.data();

  if (!before && !after) return;

  const updatesToApply = new Map<string, any>();

  const addUpdate = (docId: string, payload: any) => {
    if (!updatesToApply.has(docId)) {
      updatesToApply.set(docId, {});
    }
    const current = updatesToApply.get(docId);
    for (const [k, v] of Object.entries(payload)) {
      current[k] = (current[k] || 0) + v;
    }
  };

  if (before && before.year && before.month) {
    const amt = before.amount || 0;
    const cat = before.category || 'Outras Despesas';
    const monthDoc = `${before.year}_${before.month}`;
    const yearDoc = `${before.year}`;

    const monthPayload: any = { [type]: -amt };
    const yearPayload: any = { [type]: -amt };

    if (type === 'tithes' || type === 'offerings') {
      monthPayload.totalIncome = -amt;
      yearPayload.totalIncome = -amt;
    } else {
      monthPayload[`expense_${cat}`] = -amt;
      yearPayload[`expense_${cat}`] = -amt;
    }

    addUpdate(`financial_summaries/${monthDoc}`, monthPayload);
    addUpdate(`financial_summaries/${yearDoc}`, yearPayload);
  }

  if (after && after.year && after.month) {
    const amt = after.amount || 0;
    const cat = after.category || 'Outras Despesas';
    const monthDoc = `${after.year}_${after.month}`;
    const yearDoc = `${after.year}`;

    const monthPayload: any = { year: after.year, month: after.month, [type]: amt };
    const yearPayload: any = { year: after.year, [type]: amt };

    if (type === 'tithes' || type === 'offerings') {
      monthPayload.totalIncome = amt;
      yearPayload.totalIncome = amt;
    } else {
      monthPayload[`expense_${cat}`] = amt;
      yearPayload[`expense_${cat}`] = amt;
    }

    addUpdate(`financial_summaries/${monthDoc}`, monthPayload);
    addUpdate(`financial_summaries/${yearDoc}`, yearPayload);
  }

  const batch = db.batch();
  for (const [docPath, payload] of updatesToApply.entries()) {
    const ref = db.doc(docPath);
    const firestoreUpdate: any = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k === 'year' || k === 'month') {
        firestoreUpdate[k] = v;
      } else {
        firestoreUpdate[k] = admin.firestore.FieldValue.increment(v as number);
      }
    }
    batch.set(ref, firestoreUpdate, { merge: true });
  }

  await batch.commit();
}

export const syncOfferings = functions.firestore
  .document('offerings/{docId}')
  .onWrite((change) => handleFinancialUpdate(change, 'offerings'));

export const syncTithes = functions.firestore
  .document('tithes/{docId}')
  .onWrite((change) => handleFinancialUpdate(change, 'tithes'));

export const syncExpenses = functions.firestore
  .document('expenses/{docId}')
  .onWrite((change) => handleFinancialUpdate(change, 'expenses'));
