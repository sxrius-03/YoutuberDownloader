import { useState, useEffect } from 'react';
import { 
  History, 
  RotateCw, 
  FolderOpen, 
  Search, 
  Inbox, 
  Calendar,
  HardDrive
} from 'lucide-react';
import type { HistoryItem } from '../api/bridge';
import { getHistory, openFolder } from '../api/bridge';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchHistory = () => {
    setLoading(true);
    getHistory()
      .then(data => setHistory(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleOpenFolder = async (path: string) => {
    try {
      await openFolder(path);
    } catch {
      alert("Não foi possível abrir a pasta local.");
    }
  };

  const filteredHistory = history.filter(item => 
    item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.path?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="surface-card">
      {/* Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={18} color="var(--accent-blue)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Histórico de Downloads</h3>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {history.length} arquivos baixados no total
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {history.length > 0 && (
            <div className="search-pill-container" style={{ padding: '0.3rem 0.6rem', height: '36px' }}>
              <Search size={14} color="var(--text-muted)" />
              <input 
                type="text" 
                placeholder="Filtrar histórico..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
                style={{ fontSize: '0.825rem', width: '160px' }}
              />
            </div>
          )}

          <button 
            type="button"
            onClick={fetchHistory} 
            disabled={loading}
            className="btn-icon-action"
            title="Atualizar lista"
          >
            <RotateCw size={14} className={loading ? 'spin-animation' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* History Items or Empty State */}
      {history.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          <Inbox size={40} strokeWidth={1.5} style={{ marginBottom: '0.75rem', opacity: 0.6 }} />
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nenhum download registrado</p>
          <p style={{ fontSize: '0.825rem', marginTop: '0.25rem' }}>Os vídeos e áudios que você baixar aparecerão aqui.</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Nenhum arquivo encontrado para a busca "{searchTerm}".
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {filteredHistory.map((item, idx) => {
            const isAudio = item.type?.toLowerCase().includes('audio') || item.type?.toLowerCase().includes('mp3');
            return (
              <div key={idx} className="history-item-card">
                <div style={{ minWidth: 0, flex: 1, paddingRight: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span className={`chip ${isAudio ? 'chip-audio' : 'chip-video'}`}>
                      {isAudio ? 'MP3' : 'MP4'}
                    </span>
                    <h4 
                      style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={item.title}
                    >
                      {item.title}
                    </h4>
                  </div>

                  <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.775rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <HardDrive size={12} />
                      <span>{formatBytes(item.size)}</span>
                    </div>
                    {item.date && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calendar size={12} />
                        <span>{item.date}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={() => handleOpenFolder(item.path)}
                  className="btn-icon-action"
                  title="Abrir pasta no Windows Explorer"
                >
                  <FolderOpen size={14} />
                  <span>Abrir Pasta</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
