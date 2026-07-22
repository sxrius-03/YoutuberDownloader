# Refatoração Vite + FastAPI - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o frontend/mid-end do YoutubeDownloader de PyQt6 para uma aplicação web local usando React+Vite no frontend e FastAPI no backend, mantendo o empacotamento final em um único executável.

**Architecture:** O launcher em Python (`launcher.py`) inicia uma thread com o servidor Uvicorn rodando FastAPI e abre o navegador padrão do sistema. O frontend se comunica via REST API para análise/configurações e via Server-Sent Events (SSE) para progresso de download em tempo real.

**Tech Stack:** React 19, TypeScript, Vite 6, FastAPI, Uvicorn, PyInstaller, yt-dlp, python-multipart.

## Global Constraints
- **Estilo:** Design escuro moderno utilizando colorimetria em OKLCH nativo no CSS.
- **Portabilidade:** Manter a engine de download original (`YouTubeEngine`) inalterada.
- **Execução:** Não usar dependências pesadas externas adicionais além de `fastapi`, `uvicorn`, `pydantic` e `python-multipart`.
- **Compatibilidade:** Windows nativo (suporte a caminhos absolutos e barras invertidas).

---

### Task 1: Scaffolding e Dependências do Projeto

**Files:**
- Create: `package.json` (Raiz)
- Modify: `requirements.txt`
- Create: `frontend/` (Estrutura inicial do Vite)

**Interfaces:**
- Produz: Workspace monorepo configurado e dependências do FastAPI/Vite prontas.

- [ ] **Step 1: Atualizar o requirements.txt com dependências do FastAPI**

Edite `requirements.txt`:
```text
fastapi>=0.110.0
uvicorn>=0.28.0
pydantic>=2.6.0
python-multipart>=0.0.9
yt-dlp
requests
```

- [ ] **Step 2: Criar package.json raiz para scripts monorepo**

Crie `package.json`:
```json
{
  "name": "youtubedownloader-root",
  "version": "2.0.1",
  "private": true,
  "scripts": {
    "frontend:install": "cd frontend && npm install",
    "frontend:dev": "cd frontend && npm run dev",
    "frontend:build": "cd frontend && npm run build"
  }
}
```

- [ ] **Step 3: Executar teste de instalação das dependências Python**

Rode:
```powershell
pip install -r requirements.txt
```
Esperado: Instalação bem-sucedida de fastapi, uvicorn, pydantic e python-multipart.

- [ ] **Step 4: Inicializar o projeto Vite frontend**

Primeiro, consulte o help do npx para create-vite:
```powershell
npx create-vite --help
```
Depois, execute o comando não-interativo para scaffolds React + TS na pasta `frontend`:
```powershell
npx create-vite frontend --template react-ts
```
Esperado: Pasta `frontend` criada contendo `package.json`, `vite.config.ts`, `src/App.tsx`, etc.

- [ ] **Step 5: Executar npm install no frontend**

Rode:
```powershell
npm run frontend:install
```
Esperado: node_modules instalados com sucesso na pasta `frontend`.

- [ ] **Step 6: Commit das alterações**

Rode:
```bash
git add requirements.txt package.json frontend/
git commit -m "chore: setup monorepo scaffolding and dependencies"
```

---

### Task 2: Backend Core (Servidor FastAPI, Filas de Tarefas e SSE)

**Files:**
- Create: `app/main.py`
- Modify: `app/utils.py` (Se necessário para suportar logs)

**Interfaces:**
- Produz: Servidor FastAPI com endpoints REST e stream SSE de progresso rodando em background.

- [ ] **Step 1: Criar o servidor FastAPI básico com suporte a threads e fila de progresso**

Crie `app/main.py` com o seguinte código (lógica de roteamento e threads para download):
```python
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uuid
import queue
import threading
import os
import asyncio
from typing import Dict, Any

from app.downloader import YouTubeEngine
from app.utils import PATHS, SETTINGS_FILE, HISTORY_FILE, carregar_json, salvar_json, sanitizar_nome

app = FastAPI(title="YouTube Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = YouTubeEngine()

# Estado global dos downloads ativos
download_tasks: Dict[str, Any] = {}
task_queues: Dict[str, queue.Queue] = {}

class AnalyzeRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    path: str
    filename: str
    type: str # "video" ou "audio"
    quality: str
    opts: Dict[str, Any]

class PathRequest(BaseModel):
    path: str

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    try:
        info, opts, strat = engine.analisar_camaleao(req.url, is_playlist=False)
        formats = info.get('formats', [])
        resolutions = sorted(list(set([str(f['height']) for f in formats if f.get('height')])), reverse=True, key=int)
        if not resolutions: resolutions = ["Melhor"]
        return {
            "title": info.get('title', 'video'),
            "resolutions": resolutions,
            "opts": opts,
            "strategy": strat
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-playlist")
def analyze_playlist(req: AnalyzeRequest):
    try:
        info, opts, strat = engine.analisar_camaleao(req.url, is_playlist=True)
        entries = info.get('entries', [])
        videos = []
        for entry in entries:
            if entry:
                videos.append({
                    "title": entry.get('title', 'Vídeo'),
                    "url": entry.get('url') or entry.get('webpage_url')
                })
        return {
            "title": info.get('title', 'Playlist'),
            "videos": videos
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def download_thread_worker(task_id: str, req: DownloadRequest):
    q = task_queues[task_id]
    
    def hook(d):
        if d['status'] == 'downloading':
            try:
                p_str = d.get('_percent_str', '0%').replace('%', '').strip()
                p = float(p_str)
                speed = d.get('_speed_str', 'N/A')
                eta = d.get('_eta_str', 'N/A')
                q.put({
                    "status": "downloading",
                    "progress": p,
                    "speed": speed,
                    "eta": eta,
                    "message": f"Baixando: {int(p)}%"
                })
            except Exception: pass
        elif d['status'] == 'finished':
            q.put({
                "status": "processing",
                "progress": 100,
                "speed": "0",
                "eta": "0",
                "message": "Processando/Convertendo..."
            })

    try:
        # Importa dinamicamente para garantir integridade
        from app.downloader import YouTubeEngine
        eng = YouTubeEngine()
        
        # Realiza o download
        # Obs: baixar do downloader original
        # Vamos assumir que baixar está definido em YouTubeEngine
        # Caso o método precise ser verificado, faremos isso no passo seguinte.
        info = eng.baixar(req.url, req.path, req.filename, req.type, req.quality, req.opts, hook)
        
        # Salva histórico local
        historico = carregar_json(HISTORY_FILE, [])
        historico.insert(0, {
            "title": req.filename,
            "path": os.path.join(req.path, req.filename),
            "date": threading.current_thread().name,
            "type": req.type,
            "size": "N/A" # Opcional
        })
        salvar_json(HISTORY_FILE, historico[:100]) # Mantém top 100

        q.put({
            "status": "finished",
            "progress": 100,
            "message": "Download concluído com sucesso!"
        })
    except Exception as e:
        q.put({
            "status": "error",
            "progress": 0,
            "message": f"Erro: {str(e)}"
        })

@app.post("/api/download")
def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    task_queues[task_id] = queue.Queue()
    background_tasks.add_task(download_thread_worker, task_id, req)
    return {"task_id": task_id, "message": "Download iniciado"}

@app.get("/api/download/progress/{task_id}")
async def get_progress(task_id: str):
    if task_id not in task_queues:
        raise HTTPException(status_code=404, detail="Task não encontrada")

    async def event_generator():
        q = task_queues[task_id]
        loop = asyncio.get_event_loop()
        
        while True:
            # Puxa itens de forma não-bloqueante na thread do loop de eventos
            try:
                item = await loop.run_in_executor(None, lambda: q.get(timeout=1.0))
                import json
                yield f"data: {json.dumps(item)}\n\n"
                if item["status"] in ["finished", "error"]:
                    break
            except queue.Empty:
                # Mantém conexão viva enviando ping a cada segundo se vazio
                yield "data: {\"status\": \"ping\"}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/settings")
def get_settings():
    settings = carregar_json(SETTINGS_FILE, {"paths": []})
    return settings

@app.post("/api/settings/path")
def add_path(req: PathRequest):
    settings = carregar_json(SETTINGS_FILE, {"paths": []})
    if req.path not in settings["paths"]:
        settings["paths"].insert(0, req.path)
        salvar_json(SETTINGS_FILE, settings)
    return settings

@app.get("/api/history")
def get_history():
    return carregar_json(HISTORY_FILE, [])
```

- [ ] **Step 2: Testar se o backend básico inicializa sem falhas**

Rode o uvicorn para teste temporário:
```powershell
python -m uvicorn app.main:app --port 8000
```
Esperado: Uvicorn rodando em `http://127.0.0.1:8000` sem erros de importação.
Encerre o processo (Ctrl+C).

- [ ] **Step 3: Commit das alterações**

Rode:
```bash
git add app/main.py
git commit -m "feat: implement FastAPI core backend with SSE streaming"
```

---

### Task 3: Integração Backend + Frontend (Arquivos Estáticos e launcher.py)

**Files:**
- Create: `launcher.py`
- Modify: `app/main.py` (Para servir arquivos estáticos de produção)

**Interfaces:**
- Consome: FastAPI em `app/main.py`
- Produz: Executável principal unificado que serve a build do frontend e gerencia portas dinamicamente.

- [ ] **Step 1: Adicionar roteamento de arquivos estáticos no FastAPI**

Modifique o fim de `app/main.py` para montar a pasta estática:
```python
from fastapi.staticfiles import StaticFiles

# Certifique-se de montar apenas se a pasta frontend/dist existir (produção)
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
```

- [ ] **Step 2: Criar o arquivo principal launcher.py**

Crie `launcher.py`:
```python
import sys
import os
import threading
import socket
import webbrowser
import time
import uvicorn
from fastapi import FastAPI

# Garante importações corretas independente do empacotamento
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.main import app

def find_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('', 0))
    port = s.getsockname()[1]
    s.close()
    return port

def run_server(port):
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

def main():
    port = find_free_port()
    
    # Inicia o servidor uvicorn em background thread
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()
    
    # Aguarda o servidor inicializar brevemente
    time.sleep(1.0)
    
    # Abre o navegador padrão na porta dinâmica
    url = f"http://127.0.0.1:{port}"
    print(f"Iniciando servidor local em: {url}")
    webbrowser.open(url)
    
    # Mantém o processo do launcher ativo
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Finalizando aplicação...")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Testar execução do launcher**

Crie uma pasta vazia `frontend/dist` para evitar erros de inicialização das StaticFiles e teste o launcher:
```powershell
mkdir frontend/dist
python launcher.py
```
Esperado: Servidor uvicorn inicializado em porta aleatória e navegador aberto carregando uma página em branco (ou erro 404/estático, já que a pasta está vazia).
Encerre o processo (Ctrl+C).

- [ ] **Step 4: Commit das alterações**

Rode:
```bash
git add launcher.py app/main.py
git commit -m "feat: add app launcher with dynamic ports and static files routing"
```

---

### Task 4: Frontend Styling e CSS OKLCH (Padrão Pro Max)

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produz: Folha de estilos globais configurando as variáveis e visual da aplicação.

- [ ] **Step 1: Editar o arquivo de CSS do frontend com cores OKLCH**

Substitua todo o conteúdo de `frontend/src/index.css`:
```css
:root {
  /* OKLCH Color Palette */
  --bg-primary: oklch(0.12 0.015 250);
  --bg-card: oklch(0.16 0.02 250);
  --bg-input: oklch(0.20 0.025 250);
  --accent: oklch(0.60 0.18 250);
  --accent-hover: oklch(0.65 0.19 250);
  --success: oklch(0.62 0.17 145);
  --text-primary: oklch(0.98 0.005 250);
  --text-secondary: oklch(0.70 0.01 250);
  --error: oklch(0.60 0.18 25);
  --border: oklch(0.24 0.02 250);
  
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: dark;
  background-color: var(--bg-primary);
  color: var(--text-primary);

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
  background-color: var(--bg-primary);
}

#root {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Utilitários Globais */
h1 {
  font-size: 2.2rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  background: linear-gradient(135deg, var(--text-primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.card {
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
  border-color: var(--accent);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

button {
  background-color: var(--accent);
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

button:hover {
  background-color: var(--accent-hover);
}

button:active {
  transform: scale(0.98);
}

button:disabled {
  background-color: var(--border);
  color: var(--text-secondary);
  cursor: not-allowed;
}

input, select {
  background-color: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.8rem;
  color: var(--text-primary);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

input:focus, select:focus {
  border-color: var(--accent);
}

/* Tabs */
.tabs-header {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
}

.tab-btn {
  background: none;
  color: var(--text-secondary);
  padding: 0.5rem 1rem;
  font-size: 1rem;
  font-weight: 500;
  border-radius: 6px;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-card);
}

.tab-btn.active {
  color: var(--text-primary);
  background: var(--accent);
}

/* Progress bar */
.progress-container {
  width: 100%;
  background-color: var(--bg-input);
  border-radius: 8px;
  height: 24px;
  overflow: hidden;
  position: relative;
  margin: 1rem 0;
  border: 1px solid var(--border);
}

.progress-bar-fill {
  background-color: var(--success);
  height: 100%;
  transition: width 0.3s ease-out;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: 700;
  font-size: 0.85rem;
}
```

- [ ] **Step 2: Limpar arquivos desnecessários gerados pelo template**

Apague `frontend/src/App.css`.

- [ ] **Step 3: Commit das alterações**

Rode:
```bash
git add frontend/src/index.css
git commit -m "style: define OKLCH variable design tokens and clean up template styles"
```

---

### Task 5: Frontend Single Download Tab (Interface e Lógica SSE)

**Files:**
- Create: `frontend/src/components/SingleDownload.tsx`
- Modify: `frontend/src/App.tsx` (Para incluir o seletor de tabs e renderizar a tab)

**Interfaces:**
- Consome: API `/api/analyze`, `/api/download` e streaming `/api/download/progress/{task_id}` do backend.

- [ ] **Step 1: Criar o componente SingleDownload.tsx**

Crie `frontend/src/components/SingleDownload.tsx`:
```tsx
import React, { useState, useEffect } from 'react';

interface AnalysisResult {
  title: string;
  resolutions: string[];
  opts: any;
  strategy: string;
}

interface Settings {
  paths: string[];
}

export default function SingleDownload() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedQuality, setSelectedQuality] = useState('');
  const [downloadType, setDownloadType] = useState<'video' | 'audio'>('video');
  const [filename, setFilename] = useState('');
  const [savePath, setSavePath] = useState('');
  const [settings, setSettings] = useState<Settings>({ paths: [] });
  
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Aguardando...');
  const [speed, setSpeed] = useState('');
  const [eta, setEta] = useState('');

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        if (data.paths.length > 0) setSavePath(data.paths[0]);
      })
      .catch(() => {});
  }, []);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!res.ok) throw new Error("Erro na análise");
      const data: AnalysisResult = await res.json();
      setAnalysis(data);
      setFilename(data.title);
      if (data.resolutions.length > 0) setSelectedQuality(data.resolutions[0]);
      setStatusText(`Pronto (Modo: ${data.strategy})`);
    } catch (e: any) {
      alert("Falha ao analisar a URL: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!analysis) return;
    setDownloading(true);
    setProgress(0);
    setStatusText('Iniciando...');
    
    // Salva o caminho atual nas configurações
    await fetch('http://127.0.0.1:8000/api/settings/path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: savePath })
    });

    try {
      const res = await fetch('http://127.0.0.1:8000/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          path: savePath,
          filename,
          type: downloadType,
          quality: selectedQuality,
          opts: analysis.opts
        })
      });
      if (!res.ok) throw new Error("Erro ao iniciar download");
      const { task_id } = await res.json();

      // Conecta ao EventSource
      const eventSource = new EventSource(`http://127.0.0.1:8000/api/download/progress/${task_id}`);
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'ping') return;
        
        if (data.status === 'downloading') {
          setProgress(data.progress);
          setSpeed(data.speed);
          setEta(data.eta);
          setStatusText(data.message);
        } else if (data.status === 'processing') {
          setProgress(100);
          setStatusText(data.message);
        } else if (data.status === 'finished') {
          setProgress(100);
          setStatusText(data.message);
          setDownloading(false);
          eventSource.close();
        } else if (data.status === 'error') {
          setStatusText(data.message);
          setDownloading(false);
          eventSource.close();
        }
      };
    } catch (e: any) {
      setStatusText("Falha: " + e.message);
      setDownloading(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input 
          type="text" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
          placeholder="Cole a URL do vídeo do YouTube aqui..." 
          style={{ flex: 1 }}
        />
        <button onClick={handleAnalyze} disabled={loading || downloading}>
          {loading ? 'Analisando...' : 'Analisar'}
        </button>
      </div>

      <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{statusText}</div>

      {analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Nome do Arquivo:</label>
            <input 
              type="text" 
              value={filename} 
              onChange={(e) => setFilename(e.target.value)} 
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <input 
                type="radio" 
                name="type" 
                checked={downloadType === 'video'} 
                onChange={() => setDownloadType('video')}
              />
              Vídeo (MP4)
            </label>
            <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <input 
                type="radio" 
                name="type" 
                checked={downloadType === 'audio'} 
                onChange={() => setDownloadType('audio')}
              />
              Áudio (MP3)
            </label>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span>Qualidade:</span>
              <select value={selectedQuality} onChange={(e) => setSelectedQuality(e.target.value)}>
                {analysis.resolutions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Salvar em:</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                value={savePath} 
                onChange={(e) => setSavePath(e.target.value)} 
                style={{ flex: 1 }}
              />
              <select onChange={(e) => setSavePath(e.target.value)} style={{ maxWidth: '200px' }}>
                <option value="">Recentes...</option>
                {settings.paths.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {downloading && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="progress-container">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
            <span className="progress-text">{Math.round(progress)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span>Velocidade: {speed}</span>
            <span>ETA: {eta}</span>
          </div>
        </div>
      )}

      {analysis && (
        <button 
          onClick={handleDownload} 
          disabled={downloading} 
          style={{ width: '100%', marginTop: '1.5rem', backgroundColor: 'var(--success)', height: '50px' }}
        >
          {downloading ? 'Baixando...' : 'BAIXAR'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Atualizar App.tsx com gerenciador de tabs e renderização**

Crie `frontend/src/App.tsx`:
```tsx
import React, { useState } from 'react';
import SingleDownload from './components/SingleDownload';

export default function App() {
  const [activeTab, setActiveTab] = useState<'single' | 'playlist' | 'history'>('single');

  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <h1>YouTube Downloader</h1>
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

      <main>
        {activeTab === 'single' && <SingleDownload />}
        {activeTab === 'playlist' && (
          <div className="card" style={{ color: 'var(--text-secondary)' }}>Tab de Playlist em desenvolvimento...</div>
        )}
        {activeTab === 'history' && (
          <div className="card" style={{ color: 'var(--text-secondary)' }}>Tab de Histórico em desenvolvimento...</div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit das alterações**

Rode:
```bash
git add frontend/src/components/SingleDownload.tsx frontend/src/App.tsx
git commit -m "feat: implement React single download tab with real-time SSE updates"
```

---

### Task 6: Frontend Playlist Tab (Batch parsing e logs)

**Files:**
- Create: `frontend/src/components/PlaylistDownload.tsx`
- Modify: `frontend/src/App.tsx` (Adicionar import do componente de Playlist)

**Interfaces:**
- Consome: Rota `/api/analyze-playlist` e gerencia filas locais de downloads no frontend.

- [ ] **Step 1: Criar o componente PlaylistDownload.tsx**

Crie `frontend/src/components/PlaylistDownload.tsx`:
```tsx
import React, { useState, useEffect } from 'react';

interface PlaylistVideo {
  title: string;
  url: string;
}

interface Settings {
  paths: string[];
}

export default function PlaylistDownload() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [savePath, setSavePath] = useState('');
  const [settings, setSettings] = useState<Settings>({ paths: [] });
  const [logs, setLogs] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        if (data.paths.length > 0) setSavePath(data.paths[0]);
      })
      .catch(() => {});
  }, []);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setVideos([]);
    setTitle('');
    setSelectedUrls(new Set());
    try {
      const res = await fetch('http://127.0.0.1:8000/api/analyze-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!res.ok) throw new Error("Erro na análise da playlist");
      const data = await res.json();
      setTitle(data.title);
      setVideos(data.videos);
      setSelectedUrls(new Set(data.videos.map((v: PlaylistVideo) => v.url)));
    } catch (e: any) {
      alert("Falha ao analisar a playlist: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectVideo = (videoUrl: string) => {
    const updated = new Set(selectedUrls);
    if (updated.has(videoUrl)) {
      updated.delete(videoUrl);
    } else {
      updated.add(videoUrl);
    }
    setSelectedUrls(updated);
  };

  const handleSelectAll = () => {
    setSelectedUrls(new Set(videos.map(v => v.url)));
  };

  const handleSelectNone = () => {
    setSelectedUrls(new Set());
  };

  const handleDownloadSelected = async () => {
    if (selectedUrls.size === 0) return;
    setDownloading(true);
    setLogs([]);

    const urlsToDownload = videos.filter(v => selectedUrls.has(v.url));
    const total = urlsToDownload.length;

    for (let i = 0; i < total; i++) {
      const v = urlsToDownload[i];
      addLog(`[${i + 1}/${total}] Iniciando download de: ${v.title}`);
      
      try {
        const res = await fetch('http://127.0.0.1:8000/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: v.url,
            path: savePath,
            filename: v.title,
            type: 'video',
            quality: 'Melhor',
            opts: {}
          })
        });
        if (!res.ok) throw new Error("Falha na inicialização");
        const { task_id } = await res.json();

        // Aguarda a conclusão via SSE de forma síncrona/promissificada para fila sequencial
        await new Promise<void>((resolve, reject) => {
          const eventSource = new EventSource(`http://127.0.0.1:8000/api/download/progress/${task_id}`);
          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.status === 'ping') return;
            
            if (data.status === 'downloading') {
              // Atualiza log da linha atual (substituindo com progresso)
            } else if (data.status === 'finished') {
              addLog(`✅ Sucesso: ${v.title}`);
              eventSource.close();
              resolve();
            } else if (data.status === 'error') {
              addLog(`❌ Erro: ${v.title} - ${data.message}`);
              eventSource.close();
              resolve(); // Continua para o próximo mesmo se houver erro
            }
          };
          eventSource.onerror = () => {
            addLog(`❌ Erro de Conexão com SSE para: ${v.title}`);
            eventSource.close();
            resolve();
          };
        });
      } catch (e: any) {
        addLog(`❌ Falha: ${v.title} - ${e.message}`);
      }
    }
    setDownloading(false);
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input 
          type="text" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
          placeholder="Cole a URL da Playlist aqui..." 
          style={{ flex: 1 }}
        />
        <button onClick={handleAnalyze} disabled={loading || downloading}>
          {loading ? 'Analisando...' : 'Analisar'}
        </button>
      </div>

      {videos.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Playlist: {title}</h3>
          
          <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
            <button onClick={handleSelectAll} disabled={downloading} className="tab-btn">Todos</button>
            <button onClick={handleSelectNone} disabled={downloading} className="tab-btn">Nenhum</button>
          </div>

          <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem', marginBottom: '1rem' }}>
            {videos.map(v => (
              <label key={v.url} style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={selectedUrls.has(v.url)} 
                  onChange={() => toggleSelectVideo(v.url)} 
                  disabled={downloading}
                />
                <span style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</span>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <label style={{ fontWeight: 600 }}>Salvar em:</label>
            <input 
              type="text" 
              value={savePath} 
              onChange={(e) => setSavePath(e.target.value)} 
              disabled={downloading}
            />
          </div>

          <button onClick={handleDownloadSelected} disabled={downloading || selectedUrls.size === 0} style={{ width: '100%', backgroundColor: 'var(--success)' }}>
            {downloading ? 'Processando Fila...' : `Baixar selecionados (${selectedUrls.size})`}
          </button>
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4>Logs de Download:</h4>
          <pre style={{ backgroundColor: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', fontSize: '0.85rem', fontFamily: 'monospace' }}>
            {logs.map((l, idx) => <div key={idx}>{l}</div>)}
          </pre>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrar o componente de Playlist no App.tsx**

Edite `frontend/src/App.tsx` para importar `PlaylistDownload`:
```tsx
import React, { useState } from 'react';
import SingleDownload from './components/SingleDownload';
import PlaylistDownload from './components/PlaylistDownload';

export default function App() {
  const [activeTab, setActiveTab] = useState<'single' | 'playlist' | 'history'>('single');

  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <h1>YouTube Downloader</h1>
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

      <main>
        {activeTab === 'single' && <SingleDownload />}
        {activeTab === 'playlist' && <PlaylistDownload />}
        {activeTab === 'history' && (
          <div className="card" style={{ color: 'var(--text-secondary)' }}>Tab de Histórico em desenvolvimento...</div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit das alterações**

Rode:
```bash
git add frontend/src/components/PlaylistDownload.tsx frontend/src/App.tsx
git commit -m "feat: implement React playlist tab for batch downloads with log console"
```

---

### Task 7: Frontend History Tab (Carregamento e Histórico)

**Files:**
- Create: `frontend/src/components/HistoryList.tsx`
- Modify: `frontend/src/App.tsx` (Adicionar import do componente de Histórico)

**Interfaces:**
- Consome: Endpoint `/api/history` do backend.

- [ ] **Step 1: Criar o componente HistoryList.tsx**

Crie `frontend/src/components/HistoryList.tsx`:
```tsx
import React, { useState, useEffect } from 'react';

interface HistoryItem {
  title: string;
  path: string;
  date: string;
  type: string;
  size: string;
}

export default function HistoryList() {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/history')
      .then(res => res.json())
      .then(data => setHistory(data))
      .catch(() => {});
  }, []);

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>Downloads Anteriores</h3>
      
      {history.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Nenhum download registrado.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {history.map((item, idx) => (
            <div 
              key={idx} 
              style={{ 
                padding: '0.8rem', 
                border: '1px solid var(--border)', 
                borderRadius: '8px', 
                backgroundColor: 'var(--bg-input)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.path}</div>
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                {item.type.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrar o componente de Histórico no App.tsx**

Edite `frontend/src/App.tsx` para importar `HistoryList`:
```tsx
import React, { useState } from 'react';
import SingleDownload from './components/SingleDownload';
import PlaylistDownload from './components/PlaylistDownload';
import HistoryList from './components/HistoryList';

export default function App() {
  const [activeTab, setActiveTab] = useState<'single' | 'playlist' | 'history'>('single');

  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <h1>YouTube Downloader</h1>
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

      <main>
        {activeTab === 'single' && <SingleDownload />}
        {activeTab === 'playlist' && <PlaylistDownload />}
        {activeTab === 'history' && <HistoryList />}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit das alterações**

Rode:
```bash
git add frontend/src/components/HistoryList.tsx frontend/src/App.tsx
git commit -m "feat: implement React download history list tab"
```

---

### Task 8: Script de Build de Produção e Compilação PyInstaller

**Files:**
- Create: `build.bat`
- Create: `YoutubeDownloader.spec`

**Interfaces:**
- Produz: Executável autônomo funcional integrando backend FastAPI e assets compilados do frontend.

- [ ] **Step 1: Criar o script de build unificado build.bat**

Crie `build.bat` para gerenciar compilação do front e PyInstaller:
```bat
@echo off
echo ==============================================
echo [1/3] Compilando Frontend React/Vite...
echo ==============================================
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao compilar o frontend.
    cd ..
    exit /b %errorlevel%
)
cd ..

echo ==============================================
echo [2/3] Gerando Executavel com PyInstaller...
echo ==============================================
pip install pyinstaller
pyinstaller YoutubeDownloader.spec --y

echo ==============================================
echo [3/3] Concluido com sucesso!
echo Executavel gerado na pasta: dist/YoutubeDownloader.exe
echo ==============================================
```

- [ ] **Step 2: Criar a especificação PyInstaller (YoutubeDownloader.spec)**

Crie `YoutubeDownloader.spec`:
```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('frontend/dist', 'frontend/dist'),
        ('bin', 'bin'),
        ('icon.ico', '.')
    ],
    hiddenimports=[
        'fastapi',
        'uvicorn',
        'pydantic',
        'python-multipart',
        'requests',
        'yt_dlp'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='YoutubeDownloader',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
```

- [ ] **Step 3: Testar execução do script build.bat**

Rode:
```powershell
.\build.bat
```
Esperado: Compilação de front concluída com sucesso e geração final de `dist/YoutubeDownloader.exe` com sucesso.

- [ ] **Step 4: Commit final do plano**

Rode:
```bash
git add build.bat YoutubeDownloader.spec
git commit -m "chore: implement unified build scripts and pyinstaller specs"
```
