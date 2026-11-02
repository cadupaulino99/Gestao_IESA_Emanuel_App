import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/**
 * Aviso de atualização dentro da app.
 * Consulta a release mais recente no GitHub e compara com a versão embutida
 * no build (__APP_VERSION__, injetado pelo vite.config a partir do package.json).
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
  tag: string;
  apkUrl: string;
  pageUrl: string;
}

const LS_LAST = 'update-last-check';
const LS_TAG = 'update-latest-tag';
const LS_APK = 'update-latest-apk';
const THROTTLE = 10 * 60 * 1000; // 10 min

export function lastKnownTag(): string | null {
  try {
    return localStorage.getItem(LS_TAG);
  } catch {
    return null;
  }
}

let retryScheduled = false;
function scheduleRetry(): void {
  if (retryScheduled) return;
  retryScheduled = true;
  setTimeout(() => {
    retryScheduled = false;
    window.dispatchEvent(new CustomEvent('iesa:update-retry'));
  }, 45_000);
}

function infoFor(tag: string, apkUrl?: string | null): UpdateInfo {
  const base = 'https://github.com/cadupaulino99/Gestao_IESA_Emanuel_App';
  const cached = (() => {
    try {
      return localStorage.getItem(LS_APK);
    } catch {
      return null;
    }
  })();
  return {
    tag,
    apkUrl:
      apkUrl ||
      cached ||
      `${base}/releases/download/${tag}/app-release.apk`,
    pageUrl: `${base}/releases/tag/${tag}`,
  };
}

function pickApkUrl(assets: any[] | undefined, tag: string): string | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const release =
    assets.find((a) => /release/i.test(String(a?.name || '')) && /\.apk$/i.test(String(a?.name || ''))) ||
    assets.find((a) => /\.apk$/i.test(String(a?.name || '')));
  return release?.browser_download_url || null;
}

export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  try {
    const last = Number(localStorage.getItem(LS_LAST) || 0);
    const cachedTag = localStorage.getItem(LS_TAG);

    // Throttle: ainda assim devolve update se a tag em cache for mais nova
    if (!force && Date.now() - last < THROTTLE) {
      if (cachedTag && compareVersions(currentVersion(), cachedTag) > 0) {
        return infoFor(cachedTag);
      }
      return null;
    }

    localStorage.setItem(LS_LAST, String(Date.now()));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(REPO_RELEASES_API, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub exige User-Agent; sem isto alguns aparelhos recebem 403
        'User-Agent': 'Gestao-IESA-Emanuel-App',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    clearTimeout(t);
    if (!res.ok) {
      scheduleRetry();
      if (cachedTag && compareVersions(currentVersion(), cachedTag) > 0) {
        return infoFor(cachedTag);
      }
      return null;
    }
    const j = await res.json();
    const tag: string = j?.tag_name || '';
    if (!tag) return null;
    const apkUrl = pickApkUrl(j?.assets, tag);
    localStorage.setItem(LS_TAG, tag);
    if (apkUrl) {
      try {
        localStorage.setItem(LS_APK, apkUrl);
      } catch {
        /* quota */
      }
    }
    if (compareVersions(currentVersion(), tag) > 0) return infoFor(tag, apkUrl);
    return null;
  } catch {
    scheduleRetry();
    try {
      const cachedTag = localStorage.getItem(LS_TAG);
      if (cachedTag && compareVersions(currentVersion(), cachedTag) > 0) {
        return infoFor(cachedTag);
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

export async function openUpdate(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
