import { Phone, MessageCircle, MessageSquare, Mail } from 'lucide-react';
import { Button } from '../ui/button';
import { openExternal } from '../../lib/download';
import { normalizePhoneAO } from '../../lib/phone';

/* ═══════════════════════════════════════════════════════════════════════
   v1.17.0 (P1 «Contactos do membro») — acções rápidas de contacto:
   Ligar (tel:), WhatsApp (wa.me), SMS (sms:) e Email (mailto:).
   Usa openExternal (lib/download): no APK abre via plugin Browser
   (Custom Tab/intent — window.open é ignorado na WebView), na web abre
   janela nova. Telefones normalizados (+244…) antes dos links.
   ═══════════════════════════════════════════════════════════════════════ */

interface Props {
  phone?: string | null;
  email?: string | null;
  /** botões mais pequenos (fichas compactas) */
  compact?: boolean;
}

export default function MemberContactActions({ phone, email, compact }: Props) {
  const digits = (normalizePhoneAO(phone) || '').replace(/\D/g, '');
  const acts = [
    digits ? { key: 'call', label: 'Ligar', Icon: Phone, url: `tel:+${digits}` } : null,
    digits ? { key: 'wa', label: 'WhatsApp', Icon: MessageCircle, url: `https://wa.me/${digits}` } : null,
    digits ? { key: 'sms', label: 'SMS', Icon: MessageSquare, url: `sms:+${digits}` } : null,
    email ? { key: 'mail', label: 'Email', Icon: Mail, url: `mailto:${email}` } : null,
  ].filter(Boolean) as { key: string; label: string; Icon: any; url: string }[];

  if (acts.length === 0) return null;

  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {acts.map((a) => (
        <Button
          key={a.key}
          type="button"
          variant="outline"
          size="sm"
          title={a.label}
          className={compact ? 'h-6 px-1.5 text-[10px] gap-1' : 'h-7 px-2 text-xs gap-1'}
          onClick={() => { void openExternal(a.url); }}
        >
          <a.Icon className="h-3 w-3" /> {a.label}
        </Button>
      ))}
    </span>
  );
}
