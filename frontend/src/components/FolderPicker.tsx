import React from 'react';
import { Folder, FolderOpen, History } from 'lucide-react';
import { chooseFolder } from '../api/bridge';

interface FolderPickerProps {
  value: string;
  onChange: (path: string) => void;
  recentPaths?: string[];
  disabled?: boolean;
}

export const FolderPicker: React.FC<FolderPickerProps> = ({
  value,
  onChange,
  recentPaths = [],
  disabled = false
}) => {
  const handleBrowse = async () => {
    try {
      const selected = await chooseFolder();
      if (selected) {
        onChange(selected);
      }
    } catch (e: any) {
      alert('Erro ao selecionar pasta: ' + (e?.message || String(e)));
    }
  };

  return (
    <div className="meta-field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label className="meta-label">Destino do Download</label>
        {recentPaths.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <History size={12} color="var(--text-muted)" />
            <select
              disabled={disabled}
              className="custom-select"
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', height: '24px' }}
              value=""
              onChange={(e) => {
                if (e.target.value) onChange(e.target.value);
              }}
            >
              <option value="" disabled>Recentes...</option>
              {recentPaths.map((p, idx) => (
                <option key={idx} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="folder-picker-bar">
        <Folder size={16} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
        <span className="folder-path-text" title={value || 'Nenhuma pasta selecionada'}>
          {value || 'C:\\Downloads'}
        </span>
        <button
          type="button"
          className="btn-icon-action"
          onClick={handleBrowse}
          disabled={disabled}
          title="Alterar pasta de destino"
        >
          <FolderOpen size={14} />
          <span>Alterar</span>
        </button>
      </div>
    </div>
  );
};

export default FolderPicker;
