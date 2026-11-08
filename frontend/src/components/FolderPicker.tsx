import React, { useState } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import { chooseFolder } from '../api/bridge';
import Banner from './Banner';

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
  const [error, setError] = useState('');

  const handleBrowse = async () => {
    setError('');
    try {
      const selected = await chooseFolder();
      if (selected) onChange(selected);
    } catch (e: any) {
      setError('Erro ao selecionar pasta: ' + (e?.message || String(e)));
    }
  };

  return (
    <div className="meta-field">
      <div className="field-head">
        <span className="meta-label">Salvar em</span>
        {recentPaths.length > 1 && (
          <select
            disabled={disabled}
            className="custom-select custom-select-sm"
            aria-label="Escolher uma pasta usada recentemente"
            value=""
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
          >
            <option value="" disabled>Pastas recentes</option>
            {recentPaths.map((p, idx) => (
              <option key={idx} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>

      <div className="folder-picker-bar">
        <Folder size={16} className="folder-icon" />
        <span
          className={`folder-path-text ${value ? '' : 'is-empty'}`}
          title={value || 'Nenhuma pasta escolhida'}
        >
          {value || 'Nenhuma pasta escolhida'}
        </span>
        <button
          type="button"
          className="btn-icon-action"
          onClick={handleBrowse}
          disabled={disabled}
          title="Alterar pasta de destino"
        >
          <FolderOpen size={14} />
          <span>{value ? 'Alterar' : 'Escolher pasta'}</span>
        </button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
    </div>
  );
};

export default FolderPicker;
