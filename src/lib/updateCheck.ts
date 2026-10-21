import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/**
 * Aviso de atualização dentro da app.
 * Consulta a release mais recente no GitHub e compara com a versão embutida
 * no build (__APP_VERSION__, injetado pelo vite.config a partir do package.json).
 * Sem plugins pagos, sem servidor próprio: a API pública de releases basta.
 */
export const REPO_RELEASES_API =
  'https://api.github.com/repos/cadupaulino99/Gestao_IESA_Emanuel_App/releases/latest';

export function currentVersion(): string {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d !== 0) return d; // >0 se b (remota) for maior
  }
  return 0;
}

export interface UpdateInfo {
  tag: string;          // ex.: "v1.5.4"
  apkUrl: string;       // download direto do APK assinado
  pageUrl: string;      // página da release
}

const LS_LAST = 'update-last-check';
const LS_TAG = 'update-latest-tag';

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    // no máximo 1 consulta por hora por dispositivo (rate limit da API pública)
    const last = Number(localStorage.getItem(LS_LAST) || 0);
    if (Date.now() - last < 60 * 60 * 1000) {
      const tag = localStorage.getItem(LS_TAG);
      if (!tag) return null;
      return compareVersions(currentVersion(), tag) > 0 ? infoFor(tag) : null;
    }
    localStorage.setItem(LS_LAST, String(Date.now()));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(REPO_RELEASES_API, {
      signal: ctrl.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    const tag: string = j?.tag_name || '';
    if (!tag) return null;
    localStorage.setItem(LS_TAG, tag);
    if (compareVersions(currentVersion(), tag) > 0) return infoFor(tag);
    return null;
  } catch {
    return null; // sem internet / sem quota: silêncio, nunca bloqueia a app
  }
}

function infoFor(tag: string): UpdateInfo {
  const base = 'https://github.com/cadupaulino99/Gestao_IESA_Emanuel_App';
  return {
    tag,
    apkUrl: `${base}/releases/download/${tag}/app-release.apk`,
    pageUrl: `${base}/releases/tag/${tag}`,
  };
}

export async function openUpdate(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Abre numa Custom Tab do Chrome -> o download do APK começa logo
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
