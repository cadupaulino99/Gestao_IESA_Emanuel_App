import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, MapPin, UserRound, Maximize2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import RichTextView, { ExpandableRichText } from '../richtext/RichTextView';
import { resolvePosterUrl } from '../../lib/posters';
import { fmtDateTimePT, dayLabelLuanda, luandaDayKey, fmtDatePT } from '../../lib/luanda';
import { plainOf, type NormalizedEvent } from '../../lib/board';
import BoardEngagementBar from './BoardEngagementBar';
import { buildShareText } from '../../lib/boardEngagement';

const STATUS_LABEL: Record<string, string> = {
  marcado: 'Marcado',
  adiado: 'Adiado',
  cancelado: 'Cancelado',
  realizado: 'Realizado',
};

const STATUS_CLASS: Record<string, string> = {
  marcado: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200',
  adiado: 'bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-900/40 dark:text-amber-200',
  cancelado: 'bg-red-100 text-red-800 border-red-400 dark:bg-red-900/40 dark:text-red-200',
  realizado: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
};

function PosterImg({
  path,
  altPath,
  className,
  onClick,
}: {
  path?: string | null;
  altPath?: string | null;
  className?: string;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    resolvePosterUrl(path, altPath)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [path, altPath]);
  if (!url) {
    if (!path && !altPath) return null;
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 ${className || ''}`}>
        A carregar cartaz…
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block w-full cursor-pointer border-0 bg-transparent p-0">
      <img src={url} alt="Cartaz do evento" className={`poster-img ${className || '''}`} loading="lazy" decoding="async" fetchPriority="low" />
    </button>
  );
}

/** Tempo relativo estilo rede social (pt). */
export function timeAgo(ts: number | undefined, now: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 45) return 'Agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 604800) return `${Math.floor(s / 86400)} d`;
  return fmtDatePT(luandaDayKey(ts));
}

export type EventFeedPostProps = {
  event: NormalizedEvent;
  now?: number;
  onOpen?: (e: NormalizedEvent) => void;
  onFullPoster?: (e: NormalizedEvent) => void;
  footer?: ReactNode;
  expandable?: boolean;
  className?: string;
};

/**
 * Publicação de evento no estilo feed (tipo Facebook):
 * cabeçalho da igreja · tempo · título · texto · imagem · meta data/local.
 */
export default function EventFeedPost({
  event: e,
  now = Date.now(),
  onOpen,
  onFullPoster,
  footer,
  expandable = true,
  className = '',
}: EventFeedPostProps) {
  const label = dayLabelLuanda(e.date, now);
  const publishedAt = typeof e.updatedAt === 'number' ? e.updatedAt : e.createdAt;
  const cancelled = e.status === 'cancelado';

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-900/50 ${
        cancelled ? 'border-red-300/80 dark:border-red-800' : 'border-slate-200/90 dark:border-slate-700'
      } ${className}`}
    >
      <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-2">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-sm font-bold text-white shadow-sm"
          aria-hidden
        >
          IE
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Igreja Emanuel · Xangongo
            </span>
            {e.status !== 'marcado' && (
              <Badge variant="outline" className={`text-[10px] ${STATUS_CLASS[e.status] || ''}`}>
                {STATUS_LABEL[e.status] || e.status}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {timeAgo(publishedAt, now)}
            {label ? (
              <>
                {' · '}
                <span
                  className={
                    label === 'Hoje'
                      ? 'font-semibold text-emerald-600'
                      : 'font-medium text-blue-700 dark:text-blue-300'
                  }
                >
                  {label}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="px-3.5 pb-2 space-y-1.5">
        <button type="button" className="w-full text-left" onClick={() => onOpen?.(e)}>
          <h3 className="text-[15px] font-bold leading-snug text-slate-900 dark:text-slate-50">
            {e.title}
          </h3>
        </button>
        {e.html ? (
          expandable ? (
            <ExpandableRichText html={e.html} className="text-sm text-slate-700 dark:text-slate-300" />
          ) : (
            <RichTextView html={e.html} className="text-sm text-slate-700 dark:text-slate-300 line-clamp-4" />
          )
        ) : null}
      </div>

      {(e.posterUrl || e.posterPath || e.posterThumbPath) && (
        <div className="relative bg-slate-100 dark:bg-slate-800/80">
          {e.posterUrl ? (
            <button type="button" className="block w-full border-0 bg-transparent p-0" onClick={() => (onFullPoster ? onFullPoster(e) : onOpen?.(e))}>
              <img src={e.posterUrl} alt="Cartaz do evento" className="poster-img max-h-[480px] w-full object-cover" loading="lazy" decoding="async" fetchPriority="low" />
            </button>
          ) : (
          <PosterImg
            path={e.posterThumbPath || e.posterPath}
            altPath={e.posterPath || e.posterThumbPath}
            className="max-h-[480px] w-full object-cover"
            onClick={() => (onFullPoster ? onFullPoster(e) : onOpen?.(e))}
          />
          )}
          {onFullPoster && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute bottom-2 right-2 h-8 gap-1 rounded-full bg-black/55 text-white hover:bg-black/70 text-[11px]"
              onClick={() => onFullPoster(e)}
            >
              <Maximize2 className="h-3.5 w-3.5" /> Ampliar
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
            {fmtDateTimePT(e.date, e.time)}
            {e.dateEnd ? ` → ${fmtDateTimePT(e.dateEnd, e.timeEnd)}` : ''}
          </span>
          {e.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-rose-500" />
              {e.location}
            </span>
          )}
          {e.responsible && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5 text-slate-400" />
              {e.responsible}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpen && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs font-semibold text-blue-700" onClick={() => onOpen(e)}>
              Ver publicação
            </Button>
          )}
          {footer}
        </div>
        <BoardEngagementBar
          target={{ collection: 'events', id: e.id }}
          shareText={buildShareText({
            kind: 'event',
            title: e.title,
            when: fmtDateTimePT(e.date, e.time),
            location: e.location || undefined,
            bodyPlain: plainOf(e.html || ''),
          })}
        />
      </div>
    </article>
  );
}
