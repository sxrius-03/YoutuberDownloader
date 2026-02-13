import sys
import os
import ctypes
from PyQt6.QtWidgets import QApplication, QMessageBox
from PyQt6.QtGui import QIcon

# Estrutura local
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE_DIR, "app")
ICON_PATH = os.path.join(BASE_DIR, "icon.ico")

# Garante que o Windows use o ícone correto na barra de tarefas
try:
    myappid = 'mycompany.myproduct.subproduct.version' # ID arbitrário
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except ImportError:
    pass

def launch_main_app():
    # Caminho para interface.py
    interface_path = os.path.join(APP_DIR, "interface.py")
    
    if not os.path.exists(interface_path):
        # Se não existir interface (primeira vez ever), precisamos de um bootstrap mínimo
        # mas como você disse que já tem os arquivos locais, vamos assumir que existe.
        QMessageBox.critical(None, "Erro Fatal", "interface.py não encontrado.")
        sys.exit(1)

    try:
        # Adiciona o diretório atual ao path
        if BASE_DIR not in sys.path:
            sys.path.insert(0, BASE_DIR)

        # Importa e inicia
        from app.interface import MainWindow
        
        # Inicia a aplicação Qt
        app = QApplication(sys.argv)
        
        # Define o ícone global da aplicação (Barra de Tarefas)
        if os.path.exists(ICON_PATH):
            app.setWindowIcon(QIcon(ICON_PATH))

        window = MainWindow()
        window.show()
        sys.exit(app.exec())
        
    except Exception as e:
        QMessageBox.critical(None, "Erro de Execução", f"Falha ao iniciar:\n{e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    launch_main_app()