#!/usr/bin/env python3
from pathlib import Path
import re

# --- firestore.rules: permitir posterUrl (https) ---
rules = Path('firestore.rules')
rt = rules.read_text()
if "hasField(d, 'posterUrl')" not in rt:
    m = re.search(
        r"\(!hasField\(d, 'posterPath'\).*?posterThumbPath.*?\)\);",
        rt,
        re.S,
    )
    if not m:
        raise SystemExit('poster block not found in firestore.rules')
    new_block = """(!hasField(d, 'posterPath') || d.posterPath == null ||
          (d.posterPath is string && d.posterPath.matches('^posters/[^/]+\\.(jpg|png|webp)$'))) &&
        (!hasField(d, 'posterThumbPath') || d.posterThumbPath == null ||
          (d.posterThumbPath is string && d.posterThumbPath.matches('^posters/thumbs/[^/]+\\.(jpg|png|webp)$'))) &&
        (!hasField(d, 'posterUrl') || d.posterUrl == null ||
          (d.posterUrl is string && d.posterUrl.matches('^https://.+')));"""
    rt = rt[: m.start()] + new_block + rt[m.end() :]
    rules.write_text(rt)
    print('firestore.rules: posterUrl allowed')
else:
    print('firestore.rules: posterUrl already present')

# --- EventsAdmin.tsx ---
p = Path('src/components/admin/EventsAdmin.tsx')
t = p.read_text()

if 'setDoc' not in t:
    t = t.replace(
        "import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';",
        "import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';",
    )

old = '''    setSaving(true);
    try {
      let id = editing?.id || '';
      const data: any = {
        title: form.title.trim(),
        descriptionHtml: form.html || '',
        description: plainOf(form.html || '', 200),   // espelho legado (Dashboard)
        date: form.date, time: form.time || '',
        dateEnd: form.dateEnd || null, timeEnd: form.timeEnd || null,
        location: form.location.trim(), responsible: form.responsible.trim(),
        status: form.status, publishStatus,
        reminder1d: form.reminder1d === true,
        updatedBy: email, updatedAt: now,
      };
      if (editing) {
        await updateDoc(doc(db, 'events', editing.id), data);
      } else {
        const ref = await addDoc(collection(db, 'events'), { ...data, createdAt: now, createdBy: email });
        id = ref.id;
      }

      /* Cartaz (Storage): falha NÃO impede a publicação do evento — antes, um
         bucket por activar rebentava o save inteiro depois do documento já
         gravado (evento existia mas o ecrã mostrava erro e não fechava). */
      let posterWarning: string | null = null;
      try {
        if (posterFile) {
          const up = await uploadEventPoster(id, posterFile);
          const oldPaths = editing ? [editing.posterPath, editing.posterThumbPath] : [];
          await updateDoc(doc(db, 'events', id), {
            posterUrl: up.posterUrl || null,
            posterPath: up.posterPath || null,
            posterThumbPath: up.posterThumbPath || null,
          });
          await deleteEventPoster(oldPaths);
        } else if (removePoster && (editing?.posterPath || editing?.posterUrl)) {
          await updateDoc(doc(db, 'events', id), { posterPath: null, posterThumbPath: null, posterUrl: null });
          await deleteEventPoster([editing.posterPath, editing.posterThumbPath]);
        }
      } catch (pe: any) {
        const m = String(pe?.message || pe || '');
        posterWarning = /bucket|not exist|404/i.test(m)
          ? 'o armazenamento de ficheiros (Firebase Storage) ainda não foi activado no projecto — consola Firebase → Storage → «Começar»'
          : m || 'falha desconhecida no carregamento';
      }
      if (posterWarning) {
        toast.warning(`Evento guardado SEM cartaz: ${posterWarning}.`);
      }'''

new = '''    setSaving(true);
    try {
      // ID estável: permite subir o cartaz antes e gravar tudo num único write
      const id = editing?.id || doc(collection(db, 'events')).id;
      const data: any = {
        title: form.title.trim(),
        descriptionHtml: form.html || '',
        description: plainOf(form.html || '', 200),
        date: form.date, time: form.time || '',
        dateEnd: form.dateEnd || null, timeEnd: form.timeEnd || null,
        location: form.location.trim(), responsible: form.responsible.trim(),
        status: form.status, publishStatus,
        reminder1d: form.reminder1d === true,
        updatedBy: email, updatedAt: now,
      };

      let posterWarning: string | null = null;
      // Upload do cartaz ANTES de gravar o documento (R2 / Worker)
      if (posterFile) {
        try {
          const up = await uploadEventPoster(id, posterFile);
          if (up.posterUrl) data.posterUrl = up.posterUrl;
          if (up.posterPath) data.posterPath = up.posterPath;
          if (up.posterThumbPath) data.posterThumbPath = up.posterThumbPath;
          if (up.posterUrl && !up.posterPath) {
            data.posterPath = null;
            data.posterThumbPath = null;
          }
          if (editing) {
            await deleteEventPoster([editing.posterPath, editing.posterThumbPath]);
          }
        } catch (pe: any) {
          const m = String(pe?.message || pe || '');
          posterWarning = m || 'falha no carregamento do cartaz';
        }
      } else if (removePoster && (editing?.posterPath || editing?.posterUrl)) {
        data.posterPath = null;
        data.posterThumbPath = null;
        data.posterUrl = null;
        await deleteEventPoster([editing?.posterPath, editing?.posterThumbPath]);
      } else if (editing) {
        if (editing.posterUrl) data.posterUrl = editing.posterUrl;
        if (editing.posterPath) data.posterPath = editing.posterPath;
        if (editing.posterThumbPath) data.posterThumbPath = editing.posterThumbPath;
      }

      if (editing) {
        await updateDoc(doc(db, 'events', id), data);
      } else {
        await setDoc(doc(db, 'events', id), { ...data, createdAt: now, createdBy: email });
      }

      if (posterWarning) {
        toast.warning(`Evento guardado SEM cartaz: ${posterWarning}.`);
      } else if (posterFile && data.posterUrl) {
        toast.success('Cartaz associado ao evento.');
      }'''

if 'Cartaz associado ao evento' in t:
    print('EventsAdmin already patched')
elif old in t:
    t = t.replace(old, new)
    print('EventsAdmin save flow patched')
else:
    raise SystemExit('EventsAdmin save block not found — abort')

# UI previews for posterUrl
if 'editing?.posterUrl' not in t or t.count('editing?.posterUrl') < 2:
    t = t.replace(
        "{!posterPreview && editing?.posterPath && !removePoster && <PosterThumb path={editing.posterThumbPath || editing.posterPath} className=\"h-16 w-12\" />}",
        "{!posterPreview && !removePoster && editing?.posterUrl && <img src={editing.posterUrl} alt=\"Cartaz\" className=\"h-16 w-12 rounded border object-cover\" />}\n            {!posterPreview && !removePoster && !editing?.posterUrl && editing?.posterPath && <PosterThumb path={editing.posterThumbPath || editing.posterPath} className=\"h-16 w-12\" />}",
    )
    t = t.replace(
        "{posterPreview || editing?.posterPath ? 'Substituir cartaz' : 'Carregar cartaz (opcional)'}",
        "{posterPreview || editing?.posterPath || editing?.posterUrl ? 'Substituir cartaz' : 'Carregar cartaz (opcional)'}",
    )
    t = t.replace(
        "{(posterPreview || (editing?.posterPath && !removePoster)) && (",
        "{(posterPreview || ((editing?.posterPath || editing?.posterUrl) && !removePoster)) && (",
    )
    print('EventsAdmin UI posterUrl')

p.write_text(t)
print('done')
