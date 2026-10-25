import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, Loader2, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { signupSchema, signupPayload, type SignupForm } from '../lib/memberSchema';
import { cleanBi } from '../lib/members';
import { selfRegister, compressImageFile } from '../lib/ai';

/* ═══════════════════════════════════════════════════════════════════════
   AUTO-CADASTRO DO MEMBRO (v1.14.0) — ecrã público em /register
   ───────────────────────────────────────────────────────────────────────
   Os campos e validações são OS MESMOS do cadastro que o administrador
   faz (esquema zod partilhado: lib/memberSchema.ts, extraído de
   Members.tsx sem alteração das regras). Acrescentam-se email
   (obrigatório, único) e palavra-passe (com confirmação, 8+ caracteres).
   O registo fica PENDENTE: não dá acesso à app até um administrador
   aprovar (Admin → «Cadastros pendentes»). A validação é repetida no
   SERVIDOR (Worker /auth/self-register) — esconder botões não chega.
   ═══════════════════════════════════════════════════════════════════════ */

export default function SelfRegister() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  /* v1.14.2: erro EM BANNER DENTRO DA PÁGINA — os toasts não apareciam neste
     ecrã (estava fora do Layout) e o cadastro falhava em silêncio. */
  const [formError, setFormError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema) as any,
    defaultValues: { acceptsMessages: true },
  });
  const maritalStatus = watch('maritalStatus');

  const pickPhoto = async (f: File | null) => {
    if (!f) return;
    setPhotoBusy(true);
    try {
      // MESMA regra do cadastro do administrador: comprimida a 400 px, q0.8
      const p = await compressImageFile(f, { max: 400, quality: 0.8 });
      setValue('photoBase64', p.base64, { shouldDirty: true });
      setPhotoPreview(`data:${p.mimeType};base64,${p.base64}`);
    } catch {
      toast.error('Não foi possível processar a fotografia.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const onSubmit = async (data: SignupForm) => {
    setBusy(true);
    setFormError(null);
    try {
      await selfRegister(signupPayload(data));
      setDone(true);
    } catch (e: any) {
      const msg = e?.message || 'Não foi possível enviar o cadastro.';
      setFormError(msg + (e?.status ? ` (código ${e.status})` : ''));
      toast.error(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  /* Campos inválidos: dizê-lo claramente (antes só havia textos pequenos
     debaixo de cada campo, fáceis de não ver no telemóvel). */
  const onInvalid = () => {
    setFormError('Há campos por corrigir — veja as mensagens a vermelho no formulário.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const err = (k: string) => (errors as any)[k]?.message as string | undefined;
  const Err = ({ k }: { k: string }) => err(k) ? <p className="text-[11px] text-destructive">{err(k)}</p> : null;

  if (done) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-bold">Cadastro recebido!</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O seu pedido foi registado com o estado <b>pendente</b> e <b>aguarda autorização
              do administrador</b> da igreja. Não consegue entrar na aplicação até à aprovação.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Quando for aprovado, inicie sessão com o seu email e a palavra-passe que escolheu —
              ser-lhe-á pedido que defina a sua <b>palavra-passe definitiva</b> antes de entrar.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full gap-2"><ArrowLeft className="h-4 w-4" /> Voltar ao login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-start md:items-center justify-center bg-slate-50 dark:bg-background p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <Link to="/login" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
          </Link>
          <CardTitle className="text-xl flex items-center gap-2">
            <ShieldQuestion className="h-5 w-5 text-blue-600" /> Criar conta / Cadastrar-me
          </CardTitle>
          <CardDescription>
            Preencha os seus dados (os mesmos que a liderança usa no cadastro de membros).
            Depois de enviar, o administrador da igreja precisa de <b>aprovar</b> o seu pedido —
            só então o login funciona.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            {formError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive font-medium">
                {formError}
              </p>
            )}
            {/* ── conta ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Nome Completo *</Label>
                <Input {...register('name')} placeholder="Ex.: Maria Domingos Paulo" autoComplete="name" />
                <Err k="name" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Email * (único — é o seu utilizador)</Label>
                <Input type="email" {...register('email')} placeholder="nome@email.com" autoComplete="email" inputMode="email" />
                <Err k="email" />
              </div>
              <div className="space-y-1">
                <Label>Palavra-passe * (mín. 8 caracteres)</Label>
                <Input type="password" {...register('password')} autoComplete="new-password" />
                <Err k="password" />
              </div>
              <div className="space-y-1">
                <Label>Confirmar palavra-passe *</Label>
                <Input type="password" {...register('passwordConfirm')} autoComplete="new-password" />
                <Err k="passwordConfirm" />
              </div>
            </div>

            {/* ── dados pessoais (mesmos campos do cadastro da liderança) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-4">
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input {...register('phone')} placeholder="+244 9XX XXX XXX" inputMode="tel" autoComplete="tel" />
                <Err k="phone" />
              </div>
              <div className="space-y-1">
                <Label>Nº do Bilhete de Identidade</Label>
                <Input
                  {...register('documentNumber')}
                  placeholder="Ex.: 123456789LA012"
                  inputMode="text"
                  autoCapitalize="characters"
                  onChange={(e) => {
                    const upper = cleanBi(e.target.value);
                    e.target.value = upper;
                    setValue('documentNumber', upper, { shouldValidate: false });
                  }}
                />
                <Err k="documentNumber" />
              </div>
              <div className="space-y-1">
                <Label>Data de Nascimento</Label>
                <Input type="date" {...register('birthDate')} />
              </div>
              <div className="space-y-1">
                <Label>Data de Baptismo</Label>
                <Input type="date" {...register('baptismDate')} />
              </div>
              <div className="space-y-1">
                <Label>Género</Label>
                <Select onValueChange={(v) => setValue('gender', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Masculino">Masculino</SelectItem>
                    <SelectItem value="Feminino">Feminino</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Estado Civil</Label>
                <Select onValueChange={(v) => setValue('maritalStatus', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
                    <SelectItem value="Casado(a)">Casado(a)</SelectItem>
                    <SelectItem value="Viúvo(a)">Viúvo(a)</SelectItem>
                    <SelectItem value="Divorciado(a)">Divorciado(a)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {maritalStatus === 'Casado(a)' && (
                <div className="space-y-1">
                  <Label>Nome do Cônjuge</Label>
                  <Input {...register('spouseName')} />
                </div>
              )}
              <div className="space-y-1">
                <Label>Naturalidade</Label>
                <Input {...register('placeOfBirth')} placeholder="Ex.: Quitwa" />
              </div>
              <div className="space-y-1">
                <Label>Nome do Pai</Label>
                <Input {...register('fatherName')} />
              </div>
              <div className="space-y-1">
                <Label>Nome da Mãe</Label>
                <Input {...register('motherName')} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Morada/Endereço</Label>
                <Input {...register('address')} autoComplete="street-address" />
              </div>
              <div className="space-y-1">
                <Label>Formação</Label>
                <Input {...register('education')} />
              </div>
              <div className="space-y-1">
                <Label>Profissão</Label>
                <Input {...register('profession')} />
              </div>
              <div className="space-y-1">
                <Label>Célula/Grupo</Label>
                <Input {...register('groupCell')} placeholder="Ex.: Jovens" />
              </div>
              {/* fotografia opcional — mesma compressão do cadastro admin (400 px, q0.8) */}
              <div className="space-y-1">
                <Label>Fotografia (opcional)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="signup-photo"
                    onChange={(e) => pickPhoto(e.target.files?.[0] || null)}
                  />
                  <label htmlFor="signup-photo">
                    <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-muted">
                      {photoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {photoPreview ? 'Substituir foto' : 'Escolher foto'}
                    </span>
                  </label>
                  {photoPreview && <img src={photoPreview} alt="Pré-visualização" className="h-12 w-12 rounded border object-cover" />}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t pt-4">
              <Switch id="signup-msgs" defaultChecked onCheckedChange={(v) => setValue('acceptsMessages', v)} />
              <Label htmlFor="signup-msgs" className="text-xs font-normal">
                Aceito receber avisos da igreja por SMS/WhatsApp
              </Label>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'A enviar…' : 'Enviar cadastro para aprovação'}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              A sua palavra-passe viaja cifrada (HTTPS) e é guardada apenas pelo Firebase
              Authentication (hash forte). A igreja nunca a vê em texto simples.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
