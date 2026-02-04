import os
import sys
import re
import json
import unicodedata
from datetime import datetime

# --- GERENCIAMENTO DE CAMINHOS ---
# Define onde o script está rodando para localizar pastas vizinhas
def get_base_paths():
    """
    Retorna os caminhos absolutos para as pastas importantes.
    Baseado na estrutura:
    Raiz/
      |-- Launcher.exe
      |-- app/ (scripts)
      |-- bin/ (ffmpeg)
      |-- data/ (jsons)
    """
    # Se estiver rodando como script dentro de 'app/', sobe um nível
    # Se estiver congelado (exe), sys.executable é a raiz
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        # Estamos em app/utils.py, então subimos um nível
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    return {
        "root": base_dir,
        "bin": os.path.join(base_dir, "bin"),
        "data": os.path.join(base_dir, "data"),
        "app": os.path.join(base_dir, "app")
    }

PATHS = get_base_paths()

# Cria a pasta de dados se não existir
if not os.path.exists(PATHS["data"]):
    os.makedirs(PATHS["data"])

# Caminhos dos arquivos de configuração
SETTINGS_FILE = os.path.join(PATHS["data"], "settings.json")
HISTORY_FILE = os.path.join(PATHS["data"], "history.json")
COOKIES_FILE = os.path.join(PATHS["root"], "cookies.txt") # Fica na raiz para facilitar pro usuário

# --- FUNÇÕES DE CAMINHO DE RECURSOS ---
def get_binary_path(binary_name):
    """
    Retorna o caminho completo para um executável na pasta 'bin'.
    Ex: get_binary_path('ffmpeg.exe')
    """
    path = os.path.join(PATHS["bin"], binary_name)
    if os.path.exists(path):
        return path
    
    # Fallback: Se não achar na pasta bin, tenta achar dentro do próprio exe (caso decida embutir no futuro)
    if getattr(sys, 'frozen', False):
        embedded_path = os.path.join(sys._MEIPASS, binary_name)
        if os.path.exists(embedded_path):
            return embedded_path
            
    return binary_name # Retorna apenas o nome para tentar achar no PATH do Windows

# --- MANIPULAÇÃO DE STRINGS E ARQUIVOS ---
def sanitizar_nome(nome):
    """
    Remove acentos e caracteres ilegais, mantendo (), [] e -.
    """
    if not nome: return "video_sem_nome"
    
    base, ext = os.path.splitext(nome)
    
    # 1. Remove acentuação (Normalização Unicode)
    nfkd_form = unicodedata.normalize('NFKD', base)
    base_sem_acento = "".join([c for c in nfkd_form if not unicodedata.category(c) == 'Mn'])
    
    # 2. Mantém letras, números, -, (), []
    # Substitui todo o resto por espaço
    novo_nome = re.sub(r'[^a-zA-Z0-9\-\(\)\[\]]', ' ', base_sem_acento)
    
    # 3. Remove espaços duplos e trim
    novo_nome = re.sub(r'\s+', ' ', novo_nome).strip()
    
    return novo_nome

def formatar_tamanho(bytes_size):
    """Converte bytes para KB, MB, GB, TB"""
    if not bytes_size: return "Desconhecido"
    try:
        bytes_size = float(bytes_size)
    except: return "N/A"
    
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

# --- PERSISTÊNCIA DE DADOS (JSON) ---
def carregar_json(arquivo, padrao):
    if os.path.exists(arquivo):
        try:
            with open(arquivo, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return padrao
    return padrao

def salvar_json(arquivo, dados):
    try:
        with open(arquivo, 'w', encoding='utf-8') as f:
            json.dump(dados, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao salvar JSON {arquivo}: {e}")

# --- SETUP INICIAL DE AMBIENTE ---
def setup_environment():
    """Configura PATH para incluir a pasta bin (para o yt-dlp achar o qjs)"""
    bin_dir = PATHS["bin"]
    if os.path.exists(bin_dir) and bin_dir not in os.environ['PATH']:
        os.environ['PATH'] += os.pathsep + bin_dir