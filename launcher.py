import sys
import os
import threading
import socket
import webbrowser
import time
import json
import subprocess
import uvicorn

# Garante importações corretas independente do empacotamento
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.main import app
from app.utils import PATHS

def find_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('', 0))
    port = s.getsockname()[1]
    s.close()
    return port

def run_server(port):
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

def is_port_active(port):
    for host in ('127.0.0.1', 'localhost'):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.1)
            s.connect((host, port))
            s.close()
            return True
        except Exception:
            pass
    return False

def open_app_window(url):
    """
    Abre a interface Vite em modo aplicativo dedicado (sem barras de navegação/abas)
    utilizando o Microsoft Edge ou Google Chrome nativo do sistema.
    Caso nenhum esteja disponível, utiliza o navegador padrão via webbrowser.
    """
    edge_paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
    ]
    chrome_paths = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    ]

    browser_exe = None
    for p in edge_paths + chrome_paths:
        if os.path.exists(p):
            browser_exe = p
            break

    if browser_exe:
        try:
            print(f"Abrindo interface Vite em janela dedicada: {browser_exe}")
            subprocess.Popen([browser_exe, f"--app={url}"])
            return
        except Exception as e:
            print(f"Erro ao abrir janela em modo app: {e}")

    print("Abrindo interface no navegador padrão...")
    webbrowser.open(url)

def main():
    port = find_free_port()
    
    port_file = os.path.join(PATHS["data"], "port.json")
    try:
        os.makedirs(PATHS["data"], exist_ok=True)
        with open(port_file, "w", encoding="utf-8") as f:
            json.dump({"port": port}, f)
    except Exception as e:
        print(f"Erro ao salvar arquivo de porta: {e}")

    # Inicia o servidor backend FastAPI em background
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()
    
    time.sleep(1.0)
    
    url = f"http://127.0.0.1:{port}"
    
    # Verifica se o Vite dev server está rodando
    vite_port_file = os.path.join(PATHS["data"], "vite_port.json")
    if os.path.exists(vite_port_file):
        try:
            with open(vite_port_file, "r", encoding="utf-8") as f:
                vite_data = json.load(f)
                vite_port = vite_data.get("port")
                if vite_port and is_port_active(vite_port):
                    url = f"http://127.0.0.1:{vite_port}"
                    print(f"Vite dev server detectado na porta {vite_port}.")
        except Exception as e:
            print(f"Erro ao testar porta do Vite: {e}")

    print(f"Backend FastAPI rodando em: http://127.0.0.1:{port}")
    print(f"Interface Vite rodando em: {url}")
    
    open_app_window(url)
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Finalizando aplicação...")

if __name__ == "__main__":
    main()