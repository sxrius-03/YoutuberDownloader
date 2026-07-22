import { useState, useEffect } from 'react';

interface HistoryItem {
  title: string;
  path: string;
  date: string;
  type: string;
  size: number | string;
}

function formatBytes(bytes: number | string | undefined) {
  if (bytes === undefined || bytes === null || bytes === "N/A" || bytes === "") return "Desconhecido";
  const num = Number(bytes);
  if (isNaN(num)) return "N/A";
  if (num === 0) return "0 B";
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return parseFloat((num / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function HistoryList() {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const fetchHistory = () => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => setHistory(data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleOpenFolder = async (path: string) => {
    try {
      const res = await fetch('/api/history/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (!res.ok) {
        alert("Não foi possível abrir a pasta local.");
      }
    } catch {
      alert("Erro ao tentar conectar com a API local.");
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3>Downloads Anteriores</h3>
        <button onClick={fetchHistory} className="tab-btn">Atualizar</button>
      </div>
      
      {history.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Nenhum download registrado.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {history.map((item, idx) => (
            <div 
              key={idx} 
              style={{ 
                padding: '0.8rem 1.2rem', 
                border: '1px solid var(--border)', 
                borderRadius: '8px', 
                backgroundColor: 'var(--bg-input)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                textAlign: 'left'
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.path}>
                  {item.path}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Data: {item.date} | Tamanho: {formatBytes(item.size)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                  {item.type.toUpperCase()}
                </span>
                <button 
                  onClick={() => handleOpenFolder(item.path)} 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  Abrir Pasta
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
