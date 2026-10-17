import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { getSettings, saveSettingProxies } from '../api/bridge';

export const SettingsPanel: React.FC = () => {
  const [proxiesText, setProxiesText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => setProxiesText((s.proxies || []).join('\n')))
      .catch(() => { /* preview web sem backend: segue com textarea vazia */ });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveSettingProxies(proxiesText.split('\n'));
      setProxiesText((saved.proxies || []).join('\n'));
      setFeedback('Proxies salvos com sucesso.');
    } catch (e: any) {
      setFeedback(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card" data-testid="settings-panel">
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Ajustes</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
        Caminho alternativo de rede para contornar bloqueio de IP. Um proxy por linha
        (ex.: <code>http://user:senha@host:porta</code> ou <code>socks5://host:porta</code>).
        A cada download o app rotaciona entre os proxies da lista.
      </p>
      <div className="meta-field">
        <label className="meta-label" htmlFor="proxies-input">Proxies (round-robin)</label>
        <textarea
          id="proxies-input"
          className="proxy-textarea"
          placeholder={'http://user:senha@host:porta\nsocks5://host:porta\n(Deixe vazio para não usar proxy)'}
          value={proxiesText}
          onChange={(e) => { setProxiesText(e.target.value); setFeedback(null); }}
          disabled={saving}
          spellCheck={false}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={15} />
          <span>{saving ? 'Salvando...' : 'Salvar proxies'}</span>
        </button>
        {feedback && <span className="feedback-text" role="status">{feedback}</span>}
      </div>
    </div>
  );
};

export default SettingsPanel;
