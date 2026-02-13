import sys
import os
import ctypes
from PyQt6.QtWidgets import QApplication, QMessageBox
from PyQt6.QtGui import QIcon

# Estrutura local
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE_DIR, "app")
ICON_PATH = os.path.join(BASE_DIR, "icon.ico")

# Garante que o Windows use o ícone correto na barra de tarefas (Taskbar)
try:
    myappid = 'youtube.downloader.ultimate.v5'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except ImportError:
    pass

def launch_main_app():
    # 1. CRIA A APLICAÇÃO PRIMEIRO (Antes de qualquer lógica)
    # Isso garante que QMessagebox funcione se der erro nos imports
    app = QApplication(sys.argv)
    
    # Define o ícone global imediatamente
    if os.path.exists(ICON_PATH):
        app.setWindowIcon(QIcon(ICON_PATH))

    # Verifica se a pasta app existe
    interface_path = os.path.join(APP_DIR, "interface.py")
    if not os.path.exists(interface_path):
        QMessageBox.critical(None, "Erro Fatal", f"O arquivo 'interface.py' não foi encontrado em:\n{interface_path}")
        sys.exit(1)

    try:
        # 2. Configura o caminho para encontrar os módulos
        if BASE_DIR not in sys.path:
            sys.path.insert(0, BASE_DIR)

        # 3. Importa a Janela Principal (Aqui é onde o erro real costuma acontecer)
        from app.interface import MainWindow
        
        # 4. Inicia a Janela
        window = MainWindow()
        window.show()
        
        sys.exit(app.exec())
        
    except Exception as e:
        # Agora este alerta vai funcionar e mostrar o erro real!
        err_msg = f"Erro ao iniciar o programa:\n{str(e)}"
        print(err_msg) # Mostra no terminal
        QMessageBox.critical(None, "Erro de Inicialização", err_msg) # Mostra na tela
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    launch_main_app()