import { useState } from 'react';
import { Film, ListMusic, History, Download } from 'lucide-react';
import SingleDownload from './components/SingleDownload';
import PlaylistDownload from './components/PlaylistDownload';
import HistoryList from './components/HistoryList';
import UpdateChecker from './components/UpdateChecker';

export default function App() {
  const [activeTab, setActiveTab] = useState<'single' | 'playlist' | 'history'>('single');

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
            <div className="brand-subtitle">Desktop Native v2.0.8</div>
          </div>
        </div>

        <div className="system-status-pill">
          <div className="status-dot"></div>
          <span>Pronto</span>
        </div>
      </header>

      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          <Film size={16} />
          <span>Download Único</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'playlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('playlist')}
        >
          <ListMusic size={16} />
          <span>Playlist</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={16} />
          <span>Histórico</span>
        </button>
      </nav>

      <main>
        {activeTab === 'single' && <SingleDownload />}
        {activeTab === 'playlist' && <PlaylistDownload />}
        {activeTab === 'history' && <HistoryList />}
      </main>

      <UpdateChecker />
    </div>
  );
}

