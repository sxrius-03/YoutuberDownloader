import { useState, useEffect } from 'react';
import { 
  Clipboard, 
  Search, 
  Download, 
  CheckSquare, 
  Square, 
  ListMusic, 
  Loader2, 
  X, 
  AlertCircle,
  Terminal,
  Video,
  Music,
  FileType
} from 'lucide-react';
import type { PlaylistVideo, Settings } from '../api/bridge';
import {
  getSettings,
  analyzePlaylist,
  startDownload
} from '../api/bridge';
import FolderPicker from './FolderPicker';

const VIDEO_CONTAINERS = [
  { value: 'mp4', label: 'MP4 (Universal)' },
  { value: 'mkv', label: 'MKV (Matroska)' },
  { value: 'webm', label: 'WEBM (Web)' },
  { value: 'mov', label: 'MOV (Apple)' },
  { value: 'avi', label: 'AVI (Legado)' },
];

const AUDIO_CONTAINERS = [
  { value: 'mp3', label: 'MP3 (Universal)' },
  { value: 'm4a', label: 'M4A (Apple AAC)' },
  { value: 'wav', label: 'WAV (Sem Perdas)' },
  { value: 'flac', label: 'FLAC (Lossless)' },
  { value: 'opus', label: 'OPUS (Moderno)' },
];

export default function PlaylistDownload() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [downloadType, setDownloadType] = useState<'video' | 'audio'>('video');
  const [videoContainer, setVideoContainer] = useState('mp4');
  const [audioContainer, setAudioContainer] = useState('mp3');
  const [savePath, setSavePath] = useState('');
  const [settings, setSettings] = useState<Settings>({ paths: [] });
  const [logs, setLogs] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    getSettings()
      .then(data => {
        setSettings(data);
        if (data.paths && data.paths.length > 0) setSavePath(data.paths[0]);
      })
      .catch(() => {});
  }, []);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('http')) {
        setUrl(text.trim());
      }
    } catch {
      // Ignore
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setVideos([]);
    setTitle('');
    setSelectedUrls(new Set());
    setErrorMsg('');
    setLogs([]);

    try {
      const data = await analyzePlaylist(url.trim());
      setTitle(data.title || 'Playlist do YouTube');
      setVideos(data.videos || []);
      setSelectedUrls(new Set(data.videos.map(v => v.url)));
    } catch (e: any) {
      setErrorMsg("Falha ao analisar a playlist: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading && !downloading && url.trim()) {
      handleAnalyze();
    }
  };

  const toggleSelectVideo = (videoUrl: string) => {
    const updated = new Set(selectedUrls);
    if (updated.has(videoUrl)) {
      updated.delete(videoUrl);
    } else {
      updated.add(videoUrl);
    }
    setSelectedUrls(updated);
  };

  const handleSelectAll = () => {
    setSelectedUrls(new Set(videos.map(v => v.url)));
  };

  const handleSelectNone = () => {
    setSelectedUrls(new Set());
  };

  const handleDownloadSelected = async () => {
    if (selectedUrls.size === 0) return;
    setDownloading(true);
    setLogs([]);
    setErrorMsg('');

    const urlsToDownload = videos.filter(v => selectedUrls.has(v.url));
    const total = urlsToDownload.length;
    const chosenContainer = downloadType === 'audio' ? audioContainer : videoContainer;

    for (let i = 0; i < total; i++) {
      setCurrentIndex(i + 1);
      const v = urlsToDownload[i];
      addLog(`[${i + 1}/${total}] Baixando (${chosenContainer.toUpperCase()}): ${v.title}`);
      
      try {
        await new Promise<void>(async (resolve) => {
          try {
            const cleanup = await startDownload(
              {
                url: v.url,
                path: savePath,
                filename: v.title,
                downloadType,
                quality: 'Melhor',
                container: chosenContainer
              },
              (payload) => {
                if (payload.status === 'finished') {
                  addLog(`✅ Sucesso: ${v.title}`);
                  cleanup();
                  resolve();
                } else if (payload.status === 'error') {
                  addLog(`❌ Erro em ${v.title}: ${payload.message}`);
                  cleanup();
                  resolve();
                }
              }
            );
          } catch (e: any) {
            addLog(`❌ Falha: ${v.title} - ${e?.message || String(e)}`);
            resolve();
          }
        });
      } catch (e: any) {
        addLog(`❌ Erro inesperado: ${v.title} - ${e?.message || String(e)}`);
      }
    }
    setDownloading(false);
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const activeFormatLabel = downloadType === 'video' 
    ? videoContainer.toUpperCase() 
    : audioContainer.toUpperCase();

  return (
    <div className="surface-card">
      {/* Search & URL Input Bar */}
      <div className="search-pill-container">
        <input 
          type="text" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
          onKeyDown={handleKeyDown}
          placeholder="Cole a URL da Playlist do YouTube (ex: https://youtube.com/playlist?list=...)" 
          disabled={loading || downloading}
          className="search-input"
        />

        {url && !loading && !downloading && (
          <button 
            type="button" 
            className="btn-icon-action" 
            onClick={() => setUrl('')}
            title="Limpar campo"
            style={{ padding: '0.35rem 0.5rem' }}
          >
            <X size={14} />
          </button>
        )}

        <button 
          type="button"
          className="btn-icon-action" 
          onClick={handlePasteClipboard} 
          disabled={loading || downloading}
          title="Colar da Área de Transferência"
        >
          <Clipboard size={14} />
          <span>Colar</span>
        </button>

        <button 
          type="button"
          className="btn-primary" 
          onClick={handleAnalyze} 
          disabled={loading || downloading || !url.trim()}
        >
          {loading ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Analisando...</span>
            </>
          ) : (
            <>
              <Search size={16} />
              <span>Analisar</span>
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', padding: '0.75rem 1rem', backgroundColor: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 600 }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Playlist Content & Selection */}
      {videos.length > 0 && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          {/* Header Summary */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ListMusic size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{title}</h3>
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {videos.length} itens encontrados · <strong style={{ color: 'var(--text-primary)' }}>{selectedUrls.size}</strong> selecionados
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button 
                type="button" 
                onClick={handleSelectAll} 
                disabled={downloading} 
                className="btn-icon-action"
              >
                <CheckSquare size={14} />
                <span>Todos</span>
              </button>
              <button 
                type="button" 
                onClick={handleSelectNone} 
                disabled={downloading} 
                className="btn-icon-action"
              >
                <Square size={14} />
                <span>Nenhum</span>
              </button>
            </div>
          </div>

          {/* Video List */}
          <div className="playlist-items-container">
            {videos.map((v, idx) => {
              const isSelected = selectedUrls.has(v.url);
              return (
                <div 
                  key={v.url || idx}
                  className="playlist-item-row"
                  onClick={() => !downloading && toggleSelectVideo(v.url)}
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-surface-elevated)' : 'transparent',
                    borderColor: isSelected ? 'var(--border-subtle)' : 'transparent'
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={() => {}} 
                    disabled={downloading}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                  />
                  <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', width: '24px' }}>
                    #{idx + 1}
                  </span>
                  <span className="playlist-item-title">{v.title}</span>
                </div>
              );
            })}
          </div>

          {/* Format Selection Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginTop: '1.25rem', alignItems: 'end' }}>
            <div className="meta-field" style={{ margin: 0 }}>
              <label className="meta-label">Tipo de Mídia</label>
              <div className="segmented-control">
                <button 
                  type="button" 
                  className={`segmented-btn ${downloadType === 'video' ? 'active' : ''}`}
                  onClick={() => setDownloadType('video')}
                  disabled={downloading}
                >
                  <Video size={14} />
                  <span>Vídeo</span>
                </button>
                <button 
                  type="button" 
                  className={`segmented-btn ${downloadType === 'audio' ? 'active' : ''}`}
                  onClick={() => setDownloadType('audio')}
                  disabled={downloading}
                >
                  <Music size={14} />
                  <span>Áudio</span>
                </button>
              </div>
            </div>

            <div className="meta-field" style={{ margin: 0 }}>
              <label className="meta-label">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FileType size={12} />
                  <span>Formato de Saída</span>
                </span>
              </label>
              {downloadType === 'video' ? (
                <select 
                  value={videoContainer} 
                  onChange={(e) => setVideoContainer(e.target.value)} 
                  disabled={downloading}
                  className="custom-select"
                >
                  {VIDEO_CONTAINERS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              ) : (
                <select 
                  value={audioContainer} 
                  onChange={(e) => setAudioContainer(e.target.value)} 
                  disabled={downloading}
                  className="custom-select"
                >
                  {AUDIO_CONTAINERS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Destination Folder */}
          <div style={{ marginTop: '1.25rem' }}>
            <FolderPicker 
              value={savePath} 
              onChange={setSavePath} 
              recentPaths={settings.paths} 
              disabled={downloading} 
            />
          </div>

          {/* Download Action */}
          <button 
            type="button"
            onClick={handleDownloadSelected} 
            disabled={downloading || selectedUrls.size === 0} 
            className="btn-primary"
            style={{ width: '100%', marginTop: '1.25rem', height: '46px', fontSize: '1rem', justifyContent: 'center' }}
          >
            {downloading ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Baixando Fila ({currentIndex}/{selectedUrls.size})...</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Baixar {selectedUrls.size} Itens ({activeFormatLabel})</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Logs Drawer */}
      {logs.length > 0 && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            <Terminal size={14} />
            <span>Registro de Atividades</span>
          </div>
          <pre style={{ backgroundColor: 'var(--bg-input)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', maxHeight: '160px', overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', lineHeight: '1.6' }}>
            {logs.map((l, idx) => (
              <div key={idx}>{l}</div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}
