export interface Member {
  id: string;
  name: string;
  role?: string;
  status: string;
  /** Nº do Bilhete de Identidade (lido automaticamente pela IA a partir da foto do BI). */
  documentNumber?: string;
  /** Data de emissão do BI (AAAA-MM-DD). */
  issueDate?: string;
  /** Nº do cartão de membro (o que está impresso no cartão de papel). */
  memberNumber?: string;
  /** ID interno sequencial (M-0001…), gerado uma vez, nunca muda.
   *  Identificação provisória para quem não tem B.I. */
  internalCode?: string;
  /** Nome do pai («Filho de …»). */
  fatherName?: string;
  /** Nome da mãe («… e de …»). */
  motherName?: string;
  /** Naturalidade («Natural de …»). */
  placeOfBirth?: string;
  /** Fotografia do titular (JPEG comprimido em base64, ~400 px). */
  photoBase64?: string;
  /** Aceita receber mensagens por telemóvel (SMS/WhatsApp). Defeito: sim. */
  acceptsMessages?: boolean;
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string;
  baptismDate?: string;
  /** «Recebido como membro da Igreja aos …». */
  joinDate?: string;
  gender?: string;
  maritalStatus?: string;
  spouseName?: string;
  education?: string;
  profession?: string;
  groupCell?: string;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Tithe {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail?: string | null;
  amount: number;
  date: string; // ISO date string or formatted date depending on what's used
  /** LEGADO pré-v1.9.3: mês em nome ('Janeiro'); espelho da entrega. Usar deliveryOf(). */
  month: string;
  year?: number;
  /** DATA DE ENTREGA (v1.9.3+): mês canónico '01'..'12' em que o dinheiro foi recebido.
   *  É ESTA que a contabilidade e os relatórios usam. */
  deliveryMonth?: string;
  deliveryYear?: number;
  /** LEGADO: mês da operação de caixa (nome). */
  cashierMonth?: string;
  cashierYear?: number;
  /** MÊS DE REFERÊNCIA (v1.9.3+ numérico): o mês a que o dízimo pertence.
   *  É ESTE que o cartão do membro usa. */
  referenceMonth?: string;
  referenceYear?: number;
  contributionType?: string;
  contributionDetail?: string;
  receiptNumber?: string;
  adminId?: string;
  updatedAt?: number;
  createdAt?: number;
  financialMonthId?: string;
}

export interface Offering {
  id: string;
  description: string;
  amount: number;
  date: string;
  month: string;
  financialMonthId?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  month: string;
  financialMonthId?: string;
}

export interface FinancialMonth {
  id: string;
  month: string; // e.g. "Janeiro/2026"
  status: 'open' | 'closed';
  totalTithes: number;
  totalOfferings: number;
  totalExpenses: number;
  balance: number;
  openingBalance?: number;
}

export interface BuildingFund {
  id: string;
  type: 'contribuicao' | 'despesa';
  description: string;
  amount: number;
  date: string;
  memberId?: string;
  memberName?: string;
  month: string;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  quantity: number;
  value: number;
  purchaseDate: string;
  condition: string;
  location: string;
}

export interface DashboardStats {
  totalMembers: number;
  totalActive: number;
  totalInactive: number;
  thisMonthTithes: number;
  lastMonthTithes: number;
  genders: { name: string; value: number; fill: string }[];
  demographics: { name: string; value: number; fill: string }[];
  statusStats?: Record<string, { men: number; women: number }>;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  adminId: string;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* Cartão de membro digital (espelho do cartão de papel da IESA)       */
/* ------------------------------------------------------------------ */

/** Marca de «Participou da Comunhão»: uma por (membro, ano, mês).
 *  No papel as casas levavam a ASSINATURA do pastor; no digital (decisão da
 *  liderança, 2026-10-23) usa-se:
 *    'present' → ✓ participou
 *    'absent'  → ✗ não participou
 *    (sem registo) → casa vazia, mês ainda não marcado
 *  Valores antigos em texto livre continuam a ser mostrados como texto. */
export interface CommunionMark {
  id: string;
  memberId: string;
  year: number;
  /** '01'..'12' */
  month: string;
  mark: string;
  recordedBy?: string;
  createdAt?: number;
}

/** «Entrega de Donativos Voluntários»: donativo POR MEMBRO (não confundir com
 *  `offerings`, que são ofertas da igreja sem memberId). */
export interface Donation {
  id: string;
  memberId: string;
  memberName?: string;
  amount: number;
  /** ISO AAAA-MM-DD */
  date: string;
  /** '01'..'12' */
  referenceMonth?: string;
  referenceYear?: number;
  recordedBy?: string;
  createdAt?: number;
}

/** «Renovações» anuais do cartão, com rubrica do pastor. */
export interface Renewal {
  id: string;
  memberId: string;
  /** ISO AAAA-MM-DD */
  date: string;
  pastorSign?: string;
  createdAt?: number;
}

/** Cabeçalho institucional impresso no cartão. */
export interface CardHeader {
  sinodo: string;
  igreja: string;
  provincia: string;
}

export const CARD_HEADER_DEFAULT: CardHeader = {
  sinodo: 'Cunene',
  igreja: 'Emanuel – Xangongo',
  provincia: 'Cunene',
};

export const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;
export const MONTHS_IDX = ['01','02','03','04','05','06','07','08','09','10','11','12'] as const;

/* ------------------------------------------------------------------ */
/* v1.11.0 — Orçamento único, contribuições, notificações, mensagens  */
/* ------------------------------------------------------------------ */

export interface BudgetEntry {
  id: string;
  memberId: string;
  memberEmail?: string | null;
  year: number;
  amount: number;                 // kwanzas inteiros, > 0
  setBy: string;                  // email de quem definiu
  setAt: number;
  history: { from: number | null; to: number; by: string; at: number }[];
}

export type ContributionStatus = 'em_curso' | 'concluida' | 'em_atraso';

export interface Contribution {
  id: string;
  memberId: string;
  memberEmail?: string | null;
  description: string;
  amount: number;                 // valor total devido
  dueDate: string;                // AAAA-MM-DD (prazo)
  status: ContributionStatus;     // calculado + fechos manuais
  paidAmount?: number;            // soma de pagamentos (mantida por trigger de app)
  completedAt?: number | null;    // quando atingiu/marcou concluída
  closeReason?: string | null;    // motivo do fecho manual
  reopenReason?: string | null;   // motivo da reabertura (só admin)
  setBy: string;
  setAt: number;
  history: { field: string; from: unknown; to: unknown; by: string; at: number }[];
}

export interface ContributionPayment {
  id: string;
  contributionId: string;
  memberId: string;
  amount: number;
  deliveryDate: string;           // data de ENTREGA (contabilidade)
  recordedBy: string;
  createdAt: number;
}

export interface AppNotification {
  id: string;
  userEmail: string;              // dono da notificação (membro ou liderança)
  kind: string;                   // budget_set | contribution_set | payment_received | reminder | admin_alert …
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  refId?: string;
}

export type ChannelState = 'pending' | 'manual_hold' | 'sent' | 'failed' | 'no_phone' | 'not_accepted' | 'cancelled' | 'replaced';

export interface OutboxMessage {
  id: string;
  memberId: string;
  memberEmail?: string | null;
  memberName?: string;
  phone?: string | null;          // snapshot normalizado no momento do agendamento
  acceptsMessages?: boolean;      // snapshot do campo do membro
  kind: string;
  body: string;                   // mensagem já com dados reais substituídos
  smsState: ChannelState;
  waState: ChannelState;
  status: 'pending' | 'held' | 'done';
  cancelUntil: number;            // janela de 10 min para cancelar/substituir
  dedupeDay: string;              // AAAA-MM-DD: máx. 1 mensagem/dia/membro
  campaignId?: string | null;
  refId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Campaign {
  id: string;
  name: string;
  audience: string;               // descrição do filtro (código calcula destinatários)
  templates: Record<string, string>; // groupId → modelo com {marcadores}
  groupCounts: Record<string, number>;
  createdBy: string;
  createdAt: number;
  status: 'draft' | 'sent';
  recipientCount: number;
}

export interface NotifSettings {
  perWeek: number;                // NOTIFICACOES_POR_SEMANA (def. 3)
  days: number[];                 // 1=seg … 7=dom (def. [1,3,5])
  hour: number;                   // hora de Luanda (def. 9)
  maxWeeks: number;               // MAX_SEMANAS_LEMBRETE (def. 8)
  externalReminders: boolean;     // SMS/WhatsApp nos lembretes (def. false)
  maxExternalPerWeek: number;     // tecto por membro/semana (def. 2)
  testMode: boolean;              // lembretes de minuto a minuto p/ testes
}

export const NOTIF_SETTINGS_DEFAULT: NotifSettings = {
  perWeek: 3,
  days: [1, 3, 5],
  hour: 9,
  maxWeeks: 8,
  externalReminders: false,
  maxExternalPerWeek: 2,
  testMode: false,
};
