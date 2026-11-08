import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface BannerProps {
  kind: 'error' | 'success';
  children: ReactNode;
  actions?: ReactNode;
}

// Faixa de feedback reutilizada por todas as abas (erro/sucesso).
export default function Banner({ kind, children, actions }: BannerProps) {
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={16} className="banner-icon" />
      <span className="banner-text">{children}</span>
      {actions && <div className="banner-actions">{actions}</div>}
    </div>
  );
}
