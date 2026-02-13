import sys
import os
import threading
import json
import requests
import time
from datetime import datetime
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QLabel, QLineEdit, QPushButton, 
                             QTabWidget, QProgressBar, QComboBox, QRadioButton, 
                             QButtonGroup, QFileDialog, QMessageBox, QTableWidget, 
                             QTableWidgetItem, QHeaderView, QFrame, QAbstractItemView, QTextEdit)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QSize, QTimer
from PyQt6.QtGui import QIcon, QCursor, QAction

from app.downloader import YouTubeEngine
from app.utils import PATHS, SETTINGS_FILE, HISTORY_FILE, carregar_json, salvar_json, formatar_tamanho, sanitizar_nome

# --- CONFIGURAÇÃO UPDATE ---
GITHUB_BASE_URL = "https://raw.githubusercontent.com/sxrius-03/YoutuberDownloader/refs/heads/main/"
LOCAL_VERSION_FILE = os.path.join(PATHS["data"], "version.json")

# --- ESTILO DARK MODERNO ---
STYLESHEET = """
QMainWindow { background-color: #1e1e1e; }
QWidget { color: #ffffff; font-family: 'Segoe UI', Arial; font-size: 14px; }
QTabWidget::pane { border: 1px solid #3a3a3a; background-color: #252526; }
QTabBar::tab { background: #2d2d30; color: #a0a0a0; padding: 10px 20px; border-top-left-radius: 4px; border-top-right-radius: 4px; }
QTabBar::tab:selected { background: #3e3e42; color: #ffffff; border-bottom: 2px solid #007acc; }
QLineEdit { background-color: #333337; border: 1px solid #434346; padding: 5px; color: white; border-radius: 3px; }
QLineEdit:focus { border: 1px solid #007acc; }
QPushButton { background-color: #0e639c; color: white; border: none; padding: 8px 15px; border-radius: 4px; font-weight: bold; }
QPushButton:hover { background-color: #1177bb; }
QPushButton:pressed { background-color: #094771; }
QPushButton:disabled { background-color: #3a3a3a; color: #888; }
QComboBox { background-color: #333337; border: 1px solid #434346; padding: 5px; border-radius: 3px; }
QProgressBar { border: 1px solid #3a3a3a; border-radius: 5px; text-align: center; background-color: #252526; }
QProgressBar::chunk { background-color: #007acc; border-radius: 4px; }
QTableWidget { background-color: #252526; gridline-color: #3a3a3a; border: none; }
QHeaderView::section { background-color: #333337; padding: 5px; border: none; font-weight: bold; }
QTableWidget::item { padding: 5px; }
QTableWidget::item:selected { background-color: #37373d; }
QTextEdit { background-color: #1e1e1e; border: 1px solid #333; font-family: Consolas, Monospace; font-size: 12px; }
"""

# --- WORKER DE UPDATE (SILENCIOSO) ---
class BackgroundUpdateWorker(QThread):
    update_found = pyqtSignal(str, list) # nova_versao, lista_arquivos
    finished_install = pyqtSignal()
    
    def __init__(self):
        super().__init__()
        self.mode = "check" # check ou install
        self.files_to_download = []
        self.new_version = ""

    def run(self):
        if self.mode == "check":
            self.check_updates()
        elif self.mode == "install":
            self.install_updates()

    def check_updates(self):
        try:
            # Pega versão remota
            url_version = GITHUB_BASE_URL + "version.json"
            resp = requests.get(url_version, timeout=5)
            if resp.status_code != 200: return
            remote_data = resp.json()

            # Pega versão local
            local_ver = "0.0.0"
            if os.path.exists(LOCAL_VERSION_FILE):
                try:
                    with open(LOCAL_VERSION_FILE, 'r') as f:
                        local_ver = json.load(f).get("version", "0.0.0")
                except: pass

            # Compara
            if remote_data["version"] != local_ver:
                self.files_to_download = remote_data.get("files", [])
                self.new_version = remote_data["version"]
                self.update_found.emit(self.new_version, self.files_to_download)
                
                # Salva o json novo temporariamente ou sobrescreve no final
                self.remote_data_cache = remote_data

        except Exception:
            pass # Falha silenciosa

    def install_updates(self):
        try:
            for filename in self.files_to_download:
                file_url = GITHUB_BASE_URL + filename
                r = requests.get(file_url)
                if r.status_code == 200:
                    file_path = os.path.join(PATHS["app"], filename)
                    with open(file_path, 'wb') as f:
                        f.write(r.content)
            
            # Atualiza version.json
            with open(LOCAL_VERSION_FILE, 'w') as f:
                json.dump(self.remote_data_cache, f)
            
            self.finished_install.emit()
        except: pass

# --- WORKERS DE DOWNLOAD (Mantidos iguais) ---
class AnalysisWorker(QThread):
    finished = pyqtSignal(dict, dict, str)
    error = pyqtSignal(str)
    def __init__(self, engine, url):
        super().__init__()
        self.engine = engine; self.url = url
    def run(self):
        try:
            info, opts, strat = self.engine.analisar_camaleao(self.url, is_playlist=False)
            self.finished.emit(info, opts, strat)
        except Exception as e: self.error.emit(str(e))

class DownloadWorker(QThread):
    progress = pyqtSignal(float, str)
    finished = pyqtSignal(dict)
    error = pyqtSignal(str)
    def __init__(self, engine, url, path, filename, type_, res, opts):
        super().__init__()
        self.engine = engine; self.url = url; self.path = path; self.filename = filename; self.type_ = type_; self.res = res; self.opts = opts
    def run(self):
        def hook(d):
            if d['status'] == 'downloading':
                try:
                    p = float(d.get('_percent_str', '0%').replace('%', ''))
                    self.progress.emit(p, f"Baixando: {int(p)}%")
                except: pass
            elif d['status'] == 'finished': self.progress.emit(100, "Processando...")
        try:
            info = self.engine.baixar(self.url, self.path, self.filename, self.type_, self.res, self.opts, hook)
            self.finished.emit(info)
        except Exception as e: self.error.emit(str(e))

class PlaylistAnalysisWorker(QThread):
    finished = pyqtSignal(dict, dict, str)
    error = pyqtSignal(str)
    def __init__(self, engine, url): super().__init__(); self.engine = engine; self.url = url
    def run(self):
        try:
            info, opts, strat = self.engine.analisar_camaleao(self.url, is_playlist=True)
            self.finished.emit(info, opts, strat)
        except Exception as e: self.error.emit(str(e))

class PlaylistDownloadWorker(QThread):
    log = pyqtSignal(str)
    video_finished = pyqtSignal(dict)
    finished = pyqtSignal()
    def __init__(self, engine, video_list, path, type_, res, opts):
        super().__init__(); self.engine = engine; self.video_list = video_list; self.path = path; self.type_ = type_; self.res = res; self.opts = opts; self.is_running = True
    def run(self):
        total = len(self.video_list)
        for i, entry in enumerate(self.video_list):
            if not self.is_running: break
            title = entry.get('title', 'Video')
            url = entry.get('url') or entry.get('webpage_url')
            clean = sanitizar_nome(title)
            self.log.emit(f"[{i+1}/{total}] Baixando: {title}")
            try:
                def h(d): pass 
                info = self.engine.baixar(url, self.path, clean, self.type_, self.res, self.opts, h)
                self.video_finished.emit(info)
                self.log.emit(f"✅ Sucesso: {title}")
            except Exception as e: self.log.emit(f"❌ Erro: {str(e)}")
        self.finished.emit()
    def stop(self): self.is_running = False

# --- JANELA PRINCIPAL ---
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("YouTube Downloader")
        self.resize(1000, 750)
        self.setStyleSheet(STYLESHEET)

        # Configura Ícone da Janela (Titulo)
        icon_path = os.path.join(PATHS["root"], "icon.ico")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))

        self.engine = YouTubeEngine()
        self.settings = carregar_json(SETTINGS_FILE, {"paths": []})
        self.history = carregar_json(HISTORY_FILE, [])
        self.download_folder = self.settings["paths"][0] if self.settings["paths"] else os.path.join(os.path.expanduser("~"), "Downloads")

        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)

        self.tabs = QTabWidget()
        main_layout.addWidget(self.tabs)

        self.setup_single_tab()
        self.setup_playlist_tab()
        self.setup_history_tab()

        # Inicia verificação de Update em Segundo Plano
        self.run_background_update_check()

    def run_background_update_check(self):
        self.updater = BackgroundUpdateWorker()
        self.updater.update_found.connect(self.ask_for_update)
        self.updater.finished_install.connect(self.on_update_installed)
        self.updater.start()

    def ask_for_update(self, new_ver, files):
        reply = QMessageBox.question(
            self, "Atualização Disponível", 
            f"Uma nova versão (v{new_ver}) está disponível.\nDeseja baixar e instalar agora?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            self.lbl_status.setText("Baixando atualização...")
            self.updater.mode = "install"
            self.updater.start() # Reusa a thread para baixar

    def on_update_installed(self):
        QMessageBox.information(self, "Atualizado", "A atualização foi baixada com sucesso!\nO programa será fechado. Por favor, abra-o novamente.")
        self.close()

    # ==========================
    # ABA 1: SINGLE
    # ==========================
    def setup_single_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        url_frame = QFrame(); url_layout = QHBoxLayout(url_frame); url_layout.setContentsMargins(0,0,0,0)
        self.txt_url = QLineEdit(); self.txt_url.setPlaceholderText("Cole o link aqui...")
        self.btn_analyze = QPushButton("Analisar"); self.btn_analyze.clicked.connect(self.iniciar_analise)
        url_layout.addWidget(QLabel("Link:")); url_layout.addWidget(self.txt_url); url_layout.addWidget(self.btn_analyze)
        layout.addWidget(url_frame)

        self.lbl_status = QLabel("Aguardando..."); self.lbl_status.setStyleSheet("color: gray;")
        layout.addWidget(self.lbl_status)

        self.details_frame = QFrame(); self.details_frame.setVisible(False); det_layout = QVBoxLayout(self.details_frame)
        det_layout.addWidget(QLabel("Nome do Arquivo:")); self.txt_filename = QLineEdit(); det_layout.addWidget(self.txt_filename)
        
        opts_layout = QHBoxLayout()
        self.rb_video = QRadioButton("Vídeo (MP4)"); self.rb_audio = QRadioButton("Áudio (MP3)"); self.rb_video.setChecked(True)
        self.cb_quality = QComboBox(); self.cb_quality.setMinimumWidth(150)
        opts_layout.addWidget(self.rb_video); opts_layout.addWidget(self.rb_audio); opts_layout.addStretch(); opts_layout.addWidget(QLabel("Qualidade:")); opts_layout.addWidget(self.cb_quality)
        det_layout.addLayout(opts_layout)

        path_layout = QHBoxLayout()
        self.cb_path = QComboBox(); self.cb_path.addItems(self.settings["paths"] if self.settings["paths"] else [self.download_folder]); self.cb_path.setEditable(True)
        btn_browse = QPushButton("..."); btn_browse.setFixedWidth(40); btn_browse.clicked.connect(lambda: self.escolher_pasta(self.cb_path))
        path_layout.addWidget(QLabel("Salvar em:")); path_layout.addWidget(self.cb_path); path_layout.addWidget(btn_browse)
        det_layout.addLayout(path_layout)
        layout.addWidget(self.details_frame)

        self.progress_bar = QProgressBar(); self.progress_bar.setVisible(False)
        self.btn_download = QPushButton("BAIXAR"); self.btn_download.setStyleSheet("background-color: #2ea043; height: 40px;"); self.btn_download.setEnabled(False); self.btn_download.clicked.connect(self.iniciar_download)
        layout.addStretch(); layout.addWidget(self.progress_bar); layout.addWidget(self.btn_download)
        self.tabs.addTab(tab, "Download Único")

    def iniciar_analise(self):
        url = self.txt_url.text().strip()
        if not url: return
        self.lbl_status.setText("Analisando...")
        self.btn_analyze.setEnabled(False)
        self.worker_analysis = AnalysisWorker(self.engine, url)
        self.worker_analysis.finished.connect(self.on_analysis_finished)
        self.worker_analysis.error.connect(self.on_error)
        self.worker_analysis.start()

    def on_analysis_finished(self, info, opts, strat):
        self.current_video_info = info; self.current_video_opts = opts
        self.lbl_status.setText(f"Pronto (Modo: {strat})")
        self.txt_filename.setText(sanitizar_nome(info.get('title', 'video')))
        self.cb_quality.clear()
        formats = info.get('formats', [])
        resolucoes = sorted(list(set([f['height'] for f in formats if f.get('height')])), reverse=True)
        if not resolucoes: resolucoes = ["Melhor"]
        self.cb_quality.addItems([str(x) for x in resolucoes])
        self.details_frame.setVisible(True); self.btn_download.setEnabled(True); self.btn_analyze.setEnabled(True)

    def iniciar_download(self):
        url = self.txt_url.text(); nome = self.txt_filename.text(); pasta = self.cb_path.currentText(); self.salvar_path(pasta)
        tipo = "audio" if self.rb_audio.isChecked() else "video"; res = self.cb_quality.currentText()
        self.progress_bar.setVisible(True); self.progress_bar.setValue(0); self.btn_download.setEnabled(False); self.btn_analyze.setEnabled(False)
        self.worker_download = DownloadWorker(self.engine, url, pasta, nome, tipo, res, self.current_video_opts)
        self.worker_download.progress.connect(lambda v, t: (self.progress_bar.setValue(int(v)), self.lbl_status.setText(t)))
        self.worker_download.finished.connect(self.on_download_finished)
        self.worker_download.error.connect(self.on_error)
        self.worker_download.start()

    def on_download_finished(self, info):
        self.lbl_status.setText("Concluído!"); self.progress_bar.setVisible(False); self.btn_download.setEnabled(True); self.btn_analyze.setEnabled(True)
        tipo = "audio" if self.rb_audio.isChecked() else "video"
        self.registrar_historico(info, self.cb_path.currentText(), tipo)
        QMessageBox.information(self, "Sucesso", "Download finalizado!")

    def on_error(self, err):
        self.lbl_status.setText("Erro."); self.btn_download.setEnabled(True); self.btn_analyze.setEnabled(True)
        QMessageBox.critical(self, "Erro", str(err))

    # ==========================
    # ABA 2: PLAYLIST
    # ==========================
    def setup_playlist_tab(self):
        tab = QWidget(); layout = QVBoxLayout(tab); layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        url_frame = QFrame(); url_layout = QHBoxLayout(url_frame); url_layout.setContentsMargins(0,0,0,0)
        self.pl_url = QLineEdit(); self.pl_url.setPlaceholderText("Cole o link da Playlist...")
        self.pl_btn_analyze = QPushButton("Carregar Lista"); self.pl_btn_analyze.clicked.connect(self.iniciar_analise_playlist)
        url_layout.addWidget(QLabel("Playlist:")); url_layout.addWidget(self.pl_url); url_layout.addWidget(self.pl_btn_analyze); layout.addWidget(url_frame)

        self.pl_opts_frame = QFrame(); self.pl_opts_frame.setVisible(False); pl_opts_layout = QVBoxLayout(self.pl_opts_frame)
        row1 = QHBoxLayout()
        self.pl_rb_video = QRadioButton("Vídeo"); self.pl_rb_audio = QRadioButton("Áudio"); self.pl_rb_video.setChecked(True)
        self.pl_combo_res = QComboBox(); self.pl_combo_res.addItems(["Melhor", "1080", "720", "480"])
        row1.addWidget(self.pl_rb_video); row1.addWidget(self.pl_rb_audio); row1.addWidget(QLabel("Limite:")); row1.addWidget(self.pl_combo_res); pl_opts_layout.addLayout(row1)

        row2 = QHBoxLayout()
        self.pl_cb_path = QComboBox(); self.pl_cb_path.addItems(self.settings["paths"]); self.pl_cb_path.setEditable(True)
        pl_browse = QPushButton("..."); pl_browse.setFixedWidth(40); pl_browse.clicked.connect(lambda: self.escolher_pasta(self.pl_cb_path))
        row2.addWidget(QLabel("Salvar em:")); row2.addWidget(self.pl_cb_path); row2.addWidget(pl_browse); pl_opts_layout.addLayout(row2)
        
        self.lbl_pl_count = QLabel("0 vídeos."); pl_opts_layout.addWidget(self.lbl_pl_count); layout.addWidget(self.pl_opts_frame)
        self.pl_log = QTextEdit(); self.pl_log.setReadOnly(True); layout.addWidget(self.pl_log)
        self.pl_btn_download = QPushButton("BAIXAR PLAYLIST"); self.pl_btn_download.setStyleSheet("background-color: #b36b00; height: 45px;"); self.pl_btn_download.setEnabled(False); self.pl_btn_download.clicked.connect(self.iniciar_download_playlist)
        layout.addWidget(self.pl_btn_download)
        self.tabs.addTab(tab, "Playlist")
        self.pl_entries = []; self.pl_opts_engine = None

    def iniciar_analise_playlist(self):
        url = self.pl_url.text(); 
        if not url: return
        self.pl_log.clear(); self.pl_log.append("Analisando..."); self.pl_btn_analyze.setEnabled(False); self.pl_opts_frame.setVisible(False)
        self.pl_worker_ana = PlaylistAnalysisWorker(self.engine, url)
        self.pl_worker_ana.finished.connect(self.on_pl_ana_finished); self.pl_worker_ana.error.connect(self.on_pl_error); self.pl_worker_ana.start()

    def on_pl_ana_finished(self, info, opts, strat):
        self.pl_btn_analyze.setEnabled(True)
        if 'entries' not in info: self.pl_log.append("Erro: Lista vazia."); return
        self.pl_entries = list(info['entries']); self.pl_opts_engine = opts
        self.lbl_pl_count.setText(f"{len(self.pl_entries)} vídeos. (Modo: {strat})"); self.pl_log.append(f"Encontrados: {len(self.pl_entries)}"); self.pl_opts_frame.setVisible(True); self.pl_btn_download.setEnabled(True)

    def on_pl_error(self, err): self.pl_log.append(f"ERRO: {err}"); self.pl_btn_analyze.setEnabled(True)

    def iniciar_download_playlist(self):
        self.pl_btn_download.setEnabled(False); self.pl_btn_analyze.setEnabled(False); self.pl_log.append("Iniciando...")
        pasta = self.pl_cb_path.currentText(); self.salvar_path(pasta)
        tipo = "audio" if self.pl_rb_audio.isChecked() else "video"
        res = self.pl_combo_res.currentText(); 
        if res == "Melhor": res = None
        self.pl_worker_down = PlaylistDownloadWorker(self.engine, self.pl_entries, pasta, tipo, res, self.pl_opts_engine)
        self.pl_worker_down.log.connect(self.pl_log.append); self.pl_worker_down.video_finished.connect(lambda info: self.registrar_historico(info, pasta, tipo))
        self.pl_worker_down.finished.connect(self.on_pl_finished); self.pl_worker_down.start()

    def on_pl_finished(self):
        self.pl_log.append("--- FIM ---"); self.pl_btn_download.setEnabled(True); self.pl_btn_analyze.setEnabled(True); QMessageBox.information(self, "Playlist", "Processo finalizado.")

    # ==========================
    # ABA 3: HISTÓRICO
    # ==========================
    def setup_history_tab(self):
        tab = QWidget(); layout = QVBoxLayout(tab)
        self.table = QTableWidget(); self.table.setColumnCount(5); self.table.setHorizontalHeaderLabels(["Data", "Título", "Tipo", "Tamanho", "Caminho"])
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch); self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows); self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        layout.addWidget(self.table)
        btn_layout = QHBoxLayout()
        btn_refresh = QPushButton("Atualizar Tabela"); btn_refresh.clicked.connect(self.carregar_historico_tabela)
        btn_open = QPushButton("Abrir Local"); btn_open.clicked.connect(self.abrir_item_historico)
        btn_layout.addWidget(btn_refresh); btn_layout.addWidget(btn_open); layout.addLayout(btn_layout)
        self.tabs.addTab(tab, "Histórico"); self.carregar_historico_tabela()

    def registrar_historico(self, info, pasta, tipo):
        item = {"title": info.get('title'), "type": tipo, "path": pasta, "size": info.get('filesize') or info.get('filesize_approx'), "date": datetime.now().strftime("%d/%m/%Y %H:%M")}
        self.history.insert(0, item); salvar_json(HISTORY_FILE, self.history); self.carregar_historico_tabela()

    def carregar_historico_tabela(self):
        self.table.setRowCount(0)
        for row, item in enumerate(self.history):
            self.table.insertRow(row)
            self.table.setItem(row, 0, QTableWidgetItem(item.get('date', '')))
            self.table.setItem(row, 1, QTableWidgetItem(item.get('title', '')))
            self.table.setItem(row, 2, QTableWidgetItem(item.get('type', '').upper()))
            self.table.setItem(row, 3, QTableWidgetItem(formatar_tamanho(item.get('size'))))
            self.table.setItem(row, 4, QTableWidgetItem(item.get('path', '')))

    def abrir_item_historico(self):
        row = self.table.currentRow()
        if row < 0: return
        path = self.table.item(row, 4).text()
        if os.path.exists(path): os.startfile(path)
        else: QMessageBox.warning(self, "Erro", "Pasta não encontrada.")

    def escolher_pasta(self, combo):
        folder = QFileDialog.getExistingDirectory(self, "Selecionar Pasta")
        if folder: combo.setCurrentText(folder); self.salvar_path(folder)

    def salvar_path(self, folder):
        if folder and folder not in self.settings["paths"]:
            self.settings["paths"].insert(0, folder); self.settings["paths"] = self.settings["paths"][:10]; salvar_json(SETTINGS_FILE, self.settings)