#!/usr/bin/env python3
from pathlib import Path

p = Path('src/components/admin/EventsAdmin.tsx')
t = p.read_text()

# Ensure runStorageTest always clears state (already has finally - ok)
# Make notifications non-blocking so save never hangs after event is written
old = '''      // notificações (só do que está publicado)
      if (publishStatus === 'publicado') {
        const after = normalizeEvent({ ...data, id });
        if (!editing) {
          const r = await publishBoardNotification({
            kind: 'evento', label: boardLabels.newEvent(after), refId: id,
            alsoSms: form.alsoSms, byEmail: email,
          });
          toast.success(`Evento publicado — ${r.notified} membro(s) notificado(s)${r.smsQueued ? ` · ${r.smsQueued} na fila SMS/WhatsApp` : ''}.`);
          void logAudit('event.published', `events/${id}`, email, form.title.trim());
        } else {
          const what = eventChangesForNotification(editing, { ...data, id });
          if (what) {
            const r = await publishBoardNotification({
              kind: 'evento_change', label: boardLabels.eventChanged(after, what), refId: id,
              alsoSms: form.alsoSms, byEmail: email,
            });
            toast.success(`Evento actualizado — ${r.notified} membro(s) notificado(s) da alteração.`);
            void logAudit('event.changed', `events/${id}`, email, what || '');
          } else if (editing.publishStatus === 'rascunho') {
            const r = await publishBoardNotification({
              kind: 'evento', label: boardLabels.newEvent(after), refId: id, alsoSms: form.alsoSms, byEmail: email,
            });
            toast.success(`Evento publicado — ${r.notified} membro(s) notificado(s).`);
            void logAudit('event.published', `events/${id}`, email, form.title.trim());
          } else {
            toast.success('Evento actualizado.');
            void logAudit('event.updated', `events/${id}`, email, form.title.trim());
          }
        }
      } else {
        toast.success('Rascunho gravado (os membros não o vêem).');
      }
      reset();
      await load();'''

new = '''      // Notificações em fundo — não bloqueiam o botão Guardar
      if (publishStatus === 'publicado') {
        const after = normalizeEvent({ ...data, id });
        const notify = async () => {
          try {
            if (!editing) {
              const r = await publishBoardNotification({
                kind: 'evento', label: boardLabels.newEvent(after), refId: id,
                alsoSms: form.alsoSms, byEmail: email,
              });
              toast.success(`Evento publicado — ${r.notified} membro(s) notificado(s)${r.smsQueued ? ` · ${r.smsQueued} na fila SMS/WhatsApp` : ''}.`);
              void logAudit('event.published', `events/${id}`, email, form.title.trim());
            } else {
              const what = eventChangesForNotification(editing, { ...data, id });
              if (what) {
                const r = await publishBoardNotification({
                  kind: 'evento_change', label: boardLabels.eventChanged(after, what), refId: id,
                  alsoSms: form.alsoSms, byEmail: email,
                });
                toast.success(`Evento actualizado — ${r.notified} membro(s) notificado(s) da alteração.`);
                void logAudit('event.changed', `events/${id}`, email, what || '');
              } else if (editing.publishStatus === 'rascunho') {
                const r = await publishBoardNotification({
                  kind: 'evento', label: boardLabels.newEvent(after), refId: id, alsoSms: form.alsoSms, byEmail: email,
                });
                toast.success(`Evento publicado — ${r.notified} membro(s) notificado(s).`);
                void logAudit('event.published', `events/${id}`, email, form.title.trim());
              } else {
                toast.success('Evento actualizado.');
                void logAudit('event.updated', `events/${id}`, email, form.title.trim());
              }
            }
          } catch (ne: any) {
            toast.success('Evento guardado (notificações em atraso ou falharam).');
            console.warn('notify events', ne);
          }
        };
        void notify();
      } else {
        toast.success('Rascunho gravado (os membros não o vêem).');
      }
      reset();
      void load();'''

if old not in t:
    if 'Notificações em fundo' in t:
        print('already patched notifications')
    else:
        raise SystemExit('notification block not found')
else:
    t = t.replace(old, new)
    print('notifications non-blocking')

# Harden runStorageTest
old_test = '''  const runStorageTest = async () => {
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
  };'''
new_test = '''  const runStorageTest = async () => {
    if (storageTesting) return;
    setStorageTesting(true);
    const hardStop = window.setTimeout(() => {
      setStorageTesting(false);
      toast.error('Teste do Storage demorou demais (timeout). Verifique se o Storage está activo no Firebase.');
    }, 15000);
    try {
      const res = await testStorageActive();
      if (res.ok) toast.success(res.detail);
      else toast.error(res.detail);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao testar o Storage');
    } finally {
      window.clearTimeout(hardStop);
      setStorageTesting(false);
    }
  };'''
if old_test in t:
    t = t.replace(old_test, new_test)
    print('runStorageTest hardened')
elif 'hardStop' in t:
    print('runStorageTest already hardened')
else:
    print('warn: runStorageTest block not exact')

p.write_text(t)
print('done', p.stat().st_size)
