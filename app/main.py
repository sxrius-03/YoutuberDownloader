from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uuid
import queue
import threading
import os
import asyncio
from datetime import datetime
from typing import Dict, Any

from app.downloader import YouTubeEngine
from app.utils import PATHS, SETTINGS_FILE, HISTORY_FILE, carregar_json, salvar_json, sanitizar_nome, formatar_tamanho

app = FastAPI(title="Youtube Downloader API")

# Habilita CORS para o servidor de desenvolvimento do Vite
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
        
        # Filtra e ordena as resoluções
        resolucoes_set = set()
        for f in formats:
            height = f.get('height')
            if height:
                resolucoes_set.add(height)
        
        resolucoes = sorted(list(resolucoes_set), reverse=True)
        resolutions_str = [str(x) for x in resolucoes]
        if not resolutions_str:
            resolutions_str = ["Melhor"]
            
        return {
            "title": info.get('title', 'video'),
            "resolutions": resolutions_str,
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
        # Instancia uma nova engine para evitar conflitos de threads no hook
        from app.downloader import YouTubeEngine
        eng = YouTubeEngine()
        
        # Realiza o download
        info = eng.baixar(req.url, req.path, req.filename, req.type, req.quality, req.opts, hook)
        
        # Salva histórico local
        historico = carregar_json(HISTORY_FILE, [])
        tamanho = info.get('filesize') or info.get('filesize_approx')
        
        historico.insert(0, {
            "title": req.filename,
            "type": req.type,
            "path": req.path,
            "size": tamanho,
            "date": datetime.now().strftime("%d/%m/%Y %H:%M")
        })
        salvar_json(HISTORY_FILE, historico[:100]) # Mantém apenas os últimos 100

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
            try:
                # Puxa itens de forma não-bloqueante na thread do loop de eventos
                item = await loop.run_in_executor(None, lambda: q.get(timeout=1.0))
                import json
                yield f"data: {json.dumps(item)}\n\n"
                if item["status"] in ["finished", "error"]:
                    break
            except queue.Empty:
                # Mantém conexão viva enviando ping a cada segundo
                yield "data: {\"status\": \"ping\"}\n\n"
            except asyncio.CancelledError:
                break

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/download/cancel/{task_id}")
def cancel_download(task_id: str):
    # Em um download em thread pura com o yt-dlp executando síncrono, parar a thread
    # diretamente de fora é complexo em Python puro sem quebrar o interpretador.
    # No entanto, podemos remover a fila para que o frontend encerre seu listener.
    if task_id in task_queues:
        del task_queues[task_id]
        return {"status": "cancelled"}
    raise HTTPException(status_code=404, detail="Task não encontrada")

@app.get("/api/settings")
def get_settings():
    settings = carregar_json(SETTINGS_FILE, {"paths": []})
    # Caso não tenha caminhos salvos, adiciona a pasta padrão de downloads do usuário
    if not settings.get("paths"):
        default_path = os.path.join(os.path.expanduser("~"), "Downloads")
        settings["paths"] = [default_path]
        salvar_json(SETTINGS_FILE, settings)
    return settings

@app.post("/api/settings/path")
def add_path(req: PathRequest):
    settings = carregar_json(SETTINGS_FILE, {"paths": []})
    if req.path and req.path not in settings["paths"]:
        settings["paths"].insert(0, req.path)
        settings["paths"] = settings["paths"][:10] # Limita a 10 históricos
        salvar_json(SETTINGS_FILE, settings)
    return settings

@app.post("/api/settings/choose-path")
def choose_path():
    import subprocess
    import sys
    
    code = """
import tkinter as tk
from tkinter import filedialog
import os
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
path = filedialog.askdirectory(title="Selecione a Pasta de Destino")
root.destroy()
if path:
    print(os.path.abspath(path).replace("\\\\", "/"), end="")
"""
    try:
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=60
        )
        path = result.stdout.strip()
        if path:
            return {"path": path}
        return {"path": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history")
def get_history():
    return carregar_json(HISTORY_FILE, [])

@app.post("/api/history/open")
def open_folder(req: PathRequest):
    if req.path and os.path.exists(req.path):
        try:
            os.startfile(req.path)
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=404, detail="Pasta não encontrada")

# Roteia os arquivos estáticos montados do frontend no ambiente de produção
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
