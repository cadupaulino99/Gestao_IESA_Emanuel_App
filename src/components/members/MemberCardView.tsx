import { formatKz } from '../../lib/money';
import { Check, X } from 'lucide-react';
import { aggregateByMonth, sumYear } from '../../lib/finance';
import {
  Member,
  CommunionMark,
  Donation,
  Renewal,
  Tithe,
  CardHeader,
  CARD_HEADER_DEFAULT,
  MONTHS_SHORT,
  MONTHS_IDX,
} from '../../types';

export interface MemberCardData {
  communions: CommunionMark[];
  donations: Donation[];
  tithes: Tithe[];
  renewals: Renewal[];
  budget?: { year: number; amount: number } | null;
  contributions?: { description: string; amount: number; paid: number; dueDate: string; status: string; completedAt?: number | null }[];
}

interface Props {
  member: Member;
  data: MemberCardData;
  header?: CardHeader;
  /** compacto = portal do membro (uma face de cada vez, sem sombras de papel) */
  compact?: boolean;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const fmtDateLong = (iso?: string | null) => {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
};

const money = (n: number) =>
  formatKz(n || 0);

/** Anos a mostrar nas tabelas (união dos anos com registos, máx. 4 colunas). */
function yearsOf(data: MemberCardData): number[] {
  const ys = new Set<number>();
  data.communions.forEach((c) => c.year && ys.add(c.year));
  data.donations.forEach((d) => d.referenceYear && ys.add(d.referenceYear));
  data.tithes.forEach((t) => t.referenceYear && ys.add(t.referenceYear));
  data.renewals.forEach((r) => {
    const y = Number(String(r.date || '').slice(0, 4));
    if (y) ys.add(y);
  });
  if (ys.size === 0) ys.add(new Date().getFullYear());
  return [...ys].sort((a, b) => b - a).slice(0, 4).sort((a, b) => a - b);
}

const cell = 'border border-slate-400/70 px-1 py-0.5 text-center';
const head = 'border border-slate-500/80 bg-slate-200/70 px-1 py-0.5 text-center font-semibold';

/** Selo IESA desenhado em SVG (círculo vermelho + cruz branca), como no papel. */
function IesaSeal({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Selo IESA">
      <circle cx="50" cy="50" r="48" fill="#b4232a" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#ffffff" strokeWidth="2" />
      <rect x="44" y="18" width="12" height="64" fill="#ffffff" />
      <rect x="26" y="36" width="48" height="12" fill="#ffffff" />
      <text x="50" y="90" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="bold" fontFamily="sans-serif">
        IESA
      </text>
    </svg>
  );
}

function Field({ label, value, className = '' }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={`flex gap-1 items-baseline ${className}`}>
      <span className="shrink-0 text-[11px] font-semibold text-slate-700">{label}</span>
      <span className="flex-1 border-b border-slate-400/80 text-[12px] font-medium text-blue-900 px-1 leading-5">
        {value || '—'}
      </span>
    </div>
  );
}

/**
 * Cartão de membro digital — réplica do cartão de papel da IESA:
 *   FRENTE: cabeçalho institucional, dados pessoais, comunhão, donativos;
 *   VERSO:  renovações, fotografia, assinatura, dízimos, Mal. 3:10.
 */
export default function MemberCardView({ member, data, header = CARD_HEADER_DEFAULT, compact = false }: Props) {
  const years = yearsOf(data);

  const comOf = (y: number, mi: string) =>
    data.communions.find((c) => c.year === y && c.month === mi)?.mark || '';

  /** No papel era a assinatura do pastor; no digital, ✓ / ✗ (decisão da liderança). */
  const ComMark = ({ mark }: { mark: string }) => {
    if (mark === 'present')
      return <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 inline" aria-label="participou" />;
    if (mark === 'absent')
      return <X className="h-3.5 w-3.5 text-red-500 dark:text-red-400 inline" aria-label="não participou" />;
    return <>{mark}</>;
  };
  const donByYear = (y: number) => aggregateByMonth(data.donations, y);
  const titByYear = (y: number) => aggregateByMonth(data.tithes, y);
  const donOf = (y: number, mi: string) => donByYear(y)[mi]?.total || 0;
  const titOf = (y: number, mi: string) => {
    const a = titByYear(y)[mi];
    return { total: a?.total || 0, n: a?.count || 0 };
  };

  const face = `${compact ? '' : 'shadow-md '}rounded-lg border border-slate-300 dark:border-slate-700 bg-[#eef5ee] dark:bg-slate-900 p-4 space-y-3`;

  return (
    <div className="space-y-4">
      {/* ═══════════════ FRENTE ═══════════════ */}
      <div className={face}>
        <div className="flex items-start gap-3">
          <IesaSeal size={compact ? 52 : 64} />
          <div className="flex-1 text-[12px] leading-5 text-slate-800 dark:text-slate-200">
            <Field label="Sínodo Eclesiástico de" value={header.sinodo} />
            <Field label="Igreja Local de" value={header.igreja} />
            <Field label="Província de" value={header.provincia} />
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide bg-slate-300/80 dark:bg-slate-700 px-2 py-0.5 rounded">
              Cartão de Membro
            </div>
            <div className="text-xl font-bold text-blue-900 dark:text-blue-300 mt-1">
              Nº {member.memberNumber || '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-[12px]">
          <Field label="Nome" value={member.name} className="col-span-2" />
          <Field label="Filho de" value={member.fatherName} />
          <Field label="e de" value={member.motherName} />
          <Field label="Natural de" value={member.placeOfBirth} />
          <Field label="Nascido aos" value={member.birthDate ? fmtDateLong(member.birthDate) : null} />
          <Field label="Residente em" value={member.address} />
          {member.documentNumber ? (
            <Field label="BI nº" value={member.documentNumber} />
          ) : (
            <Field label="Identificação provisória (ID interno)" value={member.internalCode} />
          )}
          <Field label="Emitido aos" value={member.issueDate ? fmtDate(member.issueDate) : null} />
          <Field label="Estado Civil" value={member.maritalStatus} />
          <Field label="Baptizado aos" value={member.baptismDate ? fmtDate(member.baptismDate) : null} />
          <Field
            label="Recebido como membro aos"
            value={member.joinDate ? `${fmtDate(member.joinDate)} em ${header.igreja}` : null}
            className="col-span-2"
          />
        </div>

        {/* ORÇAMENTO ÚNICO + CONTRIBUIÇÕES (v1.11.0) */}
        <div className="rounded-lg border border-slate-400/60 px-2 py-1.5 text-[12px] space-y-1 bg-white/40 dark:bg-slate-800/40">
          <div className="flex items-baseline gap-1">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Orçamento único:</span>
            {data.budget?.amount ? (
              <span className="font-bold text-blue-900 dark:text-blue-300">
                {money(data.budget.amount)} Kz ({data.budget.year})
              </span>
            ) : (
              <span className="text-slate-500">Não definido</span>
            )}
          </div>
          {(data.contributions || []).length > 0 && (
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Contribuições:</span>
              {(data.contributions || []).map((c, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                  <span>• {c.description}</span>
                  <span className="text-blue-900 dark:text-blue-300">{money(c.paid)}/{money(c.amount)} Kz</span>
                  <span>prazo {fmtDate(c.dueDate)}</span>
                  <span className={c.status === 'concluida' ? 'text-emerald-700 font-semibold' : c.status === 'em_atraso' ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                    {c.status === 'concluida' ? `Contribuição concluída${c.completedAt ? ` em ${fmtDate(new Date(c.completedAt).toISOString().slice(0, 10))}` : ''}` : c.status === 'em_atraso' ? 'Em atraso' : 'Em curso'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PARTICIPOU DA COMUNHÃO */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200 mb-1">
            Participou da Comunhão
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr>
                  <th className={head}>Mês</th>
                  {years.map((y) => (
                    <th key={y} className={head}>{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTHS_IDX.map((mi, i) => (
                  <tr key={mi}>
                    <td className={cell + ' font-medium'}>{MONTHS_SHORT[i]}.</td>
                    {years.map((y) => (
                      <td key={y} className={cell + ' text-blue-800 dark:text-blue-300 font-semibold'}>
                        <ComMark mark={comOf(y, mi)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ENTREGA DE DONATIVOS VOLUNTÁRIOS */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200 mb-1">
            Entrega de Donativos Voluntários
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr>
                  <th className={head}>Mês</th>
                  {years.map((y) => (
                    <th key={y} className={head}>{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTHS_IDX.map((mi, i) => (
                  <tr key={mi}>
                    <td className={cell + ' font-medium'}>{MONTHS_SHORT[i]}.</td>
                    {years.map((y) => {
                      const v = donOf(y, mi);
                      return (
                        <td key={y} className={cell + ' text-blue-800 dark:text-blue-300'}>
                          {v ? money(v) : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className={head}>Total</td>
                  {years.map((y) => (
                    <td key={y} className={cell + ' font-bold'}>
                      {money(sumYear(data.donations, y))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════════════ VERSO ═══════════════ */}
      <div className={face}>
        <p className="text-[10px] italic text-slate-600 dark:text-slate-300">
          Este cartão será renovado anualmente, e o portador será obrigado a entregá-lo em caso de desistência.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* RENOVAÇÕES + FOTO + ASSINATURA */}
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr>
                    <th className={head}>Renovações</th>
                    <th className={head}>Rubrica do Pastor</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.renewals]
                    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                    .slice(-4)
                    .map((r) => (
                      <tr key={r.id}>
                        <td className={cell}>Renovado aos {fmtDate(r.date)}</td>
                        <td className={cell + ' text-blue-800 dark:text-blue-300 font-semibold'}>{r.pastorSign || ''}</td>
                      </tr>
                    ))}
                  {data.renewals.length === 0 && (
                    <tr>
                      <td className={cell} colSpan={2}>—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-end gap-3">
              <div className="w-24 h-28 rounded border border-slate-400 bg-white dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                {member.photoBase64 ? (
                  <img src={`data:image/jpeg;base64,${member.photoBase64}`} alt="Fotografia do titular" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[9px] text-slate-400 text-center px-1">fotografia do titular</span>
                )}
              </div>
              <div className="flex-1">
                <div className="border-b border-slate-500 h-10" />
                <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">Assinatura do Titular</div>
              </div>
            </div>
          </div>

          {/* ENTREGA DE DÍZIMOS */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200 mb-1">
              Entrega de Dízimos
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr>
                    <th className={head}>Mês</th>
                    {years.map((y) => (
                      <th key={y} className={head}>{y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS_IDX.map((mi, i) => (
                    <tr key={mi}>
                      <td className={cell + ' font-medium'}>{MONTHS_SHORT[i]}.</td>
                      {years.map((y) => {
                        const t = titOf(y, mi);
                        return (
                          <td key={y} className={cell + ' text-blue-800 dark:text-blue-300'}>
                            {t.total ? money(t.total) : ''}
                            {t.n > 1 ? <span className="text-[9px] text-slate-500"> ({t.n}×)</span> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className={head}>Total</td>
                    {years.map((y) => (
                      <td key={y} className={cell + ' font-bold'}>
                        {money(sumYear(data.tithes, y))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <p className="text-[10px] italic text-slate-600 dark:text-slate-300 text-center">
          “Trazei todos os dízimos à casa do tesouro…” Mal. 3:10
        </p>
      </div>
    </div>
  );
}
