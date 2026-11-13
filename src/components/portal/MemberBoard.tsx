import { useEffect, useState, type ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  Bell, CalendarDays, CalendarPlus, LayoutGrid, ChevronLeft, ChevronRight, Clock, Loader2,
  MapPin, Pin, UserRound, XCircle, Maximize2, Eye, Share2, BookOpen, Heart,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import RichTextView, { ExpandableRichText } from '../richtext/RichTextView';
import {
  normalizeAnnouncement, normalizeEvent, normalizeAgendaItem,
  isAnnouncementVisible, isEventVisibleToMembers, isEventPast,
  sortAnnouncementsForMembers, sortEventsByDate,
  type NormalizedAnnouncement, type NormalizedEvent,
} from '../../lib/board';
import { expandWeek } from '../../lib/agenda';
import { resolvePosterUrl } from '../../lib/posters';
import { buildShareText } from '../../lib/boardEngagement';
import {
  luandaDayKey, fmtDatePT, fmtDateTimePT, dayLabelLuanda, weekdayNameOfDate,
} from '../../lib/luanda';
import { AgendaItem } from '../../types';
import EventFeedPost from '../board/EventFeedPost';
import AnnouncementFeedPost from '../board/AnnouncementFeedPost';

const STATUS_LABEL: Record<string, string> = { marcado: 'Marcado', adiado: 'ADIADO', cancelado: 'CANCELADO', realizado: 'Realizado' };
const STATUS_CLASS: Record<string, string> = {
  adiado: 'bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-900/40 dark:text-amber-200',
  cancelado: 'bg-red-100 text-red-800 border-red-400 dark:bg-red-900/40 dark:text-red-200',
  realizado: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
  marcado: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200',
};

function PosterImg({ path, altPath, className }: { path?: string | null; altPath?: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    resolvePosterUrl(path, altPath).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [path, altPath]);
  if (!url) {
    if (!path && !altPath) return null;
    return <div className={`flex items-center justify-center bg-slate-100 text-[11px] text-slate-400 dark:bg-slate-800 ${className || ''}`}>A carregar cartaz…</div>;
  }
  return <img src={url} alt="Cartaz do evento" className={className} loading="lazy"  decoding="async" / decoding="async">;
}

function addToCalendar(e: NormalizedEvent) {
  const start = `${(e.date || '').replace(/-/g, '')}T${(e.time || '09:00').replace(':', '')}00`;
  const endDate = (e.dateEnd || e.date || '').replace(/-/g, '');
  const end = `${endDate}T${(e.timeEnd || e.time || '10:00').replace(':', '')}00`;
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title || 'Evento')}&dates=${start}/${end}&details=${encodeURIComponent((e.html || '').replace(/<[^>]+>/g, ' '))}&location=${encodeURIComponent(e.location || '')}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function shareEvent(e: NormalizedEvent) {
  const text = buildShareText({
    kind: 'event',
    title: e.title,
    when: fmtDateTimePT(e.date, e.time),
    location: e.location || undefined,
    bodyPlain: (e.html || '').replace(/<[^>]+>/g, ' ').trim(),
  });
  try {
    if (navigator.share) { await navigator.share({ title: e.title, text }); return; }
  } catch { /* */ }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center">
      <span className="text-slate-300 dark:text-slate-600">{icon}</span>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export default function MemberBoard() {
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<NormalizedAnnouncement[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [evFilter, setEvFilter] = useState<'proximos' | 'passados'>('proximos');
  const [openEvent, setOpenEvent] = useState<NormalizedEvent | null>(null);
  const [fullPoster, setFullPoster] = useState<NormalizedEvent | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, g, e] = await Promise.all([
          getDocs(collection(db, 'announcements')),
          getDocs(collection(db, 'agenda_items')),
          getDocs(collection(db, 'events')),
        ]);
        setAnnouncements(a.docs.map((d) => normalizeAnnouncement({ id: d.id, ...d.data() })));
        setAgenda(g.docs.map((d) => normalizeAgendaItem({ id: d.id, ...d.data() })));
        setEvents(e.docs.map((d) => normalizeEvent({ id: d.id, ...d.data() })));
      } catch { /* regras publicadas? sem dados ainda */ }
      finally { setLoading(false); }
    })();
  }, []);

  const dayKey = luandaDayKey();
  const now = Date.now();

  const visibleAnnouncements = sortAnnouncementsForMembers(
    announcements.filter((x) => isAnnouncementVisible(x, dayKey)));

  const weekRef = now + weekOffset * 7 * 86400000;
  const week = expandWeek(agenda, weekRef);
  const weekLabel = `${fmtDatePT(firstDateOfWeek(weekRef))} – ${fmtDatePT(shiftIso(firstDateOfWeek(weekRef), 6))}`;

  const visibleEvents = events.filter(isEventVisibleToMembers);
  const upcoming = sortEventsByDate(visibleEvents.filter((e) => !isEventPast(e, dayKey)));
  const past = sortEventsByDate(visibleEvents.filter((e) => isEventPast(e, dayKey))).reverse();
  const shownEvents = evFilter === 'proximos' ? upcoming : past;
  type FeedEntry =
    | { kind: 'announcement'; at: number; a: NormalizedAnnouncement }
    | { kind: 'event'; at: number; e: NormalizedEvent };
  const feed: FeedEntry[] = [
    ...visibleAnnouncements.map((a) => ({
      kind: 'announcement' as const,
      at: (a.createdAt || 0) + (a.pinned ? 1e15 : 0) + (a.level === 'urgente' ? 1e14 : 0),
      a,
    })),
    ...visibleEvents.map((e) => ({
      kind: 'event' as const,
      at: (typeof e.updatedAt === 'number' ? e.updatedAt : e.createdAt) || 0,
      e,
    })),
  ].sort((x, y) => y.at - x.at);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> A carregar…</div>;
  }

  const eventFooter = (e: NormalizedEvent) => (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" className="h-8 gap-1 rounded-full bg-[#1557c0] text-xs text-white hover:bg-[#0b3d91]" onClick={() => setOpenEvent(e)}>
        <Eye className="h-3.5 w-3.5" /> Ver Detalhes
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs" onClick={() => void shareEvent(e)}>
        <Share2 className="h-3.5 w-3.5" /> Partilhar
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs" onClick={() => addToCalendar(e)}>
        <CalendarPlus className="h-3.5 w-3.5" /> Adicionar ao Calendário
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
    <Tabs defaultValue="feed" className="space-y-1">
      <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl border bg-white p-1 shadow-sm dark:bg-card">
        <TabsTrigger value="feed" className="gap-1 rounded-lg text-xs sm:text-sm"><LayoutGrid className="h-3.5 w-3.5" /> Feed</TabsTrigger>
        <TabsTrigger value="avisos" className="gap-1 rounded-lg text-xs sm:text-sm"><Bell className="h-3.5 w-3.5" /> Avisos</TabsTrigger>
        <TabsTrigger value="agenda" className="gap-1 rounded-lg text-xs sm:text-sm"><CalendarDays className="h-3.5 w-3.5" /> Agenda</TabsTrigger>
        <TabsTrigger value="eventos" className="gap-1 rounded-lg text-xs sm:text-sm"><CalendarPlus className="h-3.5 w-3.5" /> Eventos</TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="pt-4">
        {feed.length === 0 && (
          <Empty icon={<LayoutGrid className="h-8 w-8" />} text="Ainda não há publicações no mural." />
        )}
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-4 overflow-hidden rounded-2xl bg-gradient-to-b from-[#0b3d91] to-[#1557c0] p-5 text-center text-white shadow-md">
              <BookOpen className="mx-auto mb-3 h-10 w-10 opacity-90" />
              <p className="text-sm italic leading-relaxed text-blue-50">
                “Porque eu bem sei os planos que tenho para vós, diz o Senhor, planos de paz, e não de mal, para vos dar um futuro e uma esperança.”
              </p>
              <span className="mt-4 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-[#0b3d91]">Jeremias 29:11</span>
            </div>
          </aside>
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {feed.map((item) =>
            item.kind === 'announcement' ? (
              <AnnouncementFeedPost key={`a-${item.a.id}`} announcement={item.a} now={now} />
            ) : (
              <EventFeedPost
                key={`e-${item.e.id}`}
                event={item.e}
                now={now}
                expandable
                onOpen={setOpenEvent}
                onFullPoster={setFullPoster}
                footer={eventFooter(item.e)}
              />
            ),
          )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="avisos" className="pt-4 space-y-3">
        {visibleAnnouncements.length === 0 && <Empty icon={<Bell className="h-8 w-8" />} text="Não há avisos de momento." />}
        {/* avisos posts */}
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {visibleAnnouncements.map((a) => (
            <AnnouncementFeedPost key={a.id} announcement={a} now={now} />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="agenda" className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-2 py-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Semana anterior" onClick={() => setWeekOffset((w) => w - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="text-center">
            <p className="text-xs font-semibold">{weekLabel}</p>
            {weekOffset !== 0 && (
              <button type="button" className="text-[10px] text-blue-700 dark:text-blue-300 underline" onClick={() => setWeekOffset(0)}>
                voltar à semana actual
              </button>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Semana seguinte" onClick={() => setWeekOffset((w) => w + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>

        {week.flat().length === 0 && <Empty icon={<CalendarDays className="h-8 w-8" />} text="Sem atividades regulares nesta semana." />}
        {week.map((day, idx) => day.length === 0 ? null : (
          <section key={idx} className="rounded-xl border bg-white/60 dark:bg-slate-900/40 overflow-hidden">
            <header className={`flex items-center gap-2 px-3 py-1.5 border-b ${day[0].isToday ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-muted/40'}`}>
              <span className="text-xs font-bold">{weekdayNameOfDate(day[0].date)}, {fmtDatePT(day[0].date)}</span>
              {day[0].isToday && <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[9px] px-1.5">HOJE</Badge>}
            </header>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {day.map((o) => (
                <li key={o.item.id} className="px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xs font-mono font-semibold tabular-nums ${o.cancelled ? 'line-through text-slate-400' : 'text-blue-800 dark:text-blue-300'}`}>
                      {o.item.startTime}{o.item.endTime ? `–${o.item.endTime}` : ''}
                    </span>
                    <span className={`text-sm font-medium flex-1 ${o.cancelled ? 'line-through text-slate-400' : ''}`}>{o.item.title}</span>
                    {o.cancelled && (
                      <Badge variant="outline" className="gap-0.5 text-[9px] text-red-600 border-red-300 shrink-0">
                        <XCircle className="h-2.5 w-2.5" /> Cancelado
                      </Badge>
                    )}
                  </div>
                  {!o.cancelled && (o.item.location || o.item.responsible || o.item.notes) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[o.item.location, o.item.responsible && `Resp.: ${o.item.responsible}`, o.item.notes].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </TabsContent>

      <TabsContent value="eventos" className="pt-4 space-y-4">
        <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
          {(['proximos', 'passados'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setEvFilter(f)}
              className={`flex-1 rounded-md py-1.5 font-semibold transition-colors ${evFilter === f ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              {f === 'proximos' ? `Próximos (${upcoming.length})` : `Passados (${past.length})`}
            </button>
          ))}
        </div>

        {shownEvents.length === 0 && (
          <Empty icon={<CalendarPlus className="h-8 w-8" />} text={evFilter === 'proximos' ? 'Sem eventos próximos.' : 'Sem eventos passados.'} />
        )}

        {/* Feed estilo publicações (tipo Facebook) */}
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {shownEvents.map((e) => (
            <EventFeedPost
              key={e.id}
              event={e}
              now={now}
              expandable
              onOpen={setOpenEvent}
              onFullPoster={setFullPoster}
              footer={eventFooter(e)}
            />
          ))}
        </div>
      </TabsContent>

      <Dialog open={!!openEvent} onOpenChange={(o) => !o && setOpenEvent(null)}>
        <DialogContent className="max-w-md max-h-[92dvh] overflow-y-auto">
          {openEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base pr-6">{openEvent.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={`text-[9px] ${STATUS_CLASS[openEvent.status] || ''}`}>{STATUS_LABEL[openEvent.status]}</Badge>
                  <span>{fmtDateTimePT(openEvent.date, openEvent.time)}</span>
                  {openEvent.dateEnd && <span>→ {fmtDateTimePT(openEvent.dateEnd, openEvent.timeEnd)}</span>}
                  <span className="font-semibold text-blue-700 dark:text-blue-300">{dayLabelLuanda(openEvent.date, now)}</span>
                </DialogDescription>
              </DialogHeader>
              {(openEvent.location || openEvent.responsible) && (
                <div className="space-y-1 text-sm">
                  {openEvent.location && <p className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" /> {openEvent.location}</p>}
                  {openEvent.responsible && <p className="flex items-center gap-1.5"><UserRound className="h-4 w-4 text-muted-foreground" /> Responsável: {openEvent.responsible}</p>}
                </div>
              )}
              {openEvent.html && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <RichTextView html={openEvent.html} className="text-sm" />
                </div>
              )}
              {(openEvent.posterPath || openEvent.posterThumbPath) && (
                <div className="space-y-1.5">
                  <PosterImg path={openEvent.posterPath || openEvent.posterThumbPath} altPath={openEvent.posterThumbPath || openEvent.posterPath} className="max-h-72 w-full rounded-lg border object-contain" />
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => setFullPoster(openEvent)}>
                    <Maximize2 className="h-3.5 w-3.5" /> Ver cartaz em ecrã inteiro
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!fullPoster} onOpenChange={(o) => !o && setFullPoster(null)}>
        <DialogContent className="max-w-[96vw] p-1 border-none bg-transparent shadow-none [&>button]:text-white [&>button]:bg-black/50">
          {fullPoster && (
            <>
              <DialogTitle className="sr-only">Cartaz: {fullPoster.title}</DialogTitle>
              <PosterImg path={fullPoster.posterPath || fullPoster.posterThumbPath} altPath={fullPoster.posterThumbPath || fullPoster.posterPath} className="max-h-[92dvh] w-auto max-w-full mx-auto rounded-lg" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
    <footer className="flex flex-col items-center gap-1 border-t pt-4 text-center text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5 font-medium text-[#1557c0]"><Heart className="h-3.5 w-3.5" /> Juntos na fé, servindo a Deus!</p>
      <p>© IESA Emanuel Xangongo – {new Date().getFullYear()}</p>
    </footer>
    </div>
  );
}

function firstDateOfWeek(ref: number): string {
  const d = new Date(ref + 60 * 60 * 1000);
  const dow = ((d.getUTCDay() + 6) % 7) + 1;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (dow - 1) * 86400000;
  const m = new Date(monday);
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}-${String(m.getUTCDate()).padStart(2, '0')}`;
}
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
