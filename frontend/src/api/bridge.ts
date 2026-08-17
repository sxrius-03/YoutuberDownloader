import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface AnalysisResult {
  title: string;
  resolutions: string[];
  opts?: any;
  strategy?: string;
  thumbnail?: string;
  duration?: string;
  uploader?: string;
}

export interface PlaylistVideo {
  title: string;
  url: string;
}

export interface PlaylistResult {
  title: string;
  videos: PlaylistVideo[];
}

export interface Settings {
  paths: string[];
}

export interface DownloadProgressPayload {
  task_id: string;
  status: string;
  progress: number;
  speed: string;
  eta: string;
  message: string;
}

export interface HistoryItem {
  title: string;
  path: string;
  date: string;
  type: string;
  size: number | string;
}

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
};

export async function getSettings(): Promise<Settings> {
  if (isTauri()) {
    return invoke<Settings>('get_settings');
  }
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error('Falha ao carregar configurações');
  return res.json();
}

export async function saveSettingPath(path: string): Promise<Settings> {
  if (isTauri()) {
    return invoke<Settings>('save_setting_path', { path });
  }
  const res = await fetch('/api/settings/path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  if (!res.ok) throw new Error('Falha ao salvar caminho');
  return res.json();
}

export async function chooseFolder(): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('choose_folder');
  }
  const res = await fetch('/api/settings/choose-path', { method: 'POST' });
  if (!res.ok) throw new Error('Erro ao abrir seletor de pasta');
  const data = await res.json();
  return data.path || null;
}

export async function analyzeVideo(url: string): Promise<AnalysisResult> {
  if (isTauri()) {
    return invoke<AnalysisResult>('analyze_video', { url });
  }
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Falha na análise');
  }
  return res.json();
}

export async function analyzePlaylist(url: string): Promise<PlaylistResult> {
  if (isTauri()) {
    return invoke<PlaylistResult>('analyze_playlist', { url });
  }
  const res = await fetch('/api/analyze-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Falha na análise da playlist');
  }
  return res.json();
}

export async function getHistory(): Promise<HistoryItem[]> {
  if (isTauri()) {
    return invoke<HistoryItem[]>('get_history');
  }
  const res = await fetch('/api/history');
  if (!res.ok) return [];
  return res.json();
}

export async function openFolder(path: string): Promise<void> {
  if (isTauri()) {
    return invoke('open_folder', { path });
  }
  const res = await fetch('/api/history/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  if (!res.ok) throw new Error('Não foi possível abrir a pasta local');
}

export interface StartDownloadParams {
  url: string;
  path: string;
  filename: string;
  downloadType: 'video' | 'audio';
  quality: string;
  container?: string;
  opts?: any;
}

export async function startDownload(
  params: StartDownloadParams,
  onProgress: (payload: DownloadProgressPayload) => void
): Promise<() => void> {
  const taskId = Math.random().toString(36).substring(7);

  if (isTauri()) {
    const unlisten = await listen<DownloadProgressPayload>('download-progress', (event) => {
      const data = event.payload;
      if (data.task_id === taskId) {
        onProgress(data);
      }
    });

    try {
      await invoke('start_download', {
        taskId,
        url: params.url,
        path: params.path,
        filename: params.filename,
        downloadType: params.downloadType,
        quality: params.quality,
        container: params.container || (params.downloadType === 'audio' ? 'mp3' : 'mp4')
      });
    } catch (err) {
      unlisten();
      throw err;
    }

    return unlisten;
  }

  // FastAPI SSE Flow
  const res = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: params.url,
      path: params.path,
      filename: params.filename,
      type: params.downloadType,
      quality: params.quality,
      opts: params.opts || {}
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erro ao iniciar download');
  }

  const { task_id } = await res.json();
  const eventSource = new EventSource(`/api/download/progress/${task_id}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.status === 'ping') return;

      onProgress({
        task_id,
        status: data.status,
        progress: data.progress ?? 0,
        speed: data.speed ?? '',
        eta: data.eta ?? '',
        message: data.message ?? ''
      });

      if (data.status === 'finished' || data.status === 'error') {
        eventSource.close();
      }
    } catch {
      // Ignore parse errors
    }
  };

  eventSource.onerror = () => {
    onProgress({
      task_id,
      status: 'error',
      progress: 0,
      speed: '',
      eta: '',
      message: 'Erro de conexão no stream de download'
    });
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  release_notes: string;
  download_url: string;
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  if (isTauri()) {
    return invoke<UpdateInfo | null>('check_for_updates');
  }
  return null;
}

export async function installUpdate(downloadUrl: string): Promise<void> {
  if (isTauri()) {
    return invoke('install_update', { downloadUrl });
  }
}

