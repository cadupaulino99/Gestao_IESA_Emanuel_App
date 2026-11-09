#!/usr/bin/env python3
from pathlib import Path

p = Path('src/components/admin/EventsAdmin.tsx')
t = p.read_text()

if 'testStorageActive' not in t:
    t = t.replace(
        "import { uploadEventPoster, deleteEventPoster, posterUrl, validatePosterFile } from '../../lib/posters';",
        "import { uploadEventPoster, deleteEventPoster, posterUrl, validatePosterFile, testStorageActive } from '../../lib/posters';",
    )

if 'HardDrive' not in t:
    t = t.replace(
        'CalendarPlus, Pencil, Trash2, Loader2, ImagePlus, MapPin, Clock, UserRound',
        'CalendarPlus, Pencil, Trash2, Loader2, ImagePlus, MapPin, Clock, UserRound, HardDrive',
    )

if 'storageTesting' not in t:
    t = t.replace(
        'const [removePoster, setRemovePoster] = useState(false);',
        'const [removePoster, setRemovePoster] = useState(false);\n  const [storageTesting, setStorageTesting] = useState(false);',
    )

if 'runStorageTest' not in t:
    # insert before return (
    marker = '  return (\n    <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">'
    fn = '''  const runStorageTest = async () => {
    setStorageTesting(true);
    try {
      const res = await testStorageActive();
      if (res.ok) toast.success(res.detail);
      else toast.error(res.detail);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao testar o Storage');
    } finally {
      setStorageTesting(false);
    }
  };

'''
    if marker not in t:
        raise SystemExit('return marker not found')
    t = t.replace(marker, fn + marker)

if 'Testar Storage' not in t:
    old = '''        <CardDescription>
          Atividades com data própria. Estados: marcado, adiado, cancelado, realizado.
          Cartaz opcional (JPG/PNG/WEBP até 10 MB — comprimido a 1600 px e guardado como ficheiro).
        </CardDescription>
      </CardHeader>'''
    new = '''        <CardDescription>
          Atividades com data própria. Estados: marcado, adiado, cancelado, realizado.
          Cartaz opcional (JPG/PNG/WEBP até 10 MB — comprimido a 1600 px e guardado como ficheiro).
        </CardDescription>
        <div className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={storageTesting}
            onClick={() => void runStorageTest()}
          >
            {storageTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HardDrive className="h-3.5 w-3.5" />}
            {storageTesting ? 'A testar Storage…' : 'Testar Storage'}
          </Button>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Verifica se o Firebase Storage aceita upload de cartazes (escreve e apaga um ficheiro de teste).
          </p>
        </div>
      </CardHeader>'''
    if old not in t:
        raise SystemExit('CardDescription block not found')
    t = t.replace(old, new)

p.write_text(t)
print('EventsAdmin patched', p.stat().st_size)
