import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toast } from 'sonner';

/**
 * Descargas que FUNCIONAM no APK.
 *
 * Nem `<a download>` nem `window.open()` trabalham na WebView do Android:
 * o clique é ignorado em silêncio (foi assim que o cartão "não aparecia", e o
 * mesmo acontecia com Excel, recibos, backups e relatórios — varrimento
 * de 2026-10-24).
 *
 * v1.12.2 — A Web Share API (`navigator.share`/`canShare`) usada desde a
 * v1.8.3 TAMBÉM não existe na Android System WebView (só nos browsers):
 * `canShare` vinha `undefined`, a folha de partilha nunca abria e o recurso
 * escrevia o ficheiro em `Directory.Documents` — que no Android é a pasta
 * PRIVADA da app (`Android/data/<appId>/files/Documents/Download/`),
 * inacessível a gestores de ficheiros desde o Android 11. O utilizador via
 * "guardado" e nunca recebia ficheiro nenhum.
 *
 * Em native agora: grava na cache e abre a folha de partilha NATIVA via
 * plugin @capacitor/share (Intent.ACTION_SEND + FileProvider) —Guardar em
 * Ficheiros, Drive, imprimir, WhatsApp… Se a partilha falhar, grava em
 * Documents/Download/ e diz honestamente onde ficou. Na web: <a download>.
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
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    r.readAsDataURL(blob);
  });
  try {
    // Ficheiro na CACHE + partilha nativa (padrão oficial do @capacitor/share)
    const cached = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({
      title: filename,
      files: [cached.uri],
      dialogTitle: 'Guardar ou abrir o ficheiro',
    });
    return;
  } catch {
    /* partilha indisponível/falhou → grava em Documents e diz onde ficou */
  }
  await Filesystem.writeFile({
    path: `Download/${filename}`,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  toast.success(`Não foi possível partilhar — cópia na pasta da app: Documents/Download/${filename}`);
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

/** v1.12: aplica formato de célula «1.500,00 Kz» às colunas monetárias de uma
 *  folha XLSX (a célula continua a guardar NÚMERO → somas funcionam no Excel). */
export function formatMoneyCells(ws: any, XLSX: any): void {
  try {
    const ref = ws['!ref'];
    if (!ref) return;
    const range = XLSX.utils.decode_range(ref);
    const moneyCols: number[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const h = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
      if (h && /Kz|Valor|Montante|Total|Dízimo|Oferta/i.test(String(h.v))) moneyCols.push(c);
    }
    for (const c of moneyCols) {
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === 'number') cell.z = '#,##0.00 "Kz"';
      }
    }
  } catch { /* nunca bloqueia a exportação */ }
}


/** v1.18 (P2 «backup Android»): cópia DIRECTA para a memória do telemóvel
 *  (Documents/Backup/), sem passar pela folha de partilha. Devolve o caminho
 *  gravado, ou null na web (onde o <a download> do saveBlob já chega). */
export async function saveToDeviceBackup(blob: Blob, filename: string): Promise<string | null> {
  if (Capacitor.getPlatform() === 'web') return null;
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    r.readAsDataURL(blob);
  });
  const path = `Backup/${filename}`;
  await Filesystem.writeFile({ path, data: base64, directory: Directory.Documents, recursive: true });
  return `Documents/${path}`;
}
