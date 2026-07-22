import sys
import os

# Desabilita o sandbox do Chromium e outros problemas comuns do QWebEngine
os.environ["QTWEBENGINE_DISABLE_SANDBOX"] = "1"

import threading
import socket
import webbrowser
import time
import json
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
    # Tenta conectar via IPv4 e IPv6 no localhost
    for host in ('127.0.0.1', 'localhost'):
        # Tenta IPv4
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.1)
            s.connect((host, port))
            s.close()
            return True
        except Exception:
            pass
        # Tenta IPv6
        try:
            s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
            s.settimeout(0.1)
            s.connect((host, port))
            s.close()
            return True
        except Exception:
            pass
    return False

def start_gui(url):
    from PyQt6.QtCore import QUrl
    from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEnginePage
    from PyQt6.QtNetwork import QNetworkProxy

    # Desativa qualquer proxy local (evita que localhost passe por proxies de VPN/Fiddler)
    QNetworkProxy.setApplicationProxy(QNetworkProxy(QNetworkProxy.ProxyType.NoProxy))

    class CustomWebPage(QWebEnginePage):
        def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
            print(f"[JS CONSOLE] Level {level}: {message} (Line {lineNumber} in {sourceID})")

    class WebViewerWindow(QMainWindow):
        def __init__(self, url):
            super().__init__()
            self.setWindowTitle("Youtube Downloader")
            self.resize(1100, 750)
            
            # Central widget
            central_widget = QWidget()
            self.setCentralWidget(central_widget)
            layout = QVBoxLayout(central_widget)
            layout.setContentsMargins(0, 0, 0, 0)
            
            # Web view
            self.web_view = QWebEngineView()
            self.page = CustomWebPage(self.web_view)
            self.web_view.setPage(self.page)
            
            # Connect load finished signal
            self.web_view.loadFinished.connect(self.on_load_finished)
            
            print(f"WebViewer carregando URL: {url}")
            self.web_view.setUrl(QUrl(url))
            layout.addWidget(self.web_view)
            
        def on_load_finished(self, success):
            if success:
                print("WebViewer: Pagina carregada com sucesso!")
            else:
                print("WebViewer ERROR: Falha ao carregar a pagina!")

    # Adiciona argumentos para desabilitar sandboxes e problemas gráficos do Chromium
    args = sys.argv + ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer", "--ignore-gpu-blocklist"]
    app = QApplication(args)
    window = WebViewerWindow(url)
    window.show()
    sys.exit(app.exec())

def main():
    port = find_free_port()
    
    # Salva a porta no arquivo data/port.json para que o Vite dev server possa ler
    port_file = os.path.join(PATHS["data"], "port.json")
    try:
        os.makedirs(PATHS["data"], exist_ok=True)
        with open(port_file, "w", encoding="utf-8") as f:
            json.dump({"port": port}, f)
    except Exception as e:
        print(f"Erro ao salvar arquivo de porta: {e}")

    # Inicia o servidor uvicorn em background thread
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()
    
    # Aguarda o servidor inicializar brevemente
    time.sleep(1.0)
    
    # URL padrão: backend local servindo static files
    url = f"http://127.0.0.1:{port}"
    
    # Verifica se o Vite dev server está rodando (modo desenvolvimento)
    vite_port_file = os.path.join(PATHS["data"], "vite_port.json")
    if os.path.exists(vite_port_file):
        try:
            with open(vite_port_file, "r", encoding="utf-8") as f:
                vite_data = json.load(f)
                vite_port = vite_data.get("port")
                if vite_port and is_port_active(vite_port):
                    url = f"http://127.0.0.1:{vite_port}"
                    print(f"Vite dev server detectado na porta {vite_port}. Direcionando WebViewer para o frontend de desenvolvimento.")
        except Exception as e:
            print(f"Erro ao testar porta do Vite: {e}")

    print(f"Servidor backend rodando em: http://127.0.0.1:{port}")
    print(f"Carregando interface em: {url}")
    
    # Tenta rodar a interface com PyQt6 WebViewer
    try:
        print("Iniciando interface desktop com PyQt6 WebViewer...")
        start_gui(url)
    except Exception as e:
        print(f"Não foi possível iniciar o WebViewer ({e}). Abrindo no navegador padrão...")
        webbrowser.open(url)
        # Mantém o processo do launcher ativo caso falhe e use o navegador
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("Finalizando aplicação...")

if __name__ == "__main__":
    main()