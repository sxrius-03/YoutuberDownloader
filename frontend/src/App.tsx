import { useState } from 'react';
import SingleDownload from './components/SingleDownload';
import PlaylistDownload from './components/PlaylistDownload';
import HistoryList from './components/HistoryList';

export default function App() {
  const [activeTab, setActiveTab] = useState<'single' | 'playlist' | 'history'>('single');

  return (
    <div>
      <header style={{ marginBottom: '2rem', textAlign: 'left' }}>
        <h1>Youtube Downloader</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Versão 2.0.1 (Interface Web)</p>
      </header>

      <div className="tabs-header">
        <button 
          className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          Download Único
        </button>
        <button 
          className={`tab-btn ${activeTab === 'playlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('playlist')}
        >
          Playlist
        </button>
        <button 
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Histórico
        </button>
      </div>

      <main style={{ marginTop: '1rem' }}>
        {activeTab === 'single' && <SingleDownload />}
        {activeTab === 'playlist' && <PlaylistDownload />}
        {activeTab === 'history' && <HistoryList />}
      </main>
    </div>
  );
}
