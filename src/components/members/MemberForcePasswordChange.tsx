import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { PASSWORD_MIN } from '../../lib/memberSchema';

/* ═══════════════════════════════════════════════════════════════════════
   v1.14.0 — Troca OBRIGATÓRIA da palavra-passe no 1.º login do membro
   (auto-cadastro aprovado). Espelho do ForcePasswordChangeModal dos
   admins: bloqueia TODA a app até gravar a definitiva.
   Segurança:
   - reautentica com a palavra-passe actual (prova que a conhece e satisfaz
     o requisito de "login recente" do updatePassword);
   - a nova tem de ser DIFERENTE da actual e ter 8+ caracteres (a política
     também é validada no servidor para o auto-cadastro; aqui o servidor é
     o próprio Firebase Auth, que recusa palavras-passe fracas);
   - a marca mustChangePassword é desligada por regra própria (o membro só
     pode escrever este campo em SI e só para `false` — firestore.rules).
   ═══════════════════════════════════════════════════════════════════════ */
export default function MemberForcePasswordChange() {
  const { user, memberData, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user || !memberData) return null;

  const change = async () => {
    if (!current) { toast.error('Escreva a palavra-passe actual (a que usou para entrar).'); return; }
    if (p1.length < PASSWORD_MIN) { toast.error(`A nova palavra-passe precisa de ${PASSWORD_MIN}+ caracteres.`); return; }
    if (p1 === current) { toast.error('A palavra-passe definitiva tem de ser DIFERENTE da actual.'); return; }
    if (p1 !== p2) { toast.error('As palavras-passe não coincidem.'); return; }
    setBusy(true);
    try {
      // 1) prova que conhece a actual (e refresca a sessão p/ updatePassword)
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email || '', current));
      // 2) define a definitiva (o Firebase guarda o hash — nunca nós)
      await updatePassword(user, p1);
      // 3) desliga a marca (regra: o próprio, só este campo, só para false)
      await updateDoc(doc(db, 'members', memberData.id), { mustChangePassword: false, updatedAt: Date.now() });
      toast.success('Palavra-passe definitiva gravada. Bem-vindo(a)!');
      window.location.reload();
    } catch (e: any) {
      const code = e?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        toast.error('A palavra-passe actual está errada.');
      } else if (code === 'auth/weak-password') {
        toast.error('Palavra-passe demasiado fraca para o servidor. Use 8+ caracteres.');
      } else {
        toast.error(e?.message || 'Falha ao trocar a palavra-passe.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-500" /> Defina a sua palavra-passe definitiva
          </DialogTitle>
          <DialogDescription>
            O seu cadastro foi <b>aprovado</b> — bem-vindo(a) à igreja! Por segurança, antes de
            usar a aplicação defina a sua palavra-passe definitiva (diferente da que usou no cadastro).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Palavra-passe actual (a do cadastro)</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nova palavra-passe (mín. {PASSWORD_MIN} caracteres, diferente da actual)</Label>
            <Input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirmar nova palavra-passe</Label>
            <Input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void change(); } }} />
          </div>
          <Button className="w-full" onClick={change} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Gravar e entrar
          </Button>
          <Button variant="ghost" className="w-full gap-1.5 text-xs" onClick={() => { void (async () => { await signOut(); window.location.reload(); })(); }}>
            <LogOut className="h-3.5 w-3.5" /> Terminar sessão
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}