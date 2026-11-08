import { useState } from 'react';
import { Film, ListMusic, History, Download } from 'lucide-react';
import SingleDownload from './components/SingleDownload';
import PlaylistDownload from './components/PlaylistDownload';
import HistoryList from './components/HistoryList';
import UpdateChecker from './components/UpdateChecker';

type Tab = 'single' | 'playlist' | 'history';

const TABS: { id: Tab; label: string; Icon: typeof Film }[] = [
  { id: 'single', label: 'Download Único', Icon: Film },
  { id: 'playlist', label: 'Playlist', Icon: ListMusic },
  { id: 'history', label: 'Histórico', Icon: History },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('single');

  return (
    <div>
      <header className="app-header">
        <div className="brand-container">
          <div className="brand-badge">
            <Download size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div className="brand-title">
              <span>Youtube Downloader</span>
            </div>
            <div className="brand-subtitle">Desktop Native v2.0.9</div>
          </div>
        </div>
      </header>

      <nav className="tabs-nav" role="tablist" aria-label="Seções do aplicativo">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={activeTab === id}
            aria-controls="tab-panel"
            className={`tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main id="tab-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'single' && <SingleDownload />}
        {activeTab === 'playlist' && <PlaylistDownload />}
        {activeTab === 'history' && <HistoryList onGoToDownload={() => setActiveTab('single')} />}
      </main>

      <UpdateChecker />
    </div>
  );
}
