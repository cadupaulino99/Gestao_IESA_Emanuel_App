import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, updateDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { AppNotification } from '../types';

/** Sino com contador: cada utilizador vê só as suas notificações (regra do servidor). */
export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user?.email) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'notifications'), where('userEmail', '==', user.email), orderBy('createdAt', 'desc'), limit(30))
      );
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification));
    } catch { /* sem notificações ainda */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, open]);

  const unread = items.filter((i) => !i.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notificações">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-danger-foreground text-caption font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[70dvh] overflow-y-auto p-2" align="end">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-sm font-semibold">Notificações</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] h-7"
              onClick={async () => {
                await Promise.all(items.filter((i) => !i.read).map((i) => updateDoc(doc(db, 'notifications', i.id), { read: true })));
                load();
              }}
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
        {items.length === 0 && <p className="text-xs text-muted-foreground p-3 text-center">Sem notificações.</p>}
        {items.map((n) => (
          <button
            key={n.id}
            className={`w-full text-left rounded-lg px-2.5 py-2 mb-1 border ${n.read ? 'opacity-70' : 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-900/60'}`}
            onClick={() => {
              if (!n.read) updateDoc(doc(db, 'notifications', n.id), { read: true }).then(load);
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold flex-1">{n.title}</span>
              {!n.read && <Badge variant="destructive" className="text-[9px] px-1">nova</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap mt-0.5">{n.body}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{new Date(n.createdAt).toLocaleString('pt-AO')}</p>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
