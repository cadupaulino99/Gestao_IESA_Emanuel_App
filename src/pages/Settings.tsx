import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useTheme, Theme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { Settings as SettingsIcon, Monitor, Moon, Sun, Smartphone, Globe, Bell, AppWindow, Palette, EyeOff, LayoutTemplate, Languages, ShieldCheck } from 'lucide-react';
import { useDevice } from '../hooks/useDevice';
import { Switch } from '../components/ui/switch';

export default function Settings() {
  const { theme, setTheme } = useTheme();
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
              <Label htmlFor="theme-select">Tema Principal</Label>
              <Select value={theme} onValueChange={(t: Theme) => setTheme(t)}>
                <SelectTrigger id="theme-select" className="w-full">
                  <SelectValue placeholder="Seleccione o tema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system"><div className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Padrão do Sistema</div></SelectItem>
                  <SelectItem value="light"><div className="flex items-center gap-2"><Sun className="h-4 w-4" /> Claro Padrão</div></SelectItem>
                  <SelectItem value="dark"><div className="flex items-center gap-2"><Moon className="h-4 w-4" /> Escuro Padrão</div></SelectItem>
                  <SelectItem value="cosmic"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div> Cósmico (Dark)</div></SelectItem>
                  <SelectItem value="forest"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-700"></div> Floresta (Light)</div></SelectItem>
                  <SelectItem value="ocean"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Oceano (Dark)</div></SelectItem>
                  <SelectItem value="sunset"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500"></div> Pôr do Sol (Light)</div></SelectItem>
                </SelectContent>
              </Select>
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
               </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
