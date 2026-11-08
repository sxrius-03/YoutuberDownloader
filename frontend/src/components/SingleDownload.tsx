import { useState, useEffect } from 'react';
import {
  Clipboard,
  Search,
  Download,
  Video,
  Music,
  FolderOpen,
  RotateCcw,
  Loader2,
  X,
  Gauge,
  Clock
} from 'lucide-react';
import type { AnalysisResult, Settings } from '../api/bridge';
import {
  getSettings,
  saveSettingPath,
  analyzeVideo,
  startDownload,
  openFolder
} from '../api/bridge';
import FolderPicker from './FolderPicker';
import Banner from './Banner';
import { VIDEO_CONTAINERS, AUDIO_CONTAINERS } from '../containers';


const formatResolutionLabel = (res: string): string => {
  const digits = res.replace(/[^\d]/g, '');
  const num = parseInt(digits, 10);
  if (isNaN(num)) {
    return res === 'Melhor' ? 'Melhor Resolução (Auto)' : res;
  }
  if (num >= 4320) return `${num}p (8K Ultra HD)`;
  if (num >= 2160) return `${num}p (4K Ultra HD)`;
  if (num >= 1440) return `${num}p (2K Quad HD)`;
  if (num >= 1080) return `${num}p (Full HD)`;
  if (num >= 720) return `${num}p (HD)`;
  if (num >= 480) return `${num}p (SD)`;
  return `${num}p`;
};

export default function SingleDownload() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedQuality, setSelectedQuality] = useState('');
  const [downloadType, setDownloadType] = useState<'video' | 'audio'>('video');
  const [videoContainer, setVideoContainer] = useState('mp4');
  const [audioContainer, setAudioContainer] = useState('mp3');
  const [filename, setFilename] = useState('');
  const [savePath, setSavePath] = useState('');
  const [settings, setSettings] = useState<Settings>({ paths: [], proxies: [] });
  
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [speed, setSpeed] = useState('');
  const [eta, setEta] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
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
    setAnalysis(null);
    setIsSuccess(false);
    setErrorMsg('');
    setStatusText('Analisando o vídeo e as resoluções disponíveis...');

    try {
      const data = await analyzeVideo(url.trim());
      setAnalysis(data);
      setFilename(data.title);
      if (data.resolutions && data.resolutions.length > 0) {
        setSelectedQuality(data.resolutions[0]);
      }
      setStatusText('');
    } catch (e: any) {
      setErrorMsg('Falha ao analisar a URL: ' + (e?.message || String(e)));
      setStatusText('');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading && !downloading && url.trim()) {
      handleAnalyze();
    }
  };

  const handleDownload = async () => {
    if (!analysis) return;
    setDownloading(true);
    setProgress(0);
    setSpeed('');
    setEta('');
    setIsSuccess(false);
    setErrorMsg('');
    setStatusText('Iniciando download...');

    saveSettingPath(savePath).catch(() => {});

    const chosenContainer = downloadType === 'audio' ? audioContainer : videoContainer;

    try {
      await startDownload(
        {
          url: url.trim(),
          path: savePath,
          filename,
          downloadType,
          quality: selectedQuality,
          container: chosenContainer,
          opts: analysis.opts
        },
        (payload) => {
          if (payload.status === 'downloading') {
            setProgress(payload.progress);
            setSpeed(payload.speed || '');
            setEta(payload.eta || '');
            setStatusText(payload.message || 'Baixando...');
          } else if (payload.status === 'processing') {
            setProgress(100);
            setStatusText(payload.message || 'Processando e convertendo o arquivo...');
          } else if (payload.status === 'finished') {
            setProgress(100);
            setStatusText('');
            setIsSuccess(true);
            setDownloading(false);
          } else if (payload.status === 'error') {
            setErrorMsg(payload.message || 'Falha no download');
            setStatusText('');
            setDownloading(false);
          }
        }
      );
    } catch (e: any) {
      setErrorMsg('Falha de execução: ' + (e?.message || String(e)));
      setStatusText('');
      setDownloading(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openFolder(savePath);
    } catch (e: any) {
      setErrorMsg('Não foi possível abrir a pasta: ' + (e?.message || String(e)));
    }
  };

  const handleReset = () => {
    setUrl('');
    setAnalysis(null);
    setFilename('');
    setProgress(0);
    setIsSuccess(false);
    setErrorMsg('');
    setStatusText('');
  };

  const activeFormatLabel = downloadType === 'video'
    ? videoContainer.toUpperCase()
    : audioContainer.toUpperCase();

  return (
    <div className="surface-card">
      <div className="search-pill-container">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Cole ou digite a URL do YouTube (ex: https://youtube.com/watch?v=...)"
          aria-label="URL do vídeo do YouTube"
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

      {isSuccess && (
        <Banner
          kind="success"
          actions={
            <>
              <button type="button" className="btn-icon-action" onClick={handleOpenFolder}>
                <FolderOpen size={14} />
                <span>Abrir pasta</span>
              </button>
              <button type="button" className="btn-icon-action" onClick={handleReset}>
                <RotateCcw size={14} />
                <span>Baixar outro</span>
              </button>
            </>
          }
        >
          Download concluído. O arquivo foi salvo na pasta de destino.
        </Banner>
      )}

      {!analysis && !loading && (
        <ol className="steps-guide" aria-label="Como baixar">
          <li><span className="step-num">1</span><span>Cole o link</span></li>
          <li><span className="step-num">2</span><span>Clique em Analisar</span></li>
          <li><span className="step-num">3</span><span>Escolha o formato e baixe</span></li>
        </ol>
      )}

      {loading && statusText && <p className="status-hint" role="status">{statusText}</p>}

      {analysis && (
        <div className="video-preview-grid">
          <div>
            <div className="thumbnail-container">
              {analysis.thumbnail ? (
                <img
                  src={analysis.thumbnail}
                  alt={analysis.title}
                  className="thumbnail-img"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <Video size={48} className="icon-muted" />
              )}
              {analysis.duration && (
                <span className="duration-pill">{analysis.duration}</span>
              )}
            </div>
            {analysis.uploader && (
              <div className="channel-line">
                Canal: <strong>{analysis.uploader}</strong>
              </div>
            )}
          </div>

          <div>
            <div className="meta-field">
              <label className="meta-label" htmlFor="single-filename">Nome do arquivo</label>
              <input
                id="single-filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                disabled={downloading}
                className="meta-input"
              />
            </div>

            <div className="field-grid">
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

              {downloadType === 'video' && analysis.resolutions && analysis.resolutions.length > 0 && (
                <div className="meta-field">
                  <label className="meta-label" htmlFor="single-quality">Resolução</label>
                  <select
                    id="single-quality"
                    value={selectedQuality}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                    disabled={downloading}
                    className="custom-select"
                  >
                    {analysis.resolutions.map(r => (
                      <option key={r} value={r}>{formatResolutionLabel(r)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="meta-field">
                <label className="meta-label" htmlFor="single-container">Formato de saída</label>
                {downloadType === 'video' ? (
                  <select
                    id="single-container"
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
                    id="single-container"
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

            <FolderPicker
              value={savePath}
              onChange={setSavePath}
              recentPaths={settings.paths}
              disabled={downloading}
            />

            {downloading && (
              <div className="hud-container">
                <div className="hud-header">
                  <div className="hud-title">
                    <Loader2 size={14} className="spin-animation" />
                    <span>{statusText || 'Baixando...'}</span>
                  </div>
                  <span className="hud-percent">{Math.round(progress)}%</span>
                </div>

                <div
                  className="hud-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                  aria-label="Progresso do download"
                >
                  <div className="hud-progress-fill" style={{ width: `${progress}%` }}></div>
                </div>

                <div className="hud-metrics-row">
                  <div className="meta-item">
                    <Gauge size={13} />
                    <span>{speed || 'Calculando velocidade...'}</span>
                  </div>
                  <div className="meta-item">
                    <Clock size={13} />
                    <span>ETA: {eta || '--:--'}</span>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="btn-primary btn-download btn-lg"
            >
              {downloading ? (
                <>
                  <Loader2 size={18} className="spin-animation" />
                  <span>Baixando {downloadType === 'video' ? 'Vídeo' : 'Áudio'} ({activeFormatLabel})...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>Baixar {downloadType === 'video' ? 'Vídeo' : 'Áudio'} ({activeFormatLabel})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
