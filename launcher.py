import sys
import os
import json
import requests
import shutil
import importlib.util
from PyQt6.QtWidgets import QApplication, QWidget, QVBoxLayout, QLabel, QProgressBar, QMessageBox
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer
from PyQt6.QtGui import QIcon

# --- CONFIGURAÇÃO DO REPOSITÓRIO (EDITAR ISTO) ---
# Exemplo: "https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/"
# Não esqueça da barra "/" no final.
GITHUB_BASE_URL = "https://raw.githubusercontent.com/sxrius-03/YoutuberDownloader/refs/heads/main/"

# Estrutura local
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE_DIR, "app")
DATA_DIR = os.path.join(BASE_DIR, "data")
LOCAL_VERSION_FILE = os.path.join(DATA_DIR, "version.json")

# Garante que as pastas existam
if not os.path.exists(APP_DIR): os.makedirs(APP_DIR)
if not os.path.exists(DATA_DIR): os.makedirs(DATA_DIR)

# --- WORKER DE ATUALIZAÇÃO ---
class UpdateWorker(QThread):
    progress = pyqtSignal(int, str)
    finished = pyqtSignal(bool, str) # success, message

    def run(self):
        try:
            self.progress.emit(10, "Verificando versão...")
            
            # 1. Pega versão remota
            url_version = GITHUB_BASE_URL + "version.json"
            try:
                resp = requests.get(url_version, timeout=5)
                if resp.status_code != 200:
                    raise Exception("Repositório inacessível")
                remote_data = resp.json()
            except Exception:
                # Se falhar na internet, tenta rodar o que tem localmente
                self.finished.emit(True, "Offline: Iniciando versão local...")
                return

            # 2. Pega versão local
            local_ver = "0.0.0"
            if os.path.exists(LOCAL_VERSION_FILE):
                try:
                    with open(LOCAL_VERSION_FILE, 'r') as f:
                        local_ver = json.load(f).get("version", "0.0.0")
                except: pass

            # 3. Compara
            if remote_data["version"] != local_ver or remote_data.get("force_update", False):
                self.progress.emit(30, f"Atualizando para v{remote_data['version']}...")
                
                files = remote_data.get("files", [])
                total_files = len(files)
                
                for i, filename in enumerate(files):
                    self.progress.emit(30 + int((i / total_files) * 60), f"Baixando {filename}...")
                    
                    # Download do arquivo python
                    file_url = GITHUB_BASE_URL + filename
                    r = requests.get(file_url)
                    if r.status_code == 200:
                        # Salva em utf-8 para garantir acentuação
                        file_path = os.path.join(APP_DIR, filename)
                        with open(file_path, 'wb') as f:
                            f.write(r.content)
                    else:
                        print(f"Falha ao baixar {filename}")

                # Atualiza o arquivo de versão local
                with open(LOCAL_VERSION_FILE, 'w') as f:
                    json.dump(remote_data, f)
                
                self.progress.emit(100, "Atualização concluída!")
                time.sleep(0.5) # Breve pausa para ler
            else:
                self.progress.emit(100, "Sistema atualizado.")
            
            self.finished.emit(True, "Pronto")

        except Exception as e:
            self.finished.emit(False, str(e))

import time

# --- JANELA DE SPLASH/LAUNCHER ---
class LauncherWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.resize(300, 150)
        
        # Layout Estilizado
        layout = QVBoxLayout(self)
        self.setStyleSheet("""
            QWidget { background-color: #2b2b2b; border: 1px solid #444; border-radius: 10px; color: white; }
            QProgressBar { border: none; background-color: #444; height: 5px; text-align: center; }
            QProgressBar::chunk { background-color: #007acc; }
        """)
        
        self.lbl_title = QLabel("YouTube Ultimate Auto-Updater")
        self.lbl_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_title.setStyleSheet("font-weight: bold; font-size: 14px; border: none;")
        
        self.lbl_status = QLabel("Iniciando...")
        self.lbl_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_status.setStyleSheet("color: #aaa; font-size: 11px; border: none;")
        
        self.progress = QProgressBar()
        self.progress.setValue(0)
        
        layout.addWidget(self.lbl_title)
        layout.addStretch()
        layout.addWidget(self.lbl_status)
        layout.addWidget(self.progress)
        layout.addStretch()

        # Inicia Worker
        self.worker = UpdateWorker()
        self.worker.progress.connect(self.update_status)
        self.worker.finished.connect(self.on_finished)
        self.worker.start()

    def update_status(self, val, msg):
        self.progress.setValue(val)
        self.lbl_status.setText(msg)

    def on_finished(self, success, msg):
        if not success:
            # Se deu erro crítico no updater, avisa mas tenta abrir o app mesmo assim se existir
            print(f"Erro no update: {msg}")
        
        self.launch_main_app()

    def launch_main_app(self):
        self.lbl_status.setText("Abrindo Aplicação...")
        
        # Caminho para interface.py
        interface_path = os.path.join(APP_DIR, "interface.py")
        
        if not os.path.exists(interface_path):
            QMessageBox.critical(self, "Erro Fatal", "O arquivo principal (interface.py) não foi encontrado.\nVerifique sua conexão para a primeira instalação.")
            sys.exit(1)

        try:
            # TÉCNICA DE IMPORTAÇÃO DINÂMICA
            # Isso garante que o Python carregue o arquivo .py que está na pasta,
            # e não uma versão compilada/congelada antiga.
            
            # Adiciona o diretório atual ao path para que o 'app' seja visível
            if BASE_DIR not in sys.path:
                sys.path.insert(0, BASE_DIR)

            # Importa o módulo interface da pasta app
            from app.interface import MainWindow
            
            self.main_window = MainWindow()
            self.main_window.show()
            self.close() # Fecha o launcher
            
        except Exception as e:
            QMessageBox.critical(self, "Erro de Execução", f"Falha ao iniciar o programa:\n{e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    launcher = LauncherWindow()
    launcher.show()
    sys.exit(app.exec())