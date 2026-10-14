import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Member } from '../../types';
import { Sparkles, MessageCircle, Copy, Check, Send } from 'lucide-react';
import { toast } from 'sonner';
import { aiDraftMessage } from '../../lib/ai';

interface PastoralMessageGeneratorModalProps {
  member: Member | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PastoralMessageGeneratorModal({
  member,
  isOpen,
  onClose,
}: PastoralMessageGeneratorModalProps) {
  const [occasion, setOccasion] = useState('Aniversário Natalício');
  const [tone, setTone] = useState('Afetuoso e Pastoral com bênção bíblica');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!member) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setGeneratedMessage('');
    try {
      const text = await aiDraftMessage(member.name, occasion, tone);
      setGeneratedMessage(text);
    } catch (err: any) {
      toast.error('Erro ao gerar mensagem pastoral.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedMessage) return;
    navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
    toast.success('Mensagem copiada para a área de transferência!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    if (!generatedMessage) return;
    let phone = member.phone?.replace(/\D/g, '') || '';
    if (phone && !phone.startsWith('244') && phone.length === 9) {
      phone = '244' + phone;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(generatedMessage)}`;
    window.open(url, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg shadow-xl border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Gerar Mensagem Pastoral com IA
          </DialogTitle>
          <DialogDescription>
            Gere saudações bíblicas e mensagens personalizadas para <strong>{member.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Ocasião / Motivo</Label>
            <Select value={occasion} onValueChange={setOccasion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Aniversário Natalício">Aniversário Natalício</SelectItem>
                <SelectItem value="Boas-Vindas a Novo Membro">Boas-Vindas a Novo Membro</SelectItem>
                <SelectItem value="Palavra de Conforto e Oração">Palavra de Conforto e Oração</SelectItem>
                <SelectItem value="Agradecimento por Serviço e Dedicação">Agradecimento por Serviço e Dedicação</SelectItem>
                <SelectItem value="Aniversário de Casamento">Aniversário de Casamento</SelectItem>
                <SelectItem value="Convite para Reunião de Célula">Convite para Reunião de Célula</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tom da Mensagem</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Afetuoso e Pastoral com bênção bíblica">Afetuoso e Pastoral (Bíblico)</SelectItem>
                <SelectItem value="Solene e Encorajador">Solene e Encorajador</SelectItem>
                <SelectItem value="Breve e Fraterno para WhatsApp">Breve e Fraterno</SelectItem>
                <SelectItem value="Oficial em nome da Direcção Local">Oficial em nome da Direcção Local</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm"
          >
            <Sparkles className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'A elaborar mensagem...' : 'Elaborar Mensagem Inteligente'}
          </Button>

          {generatedMessage && (
            <div className="space-y-3 pt-2">
              <Label>Mensagem Elaborada:</Label>
              <div className="p-3 bg-muted/50 rounded-lg border text-sm whitespace-pre-wrap max-h-48 overflow-y-auto font-sans leading-relaxed">
                {generatedMessage}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1 gap-1.5">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendWhatsApp}
                  className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  Enviar WhatsApp
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
