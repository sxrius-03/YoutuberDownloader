import { useEffect, useState } from 'react';
import { Sparkles, Download, Loader2, X, AlertCircle } from 'lucide-react';
import { checkForUpdates, installUpdate, type UpdateInfo } from '../api/bridge';

export default function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Delay check slightly to let app initialize smoothly
    const timer = setTimeout(() => {
      checkForUpdates()
        .then((res) => {
          if (res) {
            setUpdate(res);
          }
        })
        .catch((err) => {
          console.error('Erro ao verificar atualizações:', err);
        });
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modalSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--accent-primary-bg)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Nova Atualização Disponível!
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Versão {update.latest_version} pronta para download
              </span>
            </div>
          </div>

          {!updating && (
            <button
              type="button"
              onClick={() => setUpdate(null)}
              className="btn-icon-action"
              style={{ padding: '0.35rem' }}
              title="Fechar"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                Versão Atual
              </span>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                v{update.current_version}
              </span>
            </div>
            <div style={{ color: 'var(--accent-primary)', fontSize: '1.1rem', fontWeight: 800 }}>
              ➔
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                Nova Versão
              </span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--success)' }}>
                v{update.latest_version}
              </span>
            </div>
          </div>

          {update.release_notes && (
            <div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '0.35rem',
                  display: 'block',
                }}
              >
                Notas da Atualização:
              </span>
              <div
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  fontSize: '0.775rem',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {update.release_notes}
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 0.85rem',
                backgroundColor: 'var(--error-bg)',
                color: 'var(--error)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            O aplicativo baixará o instalador oficial e iniciará a instalação de forma segura. Seu histórico e configurações locais serão preservados.
          </p>
        </div>

        {/* Modal Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <button
            type="button"
            disabled={updating}
            onClick={() => setUpdate(null)}
            className="btn-icon-action"
            style={{ padding: '0.5rem 1rem', fontSize: '0.825rem' }}
          >
            Lembrar mais tarde
          </button>

          <button
            type="button"
            disabled={updating}
            onClick={handleUpdate}
            className="btn-primary"
            style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}
          >
            {updating ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
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
