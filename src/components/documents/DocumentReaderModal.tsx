import { useRef, useState } from 'react';
import { Camera, FileImage, Sparkles, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import {
  compressImageFile,
  aiExtractMember,
  aiExtractReceipt,
  normalizeMemberFields,
  runAiDiagnostics,
} from '../../lib/ai';

export type DocKind = 'bi' | 'cartao' | 'comprovativo';

const TITLES: Record<DocKind, string> = {
  bi: 'Ler Bilhete de Identidade',
  cartao: 'Ler Cartão de Membro Batizado',
  comprovativo: 'Ler Comprovativo Bancário',
};

const LABELS: Record<string, string> = {
  name: 'Nome completo',
  documentNumber: 'Nº do BI',
  birthDate: 'Nascimento',
  address: 'Residência',
  gender: 'Sexo',
  issueDate: 'Emissão',
  memberNumber: 'Nº de membro',
  baptismDate: 'Batismo',
  groupCell: 'Célula / Grupo',
  phone: 'Telefone',
  amount: 'Valor (AOA)',
  currency: 'Moeda',
  date: 'Data',
  method: 'Método',
  bank: 'Banco',
  payerName: 'Pagador',
  reference: 'Referência',
  notes: 'Observações',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DocKind;
  onApply: (fields: Record<string, string | number | null>) => void;
}

/**
 * Modal «Leitor de documentos com IA»: tira/escolhe uma fotografia,
 * comprime no dispositivo, envia ao Worker (Gemini visão) e devolve os
 * campos estruturados para aplicar no formulário.
 */
export default function DocumentReaderModal({ open, onOpenChange, kind, onApply }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [payload, setPayload] = useState<{
    base64: string;
    mimeType: string;
    width?: number;
    height?: number;
    approxKb?: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string>('');
  const [fields, setFields] = useState<Record<string, string | number | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);

  const reset = () => {
    setPreview(null);
    setPayload(null);
    setFields(null);
    setError(null);
    setDiag(null);
    setBusy(false);
    setBusyLabel('');
  };

  const handleFile = async (f: File) => {
    if (!f.type.startsWith('image/')) {
      toast.error('Escolha um ficheiro de imagem.');
      return;
    }
    setBusy(true);
    setBusyLabel('A preparar a imagem…');
    setError(null);
    setFields(null);
    setDiag(null);
    try {
      const p = await compressImageFile(f);
      setPayload(p);
      setPreview(`data:${p.mimeType};base64,${p.base64}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha a preparar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  /** Testa a ligação ao servidor de IA (Worker, segredos, papel, Gemini). */
  const runDiagnostics = async () => {
    setBusy(true);
    setBusyLabel('A testar a ligação da IA…');
    setError(null);
    try {
      const { lines } = await runAiDiagnostics();
      setDiag(lines.join('\n'));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const extract = async () => {
    if (!payload) return;
    setBusy(true);
    setBusyLabel('A ler o documento com IA…');
    setError(null);
    setDiag(null);
    try {
      if (kind === 'comprovativo') {
        const f = await aiExtractReceipt(payload.base64, payload.mimeType);
        const clean = Object.fromEntries(
          Object.entries(f as Record<string, unknown>)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => [k, v as string | number])
        );
        if (Object.keys(clean).length === 0) {
          setError('Não consegui ler nada utilizável neste comprovativo. Tente uma foto mais nítida, com boa luz e sem reflexos.');
        } else {
          setFields(clean);
        }
      } else {
        const raw = await aiExtractMember(payload.base64, payload.mimeType, kind);
        /* Normaliza datas (AAAA-MM-DD), sexo (Masculino/Feminino) e telefone (+244…)
           — sem isto o formulário ignora os valores e parece que a IA não leu nada. */
        const clean = normalizeMemberFields(raw);
        if (Object.keys(clean).length === 0) {
          setError(
            'A IA não encontrou dados legíveis nesta imagem. Aproxime-se do documento, evite reflexos e sombras, ' +
            'enquadre o BI todo e tire nova foto. Se o erro persistir, corra o teste de ligação.'
          );
        } else {
          setFields(clean);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o documento.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const apply = () => {
    if (!fields) return;
    onApply(fields);
    toast.success('Campos preenchidos — reveja antes de guardar.');
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 300);
      }}
    >
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-gold" /> {TITLES[kind]}
          </DialogTitle>
          <DialogDescription>
            Fotografe o documento na horizontal, com boa luz. A IA lê e preenche os campos — você
            confirma antes de guardar.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />

        {!preview ? (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 py-10 text-slate-500 hover:border-gold hover:text-slate-700 dark:hover:text-slate-300 transition-colors w-full"
          >
            {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Camera className="h-8 w-8" />}
            <span className="text-sm font-medium">Tirar fotografia ou escolher imagem</span>
            <span className="text-xs text-slate-400">BI · cartão de membro · comprovativo</span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              <img src={preview} alt="Documento" className="w-full max-h-56 object-contain bg-slate-100 dark:bg-slate-900" />
              <button
                onClick={() => inputRef.current?.click()}
                className="absolute top-2 right-2 rounded-full bg-black/60 text-white px-3 py-1.5 text-xs font-medium"
              >
                <FileImage className="h-3.5 w-3.5 inline mr-1" /> Outra foto
              </button>
            </div>

            {payload?.approxKb !== undefined && (
              <div className="text-[11px] text-slate-400 text-center">
                Imagem optimizada: {payload.width}×{payload.height} px · ~{payload.approxKb} KB
              </div>
            )}

            {!fields && !busy && (
              <div className="flex gap-2">
                <Button onClick={extract} className="flex-1 gap-2">
                  <Sparkles className="h-4 w-4" /> Ler com IA
                </Button>
                <Button type="button" variant="outline" onClick={runDiagnostics} className="gap-1.5 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" /> Testar ligação
                </Button>
              </div>
            )}
            {busy && (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel || 'A processar…'}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span className="whitespace-pre-line">{error}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={runDiagnostics} disabled={busy} className="flex-1 text-xs">
                Testar ligação da IA
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={extract} disabled={busy || !payload} className="flex-1 text-xs">
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        {diag && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Diagnóstico</div>
            <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">{diag}</pre>
          </div>
        )}

        {fields && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
            {Object.entries(fields).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400 text-xs font-medium shrink-0">
                  {LABELS[k] || k}
                </span>
                <span className="font-medium text-right truncate flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> {String(v)}
                </span>
              </div>
            ))}
          </div>
        )}

        {fields && (
          <div className="flex gap-2">
            <Badge variant="outline" className="flex-1 justify-center py-2 text-[11px] font-normal">
              Confira os dados — a IA pode enganar-se
            </Badge>
            <Button onClick={apply} className="shrink-0 gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Aplicar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
