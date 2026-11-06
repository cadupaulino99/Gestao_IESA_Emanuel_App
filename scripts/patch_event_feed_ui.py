#!/usr/bin/env python3
"""Aplica feed estilo Facebook nos eventos (MemberBoard + EventsAdmin)."""
from pathlib import Path

# --- MemberBoard ---
mb = Path("src/components/portal/MemberBoard.tsx")
t = mb.read_text()
if "EventFeedPost" not in t:
    t = t.replace(
        "import { AgendaItem } from '../../types';",
        "import { AgendaItem } from '../../types';\nimport EventFeedPost from '../board/EventFeedPost';",
    )

start = t.find('      <TabsContent value="eventos"')
end = t.find('      <Dialog open={!!openEvent}', start)
if start < 0 or end < 0:
    raise SystemExit("MemberBoard eventos block markers not found")

new_block = """      <TabsContent value=\"eventos\" className=\"pt-4 space-y-4\">
        <div className=\"flex rounded-lg border bg-muted/40 p-0.5 text-xs\">
          {(['proximos', 'passados'] as const).map((f) => (
            <button
              key={f}
              type=\"button\"
              onClick={() => setEvFilter(f)}
              className={`flex-1 rounded-md py-1.5 font-semibold transition-colors ${evFilter === f ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              {f === 'proximos' ? `Próximos (${upcoming.length})` : `Passados (${past.length})`}
            </button>
          ))}
        </div>

        {shownEvents.length === 0 && (
          <Empty icon={<CalendarPlus className=\"h-8 w-8\" />} text={evFilter === 'proximos' ? 'Sem eventos próximos.' : 'Sem eventos passados.'} />
        )}

        {/* Feed estilo publicações (tipo Facebook) */}
        <div className=\"mx-auto flex max-w-xl flex-col gap-4\">
          {shownEvents.map((e) => (
            <EventFeedPost
              key={e.id}
              event={e}
              now={now}
              expandable
              onOpen={setOpenEvent}
              onFullPoster={setFullPoster}
            />
          ))}
        </div>
      </TabsContent>

"""
t = t[:start] + new_block + t[end:]
mb.write_text(t)
print("MemberBoard ok")

# --- EventsAdmin ---
ea = Path("src/components/admin/EventsAdmin.tsx")
t = ea.read_text()
if "import EventFeedPost" not in t:
    t = t.replace(
        "import { uploadEventPoster, deleteEventPoster, posterUrl, validatePosterFile } from '../../lib/posters';",
        "import { uploadEventPoster, deleteEventPoster, posterUrl, validatePosterFile } from '../../lib/posters';\nimport EventFeedPost from '../board/EventFeedPost';",
    )

marker = "function EventItem({ e, section, onEdit, onRemove }"
if "return (\n    <EventFeedPost" in t or "<EventFeedPost\n      event={e}" in t:
    print("EventsAdmin already feed style")
else:
    start = t.find(marker)
    if start < 0:
        raise SystemExit("EventItem not found")
    end_markers = ["\n/**\n * Administração de EVENTOS", "\nexport default function EventsAdmin"]
    end = -1
    for m in end_markers:
        i = t.find(m, start)
        if i > 0 and (end < 0 or i < end):
            end = i
    if end < 0:
        raise SystemExit("EventItem end not found")

    new_item = '''function EventItem({ e, section, onEdit, onRemove }: {
  e: NormalizedEvent;
  section: 'up' | 'draft' | 'past';
  onEdit: (e: NormalizedEvent) => void;
  onRemove: (e: NormalizedEvent, permanent: boolean) => void;
}) {
  const actions = (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => onEdit(e)}>
        <Pencil className="h-3 w-3" /> Editar
      </Button>
      {section === 'past' ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-destructive" onClick={() => onRemove(e, true)}>
          <Trash2 className="h-3 w-3" /> Apagar
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-destructive" onClick={() => onRemove(e, false)}>
          <Trash2 className="h-3 w-3" /> Apagar
        </Button>
      )}
    </>
  );

  if (section === 'draft') {
    return (
      <div className="flex gap-3 rounded-lg border border-dashed p-3">
        <PosterThumb path={e.posterThumbPath || e.posterPath} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate text-sm font-bold">{e.title}</h4>
            <Badge variant="secondary" className="text-[9px]">Rascunho</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> {fmtDateTimePT(e.date, e.time)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">{actions}</div>
      </div>
    );
  }

  return (
    <EventFeedPost
      event={e}
      expandable={false}
      footer={<div className="flex flex-wrap gap-1.5">{actions}</div>}
    />
  );
}
'''
    t = t[:start] + new_item + t[end:]
    ea.write_text(t)
    print("EventsAdmin ok")

print("done")
