#!/usr/bin/env python3
import re
from pathlib import Path

ef = Path("src/components/board/EventFeedPost.tsx")
t = ef.read_text()
if "BoardEngagementBar" not in t:
    t = t.replace(
        "import type { NormalizedEvent } from '../../lib/board';",
        "import { plainOf, type NormalizedEvent } from '../../lib/board';\nimport BoardEngagementBar from './BoardEngagementBar';\nimport { buildShareText } from '../../lib/boardEngagement';",
    )
    needle = "          {footer}\n        </div>\n      </div>\n    </article>"
    inject = """          {footer}
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
    </article>"""
    if needle not in t:
        raise SystemExit("event footer needle missing")
    ef.write_text(t.replace(needle, inject, 1))
    print("event post ok")
else:
    print("event post already")

mb = Path("src/components/portal/MemberBoard.tsx")
t = mb.read_text()
if "AnnouncementFeedPost" not in t:
    t = t.replace(
        "import EventFeedPost from '../board/EventFeedPost';",
        "import EventFeedPost from '../board/EventFeedPost';\nimport AnnouncementFeedPost from '../board/AnnouncementFeedPost';",
    )
if "LayoutGrid" not in t:
    t = t.replace("Bell, CalendarDays, CalendarPlus,", "Bell, CalendarDays, CalendarPlus, LayoutGrid,")
if "FeedEntry" not in t:
    t = t.replace(
        "  const shownEvents = evFilter === 'proximos' ? upcoming : past;",
        "  const shownEvents = evFilter === 'proximos' ? upcoming : past;\n"
        "  type FeedEntry =\n"
        "    | { kind: 'announcement'; at: number; a: NormalizedAnnouncement }\n"
        "    | { kind: 'event'; at: number; e: NormalizedEvent };\n"
        "  const feed: FeedEntry[] = [\n"
        "    ...visibleAnnouncements.map((a) => ({\n"
        "      kind: 'announcement' as const,\n"
        "      at: (a.createdAt || 0) + (a.pinned ? 1e15 : 0) + (a.level === 'urgente' ? 1e14 : 0),\n"
        "      a,\n"
        "    })),\n"
        "    ...visibleEvents.map((e) => ({\n"
        "      kind: 'event' as const,\n"
        "      at: (typeof e.updatedAt === 'number' ? e.updatedAt : e.createdAt) || 0,\n"
        "      e,\n"
        "    })),\n"
        "  ].sort((x, y) => y.at - x.at);",
    )
t = t.replace('<Tabs defaultValue="avisos" className="space-y-1">', '<Tabs defaultValue="feed" className="space-y-1">')
if 'TabsTrigger value="feed"' not in t:
    old = (
        '      <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl border bg-white p-1 shadow-sm dark:bg-card">\n'
        '        <TabsTrigger value="avisos" className="gap-1 rounded-lg text-xs sm:text-sm"><Bell className="h-3.5 w-3.5" /> Avisos</TabsTrigger>\n'
        '        <TabsTrigger value="agenda" className="gap-1 rounded-lg text-xs sm:text-sm"><CalendarDays className="h-3.5 w-3.5" /> Agenda</TabsTrigger>\n'
        '        <TabsTrigger value="eventos" className="gap-1 rounded-lg text-xs sm:text-sm"><CalendarPlus className="h-3.5 w-3.5" /> Eventos</TabsTrigger>\n'
        '      </TabsList>'
    )
    new = (
        '      <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl border bg-white p-1 shadow-sm dark:bg-card">\n'
        '        <TabsTrigger value="feed" className="gap-1 rounded-lg text-xs sm:text-sm"><LayoutGrid className="h-3.5 w-3.5" /> Feed</TabsTrigger>\n'
        '        <TabsTrigger value="avisos" className="gap-1 rounded-lg text-xs sm:text-sm"><Bell className="h-3.5 w-3.5" /> Avisos</TabsTrigger>\n'
        '        <TabsTrigger value="agenda" className="gap-1 rounded-lg text-xs sm:text-sm"><CalendarDays className="h-3.5 w-3.5" /> Agenda</TabsTrigger>\n'
        '        <TabsTrigger value="eventos" className="gap-1 rounded-lg text-xs sm:text-sm"><CalendarPlus className="h-3.5 w-3.5" /> Eventos</TabsTrigger>\n'
        '      </TabsList>\n'
        '\n'
        '      <TabsContent value="feed" className="pt-4">\n'
        '        {feed.length === 0 && (\n'
        '          <Empty icon={<LayoutGrid className="h-8 w-8" />} text="Ainda não há publicações no mural." />\n'
        '        )}\n'
        '        <div className="mx-auto flex max-w-xl flex-col gap-4">\n'
        '          {feed.map((item) =>\n'
        "            item.kind === 'announcement' ? (\n"
        '              <AnnouncementFeedPost key={`a-${item.a.id}`} announcement={item.a} now={now} />\n'
        '            ) : (\n'
        '              <EventFeedPost\n'
        '                key={`e-${item.e.id}`}\n'
        '                event={item.e}\n'
        '                now={now}\n'
        '                expandable\n'
        '                onOpen={setOpenEvent}\n'
        '                onFullPoster={setFullPoster}\n'
        '              />\n'
        '            ),\n'
        '          )}\n'
        '        </div>\n'
        '      </TabsContent>'
    )
    if old not in t:
        raise SystemExit("tabs block missing")
    t = t.replace(old, new, 1)
if "AnnouncementFeedPost key={a.id}" not in t:
    t2, n = re.subn(
        r"\{visibleAnnouncements\.map\(\(a\) => \(\s*<article[\s\S]*?</article>\s*\)\)\}",
        '{/* avisos posts */}\n        <div className="mx-auto flex max-w-xl flex-col gap-4">\n          {visibleAnnouncements.map((a) => (\n            <AnnouncementFeedPost key={a.id} announcement={a} now={now} />\n          ))}\n        </div>',
        t,
        count=1,
    )
    if n == 1:
        t = t2
        print("avisos ok")
    else:
        print("avisos skip", n)
mb.write_text(t)
print("memberboard", mb.stat().st_size)
print("done")
