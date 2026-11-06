import { useCallback, useEffect, useState } from 'react';
import { Heart, MessageCircle, Share2, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useAuth } from '../../context/AuthContext';
import {
  type BoardTarget, type BoardComment, fetchLikeState, toggleLike,
  fetchComments, addComment, openWhatsAppShare,
} from '../../lib/boardEngagement';
import { timeAgo } from './EventFeedPost';

export default function BoardEngagementBar({ target, shareText }: { target: BoardTarget; shareText: string }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const name = user?.displayName || user?.email?.split('@')[0] || 'Membro';
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [likes, list] = await Promise.all([fetchLikeState(target, uid), fetchComments(target)]);
      setLikeCount(likes.count);
      setLiked(likes.likedByMe);
      setComments(list);
    } catch { /* offline / rules */ }
  }, [target.collection, target.id, uid]);

  useEffect(() => { void reload(); }, [reload]);

  const onLike = async () => {
    if (!uid) return toast.error('Inicie sessão para gostar.');
    const was = liked;
    setLiked(!was);
    setLikeCount((c) => c + (was ? -1 : 1));
    try { await toggleLike(target, uid, was); }
    catch { setLiked(was); setLikeCount((c) => c + (was ? 1 : -1)); toast.error('Sem permissão para gostar. Publique as regras Firestore (Deploy Firebase).'); }
  };

  const onSend = async () => {
    if (!uid) return toast.error('Inicie sessão para comentar.');
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const c = await addComment(target, { uid, name, text: draft });
      setComments((p) => [...p, c]);
      setDraft('');
      setOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error && /permission|insufficient/i.test(e.message) ? 'Sem permissão para comentar. Publique as regras Firestore (Deploy Firebase).' : (e instanceof Error ? e.message : 'Falha ao comentar.'));
    } finally { setBusy(false); }
  };

  const now = Date.now();
  return (
    <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className={`h-9 flex-1 gap-1.5 text-xs font-semibold ${liked ? 'text-rose-600' : 'text-slate-600'}`} onClick={() => void onLike()}>
          <Heart className={`h-4 w-4 ${liked ? 'fill-rose-600' : ''}`} />{likeCount > 0 ? likeCount : 'Gostar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9 flex-1 gap-1.5 text-xs font-semibold text-slate-600" onClick={() => setOpen((v) => !v)}>
          <MessageCircle className="h-4 w-4" />{comments.length > 0 ? comments.length : 'Comentar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9 flex-1 gap-1.5 text-xs font-semibold text-emerald-700" onClick={() => { try { openWhatsAppShare(shareText); } catch { void navigator.clipboard?.writeText(shareText); toast.success('Copiado.'); } }}>
          <Share2 className="h-4 w-4" />WhatsApp
        </Button>
      </div>
      {open && (
        <div className="space-y-2 rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-900/60">
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm dark:bg-slate-800">
                <div className="flex justify-between gap-2"><span className="font-semibold">{c.authorName}</span><span className="text-[10px] text-slate-400">{timeAgo(c.createdAt, now)}</span></div>
                <p className="mt-0.5 whitespace-pre-wrap">{c.text}</p>
              </li>
            ))}
          </ul>
          <div className="flex gap-1.5">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva um comentário…" maxLength={500} className="h-9 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend(); } }} />
            <Button type="button" size="sm" className="h-9 shrink-0" disabled={busy || !draft.trim()} onClick={() => void onSend()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
