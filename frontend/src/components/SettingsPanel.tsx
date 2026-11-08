import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { getSettings, saveSettingProxies } from '../api/bridge';
import Banner from './Banner';

export const SettingsPanel: React.FC = () => {
  const [proxiesText, setProxiesText] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
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
      setFeedback({ kind: 'success', text: 'Proxies salvos com sucesso.' });
    } catch (e: any) {
      setFeedback({ kind: 'error', text: e?.message || String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card" data-testid="settings-panel">
      <h3 className="section-title">Ajustes</h3>
      <p className="settings-intro">
        Caminho alternativo de rede para contornar bloqueio de IP. Um proxy por linha
        (ex.: <code>http://user:senha@host:porta</code> ou <code>socks5://host:porta</code>).
        A cada download o app rotaciona entre os proxies da lista.
      </p>
      <div className="meta-field">
        <label className="meta-label" htmlFor="proxies-input">Proxies (round-robin)</label>
        <textarea
          id="proxies-input"
          className="meta-input proxy-textarea"
          placeholder={'http://user:senha@host:porta\nsocks5://host:porta\n(Deixe vazio para não usar proxy)'}
          value={proxiesText}
          onChange={(e) => { setProxiesText(e.target.value); setFeedback(null); }}
          disabled={saving}
          spellCheck={false}
        />
      </div>
      <div className="settings-actions">
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={15} />
          <span>{saving ? 'Salvando...' : 'Salvar proxies'}</span>
        </button>
      </div>
      {feedback && <Banner kind={feedback.kind}>{feedback.text}</Banner>}
    </div>
  );
};

export default SettingsPanel;
