import { useState, useEffect } from 'react';

interface AnalysisResult {
  title: string;
  resolutions: string[];
  opts: any;
  strategy: string;
}

interface Settings {
  paths: string[];
}

export default function SingleDownload() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedQuality, setSelectedQuality] = useState('');
  const [downloadType, setDownloadType] = useState<'video' | 'audio'>('video');
  const [filename, setFilename] = useState('');
  const [savePath, setSavePath] = useState('');
  const [settings, setSettings] = useState<Settings>({ paths: [] });
  
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Aguardando...');
  const [speed, setSpeed] = useState('');
  const [eta, setEta] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        if (data.paths && data.paths.length > 0) setSavePath(data.paths[0]);
      })
      .catch(() => {});
  }, []);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!res.ok) throw new Error("Erro na análise");
      const data: AnalysisResult = await res.json();
      setAnalysis(data);
      setFilename(data.title);
      if (data.resolutions.length > 0) setSelectedQuality(data.resolutions[0]);
      setStatusText(`Pronto (Modo: ${data.strategy})`);
    } catch (e: any) {
      alert("Falha ao analisar a URL: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!analysis) return;
    setDownloading(true);
    setProgress(0);
    setStatusText('Iniciando...');
    
    // Salva o caminho atual nas configurações
    await fetch('/api/settings/path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: savePath })
    });

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          path: savePath,
          filename,
          type: downloadType,
          quality: selectedQuality,
          opts: analysis.opts
        })
      });
      if (!res.ok) throw new Error("Erro ao iniciar download");
      const { task_id } = await res.json();

      // Conecta ao EventSource
      const eventSource = new EventSource(`/api/download/progress/${task_id}`);
      
      // Armazena no ref do objeto para fechar caso o componente desmonte
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'ping') return;
        
        if (data.status === 'downloading') {
          setProgress(data.progress);
          setSpeed(data.speed);
          setEta(data.eta);
          setStatusText(data.message);
        } else if (data.status === 'processing') {
          setProgress(100);
          setStatusText(data.message);
        } else if (data.status === 'finished') {
          setProgress(100);
          setStatusText(data.message);
          setDownloading(false);
          eventSource.close();
        } else if (data.status === 'error') {
          setStatusText(data.message);
          setDownloading(false);
          eventSource.close();
        }
      };
      eventSource.onerror = () => {
        setStatusText("Erro de conexão no stream");
        setDownloading(false);
        eventSource.close();
      };
    } catch (e: any) {
      setStatusText("Falha: " + e.message);
      setDownloading(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input 
          type="text" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
          placeholder="Cole a URL do vídeo do YouTube aqui..." 
          disabled={loading || downloading}
          style={{ flex: 1 }}
        />
        <button onClick={handleAnalyze} disabled={loading || downloading}>
          {loading ? 'Analisando...' : 'Analisar'}
        </button>
      </div>

      <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{statusText}</div>

      {analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Nome do Arquivo:</label>
            <input 
              type="text" 
              value={filename} 
              onChange={(e) => setFilename(e.target.value)} 
              disabled={downloading}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <input 
                type="radio" 
                name="type" 
                checked={downloadType === 'video'} 
                onChange={() => setDownloadType('video')}
                disabled={downloading}
              />
              Vídeo (MP4)
            </label>
            <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <input 
                type="radio" 
                name="type" 
                checked={downloadType === 'audio'} 
                onChange={() => setDownloadType('audio')}
                disabled={downloading}
              />
              Áudio (MP3)
            </label>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span>Qualidade:</span>
              <select value={selectedQuality} onChange={(e) => setSelectedQuality(e.target.value)} disabled={downloading}>
                {analysis.resolutions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Salvar em:</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                value={savePath} 
                onChange={(e) => setSavePath(e.target.value)} 
                disabled={downloading}
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                onClick={async () => {
                  try {
                    const res = await fetch('/api/settings/choose-path', { method: 'POST' });
                    if (!res.ok) throw new Error("Erro");
                    const data = await res.json();
                    if (data.path) setSavePath(data.path);
                  } catch (e: any) {
                    alert("Erro ao selecionar pasta: " + e.message);
                  }
                }} 
                disabled={downloading}
                style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px' }}
                title="Escolher Pasta"
              >
                📁
              </button>
              <select onChange={(e) => setSavePath(e.target.value)} style={{ maxWidth: '200px' }} value={savePath} disabled={downloading}>
                <option value="">Recentes...</option>
                {settings.paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {downloading && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="progress-container">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
            <span className="progress-text">{Math.round(progress)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span>Velocidade: {speed}</span>
            <span>ETA: {eta}</span>
          </div>
        </div>
      )}

      {analysis && (
        <button 
          onClick={handleDownload} 
          disabled={downloading} 
          style={{ width: '100%', marginTop: '1.5rem', backgroundColor: 'var(--success)', height: '50px' }}
        >
          {downloading ? 'Baixando...' : 'BAIXAR'}
        </button>
      )}
    </div>
  );
}
