import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { useTheme, Theme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from './ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from './ui/command';
import {
  PieChart,
  Users,
  Wallet,
  Building2,
  Landmark,
  BarChart,
  ReceiptText,
  Shield,
  MessageSquare,
  Settings,
  Sun,
  Moon,
  Monitor,
  Eye,
  EyeOff,
  Minimize2,
  Maximize2,
  DoorClosed,
  Search,
  Sparkles,
  Radio,
} from 'lucide-react';

export default function CommandPalette() {
  const { isOpen, setIsOpen, closePalette } = useCommandPalette();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { compactMode, setCompactMode, hideFinancials, setHideFinancials } = useSettings();
  const { userRole, signOut } = useAuth();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const handleSelect = (callback: () => void) => {
    callback();
    closePalette();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="overflow-hidden p-0 max-w-2xl shadow-2xl border-slate-200 dark:border-slate-800">
        <DialogTitle className="sr-only">Menu de Comandos e Atalhos Rápidos</DialogTitle>
        <Command className="rounded-lg border-0">
          <CommandInput
            placeholder="Digite para navegar, alternar tema ou pesquisar ferramentas... (Ctrl + K)"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[350px] overflow-y-auto">
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

            {/* Navegação */}
            <CommandGroup heading="Navegação Rápida">
              <CommandItem onSelect={() => handleSelect(() => navigate('/'))}>
                <PieChart className="mr-2 h-4 w-4 text-blue-500" />
                <span>Dashboard Geral</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/members'))}>
                <Users className="mr-2 h-4 w-4 text-green-500" />
                <span>Gestão de Membros</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/finances'))}>
                <Wallet className="mr-2 h-4 w-4 text-amber-500" />
                <span>Gestão Financeira Mensal (Dízimos / Ofertas / Despesas)</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/obligations'))}>
                <ReceiptText className="mr-2 h-4 w-4 text-purple-500" />
                <span>Obrigações Gerais</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/building-fund'))}>
                <Building2 className="mr-2 h-4 w-4 text-orange-500" />
                <span>Fundo de Construção</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/assets'))}>
                <Landmark className="mr-2 h-4 w-4 text-indigo-500" />
                <span>Património & Activos</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/budget'))}>
                <BarChart className="mr-2 h-4 w-4 text-teal-500" />
                <span>Planeamento & Orçamento</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/reports'))}>
                <ReceiptText className="mr-2 h-4 w-4 text-rose-500" />
                <span>Relatórios & Recibos Oficiais</span>
              </CommandItem>
              {userRole === 'admin' && (
                <CommandItem onSelect={() => handleSelect(() => navigate('/admin'))}>
                  <Shield className="mr-2 h-4 w-4 text-red-500" />
                  <span>Painel do Administrador & Logs</span>
                </CommandItem>
              )}
              <CommandItem onSelect={() => handleSelect(() => navigate('/support'))}>
                <MessageSquare className="mr-2 h-4 w-4 text-cyan-500" />
                <span>Suporte & Assistência Inteligente</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/radio'))}>
                <Radio className="mr-2 h-4 w-4 text-rose-500" />
                <span>Rádio Maranata — ouvir em direto</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => navigate('/settings'))}>
                <Settings className="mr-2 h-4 w-4 text-slate-500" />
                <span>Definições do Sistema</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* Preferências Visuais e Modo de Privacidade */}
            <CommandGroup heading="Preferências & Privacidade">
              <CommandItem onSelect={() => handleSelect(() => setHideFinancials(!hideFinancials))}>
                {hideFinancials ? (
                  <>
                    <Eye className="mr-2 h-4 w-4 text-emerald-500" />
                    <span>Mostrar Valores Financeiros</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="mr-2 h-4 w-4 text-amber-500" />
                    <span>Ocultar Valores Financeiros (Modo Privacidade: ***)</span>
                  </>
                )}
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => setCompactMode(!compactMode))}>
                {compactMode ? (
                  <>
                    <Maximize2 className="mr-2 h-4 w-4 text-blue-500" />
                    <span>Desativar Modo Compacto (Modo Normal)</span>
                  </>
                ) : (
                  <>
                    <Minimize2 className="mr-2 h-4 w-4 text-indigo-500" />
                    <span>Ativar Modo Compacto (Mais dados por ecrã)</span>
                  </>
                )}
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* Alternar Temas */}
            <CommandGroup heading="Mudar Tema Visual">
              <CommandItem onSelect={() => handleSelect(() => setTheme('light'))}>
                <Sun className="mr-2 h-4 w-4 text-amber-500" />
                <span>Tema Claro Padrão</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => setTheme('dark'))}>
                <Moon className="mr-2 h-4 w-4 text-slate-400" />
                <span>Tema Escuro Padrão</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => setTheme('cosmic'))}>
                <Sparkles className="mr-2 h-4 w-4 text-purple-400" />
                <span>Tema Cósmico (Violeta / Dark)</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => setTheme('forest'))}>
                <div className="mr-2 h-3.5 w-3.5 rounded-full bg-emerald-600 inline-block" />
                <span>Tema Floresta (Verde Natural)</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => setTheme('ocean'))}>
                <div className="mr-2 h-3.5 w-3.5 rounded-full bg-cyan-600 inline-block" />
                <span>Tema Oceano (Azul Profundo)</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => setTheme('sunset'))}>
                <div className="mr-2 h-3.5 w-3.5 rounded-full bg-orange-500 inline-block" />
                <span>Tema Pôr do Sol (Cálido / Âmbar)</span>
              </CommandItem>
              <CommandItem onSelect={() => handleSelect(() => setTheme('system'))}>
                <Monitor className="mr-2 h-4 w-4 text-slate-500" />
                <span>Tema Automático do Sistema</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* Sessão */}
            <CommandGroup heading="Sessão">
              <CommandItem onSelect={() => handleSelect(() => signOut())}>
                <DoorClosed className="mr-2 h-4 w-4 text-rose-500" />
                <span>Terminar Sessão</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
