import sys
import os
import ctypes
from PyQt6.QtWidgets import QApplication, QMessageBox
from PyQt6.QtGui import QIcon

# Como vamos compilar tudo em um EXE, podemos importar direto!
from app.interface import MainWindow

from app.utils import PATHS

ICON_PATH = os.path.join(PATHS["bundle"], "icon.ico")
if not os.path.exists(ICON_PATH):
    ICON_PATH = os.path.join(PATHS["root"], "icon.ico")

# --- CONFIGURAÇÃO DO WINDOWS (TASKBAR) ---
try:
    myappid = 'youtube.downloader.ultimate.v5'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except:
    pass

def main():
    app = QApplication(sys.argv)
    
    # Define o ícone global (Barra de Tarefas)
    if os.path.exists(ICON_PATH):
        app.setWindowIcon(QIcon(ICON_PATH))

    try:
        # Abre a interface gráfica
        window = MainWindow()
        window.show()
        sys.exit(app.exec())
        
    except Exception as e:
        import traceback
        err_msg = f"Erro fatal:\n{traceback.format_exc()}"
        QMessageBox.critical(None, "Erro de Execução", err_msg)
        sys.exit(1)

if __name__ == "__main__":
    main()