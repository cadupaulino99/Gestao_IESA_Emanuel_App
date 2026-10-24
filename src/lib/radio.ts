import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

/**
 * Rádio Maranata 91.9 FM (Lubango, Huíla) — player ao vivo + gravador.
 *
 * O stream é Icecast/AzuraCast em AAC (ADTS, 48 kbps). O servidor reflete o
 * header `Origin` (CORS), por isso conseguimos:
 *   1. Tocar com um <audio> normal (sem CORS);
 *   2. GRAVAR a transmissão com fetch() + ReadableStream (com CORS) e guardar
 *      os bytes crus num ficheiro `.aac` reproduzível no próprio telemóvel.
 */
export const RADIO = {
  name: 'Rádio Maranata',
  freq: '91.9 FM',
  city: 'Lubango · Huíla',
  site: 'https://radiomaranatahuila.com/',
  streamUrl: 'https://azura4.cmaudioevideo.com:8450/radio.aac',
  nowPlayingUrl: 'https://azura4.cmaudioevideo.com:8450/api/nowplaying',
  bitrateKbps: 48,
  folder: 'Radio', // dentro de Documentos da app
} as const;

export const isNative = () => Capacitor.isNativePlatform();

/* ------------------------------------------------------------------ */
/* Player ao vivo (singleton: continua a tocar ao navegar na app)      */
/* ------------------------------------------------------------------ */
type Listener = () => void;

class LivePlayer {
  private audio: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();

  playing = false;
  loading = false;
  error: string | null = null;
  volume = 0.9;

  private ensure(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const a = new Audio();
    a.preload = 'none';
    a.volume = this.volume;
    a.addEventListener('playing', () => { this.playing = true; this.loading = false; this.error = null; this.emit(); });
    a.addEventListener('waiting', () => { this.loading = true; this.emit(); });
    a.addEventListener('pause', () => { this.playing = false; this.loading = false; this.emit(); });
    a.addEventListener('error', () => {
      this.playing = false; this.loading = false;
      this.error = 'Não foi possível ligar à emissão. Verifique a internet e tente novamente.';
      this.emit();
    });
    this.audio = a;
    return a;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private emit() { this.listeners.forEach((fn) => fn()); }

  async play(): Promise<void> {
    const a = this.ensure();
    this.error = null;
    this.loading = true;
    this.emit();
    // recomeça no "vivinho" da emissão (salta qualquer buffer antigo)
    a.src = RADIO.streamUrl;
    try {
      await a.play();
    } catch (e) {
      this.loading = false;
      this.playing = false;
      this.error = 'Toque bloqueado ou sem ligação. Toque novamente para tentar.';
      this.emit();
      throw e;
    }
  }

  pause(): void {
    this.audio?.pause();
    this.playing = false;
    this.loading = false;
    this.emit();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.audio) this.audio.volume = v;
    this.emit();
  }
}

export const livePlayer = new LivePlayer();

/* ------------------------------------------------------------------ */
/* Gravador de transmissão (fetch -> chunks -> ficheiro .aac)          */
/* ------------------------------------------------------------------ */
export class StreamRecorder {
  private ctrl: AbortController | null = null;
  private chunks: Uint8Array[] = [];
  private startedAt = 0;

  bytes = 0;
  recording = false;
  onProgress: (() => void) | null = null;

  get seconds(): number {
    return this.recording ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
  }

  async start(): Promise<void> {
    if (this.recording) return;
    this.ctrl = new AbortController();
    this.chunks = [];
    this.bytes = 0;
    this.startedAt = Date.now();
    this.recording = true;
    this.onProgress?.();

    const res = await fetch(RADIO.streamUrl, { signal: this.ctrl.signal });
    if (!res.ok || !res.body) throw new Error('A emissão não respondeu (HTTP ' + res.status + ').');
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          this.chunks.push(value);
          this.bytes += value.length;
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
    } finally {
      this.recording = false;
      this.onProgress?.();
    }
  }

  /** Termina e devolve o áudio captado. */
  async stop(): Promise<{ blob: Blob; seconds: number; bytes: number }> {
    const seconds = this.seconds;
    this.ctrl?.abort();
    // dá um tick para o loop de leitura terminar e libertar os chunks
    await new Promise((r) => setTimeout(r, 60));
    const blob = new Blob(this.chunks as unknown as BlobPart[], { type: 'audio/aac' });
    const out = { blob, seconds, bytes: this.bytes };
    this.chunks = [];
    this.bytes = 0;
    return out;
  }
}

export const recorder = new StreamRecorder();

/* ------------------------------------------------------------------ */
/* Biblioteca de gravações no telemóvel                                */
/* ------------------------------------------------------------------ */
export interface Recording {
  file: string;
  uri: string;      // uri de sistema
  playUrl: string;  // url reproduzível na WebView
  size: number;
  mtime: number;
}

export function recordingName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Maranata_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.aac`;
}

export async function listRecordings(): Promise<Recording[]> {
  if (!isNative()) return [];
  try {
    const { files } = await Filesystem.readdir({ path: RADIO.folder, directory: Directory.Documents });
    const out: Recording[] = [];
    for (const f of files) {
      if (!f.name.endsWith('.aac')) continue;
      try {
        const st = await Filesystem.stat({ path: `${RADIO.folder}/${f.name}`, directory: Directory.Documents });
        out.push({
          file: f.name,
          uri: st.uri,
          playUrl: Capacitor.convertFileSrc(st.uri),
          size: st.size ?? 0,
          mtime: st.mtime ?? 0,
        });
      } catch {
        /* ficheiro entretanto removido */
      }
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export async function saveRecording(blob: Blob, name: string): Promise<Recording> {
  const base64 = await blobToBase64(blob);
  const res = await Filesystem.writeFile({
    path: `${RADIO.folder}/${name}`,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  return { file: name, uri: res.uri, playUrl: Capacitor.convertFileSrc(res.uri), size: blob.size, mtime: Date.now() };
}

export async function deleteRecording(r: Recording): Promise<void> {
  await Filesystem.deleteFile({ path: `${RADIO.folder}/${r.file}`, directory: Directory.Documents });
}

export async function shareRecording(r: Recording): Promise<boolean> {
  try {
    const { data } = await Filesystem.readFile({ path: `${RADIO.folder}/${r.file}`, directory: Directory.Documents });
    const b64 = typeof data === 'string' ? data : String(data);
    const blob = base64ToBlob(b64, 'audio/aac');
    const file = new File([blob], r.file, { type: 'audio/aac' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: r.file });
      return true;
    }
    downloadBlob(blob, r.file);
    return false;
  } catch {
    return false;
  }
}

/** Deprecado em native: usar saveBlob de lib/download (partilha/Documents). */
export async function downloadBlob(blob: Blob, name: string): Promise<void> {
  const { saveBlob } = await import('./download');
  await saveBlob(blob, name);
}

/* ------------------------------------------------------------------ */
/* "A tocar agora" (API pública do AzuraCast; falha em silêncio)       */
/* ------------------------------------------------------------------ */
export interface NowPlaying { song: string | null; listeners: number | null }

export async function fetchNowPlaying(): Promise<NowPlaying | null> {
  try {
    const res = await fetch(RADIO.nowPlayingUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const j = await res.json();
    const st = Array.isArray(j) ? j[0] : j;
    if (!st) return null;
    return {
      song: st?.now_playing?.song?.text ?? st?.now_playing?.song?.title ?? null,
      listeners: st?.listeners?.current ?? null,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
