import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { toast } from 'sonner';

/**
 * Descargas que FUNCIONAM no APK.
 *
 * Nem `<a download>` nem `window.open()` trabalham na WebView do Android:
 * o clique é ignorado em silêncio (foi assim que o cartão "não aparecia", e o
 * mesmo acontecia com Excel, recibos, backups e relatórios — varrimento
 * de 2026-10-24). Em native: folha de partilha; se o utilizador cancelar,
 * grava em Documents/Download/ e diz onde ficou. Na web: <a download> normal.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.getPlatform() === 'web') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch {
      /* cancelou → grava em Documents */
    }
  }
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    r.readAsDataURL(blob);
  });
  await Filesystem.writeFile({
    path: `Download/${filename}`,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  toast.success(`Ficheiro guardado em Documents/Download/${filename}`);
}

/** Converte um data-URL (ex.: comprovativos guardados em base64) em Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Exporta um workbook XLSX de forma segura no APK e na web. */
export async function saveXlsx(XLSX: any, wb: unknown, filename: string): Promise<void> {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  await saveBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename
  );
}

/**
 * Abrir URLs externos (WhatsApp, releases, mapas…).
 * Na WebView do Capacitor, `window.open()` é ignorado; usa-se o plugin
 * Browser (Custom Tab). Na web, janela nova normal.
 */
export async function openExternal(url: string): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
