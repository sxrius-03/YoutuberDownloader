import sys
import os
import ctypes

# --- DIAGNÓSTICO VISUAL NO TERMINAL ---
print("--- INICIANDO LAUNCHER ---")
print("[1] Importando bibliotecas do sistema...")

try:
    from PyQt6.QtWidgets import QApplication, QMessageBox
    from PyQt6.QtGui import QIcon
    print("[2] PyQt6 importado com sucesso.")
except ImportError as e:
    print(f"ERRO FATAL: PyQt6 não encontrado. Instale com 'pip install PyQt6'. Detalhes: {e}")
    sys.exit(1)

# Estrutura local
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE_DIR, "app")
ICON_PATH = os.path.join(BASE_DIR, "icon.ico")

# --- CONFIGURAÇÃO DO WINDOWS (TASKBAR) ---
try:
    myappid = 'youtube.downloader.ultimate.v5'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except: pass

# --- INICIALIZAÇÃO DA APLICAÇÃO (GLOBAL) ---
# Criamos a aplicação AQUI, fora de qualquer função, para ser a primeira coisa absoluta a rodar.
print("[3] Criando instância QApplication...")
app = QApplication(sys.argv)

# Define ícone se existir
if os.path.exists(ICON_PATH):
    app.setWindowIcon(QIcon(ICON_PATH))

def main():
    print(f"[4] Verificando diretórios... Base: {BASE_DIR}")
    
    # Verifica interface.py
    interface_path = os.path.join(APP_DIR, "interface.py")
    if not os.path.exists(interface_path):
        err_msg = f"ARQUIVO NÃO ENCONTRADO:\n{interface_path}\n\nVerifique se a pasta 'app' está junto do launcher."
        print(f"ERRO: {err_msg}")
        QMessageBox.critical(None, "Erro Fatal", err_msg)
        sys.exit(1)

    try:
        # Adiciona a raiz ao Path do Python para garantir que 'app.interface' seja achado
        if BASE_DIR not in sys.path:
            sys.path.insert(0, BASE_DIR)
        
        print("[5] Importando interface gráfica (app.interface)...")
        # O erro geralmente acontece AQUI se houver código solto no interface.py
        from app.interface import MainWindow
        print("[6] Interface importada. Iniciando Janela...")
        
        window = MainWindow()
        window.show()
        
        print("[7] Loop de eventos iniciado. Programa rodando.")
        sys.exit(app.exec())
        
    except Exception as e:
        import traceback
        erro_detalhado = traceback.format_exc()
        print("\n!!! ERRO CRÍTICO NA EXECUÇÃO !!!")
        print(erro_detalhado)
        
        # Tenta mostrar o erro numa janela (agora seguro pois 'app' existe globalmente)
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Icon.Critical)
        msg.setWindowTitle("Erro de Execução")
        msg.setText("Ocorreu um erro ao iniciar o programa.")
        msg.setDetailedText(erro_detalhado)
        msg.exec()
        sys.exit(1)

if __name__ == "__main__":
    main()