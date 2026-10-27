import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json'; // Adjust path if needed
import { toast } from 'sonner';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
}, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

/* v1.14.3 (auditoria): mapa código → mensagem humana. Função pura, testada
   em __tests__/firebaseErrors.test.ts. */
const FRIENDLY: Record<string, string> = {
  'permission-denied': 'Sem permissão para esta operação. Se acha que devia ter acesso, fale com o administrador.',
  'unauthenticated': 'Sessão terminada — entre novamente.',
  'unavailable': 'Sem ligação ao servidor. Verifique a internet e tente novamente.',
  'not-found': 'Registo não encontrado (talvez já tenha sido apagado).',
  'already-exists': 'Já existe um registo com este identificador.',
  'failed-precondition': 'A operação não pode ser concluída agora (estado ou índice em falta).',
  'resource-exhausted': 'Limite do servidor atingido — aguarde um momento e tente novamente.',
  'cancelled': 'Operação cancelada.',
  'deadline-exceeded': 'O servidor demorou demasiado a responder. Tente novamente.',
  'aborted': 'Operação interrompida. Tente novamente.',
  'data-loss': 'Erro de dados no servidor. Tente novamente.',
  'internal': 'Erro interno no servidor.',
  'invalid-argument': 'Dados inválidos enviados ao servidor.',
  'unknown': 'Erro inesperado. Tente novamente.',
};

export function friendlyFirestoreMessage(error: unknown): string {
  const code = String((error as any)?.code || '').replace('firebase/firestore/', '');
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  const msg = error instanceof Error
    ? error.message
    : String((error as any)?.message ?? error ?? '');
  return msg || FRIENDLY.unknown;
}

/**
 * Tratamento CENTRAL de erros do Firestore.
 * v1.14.3 (auditoria): antes registrava e RELANÇAVA um JSON — chamado dentro
 * de catch, produzia rejeições não tratadas e o utilizador não via NADA
 * (listas vazias, botões «mortos»: 55 sítios). Agora: toast legível + log
 * completo na consola; NÃO relança (o fluxo do catch termina normalmente).
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  toast.error(friendlyFirestoreMessage(error));
}
