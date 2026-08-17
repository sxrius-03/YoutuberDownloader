import { useState, useEffect } from 'react';
import { 
  Clipboard, 
  Search, 
  Download, 
  Video, 
  Music, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X,
  Gauge,
  Clock,
  FileType
} from 'lucide-react';
import type { AnalysisResult, Settings } from '../api/bridge';
import {
  getSettings,
  saveSettingPath,
  analyzeVideo,
  startDownload
} from '../api/bridge';
import FolderPicker from './FolderPicker';

const VIDEO_CONTAINERS = [
  { value: 'mp4', label: 'MP4 (Compatibilidade Universal)' },
  { value: 'mkv', label: 'MKV (Matroska / Multifaixa)' },
  { value: 'webm', label: 'WEBM (Otimizado Web)' },
  { value: 'mov', label: 'MOV (Apple / QuickTime)' },
  { value: 'avi', label: 'AVI (Legado Windows)' },
];

const AUDIO_CONTAINERS = [
  { value: 'mp3', label: 'MP3 (Padrão / Universal)' },
  { value: 'm4a', label: 'M4A (Apple AAC Alta Fidelidade)' },
  { value: 'wav', label: 'WAV (Sem Perdas / PCM)' },
  { value: 'flac', label: 'FLAC (Lossless Studio)' },
  { value: 'opus', label: 'OPUS (Baixa Latência)' },
];

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
  const [settings, setSettings] = useState<Settings>({ paths: [] });
  
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Insira a URL do vídeo para começar');
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
      // Ignore clipboard read permission failures
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setAnalysis(null);
    setIsSuccess(false);
    setErrorMsg('');
    setStatusText('Analisando informações e resoluções do vídeo...');

    try {
      const data = await analyzeVideo(url.trim());
      setAnalysis(data);
      setFilename(data.title);
      if (data.resolutions && data.resolutions.length > 0) {
        setSelectedQuality(data.resolutions[0]);
      }
      setStatusText(`Vídeo identificado com sucesso (${data.strategy || 'Padrão'})`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErrorMsg("Falha ao analisar a URL: " + msg);
      setStatusText('Erro na análise da URL');
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
    setStatusText('Iniciando processo de download...');
    
    // Salva o caminho atual nas configurações
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
            setStatusText(payload.message || 'Baixando stream...');
          } else if (payload.status === 'processing') {
            setProgress(100);
            setStatusText(payload.message || 'Processando e convertendo arquivo...');
          } else if (payload.status === 'finished') {
            setProgress(100);
            setStatusText('Download concluído com sucesso!');
            setIsSuccess(true);
            setDownloading(false);
          } else if (payload.status === 'error') {
            setErrorMsg(payload.message || 'Falha no download');
            setStatusText('Erro ao baixar');
            setDownloading(false);
          }
        }
      );
    } catch (e: any) {
      setErrorMsg("Falha de execução: " + (e?.message || String(e)));
      setStatusText('Erro no download');
      setDownloading(false);
    }
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
          placeholder="Cole ou digite a URL do YouTube (ex: https://youtube.com/watch?v=...)" 
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
              <Loader2 size={16} className="spin-animation" style={{ animation: 'spin 1s linear infinite' }} />
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

      {/* Dynamic Status / Error banner */}
      {errorMsg ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', padding: '0.75rem 1rem', backgroundColor: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 600 }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      ) : isSuccess ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', padding: '0.75rem 1rem', backgroundColor: 'var(--success-bg)', color: 'var(--success)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 600 }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span>Download finalizado com sucesso! O arquivo foi salvo na pasta destino.</span>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.825rem', marginTop: '0.75rem', paddingLeft: '0.25rem' }}>
          {statusText}
        </div>
      )}

      {/* Analyzed Media Preview Details */}
      {analysis && (
        <div className="video-preview-grid">
          {/* Left Column: Thumbnail */}
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
                <Video size={48} color="var(--text-muted)" />
              )}
              {analysis.duration && (
                <span className="duration-pill">{analysis.duration}</span>
              )}
            </div>
            {analysis.uploader && (
              <div style={{ marginTop: '0.65rem', fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Canal: <span style={{ color: 'var(--text-primary)' }}>{analysis.uploader}</span>
              </div>
            )}
          </div>

          {/* Right Column: Settings & Download Trigger */}
          <div>
            {/* Title / Filename */}
            <div className="meta-field">
              <label className="meta-label">Título do Arquivo</label>
              <input 
                type="text" 
                value={filename} 
                onChange={(e) => setFilename(e.target.value)} 
                disabled={downloading}
                className="meta-input"
              />
            </div>

            {/* Media Type & Quality/Container Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.85rem', alignItems: 'end', marginBottom: '1.1rem' }}>
              {/* Type Switcher */}
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

              {/* Resolution Picker (only for video) */}
              {downloadType === 'video' && analysis.resolutions && analysis.resolutions.length > 0 && (
                <div className="meta-field" style={{ margin: 0 }}>
                  <label className="meta-label">Resolução</label>
                  <select 
                    value={selectedQuality} 
                    onChange={(e) => setSelectedQuality(e.target.value)} 
                    disabled={downloading}
                    className="custom-select"
                  >
                    {analysis.resolutions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Container / Format Selector */}
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
            <FolderPicker 
              value={savePath} 
              onChange={setSavePath} 
              recentPaths={settings.paths} 
              disabled={downloading} 
            />

            {/* Real-time Download HUD */}
            {downloading && (
              <div className="hud-container">
                <div className="hud-header">
                  <div className="hud-title">
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Progresso do Download</span>
                  </div>
                  <span className="hud-percent">{Math.round(progress)}%</span>
                </div>

                <div className="hud-progress-track">
                  <div className="hud-progress-fill" style={{ width: `${progress}%` }}></div>
                </div>

                <div className="hud-metrics-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Gauge size={13} color="var(--text-muted)" />
                    <span>{speed || 'Calculando velocidade...'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={13} color="var(--text-muted)" />
                    <span>ETA: {eta || '--:--'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Primary Download Action Button */}
            <button 
              type="button"
              onClick={handleDownload} 
              disabled={downloading} 
              className="btn-primary"
              style={{ width: '100%', marginTop: '1.25rem', height: '46px', fontSize: '1rem', justifyContent: 'center' }}
            >
              {downloading ? (
                <>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
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
