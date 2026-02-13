import sys
import os
import ctypes
from PyQt6.QtWidgets import QApplication, QMessageBox
from PyQt6.QtGui import QIcon

# --- CAMINHOS ---
# Se for executável, usa o caminho do executável. Se for script, usa o caminho do arquivo.
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

APP_DIR = os.path.join(BASE_DIR, "app")
ICON_PATH = os.path.join(BASE_DIR, "icon.ico")

# --- CONFIGURAÇÃO DO WINDOWS (TASKBAR) ---
# Isso é crucial para o ícone não ficar como o padrão do Python
try:
    myappid = 'youtube.downloader.ultimate.v5'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except:
    pass

def launch_main_app():
    # 1. CRIA A APLICAÇÃO
    app = QApplication(sys.argv)
    
    # 2. DEFINE O ÍCONE GLOBAL (Barra de Tarefas)
    if os.path.exists(ICON_PATH):
        app.setWindowIcon(QIcon(ICON_PATH))
    else:
        # Apenas um aviso no console se não achar, não trava o programa
        print(f"Aviso: Ícone não encontrado em {ICON_PATH}")

    # Verifica interface
    interface_path = os.path.join(APP_DIR, "interface.py")
    if not os.path.exists(interface_path):
        QMessageBox.critical(None, "Erro Fatal", f"Arquivo não encontrado:\n{interface_path}")
        sys.exit(1)

    try:
        # Adiciona raiz ao path
        if BASE_DIR not in sys.path:
            sys.path.insert(0, BASE_DIR)

        # Importa e Abre
        from app.interface import MainWindow
        
        window = MainWindow()
        window.show()
        
        sys.exit(app.exec())
        
    except Exception as e:
        import traceback
        err_msg = f"Erro fatal:\n{traceback.format_exc()}"
        QMessageBox.critical(None, "Erro de Execução", err_msg)
        sys.exit(1)

if __name__ == "__main__":
    launch_main_app()