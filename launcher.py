import sys
import os
import threading
import socket
import webbrowser
import time
import uvicorn

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