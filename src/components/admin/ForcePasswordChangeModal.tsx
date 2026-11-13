import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { isTempExpired } from '../../lib/admins';
import { KeyRound, Loader2, LogOut } from 'lucide-react';

/**
 * Bloqueia a app até o administrador trocar a palavra-passe temporária.
 * Reautentica com a senha actual (requisito Firebase para updatePassword).
 */
export default function ForcePasswordChangeModal() {
  const { user, mustChangePassword, tempPasswordIssuedAt, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user || !mustChangePassword) return null;
  const expired = isTempExpired(tempPasswordIssuedAt);
  const email = (user.email || '').trim();

  const change = async () => {
    if (!current) {
      toast.error('Escreva a palavra-passe actual (a temporária que recebeu).');
      return;
    }
    if (p1.length < 8) {
      toast.error('A nova palavra-passe precisa de 8+ caracteres.');
      return;
    }
    if (p1 === current) {
      toast.error('A palavra-passe definitiva tem de ser diferente da temporária.');
      return;
    }
    if (p1 !== p2) {
      toast.error('As palavras-passe não coincidem.');
      return;
    }
    setBusy(true);
    try {
      // 1) Login recente obrigatório para updatePassword
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(email, current),
      );
      // 2) Nova palavra-passe no Firebase Auth
      await updatePassword(user, p1);
      // 3) Desliga a flag no documento admins/ (id = email em minúsculas)
      await updateDoc(doc(db, 'admins', email.toLowerCase()), {
        mustChangePassword: false,
      });
      await addDoc(collection(db, 'audit_logs'), {
        action: 'admin.password-changed',
        targetEmail: email.toLowerCase(),
        byEmail: email.toLowerCase(),
        at: Date.now(),
      }).catch(() => {});
      toast.success('Palavra-passe actualizada. Bem-vindo(a)!');
      window.location.reload();
    } catch (e: any) {
      const code = String(e?.code || '');
      const msg = String(e?.message || '');
      if (code.includes('wrong-password') || code.includes('invalid-credential') || msg.includes('INVALID_LOGIN')) {
        toast.error('Palavra-passe actual incorrecta. Use a temporária que o administrador lhe deu.');
      } else if (code.includes('requires-recent-login')) {
        toast.error('Sessão expirada. Termine a sessão, entre de novo com a temporária e defina a nova senha.');
      } else if (code.includes('weak-password')) {
        toast.error('Palavra-passe demasiado fraca. Use pelo menos 8 caracteres.');
      } else if (code.includes('permission-denied') || msg.includes('permission')) {
        toast.error('Sem permissão para actualizar o perfil. Contacte o super administrador.');
      } else {
        toast.error(msg || 'Falha ao trocar a palavra-passe.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm max-h-[90dvh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-500" /> Troca obrigatória
          </DialogTitle>
          <DialogDescription>
            {expired
              ? 'A sua palavra-passe temporária expirou (7 dias). Termine a sessão e peça uma nova ao super administrador.'
              : 'Está com uma palavra-passe temporária. Confirme-a e defina a sua palavra-passe definitiva para continuar.'}
          </DialogDescription>
        </DialogHeader>
        {expired ? (
          <Button
            variant="destructive"
            className="w-full gap-2"
            onClick={() => {
              void (async () => {
                await signOut();
                window.location.href = '/login';
              })();
            }}
          >
            <LogOut className="h-4 w-4" /> Terminar sessão
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Palavra-passe actual (temporária)</Label>
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nova palavra-passe (8+ caracteres)</Label>
              <Input
                type="password"
                value={p1}
                onChange={(e) => setP1(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Repetir nova palavra-passe</Label>
              <Input
                type="password"
                value={p2}
                onChange={(e) => setP2(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void change();
                  }
                }}
              />
            </div>
            <Button className="w-full gap-2" disabled={busy} onClick={() => void change()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {busy ? 'A guardar…' : 'Definir e entrar'}
            </Button>
            <Button
              variant="ghost"
              className="w-full gap-1.5 text-xs"
              onClick={() => {
                void (async () => {
                  await signOut();
                  window.location.href = '/login';
                })();
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Terminar sessão
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
