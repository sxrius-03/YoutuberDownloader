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
  Terminal,
  Video,
  Music,
  FolderOpen
} from 'lucide-react';
import type { PlaylistVideo, Settings } from '../api/bridge';
import {
  getSettings,
  analyzePlaylist,
  startDownload,
  openFolder
} from '../api/bridge';
import FolderPicker from './FolderPicker';
import Banner from './Banner';
import { VIDEO_CONTAINERS, AUDIO_CONTAINERS } from '../containers';


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
  const [queueTotal, setQueueTotal] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [finished, setFinished] = useState(false);
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
      // Sem permissão de leitura da área de transferência: o usuário cola com Ctrl+V.
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
    setFinished(false);

    try {
      const data = await analyzePlaylist(url.trim());
      setTitle(data.title || 'Playlist do YouTube');
      setVideos(data.videos || []);
      setSelectedUrls(new Set((data.videos || []).map(v => v.url)));
    } catch (e: any) {
      setErrorMsg('Falha ao analisar a playlist: ' + (e?.message || String(e)));
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
    if (updated.has(videoUrl)) updated.delete(videoUrl);
    else updated.add(videoUrl);
    setSelectedUrls(updated);
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const handleOpenFolder = async () => {
    try {
      await openFolder(savePath);
    } catch (e: any) {
      setErrorMsg('Não foi possível abrir a pasta: ' + (e?.message || String(e)));
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedUrls.size === 0) return;
    const queue = videos.filter(v => selectedUrls.has(v.url));
    const total = queue.length;
    const chosenContainer = downloadType === 'audio' ? audioContainer : videoContainer;

    setDownloading(true);
    setFinished(false);
    setLogs([]);
    setErrorMsg('');
    setQueueTotal(total);
    setCurrentIndex(0);
    setDoneCount(0);
    setErrorCount(0);

    let ok = 0;
    let failed = 0;

    for (let i = 0; i < total; i++) {
      setCurrentIndex(i + 1);
      const v = queue[i];
      addLog(`[${i + 1}/${total}] Baixando (${chosenContainer.toUpperCase()}): ${v.title}`);

      await new Promise<void>((resolve) => {
        let cleanup: (() => void) | undefined;
        let settled = false;
        const settle = (success: boolean, msg: string) => {
          if (settled) return;
          settled = true;
          if (success) ok++; else failed++;
          setDoneCount(ok);
          setErrorCount(failed);
          addLog(msg);
          cleanup?.();
          resolve();
        };

        startDownload(
          {
            url: v.url,
            path: savePath,
            filename: v.title,
            downloadType,
            quality: 'Melhor',
            container: chosenContainer
          },
          (payload) => {
            if (payload.status === 'finished') settle(true, `Concluído: ${v.title}`);
            else if (payload.status === 'error') settle(false, `Erro em ${v.title}: ${payload.message}`);
          }
        )
          .then((fn) => {
            cleanup = fn;
            if (settled) fn(); // evento chegou antes do retorno: libera o listener agora
          })
          .catch((e: any) => settle(false, `Falha: ${v.title} - ${e?.message || String(e)}`));
      });
    }

    setDownloading(false);
    setFinished(true);
  };

  const activeFormatLabel = downloadType === 'video'
    ? videoContainer.toUpperCase()
    : audioContainer.toUpperCase();

  const processed = doneCount + errorCount;
  const progressPct = queueTotal > 0 ? Math.round((processed / queueTotal) * 100) : 0;

  return (
    <div className="surface-card">
      <div className="search-pill-container">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Cole a URL da playlist do YouTube (ex: https://youtube.com/playlist?list=...)"
          aria-label="URL da playlist do YouTube"
          disabled={loading || downloading}
          className="search-input"
        />

        {url && !loading && !downloading && (
          <button
            type="button"
            className="btn-icon-action btn-icon-only"
            onClick={() => setUrl('')}
            title="Limpar campo"
            aria-label="Limpar campo"
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
              <Loader2 size={16} className="spin-animation" />
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

      {errorMsg && <Banner kind="error">{errorMsg}</Banner>}

      {!loading && videos.length === 0 && (
        <ol className="steps-guide" aria-label="Como baixar uma playlist">
          <li><span className="step-num">1</span><span>Cole o link da playlist</span></li>
          <li><span className="step-num">2</span><span>Clique em Analisar</span></li>
          <li><span className="step-num">3</span><span>Marque os itens e baixe</span></li>
        </ol>
      )}

      {videos.length > 0 && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <div className="section-title-row">
                <ListMusic size={18} className="icon-accent" />
                <h3 className="section-title">{title}</h3>
              </div>
              <p className="section-sub">
                {videos.length} itens · <strong>{selectedUrls.size}</strong> selecionados
              </p>
            </div>

            <div className="section-tools">
              <button
                type="button"
                onClick={() => setSelectedUrls(new Set(videos.map(v => v.url)))}
                disabled={downloading}
                className="btn-icon-action"
              >
                <CheckSquare size={14} />
                <span>Todos</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedUrls(new Set())}
                disabled={downloading}
                className="btn-icon-action"
              >
                <Square size={14} />
                <span>Nenhum</span>
              </button>
            </div>
          </div>

          <div className="playlist-items-container">
            {videos.map((v, idx) => {
              const isSelected = selectedUrls.has(v.url);
              return (
                <label
                  key={v.url || idx}
                  className={`playlist-item-row ${isSelected ? 'selected' : ''} ${downloading ? 'is-locked' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectVideo(v.url)}
                    disabled={downloading}
                  />
                  <span className="playlist-item-index">{idx + 1}</span>
                  <span className="playlist-item-title">{v.title}</span>
                </label>
              );
            })}
          </div>

          <div className="field-grid field-grid-top">
            <div className="meta-field">
              <span className="meta-label">Tipo de mídia</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn ${downloadType === 'video' ? 'active' : ''}`}
                  aria-pressed={downloadType === 'video'}
                  onClick={() => setDownloadType('video')}
                  disabled={downloading}
                >
                  <Video size={14} />
                  <span>Vídeo</span>
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${downloadType === 'audio' ? 'active' : ''}`}
                  aria-pressed={downloadType === 'audio'}
                  onClick={() => setDownloadType('audio')}
                  disabled={downloading}
                >
                  <Music size={14} />
                  <span>Áudio</span>
                </button>
              </div>
            </div>

            <div className="meta-field">
              <label className="meta-label" htmlFor="playlist-container">Formato de saída</label>
              {downloadType === 'video' ? (
                <select
                  id="playlist-container"
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
                  id="playlist-container"
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
              <span className="field-hint">Playlists baixam na melhor qualidade disponível.</span>
            </div>
          </div>

          <FolderPicker
            value={savePath}
            onChange={setSavePath}
            recentPaths={settings.paths}
            disabled={downloading}
          />

          {(downloading || finished) && (
            <div className="hud-container">
              <div className="hud-header">
                <div className="hud-title">
                  {downloading && <Loader2 size={14} className="spin-animation" />}
                  <span>
                    {downloading
                      ? `Baixando item ${currentIndex} de ${queueTotal}`
                      : 'Fila finalizada'}
                  </span>
                </div>
                <span className="hud-percent">{progressPct}%</span>
              </div>
              <div
                className="hud-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
                aria-label="Progresso da fila"
              >
                <div className="hud-progress-fill" style={{ width: `${progressPct}%` }}></div>
              </div>
            </div>
          )}

          {finished && (
            <Banner
              kind={errorCount > 0 && doneCount === 0 ? 'error' : 'success'}
              actions={
                <button type="button" className="btn-icon-action" onClick={handleOpenFolder}>
                  <FolderOpen size={14} />
                  <span>Abrir pasta</span>
                </button>
              }
            >
              {doneCount} concluídos, {errorCount} com erro
            </Banner>
          )}

          <button
            type="button"
            onClick={handleDownloadSelected}
            disabled={downloading || selectedUrls.size === 0}
            className="btn-primary btn-download btn-lg"
          >
            {downloading ? (
              <>
                <Loader2 size={18} className="spin-animation" />
                <span>Baixando fila ({currentIndex}/{queueTotal})...</span>
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

      {logs.length > 0 && (
        <div className="section-block">
          <div className="log-title">
            <Terminal size={14} />
            <span>Registro de atividades</span>
          </div>
          <pre className="log-box">
            {logs.map((l, idx) => (
              <div key={idx}>{l}</div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}
