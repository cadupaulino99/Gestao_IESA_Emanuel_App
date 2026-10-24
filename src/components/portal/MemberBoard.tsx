import { useEffect, useState, type ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  Bell, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, Loader2,
  MapPin, Pin, UserRound, XCircle, Maximize2,
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
import { posterUrl } from '../../lib/posters';
import {
  luandaDayKey, fmtDatePT, fmtDateTimePT, dayLabelLuanda, weekdayNameOfDate,
} from '../../lib/luanda';
import { AgendaItem } from '../../types';

/* ═══════════════════════════════════════════════════════════════════════
   «AVISOS, AGENDA E EVENTOS» — lado dos MEMBROS (v1.13.0)
   Só LEITURA das mesmas colecções que a Administração gere (fonte única:
   announcements, agenda_items, events). Mobile-first (360 px).
   ═══════════════════════════════════════════════════════════════════════ */

const STATUS_LABEL: Record<string, string> = { marcado: 'Marcado', adiado: 'ADIADO', cancelado: 'CANCELADO', realizado: 'Realizado' };
const STATUS_CLASS: Record<string, string> = {
  adiado: 'bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-900/40 dark:text-amber-200',
  cancelado: 'bg-red-100 text-red-800 border-red-400 dark:bg-red-900/40 dark:text-red-200',
  realizado: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
  marcado: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200',
};

function PosterImg({ path, className }: { path?: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (path) posterUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [path]);
  if (!path || !url) return null;
  return <img src={url} alt="Cartaz do evento" className={className} />;
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

  /* ── Avisos: visíveis (publicado + dentro do prazo), fixados/urgentes no topo ── */
  const visibleAnnouncements = sortAnnouncementsForMembers(
    announcements.filter((x) => isAnnouncementVisible(x, dayKey)));

  /* ── Agenda: semana (seg…dom) com ocorrências canceladas riscadas ── */
  const weekRef = now + weekOffset * 7 * 86400000;
  const week = expandWeek(agenda, weekRef);
  const weekLabel = `${fmtDatePT(firstDateOfWeek(weekRef))} – ${fmtDatePT(shiftIso(firstDateOfWeek(weekRef), 6))}`;

  /* ── Eventos ── */
  const visibleEvents = events.filter(isEventVisibleToMembers);
  const upcoming = sortEventsByDate(visibleEvents.filter((e) => !isEventPast(e, dayKey)));
  const past = sortEventsByDate(visibleEvents.filter((e) => isEventPast(e, dayKey))).reverse();
  const shownEvents = evFilter === 'proximos' ? upcoming : past;

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> A carregar…</div>;
  }

  return (
    <Tabs defaultValue="avisos">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="avisos" className="text-xs gap-1"><Bell className="h-3.5 w-3.5" /> Avisos</TabsTrigger>
        <TabsTrigger value="agenda" className="text-xs gap-1"><CalendarDays className="h-3.5 w-3.5" /> Agenda</TabsTrigger>
        <TabsTrigger value="eventos" className="text-xs gap-1"><CalendarPlus className="h-3.5 w-3.5" /> Eventos</TabsTrigger>
      </TabsList>

      {/* ═══════════ AVISOS ═══════════ */}
      <TabsContent value="avisos" className="pt-4 space-y-3">
        {visibleAnnouncements.length === 0 && <Empty icon={<Bell className="h-8 w-8" />} text="Não há avisos de momento." />}
        {visibleAnnouncements.map((a) => (
          <article
            key={a.id}
            className={`rounded-xl border p-3.5 space-y-1.5 ${
              a.level === 'urgente'
                ? 'border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/30'
                : 'bg-white/60 dark:bg-slate-900/40'
            }`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {a.level === 'urgente' && <Badge className="bg-red-600 hover:bg-red-600 text-[10px]">URGENTE</Badge>}
              {a.pinned && <Badge variant="secondary" className="gap-0.5 text-[10px]"><Pin className="h-2.5 w-2.5" /> Fixado</Badge>}
              <h3 className="text-sm font-bold flex-1 min-w-0">{a.title}</h3>
              <span className="text-[10px] text-slate-400 shrink-0">{fmtDatePT(luandaDayKey(a.createdAt))}</span>
            </div>
            <ExpandableRichText html={a.html} />
          </article>
        ))}
      </TabsContent>

      {/* ═══════════ AGENDA ═══════════ */}
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

      {/* ═══════════ EVENTOS ═══════════ */}
      <TabsContent value="eventos" className="pt-4 space-y-3">
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
        {shownEvents.map((e) => {
          const label = dayLabelLuanda(e.date, now);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setOpenEvent(e)}
              className={`w-full text-left rounded-xl border p-3 flex gap-3 bg-white/60 dark:bg-slate-900/40 hover:border-blue-300 transition-colors ${
                e.status === 'cancelado' ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : ''
              }`}
            >
              <PosterImg path={e.posterThumbPath || e.posterPath} className="h-16 w-12 shrink-0 rounded border object-cover" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold truncate">{e.title}</span>
                  {e.status !== 'marcado' && (
                    <Badge variant="outline" className={`text-[9px] ${STATUS_CLASS[e.status] || ''}`}>{STATUS_LABEL[e.status]}</Badge>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> {fmtDateTimePT(e.date, e.time)}
                </span>
                {e.location && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {e.location}
                  </span>
                )}
                <span className={`mt-1 inline-block text-[10px] font-bold ${
                  label === 'Hoje' ? 'text-emerald-600' : evFilter === 'proximos' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-400'
                }`}>
                  {label}
                </span>
              </span>
            </button>
          );
        })}
      </TabsContent>

      {/* ── detalhe do evento ── */}
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
                  <PosterImg path={openEvent.posterPath || openEvent.posterThumbPath} className="max-h-72 w-full rounded-lg border object-contain" />
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => setFullPoster(openEvent)}>
                    <Maximize2 className="h-3.5 w-3.5" /> Ver cartaz em ecrã inteiro
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── cartaz em ecrã inteiro ── */}
      <Dialog open={!!fullPoster} onOpenChange={(o) => !o && setFullPoster(null)}>
        <DialogContent className="max-w-[96vw] p-1 border-none bg-transparent shadow-none [&>button]:text-white [&>button]:bg-black/50">
          {fullPoster && (
            <>
              <DialogTitle className="sr-only">Cartaz: {fullPoster.title}</DialogTitle>
              <PosterImg path={fullPoster.posterPath || fullPoster.posterThumbPath} className="max-h-[92dvh] w-auto max-w-full mx-auto rounded-lg" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

/* datas da semana sem depender de expandWeek (rótulo do cabeçalho) */
function firstDateOfWeek(ref: number): string {
  const d = new Date(ref + 60 * 60 * 1000); // Luanda
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
