import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useTheme, type Mode, type Palette as PaletteId } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { Settings as SettingsIcon, Monitor, Moon, Sun, Smartphone, Globe, Bell, AppWindow, Palette, EyeOff, LayoutTemplate, Languages, ShieldCheck, KeyRound, Loader2 } from 'lucide-react';
import { useDevice } from '../hooks/useDevice';
import { Switch } from '../components/ui/switch';
import { Button } from '../components/ui/button';
import { currentVersion, lastKnownTag } from '../lib/updateCheck';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { NOTIF_SETTINGS_DEFAULT, type NotifSettings } from '../types';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { ArrowDownToLine } from 'lucide-react';

export default function Settings() {
  const { user, isAdmin } = useAuth();

  /* ── v1.16.0: mudar a PRÓPRIA palavra-passe (self-service da liderança).
     Antes só havia dois caminhos: pedir ao super (temporária) ou «Esqueci-me»
     no login — os admins ficavam «bloqueados» com uma palavra-passe que não
     podiam alterar a partir da sessão. ── */
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConf, setPwConf] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const hasPasswordProvider = (user?.providerData || []).some((pd) => pd.providerId === 'password');

  const changeOwnPassword = async () => {
    setPwErr(null);
    if (!user?.email) { setPwErr('Sessão sem email associado.'); return; }
    if (!pwCur) { setPwErr('Escreva a palavra-passe actual.'); return; }
    if (pwNew.length < 8) { setPwErr('A nova palavra-passe precisa de 8+ caracteres.'); return; }
    if (pwNew === pwCur) { setPwErr('A nova palavra-passe tem de ser DIFERENTE da actual.'); return; }
    if (pwNew !== pwConf) { setPwErr('A confirmação não coincide.'); return; }
    setPwBusy(true);
    try {
      // prova a actual (e refresca a sessão — requisito do updatePassword)
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pwCur));
      await updatePassword(user, pwNew);   // o hash vive só no Firebase Auth
      await addDoc(collection(db, 'audit_logs'), {
        action: 'password.self-changed', targetEmail: user.email,
        byEmail: user.email, at: Date.now(),
        adminEmail: user.email, createdAt: Date.now(), collectionName: 'admins', detail: '',
      }).catch(() => {});
      toast.success('Palavra-passe alterada com sucesso.');
      setPwCur(''); setPwNew(''); setPwConf('');
    } catch (e: any) {
      const c = String(e?.code || '');
      if (c === 'auth/invalid-credential' || c === 'auth/wrong-password') setPwErr('A palavra-passe actual está errada.');
      else if (c === 'auth/weak-password') setPwErr('Palavra-passe nova demasiado fraca para o servidor (8+ caracteres).');
      else if (c === 'auth/requires-recent-login') setPwErr('Sessão antiga demais para esta operação — termine sessão, volte a entrar e tente de novo.');
      else setPwErr(e?.message || 'Não foi possível alterar.');
    } finally {
      setPwBusy(false);
    }
  };
  const [ns, setNs] = useState<NotifSettings>(NOTIF_SETTINGS_DEFAULT);
  const [nsLoaded, setNsLoaded] = useState(false);
  const [nsSaving, setNsSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'notifications'))
      .then((d) => { if (d.exists()) setNs({ ...NOTIF_SETTINGS_DEFAULT, ...(d.data() as any) }); setNsLoaded(true); })
      .catch(() => setNsLoaded(true));
  }, []);

  const saveNs = async () => {
    setNsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'notifications'), ns);
      toast.success('Configuração de notificações guardada.');
    } catch (e: any) {
      toast.error(e?.message || 'Sem permissão para alterar (só administração).');
    } finally {
      setNsSaving(false);
    }
  };
  const { mode, setMode, palette, setPalette } = useTheme();
  const { 
    animationsEnabled, soundEnabled, compactMode, hideFinancials, language,
    setAnimationsEnabled, setSoundEnabled, setCompactMode, setHideFinancials, setLanguage 
  } = useSettings();
  const deviceInfo = useDevice();
  
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-8 w-8 text-primary" />
          Definições Gerais
        </h2>
        <p className="text-muted-foreground mt-1">Configure as preferências do aplicativo, acessibilidade e aparência.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Palavra-passe (v1.16.0) ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> A minha palavra-passe
            </CardTitle>
            <CardDescription>
              Altere a sua palavra-passe de acesso sem pedir a ninguém — confirme com a actual.
              {!hasPasswordProvider && user ? ' Esta conta entra pelo Google: defina aqui uma palavra-passe alternativa ou use «Esqueci-me da palavra-passe» no login.' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Palavra-passe actual</Label>
              <Input type="password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nova palavra-passe (8+ caracteres, diferente da actual)</Label>
              <Input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirmar nova palavra-passe</Label>
              <Input type="password" value={pwConf} onChange={(e) => setPwConf(e.target.value)} autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void changeOwnPassword(); } }} />
            </div>
            {pwErr && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium">{pwErr}</p>}
            <Button onClick={changeOwnPassword} disabled={pwBusy} className="w-full gap-2">
              {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Alterar palavra-passe
            </Button>
          </CardContent>
        </Card>

        {/* Aparência */}
        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-muted-foreground" />
              Aparência do Aplicativo
            </CardTitle>
            <CardDescription>Personalize o tema e a densidade visual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="mode-select">Modo (claro / escuro)</Label>
              <Select value={mode} onValueChange={(m) => setMode(m as Mode)}>
                <SelectTrigger id="mode-select" className="w-full">
                  <SelectValue placeholder="Seleccione o modo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system"><div className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Padrão do Sistema</div></SelectItem>
                  <SelectItem value="light"><div className="flex items-center gap-2"><Sun className="h-4 w-4" /> Claro</div></SelectItem>
                  <SelectItem value="dark"><div className="flex items-center gap-2"><Moon className="h-4 w-4" /> Escuro</div></SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label htmlFor="palette-select">Paleta de cores (identidade visual)</Label>
              <Select value={palette} onValueChange={(p) => setPalette(p as PaletteId)}>
                <SelectTrigger id="palette-select" className="w-full">
                  <SelectValue placeholder="Seleccione a paleta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iesa">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: '#B4232A' }} />
                      <span className="w-3 h-3 rounded-full -ml-1" style={{ background: '#C99A2E' }} />
                      IESA Clássico (vermelho + dourado)
                    </span>
                  </SelectItem>
                  <SelectItem value="executivo">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: '#101828' }} />
                      <span className="w-3 h-3 rounded-full -ml-1" style={{ background: '#C99A2E' }} />
                      Executivo (grafite + dourado)
                    </span>
                  </SelectItem>
                  <SelectItem value="cosmic">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-500" /> Cósmico (tema completo)</span>
                  </SelectItem>
                  <SelectItem value="forest">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-700" /> Floresta (tema completo)</span>
                  </SelectItem>
                  <SelectItem value="ocean">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500" /> Oceano (tema completo)</span>
                  </SelectItem>
                  <SelectItem value="sunset">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500" /> Pôr do Sol (tema completo)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">O modo controla os cinzas (claro/escuro); a paleta controla a cor de ação e dos destaques. As paletes «tema completo» trazem o próprio fundo.</p>
            </div>

            <div className="flex items-center justify-between border-t pt-4 border-slate-100 dark:border-slate-800">
              <div className="space-y-0.5">
                <Label>Modo Compacto</Label>
                <p className="text-[12px] text-muted-foreground">Reduz os espaçamentos para mostrar mais dados no ecrã.</p>
              </div>
              <Switch checked={compactMode} onCheckedChange={setCompactMode} />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Animações Suaves</Label>
                <p className="text-[12px] text-muted-foreground">Ativar transições ao interagir com menus e cartões.</p>
              </div>
              <Switch checked={animationsEnabled} onCheckedChange={setAnimationsEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* Preferências */}
        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
              Preferências Locais
            </CardTitle>
            <CardDescription>Ajustes de idioma e exibição de dados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-3">
              <Label htmlFor="language-select">Idioma da Interface</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language-select" className="w-full">
                  <SelectValue placeholder="Seleccione o idioma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-AO"><div className="flex items-center gap-2"><Languages className="h-4 w-4" /> Português (Angola)</div></SelectItem>
                  <SelectItem value="pt-BR"><div className="flex items-center gap-2"><Languages className="h-4 w-4" /> Português (Brasil)</div></SelectItem>
                  <SelectItem value="en-US"><div className="flex items-center gap-2"><Languages className="h-4 w-4" /> English (US)</div></SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Aviso: A alteração de idioma pode requerer recarregar a página para ter efeito completo.</p>
            </div>

            <div className="flex items-center justify-between border-t pt-4 border-slate-100 dark:border-slate-800">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">Ocultar Valores Financeiros <ShieldCheck className="h-3 w-3 text-green-600" /></Label>
                <p className="text-[12px] text-muted-foreground">Oculta os montantes com asteriscos (***) por privacidade.</p>
              </div>
              <Switch checked={hideFinancials} onCheckedChange={setHideFinancials} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sons de Notificação</Label>
                <p className="text-[12px] text-muted-foreground">Tocar sons ao receber alertas e erros do sistema.</p>
              </div>
              <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
            </div>
            
          </CardContent>
        </Card>

        {/* Notificações e Comportamento */}
        <Card className="shadow-sm md:col-span-2 border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              Diagnóstico do Ambiente
            </CardTitle>
            <CardDescription>O sistema reconheceu o seu ambiente e está adaptado automaticamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl p-4">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm font-mono text-muted-foreground">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-foreground font-sans">Navegador</span>
                    <span className="truncate">{deviceInfo.browser}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-foreground font-sans">Sistema Operativo (OS)</span>
                    <span className="truncate">{deviceInfo.os}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-foreground font-sans">Tipo de Ecrã</span>
                    <span className="flex items-center gap-1.5">
                      {deviceInfo.isMobile ? <Smartphone className="h-4 w-4" /> : <AppWindow className="h-4 w-4" />}
                      {deviceInfo.isMobile ? 'Mobile' : deviceInfo.isTablet ? 'Tablet' : 'Desktop'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-foreground font-sans">Orientação Atual</span>
                    <span>{deviceInfo.isPortrait ? 'Retrato (Vertical)' : 'Paisagem (Horizontal)'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-foreground font-sans">Versão instalada</span>
                    <span>{currentVersion()}</span>
                    <span className="text-[10px]">última release vista: {lastKnownTag() || '—'}</span>
                  </div>
               </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={() => window.dispatchEvent(new CustomEvent('iesa:check-update'))}
            >
              <ArrowDownToLine className="h-4 w-4" /> Verificar atualizações
            </Button>
          </CardContent>
        </Card>
      {isAdmin && nsLoaded && (
        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Notificações & Lembretes</CardTitle>
            <CardDescription>Configuração única dos lembretes de contribuições (hora de Luanda, UTC+1).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Lembretes por semana</Label>
                <Input type="number" min={0} max={7} value={ns.perWeek} onChange={(e) => setNs({ ...ns, perWeek: parseInt(e.target.value || '0', 10) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hora (Luanda)</Label>
                <Input type="number" min={0} max={23} value={ns.hour} onChange={(e) => setNs({ ...ns, hour: parseInt(e.target.value || '0', 10) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Máx. de semanas</Label>
                <Input type="number" min={1} max={52} value={ns.maxWeeks} onChange={(e) => setNs({ ...ns, maxWeeks: parseInt(e.target.value || '1', 10) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Máx. externas/semana</Label>
                <Input type="number" min={0} max={7} value={ns.maxExternalPerWeek} onChange={(e) => setNs({ ...ns, maxExternalPerWeek: parseInt(e.target.value || '0', 10) })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i2) => (
                  <Button key={d} type="button" size="sm" variant={ns.days.includes(i2 + 1) ? 'default' : 'outline'}
                    onClick={() => setNs({ ...ns, days: ns.days.includes(i2 + 1) ? ns.days.filter((x) => x !== i2 + 1) : [...ns.days, i2 + 1].sort() })}>
                    {d}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={ns.externalReminders} onCheckedChange={(c) => setNs({ ...ns, externalReminders: c })} />
                Lembretes também por SMS/WhatsApp
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={ns.testMode} onCheckedChange={(c) => setNs({ ...ns, testMode: c })} />
                Modo de teste (lembretes a cada minuto, ignora dias/hora/limite diário)
              </label>
            </div>
            <Button onClick={saveNs} disabled={nsSaving}>{nsSaving ? 'A guardar…' : 'Guardar configuração'}</Button>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
