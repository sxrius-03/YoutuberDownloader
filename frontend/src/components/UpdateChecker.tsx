import { useEffect, useRef, useState } from 'react';
import { Sparkles, Download, Loader2, X, AlertCircle, ArrowRight } from 'lucide-react';
import { checkForUpdates, installUpdate, type UpdateInfo } from '../api/bridge';

export default function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Delay check slightly to let app initialize smoothly
    const timer = setTimeout(() => {
      checkForUpdates()
        .then((res) => {
          if (res) setUpdate(res);
        })
        .catch((err) => {
          console.error('Erro ao verificar atualizações:', err);
        });
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!update) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !updating) setUpdate(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [update, updating]);

  const handleUpdate = async () => {
    if (!update) return;
    setUpdating(true);
    setErrorMsg('');
    try {
      await installUpdate(update.download_url);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Falha ao baixar e iniciar o instalador. Tente novamente.');
      setUpdating(false);
    }
  };

  if (!update) return null;

  return (
    <div className="update-overlay">
      <div className="update-modal" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div className="update-header">
          <div className="update-header-main">
            <div className="update-icon">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 id="update-title" className="update-title">Nova Atualização Disponível!</h3>
              <span className="update-subtitle">Versão {update.latest_version} pronta para download</span>
            </div>
          </div>

          {!updating && (
            <button
              type="button"
              onClick={() => setUpdate(null)}
              className="btn-icon-action btn-icon-only"
              title="Fechar"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="update-body">
          <div className="update-versions">
            <div>
              <span className="update-version-label">Versão Atual</span>
              <span className="update-version-current">v{update.current_version}</span>
            </div>
            <ArrowRight size={18} className="update-arrow" aria-hidden="true" />
            <div>
              <span className="update-version-label">Nova Versão</span>
              <span className="update-version-new">v{update.latest_version}</span>
            </div>
          </div>

          {update.release_notes && (
            <div>
              <span className="update-notes-label">Notas da Atualização:</span>
              <div className="update-notes">{update.release_notes}</div>
            </div>
          )}

          {errorMsg && (
            <div className="update-error" role="alert">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <p className="update-hint">
            O aplicativo baixará o instalador oficial e iniciará a instalação de forma segura. Seu histórico e configurações locais serão preservados.
          </p>
        </div>

        <div className="update-actions">
          <button type="button" disabled={updating} onClick={() => setUpdate(null)} className="btn-ghost">
            Lembrar mais tarde
          </button>
          <button
            ref={primaryRef}
            type="button"
            disabled={updating}
            onClick={handleUpdate}
            className="btn-primary btn-download"
          >
            {updating ? (
              <>
                <Loader2 size={16} className="spin-animation" />
                <span>Baixando instalador...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Atualizar Agora</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
