import { useState, useEffect } from 'react';

interface PlaylistVideo {
  title: string;
  url: string;
}

interface Settings {
  paths: string[];
}

export default function PlaylistDownload() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [savePath, setSavePath] = useState('');
  const [settings, setSettings] = useState<Settings>({ paths: [] });
  const [logs, setLogs] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

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
    setVideos([]);
    setTitle('');
    setSelectedUrls(new Set());
    try {
      const res = await fetch('/api/analyze-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!res.ok) throw new Error("Erro na análise da playlist");
      const data = await res.json();
      setTitle(data.title);
      setVideos(data.videos);
      setSelectedUrls(new Set(data.videos.map((v: PlaylistVideo) => v.url)));
    } catch (e: any) {
      alert("Falha ao analisar a playlist: " + e.message);
    } finally {
      setLoading(false);
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

    const urlsToDownload = videos.filter(v => selectedUrls.has(v.url));
    const total = urlsToDownload.length;

    for (let i = 0; i < total; i++) {
      const v = urlsToDownload[i];
      addLog(`[${i + 1}/${total}] Iniciando download de: ${v.title}`);
      
      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: v.url,
            path: savePath,
            filename: v.title,
            type: 'video',
            quality: 'Melhor',
            opts: {}
          })
        });
        if (!res.ok) throw new Error("Falha na inicialização");
        const { task_id } = await res.json();

        // Aguarda a conclusão via SSE de forma síncrona para fila sequencial
        await new Promise<void>((resolve) => {
          const eventSource = new EventSource(`/api/download/progress/${task_id}`);
          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.status === 'ping') return;
            
            if (data.status === 'finished') {
              addLog(`✅ Sucesso: ${v.title}`);
              eventSource.close();
              resolve();
            } else if (data.status === 'error') {
              addLog(`❌ Erro: ${v.title} - ${data.message}`);
              eventSource.close();
              resolve(); 
            }
          };
          eventSource.onerror = () => {
            addLog(`❌ Erro de Conexão com SSE para: ${v.title}`);
            eventSource.close();
            resolve();
          };
        });
      } catch (e: any) {
        addLog(`❌ Falha: ${v.title} - ${e.message}`);
      }
    }
    setDownloading(false);
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input 
          type="text" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
          placeholder="Cole a URL da Playlist aqui..." 
          disabled={loading || downloading}
          style={{ flex: 1 }}
        />
        <button onClick={handleAnalyze} disabled={loading || downloading}>
          {loading ? 'Analisando...' : 'Analisar'}
        </button>
      </div>

      {videos.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Playlist: {title}</h3>
          
          <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
            <button onClick={handleSelectAll} disabled={downloading} className="tab-btn">Todos</button>
            <button onClick={handleSelectNone} disabled={downloading} className="tab-btn">Nenhum</button>
          </div>

          <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem', marginBottom: '1rem' }}>
            {videos.map(v => (
              <label key={v.url} style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={selectedUrls.has(v.url)} 
                  onChange={() => toggleSelectVideo(v.url)} 
                  disabled={downloading}
                />
                <span style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</span>
              </label>
            ))}
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

          <button onClick={handleDownloadSelected} disabled={downloading || selectedUrls.size === 0} style={{ width: '100%', backgroundColor: 'var(--success)' }}>
            {downloading ? 'Processando Fila...' : `Baixar selecionados (${selectedUrls.size})`}
          </button>
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4>Logs de Download:</h4>
          <pre style={{ backgroundColor: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', fontSize: '0.85rem', fontFamily: 'monospace', textAlign: 'left' }}>
            {logs.map((l, idx) => <div key={idx}>{l}</div>)}
          </pre>
        </div>
      )}
    </div>
  );
}
