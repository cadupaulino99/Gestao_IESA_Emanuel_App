#!/usr/bin/env python3
from pathlib import Path

# ── Members.tsx — mobile list skeleton while isLoading ────────────────────
p = Path('src/pages/Members.tsx')
t = p.read_text()

old_mobile = '''              <div className="space-y-2 p-3 md:hidden">
                {filteredMembers.map((m) => (
                  <Card key={m.id}>
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.phone || 'Sem telefone'} · {m.groupCell || 'Sem área'}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${(m.status || 'Activo') === 'Activo' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100'}`}>{m.status || 'Activo'}</span>
                      </div>
                      <ActionBtns m={m} />
                    </CardContent>
                  </Card>
                ))}
              </div>'''

new_mobile = '''              <div className="space-y-2 p-3 md:hidden">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="space-y-3 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-2/3 max-w-[12rem] animate-pulse rounded bg-muted" />
                            <div className="h-3 w-1/2 max-w-[9rem] animate-pulse rounded bg-muted" />
                          </div>
                          <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                        </div>
                        <div className="flex gap-2">
                          <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
                          <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : filteredMembers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhum membro encontrado.</p>
                ) : (
                  filteredMembers.map((m) => (
                  <Card key={m.id}>
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.phone || 'Sem telefone'} · {m.groupCell || 'Sem área'}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${(m.status || 'Activo') === 'Activo' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100'}`}>{m.status || 'Activo'}</span>
                      </div>
                      <ActionBtns m={m} />
                    </CardContent>
                  </Card>
                  ))
                )}
              </div>'''

if old_mobile in t:
    t = t.replace(old_mobile, new_mobile)
    print('Members mobile skeleton')
else:
    print('WARN Members mobile block')

# Improve desktop table skeleton — 8 rows, varied widths
old_tbl = '''                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 9 }).map((__, j) => (
                          <TableCell key={j}><div className="h-4 w-14 animate-pulse rounded bg-muted" /></TableCell>
                        ))}</TableRow>
                      ))
                    ) : filteredMembers.length === 0 ? ('''

new_tbl = '''                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><div className="h-4 w-6 animate-pulse rounded bg-muted" /></TableCell>
                          <TableCell><div className="h-4 w-32 animate-pulse rounded bg-muted" /></TableCell>
                          <TableCell><div className="h-5 w-12 animate-pulse rounded-full bg-muted" /></TableCell>
                          <TableCell><div className="h-5 w-16 animate-pulse rounded-full bg-muted" /></TableCell>
                          <TableCell><div className="h-5 w-14 animate-pulse rounded-full bg-muted" /></TableCell>
                          <TableCell><div className="h-5 w-16 animate-pulse rounded-full bg-muted" /></TableCell>
                          <TableCell><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
                          <TableCell><div className="h-5 w-14 animate-pulse rounded-full bg-muted" /></TableCell>
                          <TableCell><div className="ml-auto h-8 w-20 animate-pulse rounded-md bg-muted" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredMembers.length === 0 ? ('''

if old_tbl in t:
    t = t.replace(old_tbl, new_tbl)
    print('Members table skeleton')
else:
    print('WARN Members table')

p.write_text(t)

# ── Finances.tsx — richer table skeletons (tithes / offerings / expenses) ─
p = Path('src/pages/Finances.tsx')
t = p.read_text()

# Generic replacement for simple 3-cell pulse rows used in several places
# Tithes desktop loading block - read unique context
# Replace common pattern of 3 skeleton rows with 6 richer ones where structure is simple

# Pattern A: three TableCells with fixed widths in loading for tithes
import re

# Improve mobile card skeletons count 3 -> 5 and slightly richer
t, n = re.subn(
    r'''\{loading \? \(\s*Array\.from\(\{ length: 3 \}\)\.map\(\(_, i\) => \(\s*<div key=\{i\} className="border p-4 rounded-lg shadow-sm flex flex-col gap-2(?: border-destructive/20)?">\s*<div className="h-5 w-40 bg-muted animate-pulse rounded"></div>\s*<div className="h-4 w-(?:32|24) bg-muted animate-pulse rounded"></div>\s*<div className="h-6 w-24 bg-muted animate-pulse rounded"></div>\s*</div>\s*\)\)\s*\)''',
    '''{loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="border p-4 rounded-lg shadow-sm flex flex-col gap-2">
                         <div className="flex justify-between gap-2">
                           <div className="h-5 w-36 bg-muted animate-pulse rounded" />
                           <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
                         </div>
                         <div className="h-3.5 w-28 bg-muted animate-pulse rounded" />
                         <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                      </div>
                    ))
                 )''',
    t,
    count=6,
)
print(f'Finances mobile skeletons replaced: {n}')

# Table row skeletons: increase length 3 -> 6 and vary widths for first loading blocks
# Safer: replace length: 3 in TableBody loading contexts only when paired with animate-pulse TableCell
t2 = t
# Specific: Array.from({ length: 3 }) near TableRow skeleton
t2, n2 = re.subn(
    r'(<TableBody>\s*\{loading \? \(\s*)Array\.from\(\{ length: 3 \}\)',
    r'\1Array.from({ length: 6 })',
    t2,
)
print(f'Finances table length 3->6: {n2}')
t = t2

p.write_text(t)
print('DONE')
