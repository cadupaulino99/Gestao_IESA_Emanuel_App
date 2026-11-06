import { Pin } from 'lucide-react';
import { Badge } from '../ui/badge';
import { ExpandableRichText } from '../richtext/RichTextView';
import { fmtDatePT, luandaDayKey } from '../../lib/luanda';
import { plainOf, type NormalizedAnnouncement } from '../../lib/board';
import { timeAgo } from './EventFeedPost';
import BoardEngagementBar from './BoardEngagementBar';
import { buildShareText } from '../../lib/boardEngagement';

type Props = { announcement: NormalizedAnnouncement; now?: number };

export default function AnnouncementFeedPost({ announcement: a, now = Date.now() }: Props) {
  const publishedAt = typeof a.createdAt === 'number' ? a.createdAt : undefined;
  const urgent = a.level === 'urgente';
  return (
    <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-900/50 ${
      urgent ? 'border-red-300 dark:border-red-800' : 'border-slate-200/90 dark:border-slate-700'
    }`}>
      <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-2">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${
          urgent ? 'bg-gradient-to-br from-red-600 to-rose-700' : 'bg-gradient-to-br from-blue-600 to-indigo-700'
        }`} aria-hidden>IE</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Igreja Emanuel · Xangongo</span>
            {urgent && <Badge className="bg-red-600 text-[10px] hover:bg-red-600">URGENTE</Badge>}
            {a.pinned && <Badge variant="secondary" className="gap-0.5 text-[10px]"><Pin className="h-2.5 w-2.5" /> Fixado</Badge>}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{timeAgo(publishedAt, now) || fmtDatePT(luandaDayKey(a.createdAt))}{' · Aviso'}</p>
        </div>
      </div>
      <div className="space-y-1.5 px-3.5 pb-2">
        <h3 className="text-[15px] font-bold leading-snug text-slate-900 dark:text-slate-50">{a.title}</h3>
        {a.html ? <ExpandableRichText html={a.html} className="text-sm text-slate-700 dark:text-slate-300" /> : null}
      </div>
      <div className="space-y-2 border-t border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
        <BoardEngagementBar
          target={{ collection: 'announcements', id: a.id }}
          shareText={buildShareText({ kind: 'announcement', title: a.title, bodyPlain: plainOf(a.html || '') })}
        />
      </div>
    </article>
  );
}
