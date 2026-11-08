import { useState, useEffect } from 'react';
import { 
  History, 
  RotateCw, 
  FolderOpen, 
  Search, 
  Inbox, 
  Calendar,
  HardDrive,
  Film
} from 'lucide-react';
import type { HistoryItem } from '../api/bridge';
import { getHistory, openFolder } from '../api/bridge';
import Banner from './Banner';

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

const AUDIO_FORMATS = ['MP3', 'M4A', 'WAV', 'FLAC', 'OPUS'];

// "video (WEBM)" -> { format: "WEBM", isAudio: false }; sem parenteses usa o tipo cru.
function parseType(type: string | undefined) {
  const raw = (type || '').trim();
  const inParens = raw.match(/\(([^)]+)\)/)?.[1]?.trim().toUpperCase();
  const lower = raw.toLowerCase();
  const format = inParens || (raw ? raw.toUpperCase() : 'ARQUIVO');
  const isAudio = lower.includes('audio') || lower.includes('áudio') || AUDIO_FORMATS.includes(format);
  return { format, isAudio };
}

interface HistoryListProps {
  onGoToDownload?: () => void;
}

export default function HistoryList({ onGoToDownload }: HistoryListProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchHistory = () => {
    setLoading(true);
    setErrorMsg('');
    getHistory()
      .then(data => setHistory(data || []))
      .catch((e: any) => setErrorMsg('Não foi possível carregar o histórico: ' + (e?.message || String(e))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleOpenFolder = async (path: string) => {
    setErrorMsg('');
    try {
      await openFolder(path);
    } catch (e: any) {
      setErrorMsg('Não foi possível abrir a pasta: ' + (e?.message || String(e)));
    }
  };

  const term = searchTerm.toLowerCase();
  const filteredHistory = history.filter(item =>
    item.title?.toLowerCase().includes(term) ||
    item.path?.toLowerCase().includes(term)
  );

  return (
    <div className="surface-card">
      <div className="section-head">
        <div>
          <div className="section-title-row">
            <History size={18} className="icon-accent" />
            <h3 className="section-title">Histórico de Downloads</h3>
          </div>
          <p className="section-sub">
            {history.length === 1 ? '1 arquivo baixado' : `${history.length} arquivos baixados`}
          </p>
        </div>

        <div className="section-tools">
          {history.length > 0 && (
            <div className="search-pill-container search-pill-sm">
              <Search size={14} className="icon-muted" />
              <input
                type="text"
                placeholder="Filtrar histórico..."
                aria-label="Filtrar histórico"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
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

      {errorMsg && <Banner kind="error">{errorMsg}</Banner>}

      {history.length === 0 ? (
        <div className="empty-state">
          <Inbox size={40} strokeWidth={1.5} className="empty-icon" />
          <p className="empty-title">Nenhum download registrado</p>
          <p className="empty-sub">Os vídeos e áudios que você baixar aparecerão aqui.</p>
          {onGoToDownload && (
            <button type="button" className="btn-primary" onClick={onGoToDownload}>
              <Film size={16} />
              <span>Baixar um vídeo</span>
            </button>
          )}
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="empty-state empty-state-sm">
          Nenhum arquivo encontrado para a busca "{searchTerm}".
        </div>
      ) : (
        <div className="history-list">
          {filteredHistory.map((item, idx) => {
            const { format, isAudio } = parseType(item.type);
            return (
              <div key={idx} className="history-item-card">
                <div className="history-item-main">
                  <div className="history-item-title-row">
                    <span className={`chip ${isAudio ? 'chip-audio' : 'chip-video'}`}>{format}</span>
                    <h4 className="history-item-title" title={item.title}>{item.title}</h4>
                  </div>
                  <div className="history-item-meta">
                    <span className="meta-item"><HardDrive size={12} />{formatBytes(item.size)}</span>
                    {item.date && <span className="meta-item"><Calendar size={12} />{item.date}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenFolder(item.path)}
                  className="btn-icon-action"
                  title="Abrir pasta no Explorador de Arquivos"
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
