import { useEffect, useRef, useState } from 'react';
import {
  Radio as RadioIcon,
  Play,
  Pause,
  CircleDot,
  Mic,
  Square,
  Trash2,
  Share2,
  Download,
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

/* v1.15.0: `variant="member"` = só player ao vivo (+ «a tocar agora» e site);
   o gravador e a biblioteca de gravações continuam ferramentas da liderança.
   O stream é público e nada aqui escreve no Firestore — zero impacto nas regras. */
export default function Radio({ variant = 'full' }: { variant?: 'full' | 'member' }) {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const [now, setNow] = useState<NowPlaying | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [playingRec, setPlayingRec] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  /* v1.18 (P2 «Rádio»): gravações publicadas para os membros */
  const [published, setPublished] = useState<PublishedRecording[]>([]);
  const [publishing, setPublishing] = useState<string | null>(null);
  const { user } = useAuth();
  const [tick, setTick] = useState(0); // relógio do gravador
  const recAudioRef = useRef<HTMLAudioElement | null>(null);
  /* v1.14.6: useConfirm() DEVOLVE A FUNÇÃO — o destructuring `{ confirm }`
     dava undefined e o clique no caixote rebentava com um TypeError antes de
     abrir o diálogo (era isto que tornava as gravações «impossíveis de apagar»
     mesmo depois da v1.12.3). Apanhado pelo @types/react — o tsc antigo não
     verificava JSX. */
  const confirm = useConfirm();

  /* re-render quando o player/gravador mudam de estado */
  useEffect(() => livePlayer.subscribe(rerender), []);
  useEffect(() => {
    recorder.onProgress = rerender;
    return () => { recorder.onProgress = null; };
  }, []);

  /* relógio enquanto grava */
  useEffect(() => {
    if (!recorder.recording) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [recorder.recording, tick === 0]);

  /* "a tocar agora" + biblioteca */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const np = await fetchNowPlaying();
      if (alive) setNow(np);
    };
    load();
    const id = setInterval(load, 45000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    listRecordings().then(setRecordings);
    listPublishedRecordings().then(setPublished).catch(() => setPublished([]));
  }, []);

  const toggleLive = async () => {
    if (livePlayer.playing || livePlayer.loading) {
      livePlayer.pause();
      return;
    }
    try {
      await livePlayer.play();
      toast.success('Ligado à emissão da ' + RADIO.name + '.');
    } catch {
      toast.error(livePlayer.error || 'Não foi possível iniciar a emissão.');
    }
  };

  const startRecording = async () => {
    if (recorder.recording) return;
    if (!livePlayer.playing) {
      try { await livePlayer.play(); } catch { /* grava na mesma: o fetch é independente */ }
    }
    try {
      toast.info('Gravação iniciada. Pode continuar a usar a app.');
      await recorder.start();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao iniciar a gravação.');
    }
  };

  const stopRecording = async () => {
    if (!recorder.recording) return;
    const { blob, seconds } = await recorder.stop();
    if (seconds < 3 || blob.size < 4096) {
      toast.error('Gravação demasiado curta para guardar.');
      return;
    }
    const name = recordingName();
    if (isNative()) {
      await saveRecording(blob, name);
      setRecordings(await listRecordings());
      toast.success(`Guardado no telemóvel: ${name} (${fmtBytes(blob.size)})`);
    } else {
      downloadBlob(blob, name);
      toast.success('Transferência iniciada: ' + name);
    }
  };

  const playRecording = (r: Recording) => {
    if (playingRec === r.file) {
      recAudioRef.current?.pause();
      recAudioRef.current = null;
      setPlayingRec(null);
      return;
    }
    recAudioRef.current?.pause();
    const a = new Audio(r.playUrl);
    a.play().catch(() => toast.error('Não foi possível reproduzir esta gravação.'));
    recAudioRef.current = a;
    setPlayingRec(r.file);
    a.onended = () => setPlayingRec(null);
  };

  const removeRecording = async (r: Recording) => {
    if (deletingFile) return; // evita entradas duplas (duplo toque)
    const ok = await confirm(`Apagar "${r.file}" do telemóvel? Esta ação não pode ser anulada.`, 'APAGAR');
    if (!ok) return;
    setDeletingFile(r.file);
    try {
      await deleteRecording(r);
      setRecordings(await listRecordings());
      toast.success('Gravação apagada.');
    } catch (e: any) {
      /* Antes sem catch: qualquer erro do Filesystem morria em silêncio e
         parecia que «o botão de apagar não funciona». */
      toast.error('Não foi possível apagar: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setDeletingFile(null);
    }
  };

  /* v1.18 (P2 «Rádio»): publicar/despublicar gravação para os membros.
     Botão alterna: já publicada → despublica. */
  const togglePublish = async (r: Recording) => {
    const existing = published.find((p) => p.name === r.file);
    if (existing) {
      const ok = await confirm(`Despublicar «${r.file}»? Os membros deixam de a ver no Portal.`, 'DESPUBLICAR');
      if (!ok) return;
      setPublishing(r.file);
      try {
        await unpublishRecording(existing);
        void logAudit('radio.unpublished', `radio_recordings/${existing.id}`, user?.email || '', r.file);
        toast.success('Gravação despublicada.');
        setPublished(await listPublishedRecordings());
      } catch (e: any) {
        toast.error('Falha ao despublicar: ' + (e?.message || ''));
      } finally {
        setPublishing(null);
      }
      return;
    }
    const ok = await confirm(`Publicar «${r.file}» para os membros ouvirem no Portal? O áudio é enviado para o Storage da igreja.`, 'PUBLICAR');
    if (!ok) return;
    setPublishing(r.file);
    try {
      await publishRecording(r, user?.email || '');
      void logAudit('radio.published', `radio/${r.file}`, user?.email || '', r.file);
      toast.success('Gravação publicada — os membros já a podem ouvir no Portal → Rádio.');
      setPublished(await listPublishedRecordings());
    } catch (e: any) {
      toast.error('Falha ao publicar: ' + (e?.message || 'o Storage está activado? (consola Firebase → Storage)'));
    } finally {
      setPublishing(null);
    }
  };

  const exportRecording = async (r: Recording) => {
    const shared = await shareRecording(r);
    toast.success(shared ? 'Partilha aberta.' : 'Transferência iniciada.');
  };

  const live = livePlayer.playing;
  const totalSaved = recordings.reduce((s, r) => s + r.size, 0);

  return (
    <div className="space-y-4 md:space-y-6 pb-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/25">
            <RadioIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight flex items-center gap-2">
              {RADIO.name}
              <Badge variant="outline" className="border-rose-300 text-rose-600 dark:text-rose-400 dark:border-rose-800">
                {RADIO.freq}
              </Badge>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{RADIO.city} · emissão em direto</p>
          </div>
        </div>
        <a
          href={RADIO.site}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Site da rádio
        </a>
      </div>

      {/* Player ao vivo */}
      <Card className="overflow-hidden border-0 shadow-xl shadow-slate-900/5 bg-gradient-to-br from-slate-900 to-slate-800 text-white dark:from-slate-900 dark:to-slate-950">
        <CardContent className="p-5 md:p-7">
          <div className="flex flex-col md:flex-row md:items-center gap-5">
            {/* "artwork" */}
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-red-500 to-orange-400 shadow-lg shadow-rose-900/40">
              <div className="text-center leading-none">
                <div className="text-2xl font-black tracking-tighter">91.9</div>
                <div className="text-[10px] font-semibold uppercase tracking-widest opacity-90">FM</div>
              </div>
              {live && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500 border-2 border-slate-900" />
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-300">
                {live ? (
                  <><CircleDot className="h-3.5 w-3.5 text-emerald-400" /> Em direto</>
                ) : livePlayer.loading ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-300" /> A ligar…</>
                ) : (
                  <><Pause className="h-3.5 w-3.5" /> Emissão parada</>
                )}
                {now?.listeners != null && (
                  <span className="ml-auto inline-flex items-center gap-1 text-slate-300">
                    <Headphones className="h-3.5 w-3.5" /> {now.listeners}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-base md:text-lg font-medium text-slate-100">
                {now?.song || 'Rádio Maranata — a melhor do seu rádio'}
              </p>

              {/* equalizador */}
              <div className="mt-3 flex h-6 items-end gap-1" aria-hidden>
                {[0.9, 0.6, 1.1, 0.75, 1.25, 0.5, 0.95, 0.7, 1.05, 0.65, 0.85, 1.15].map((d, i) => (
                  <span
                    key={i}
                    className={`w-1.5 rounded-full bg-gradient-to-t from-rose-500 to-orange-300 ${live ? 'eq-bar' : ''}`}
                    style={{ height: live ? '100%' : '18%', animationDuration: `${d}s`, animationDelay: `${i * 0.07}s` }}
                  />
                ))}
              </div>
            </div>

            <div className="flex md:flex-col items-center gap-3">
              <Button
                onClick={toggleLive}
                size="lg"
                className="h-16 w-16 rounded-full bg-white text-slate-900 hover:bg-rose-50 shadow-xl shadow-black/30 border-0"
                title={live ? 'Pausar emissão' : 'Ouvir em direto'}
              >
                {livePlayer.loading ? <RefreshCw className="h-7 w-7 animate-spin" /> : live ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-0.5" />}
              </Button>
              <label className="flex items-center gap-2 text-slate-300 md:w-36">
                <Volume2 className="h-4 w-4 shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={livePlayer.volume}
                  onChange={(e) => livePlayer.setVolume(Number(e.target.value))}
                  className="w-full accent-rose-400"
                  aria-label="Volume"
                />
              </label>
            </div>
          </div>

          {livePlayer.error && (
            <p className="mt-4 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 text-sm text-red-200">
              {livePlayer.error}
            </p>
          )}
        </CardContent>
      </Card>

      {variant === 'full' && (
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Gravação */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className={`h-4 w-4 ${recorder.recording ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
              Gravar transmissão
            </CardTitle>
            <CardDescription>
              {isNative()
                ? 'Guarda a emissão em direto no telemóvel para ouvir depois, mesmo sem internet.'
                : 'No computador, a gravação é transferida como ficheiro de áudio.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                  {fmtDuration(recorder.recording ? recorder.seconds : 0)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {recorder.recording
                    ? `${fmtBytes(recorder.bytes)} captados · ~${fmtBytes((recorder.seconds * RADIO.bitrateKbps * 1000) / 8) || '0 B'} estimados`
                    : 'Pronto a gravar'}
                </p>
              </div>
              {!recorder.recording ? (
                <Button onClick={startRecording} className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                  <Mic className="h-4 w-4" /> Gravar
                </Button>
              ) : (
                <Button onClick={stopRecording} variant="outline" className="gap-2 border-red-300 text-red-600 dark:border-red-900 dark:text-red-400">
                  <Square className="h-4 w-4 fill-current" /> Parar e guardar
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <HardDrive className="mr-1 inline h-3.5 w-3.5" />
              As gravações ficam em <span className="font-mono">Documentos/Radio</span> da aplicação
              ({fmtBytes(totalSaved)} ocupados em {recordings.length} ficheiro{recordings.length === 1 ? '' : 's'}).
              Mantenha a app aberta durante a gravação.
            </p>
          </CardContent>
        </Card>

        {/* Biblioteca */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Music4 className="h-4 w-4 text-slate-400" /> Gravações no telemóvel
            </CardTitle>
            <CardDescription>
              {isNative() ? 'Ouva, partilhe ou apague as transmissões guardadas.' : 'Disponível na aplicação Android.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recordings.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 py-8 text-center">
                <Music4 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Ainda não há gravações.</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Toque em «Gravar» durante a emissão.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recordings.map((r) => (
                  <li key={r.file} className="flex items-center gap-3 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-full border border-slate-200 dark:border-slate-700"
                      onClick={() => playRecording(r)}
                      title={playingRec === r.file ? 'Parar' : 'Reproduzir'}
                    >
                      {playingRec === r.file ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.file.replace('.aac', '')}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(r.mtime).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })} · {fmtBytes(r.size)} · ~{fmtDuration((r.size * 8) / (RADIO.bitrateKbps * 1000))}
                      </p>
                    </div>
                    {isNative() && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${published.some((p) => p.name === r.file) ? 'text-emerald-600' : 'text-slate-500 hover:text-emerald-600'}`}
                        onClick={() => togglePublish(r)}
                        disabled={publishing !== null}
                        title={published.some((p) => p.name === r.file) ? 'Publicada para os membros — tocar para despublicar' : 'Publicar para os membros (Portal → Rádio)'}
                      >
                        {publishing === r.file ? <Loader2 className="h-4 w-4 animate-spin" /> : published.some((p) => p.name === r.file) ? <UploadCloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" onClick={() => exportRecording(r)} title="Partilhar / exportar">
                      {isNative() ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600" onClick={() => removeRecording(r)} disabled={deletingFile !== null} title="Apagar">
                      {deletingFile === r.file ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {variant === 'member' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Music4 className="h-4 w-4 text-slate-400" /> Gravações da igreja
            </CardTitle>
            <CardDescription>Sermões e transmissões publicadas pela liderança — toque para ouvir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {published.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Ainda não há gravações publicadas.</p>
            ) : (
              published.map((p) => (
                <div key={p.id} className="rounded-lg border p-2.5 space-y-1.5">
                  <p className="text-xs font-semibold">{p.name.replace('.aac', '').replace(/[_-]/g, ' ')}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.publishedAt ? `Publicada em ${new Date(p.publishedAt).toLocaleDateString('pt-PT')}` : ''}
                    {p.size ? ` · ${fmtBytes(p.size)}` : ''}
                  </p>
                  <PublishedPlayer p={p} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** v1.18: player de gravação publicada — o URL do Storage só se resolve ao
 *  tocar (poupa a quota diária de descargas do plano Spark). */
function PublishedPlayer({ p }: { p: PublishedRecording }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  if (url) return <audio controls src={url} preload="metadata" className="w-full" />;
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs"
      disabled={busy || err}
      onClick={async () => {
        setBusy(true);
        try {
          setUrl(await publishedRecordingUrl(p));
        } catch {
          setErr(true);
          toast.error('Não foi possível carregar a gravação (o Storage pode não estar activado).');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      {err ? 'Indisponível' : 'Ouvir'}
    </Button>
  );
}
