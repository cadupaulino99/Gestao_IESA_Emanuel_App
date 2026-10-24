import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { isTempExpired } from '../../lib/admins';
import { KeyRound, LogOut } from 'lucide-react';

/**
 * Bloqueia a app até o administrador trocar a palavra-passe temporária.
 * Se a temporária tiver >7 dias, só resta terminar sessão e pedir nova ao super.
 */
export default function ForcePasswordChangeModal() {
  const { user, mustChangePassword, tempPasswordIssuedAt, signOut } = useAuth();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user || !mustChangePassword) return null;
  const expired = isTempExpired(tempPasswordIssuedAt);

  const change = async () => {
    if (p1.length < 8) { toast.error('A nova palavra-passe precisa de 8+ caracteres.'); return; }
    if (p1 !== p2) { toast.error('As palavras-passe não coincidem.'); return; }
    setBusy(true);
    try {
      await updatePassword(user, p1); // sessão acabada de entrar com a temporária
      await updateDoc(doc(db, 'admins', (user.email || '').toLowerCase()), { mustChangePassword: false });
      await addDoc(collection(db, 'audit_logs'), {
        action: 'admin.password-changed',
        targetEmail: user.email,
        byEmail: user.email,
        at: Date.now(),
      }).catch(() => {});
      toast.success('Palavra-passe atualizada. Bem-vindo(a)!');
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao trocar a palavra-passe.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber-500" /> Troca obrigatória</DialogTitle>
          <DialogDescription>
            {expired
              ? 'A sua palavra-passe temporária expirou (7 dias). Termine a sessão e peça uma nova ao super administrador.'
              : 'Está com uma palavra-passe temporária. Defina a sua palavra-passe definitiva para continuar.'}
          </DialogDescription>
        </DialogHeader>
        {expired ? (
          <Button variant="destructive" className="w-full gap-2" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" /> Terminar sessão
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nova palavra-passe (8+ caracteres)</Label>
              <Input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Repetir nova palavra-passe</Label>
              <Input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
            </div>
            <Button className="w-full" disabled={busy} onClick={change}>
              {busy ? 'A guardar…' : 'Definir e entrar'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
