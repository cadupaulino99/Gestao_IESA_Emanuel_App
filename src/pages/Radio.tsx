import { useEffect, useRef, useState } from 'react';
import {
  Radio as RadioIcon,
  Play,
  Pause,
  Mic,
  Square,
  Trash2,
  Share2,
  HardDrive,
  Music4,
  Headphones,
  ExternalLink,
  RefreshCw,
  Volume2,
  Loader2,
  UploadCloud,
  CloudOff,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  RADIO,
  livePlayer,
  recorder,
  isNative,
  listRecordings,
  saveRecording,
  deleteRecording,
  shareRecording,
  downloadBlob,
  recordingName,
  fetchNowPlaying,
  fmtDuration,
  fmtBytes,
  publishRecording,
  unpublishRecording,
  listPublishedRecordings,
  publishedRecordingUrl,
  type Recording,
  type NowPlaying,
  type PublishedRecording,
} from '../lib/radio';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../lib/audit';
import { useConfirm } from '../context/ConfirmContext';

export default function Radio({ variant = 'full' }: { variant?: 'full' | 'member' }) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [playingRec, setPlayingRec] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedRecording[]>([]);
  const [publishing, setPublishing] = useState<string | null>(null);
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const recAudioRef = useRef<HTMLAudioElement | null>(null);
  const confirm = useConfirm();

  useEffect(() => { const un = livePlayer.subscribe(rerender); void livePlayer.sync(); return un; }, []);
  useEffect(() => { recorder.onProgress = rerender; return () => { recorder.onProgress = null; }; }, []);
  useEffect(() => { if (!recorder.recording) return; const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, [recorder.recording, tick === 0]);
  useEffect(() => { let alive = true; const load = async () => { const np = await fetchNowPlaying(); if (alive) setNow(np); }; load(); const id = setInterval(load, 45000); return () => { alive = false; clearInterval(id); }; }, []);
  useEffect(() => { listRecordings().then(setRecordings); listPublishedRecordings().then(setPublished).catch(() => setPublished([])); }, []);

  const toggleLive = async () => {
    if (livePlayer.playing || livePlayer.loading) { livePlayer.pause(); return; }
    try { await livePlayer.play(); toast.success('Ligado à emissão da ' + RADIO.name + '.'); }
    catch { toast.error(livePlayer.error || 'Não foi possível iniciar a emissão.'); }
  };

  const startRecording = async () => {
    if (recorder.recording) return;
    if (!livePlayer.playing) { try { await livePlayer.play(); } catch { /* ok */ } }
    try { toast.info('Gravação iniciada.'); await recorder.start(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao iniciar a gravação.'); }
  };

  const stopRecording = async () => {
    if (!recorder.recording) return;
    const { blob, seconds } = await recorder.stop();
    if (seconds < 3 || blob.size < 4096) { toast.error('Gravação demasiado curta.'); return; }
    const name = recordingName();
    if (isNative()) { await saveRecording(blob, name); setRecordings(await listRecordings()); toast.success(`Guardado: ${name}`); }
    else { downloadBlob(blob, name); toast.success('Transferência iniciada: ' + name); }
  };

  const playRecording = (r: Recording) => {
    if (playingRec === r.file) { recAudioRef.current?.pause(); recAudioRef.current = null; setPlayingRec(null); return; }
    recAudioRef.current?.pause();
    const a = new Audio(r.playUrl);
    a.play().catch(() => toast.error('Não foi possível reproduzir.'));
    recAudioRef.current = a; setPlayingRec(r.file); a.onended = () => setPlayingRec(null);
  };

  const removeRecording = async (r: Recording) => {
    if (deletingFile) return;
    const ok = await confirm(`Apagar "${r.file}"?`, 'APAGAR');
    if (!ok) return;
    setDeletingFile(r.file);
    try { await deleteRecording(r); setRecordings(await listRecordings()); toast.success('Apagada.'); }
    catch (e: any) { toast.error('Falha: ' + (e?.message || '')); }
    finally { setDeletingFile(null); }
  };

  const togglePublish = async (r: Recording) => {
    const existing = published.find((p) => p.name === r.file);
    if (existing) {
      const ok = await confirm(`Despublicar «${r.file}»?`, 'DESPUBLICAR');
      if (!ok) return;
      setPublishing(r.file);
      try { await unpublishRecording(existing); void logAudit('radio.unpublished', `radio_recordings/${existing.id}`, user?.email || '', r.file); toast.success('Despublicada.'); setPublished(await listPublishedRecordings()); }
      catch (e: any) { toast.error('Falha: ' + (e?.message || '')); }
      finally { setPublishing(null); }
      return;
    }
    const ok = await confirm(`Publicar «${r.file}» para os membros?`, 'PUBLICAR');
    if (!ok) return;
    setPublishing(r.file);
    try { await publishRecording(r, user?.email || ''); void logAudit('radio.published', `radio/${r.file}`, user?.email || '', r.file); toast.success('Publicada.'); setPublished(await listPublishedRecordings()); }
    catch (e: any) { toast.error('Falha: ' + (e?.message || '')); }
    finally { setPublishing(null); }
  };

  const exportRecording = async (r: Recording) => {
    const shared = await shareRecording(r);
    toast.success(shared ? 'Partilha aberta.' : 'Transferência iniciada.');
  };

  const live = livePlayer.playing;
  const totalSaved = recordings.reduce((s, r) => s + r.size, 0);

  return (
    <div className="space-y-3 md:space-y-4 pb-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950 text-white shadow-xl shadow-rose-900/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative p-3.5 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 via-red-500 to-orange-400 shadow-lg">
                <div className="text-center leading-none">
                  <div className="text-sm font-black tracking-tighter">91.9</div>
                  <div className="text-[8px] font-semibold uppercase tracking-widest opacity-90">FM</div>
                </div>
                {live && (
                  <span className="absolute -right-1 -top-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-500" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="truncate text-sm font-semibold sm:text-base">{RADIO.name}</h1>
                  <Badge className="h-5 border-0 bg-white/10 px-1.5 text-[10px] text-rose-100">{RADIO.freq}</Badge>
                </div>
                <p className="truncate text-[11px] text-slate-400">{RADIO.city}</p>
              </div>
            </div>
            <a href={RADIO.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/10">
              <ExternalLink className="h-3 w-3" /> Site
            </a>
          </div>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                {live ? <span className="text-emerald-400">● Em direto</span> : livePlayer.loading ? <span className="text-amber-300">A ligar…</span> : <span>Parado</span>}
                {now?.listeners != null && <span className="inline-flex items-center gap-0.5"><Headphones className="h-3 w-3" /> {now.listeners}</span>}
              </div>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-100">{now?.song || 'Rádio Maranata — a melhor do seu rádio'}</p>
              <div className="mt-2 flex h-4 items-end gap-0.5" aria-hidden>
                {[0.9, 0.55, 1.15, 0.7, 1.05, 0.5, 0.95, 0.65, 1.2, 0.75].map((d, i) => (
                  <span key={i} className={`w-1 rounded-full bg-gradient-to-t from-rose-500 to-orange-300 ${live ? 'eq-bar' : ''}`} style={{ height: live ? '100%' : '20%', animationDuration: `${d}s` }} />
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2">
              <Button onClick={toggleLive} size="lg" className="h-12 w-12 rounded-full border-0 bg-white text-slate-900 shadow-lg hover:bg-rose-50 sm:h-14 sm:w-14">
                {livePlayer.loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : live ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </Button>
              <label className="flex w-20 items-center gap-1 text-slate-300 sm:w-24">
                <Volume2 className="h-3.5 w-3.5 opacity-70" />
                <input type="range" min={0} max={1} step={0.05} value={livePlayer.volume} onChange={(e) => livePlayer.setVolume(Number(e.target.value))} className="w-full accent-rose-400" />
              </label>
            </div>
          </div>
          {livePlayer.error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs text-red-200">{livePlayer.error}</p>}
        </div>
      </div>

      {variant === 'full' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Mic className={`h-4 w-4 ${recorder.recording ? 'animate-pulse text-red-500' : 'text-slate-400'}`} />Gravar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                <div>
                  <p className="font-mono text-xl font-semibold tabular-nums">{fmtDuration(recorder.recording ? recorder.seconds : 0)}</p>
                  <p className="text-[11px] text-muted-foreground">{recorder.recording ? fmtBytes(recorder.bytes) : 'Pronto'} · {fmtBytes(totalSaved)} guardados</p>
                </div>
                {!recorder.recording ? (
                  <Button onClick={startRecording} size="sm" className="bg-red-600 text-white hover:bg-red-700"><Mic className="mr-1 h-3.5 w-3.5" />Gravar</Button>
                ) : (
                  <Button onClick={stopRecording} size="sm" variant="outline" className="border-red-300 text-red-600"><Square className="mr-1 h-3.5 w-3.5 fill-current" />Parar</Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground"><HardDrive className="mr-1 inline h-3 w-3" />Documentos/Radio</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Music4 className="h-4 w-4 text-slate-400" />Gravações</CardTitle>
            </CardHeader>
            <CardContent>
              {recordings.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Ainda não há gravações.</p>
              ) : (
                <ul className="max-h-56 divide-y overflow-y-auto">
                  {recordings.map((r) => (
                    <li key={r.file} className="flex items-center gap-2 py-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border" onClick={() => playRecording(r)}>
                        {playingRec === r.file ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                      </Button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{r.file.replace('.aac', '')}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtBytes(r.size)}</p>
                      </div>
                      {isNative() && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => togglePublish(r)} disabled={publishing !== null}>
                          {publishing === r.file ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : published.some((p) => p.name === r.file) ? <UploadCloud className="h-3.5 w-3.5 text-emerald-600" /> : <CloudOff className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportRecording(r)}><Share2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => removeRecording(r)} disabled={deletingFile === r.file}>
                        {deletingFile === r.file ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {(variant === 'member' || published.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><RadioIcon className="h-4 w-4" />Gravações da igreja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {published.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">Ainda não há gravações publicadas.</p>
            ) : published.map((p) => (
              <div key={p.id} className="space-y-1.5 rounded-lg border p-2.5">
                <p className="text-xs font-semibold">{p.name.replace('.aac', '').replace(/[_-]/g, ' ')}</p>
                <PublishedPlayer p={p} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PublishedPlayer({ p }: { p: PublishedRecording }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  if (url) return <audio controls src={url} preload="metadata" className="w-full" />;
  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={busy || err} onClick={async () => {
      setBusy(true);
      try { setUrl(await publishedRecordingUrl(p)); }
      catch { setErr(true); toast.error('Não foi possível carregar a gravação.'); }
      finally { setBusy(false); }
    }}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      {err ? 'Indisponível' : 'Ouvir'}
    </Button>
  );
}
