import sys
import os
import threading
from datetime import datetime
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QLabel, QLineEdit, QPushButton, 
                             QTabWidget, QProgressBar, QComboBox, QRadioButton, 
                             QButtonGroup, QFileDialog, QMessageBox, QTableWidget, 
                             QTableWidgetItem, QHeaderView, QFrame, QAbstractItemView)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QSize, QTimer
from PyQt6.QtGui import QIcon, QCursor, QAction

# Importa a lógica dos arquivos anteriores
from app.downloader import YouTubeEngine
from app.utils import PATHS, SETTINGS_FILE, HISTORY_FILE, carregar_json, salvar_json, formatar_tamanho, sanitizar_nome

# --- ESTILO DARK MODERNO (CSS) ---
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
"""

# --- WORKERS (THREADS PARA NÃO TRAVAR A TELA) ---
class AnalysisWorker(QThread):
    finished = pyqtSignal(dict, dict, str) # info, opts, strategy_name
    error = pyqtSignal(str)

    def __init__(self, engine, url):
        super().__init__()
        self.engine = engine
        self.url = url

    def run(self):
        try:
            info, opts, strat = self.engine.analisar_camaleao(self.url)
            self.finished.emit(info, opts, strat)
        except Exception as e:
            self.error.emit(str(e))

class DownloadWorker(QThread):
    progress = pyqtSignal(float, str) # percent, status text
    finished = pyqtSignal()
    error = pyqtSignal(str)

    def __init__(self, engine, url, path, filename, type_, res, opts):
        super().__init__()
        self.engine = engine
        self.url = url
        self.path = path
        self.filename = filename
        self.type_ = type_
        self.res = res
        self.opts = opts

    def run(self):
        def hook(d):
            if d['status'] == 'downloading':
                try:
                    p_str = d.get('_percent_str', '0%').replace('%', '')
                    val = float(p_str)
                    self.progress.emit(val, f"Baixando: {int(val)}%")
                except: pass
            elif d['status'] == 'finished':
                self.progress.emit(100, "Processando finalização...")

        try:
            self.engine.baixar(self.url, self.path, self.filename, self.type_, self.res, self.opts, hook)
            self.finished.emit()
        except Exception as e:
            self.error.emit(str(e))

# --- JANELA PRINCIPAL ---
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("YouTube Downloader Ultimate - V5.3 (PyQt6)")
        self.resize(1000, 750)
        self.setStyleSheet(STYLESHEET)

        # Inicializa Engine
        self.engine = YouTubeEngine()
        self.settings = carregar_json(SETTINGS_FILE, {"paths": []})
        self.history = carregar_json(HISTORY_FILE, [])
        self.download_folder = self.settings["paths"][0] if self.settings["paths"] else os.path.join(os.path.expanduser("~"), "Downloads")

        # Widget Central
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)

        # Abas
        self.tabs = QTabWidget()
        main_layout.addWidget(self.tabs)

        self.setup_single_tab()
        self.setup_playlist_tab() # Pode implementar similar ao single
        self.setup_history_tab()

        # Variáveis de Estado
        self.current_video_info = None
        self.current_video_opts = None

    # ==========================
    # ABA 1: DOWNLOAD ÚNICO
    # ==========================
    def setup_single_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setSpacing(15)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        # 1. URL Input
        url_frame = QFrame()
        url_layout = QHBoxLayout(url_frame)
        url_layout.setContentsMargins(0,0,0,0)
        
        lbl_url = QLabel("Link do Vídeo:")
        self.txt_url = QLineEdit()
        self.txt_url.setPlaceholderText("Cole o link aqui...")
        self.btn_analyze = QPushButton("Analisar")
        self.btn_analyze.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.btn_analyze.clicked.connect(self.iniciar_analise)

        url_layout.addWidget(lbl_url)
        url_layout.addWidget(self.txt_url)
        url_layout.addWidget(self.btn_analyze)
        layout.addWidget(url_frame)

        # 2. Status Label
        self.lbl_status = QLabel("Aguardando link...")
        self.lbl_status.setStyleSheet("color: #aaaaaa; font-style: italic;")
        layout.addWidget(self.lbl_status)

        # 3. Detalhes (Group Hidden initially)
        self.details_frame = QFrame()
        self.details_frame.setVisible(False)
        det_layout = QVBoxLayout(self.details_frame)
        det_layout.setContentsMargins(0, 10, 0, 10)

        # Título Editável
        lbl_title = QLabel("Nome do Arquivo:")
        self.txt_filename = QLineEdit()
        det_layout.addWidget(lbl_title)
        det_layout.addWidget(self.txt_filename)

        # Opções (Radio + Combo)
        opts_layout = QHBoxLayout()
        
        self.radio_group = QButtonGroup()
        self.rb_video = QRadioButton("Vídeo (MP4)")
        self.rb_audio = QRadioButton("Áudio (MP3)")
        self.rb_video.setChecked(True)
        self.radio_group.addButton(self.rb_video)
        self.radio_group.addButton(self.rb_audio)
        
        self.cb_quality = QComboBox()
        self.cb_quality.setMinimumWidth(150)

        opts_layout.addWidget(self.rb_video)
        opts_layout.addWidget(self.rb_audio)
        opts_layout.addStretch()
        opts_layout.addWidget(QLabel("Qualidade:"))
        opts_layout.addWidget(self.cb_quality)
        det_layout.addLayout(opts_layout)

        # Seleção de Pasta
        path_layout = QHBoxLayout()
        self.cb_path = QComboBox()
        self.cb_path.addItems(self.settings["paths"] if self.settings["paths"] else [self.download_folder])
        self.cb_path.setEditable(True)
        btn_browse = QPushButton("...")
        btn_browse.setFixedWidth(40)
        btn_browse.clicked.connect(self.escolher_pasta)

        path_layout.addWidget(QLabel("Salvar em:"))
        path_layout.addWidget(self.cb_path)
        path_layout.addWidget(btn_browse)
        det_layout.addLayout(path_layout)

        layout.addWidget(self.details_frame)

        # 4. Download e Progresso
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        self.progress_bar.setVisible(False)
        
        self.btn_download = QPushButton("BAIXAR AGORA")
        self.btn_download.setMinimumHeight(45)
        self.btn_download.setStyleSheet("background-color: #2ea043; font-size: 16px;")
        self.btn_download.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.btn_download.setEnabled(False)
        self.btn_download.clicked.connect(self.iniciar_download)

        layout.addStretch() # Empurra tudo pra cima
        layout.addWidget(self.progress_bar)
        layout.addWidget(self.btn_download)

        self.tabs.addTab(tab, "Download Único")

    # --- Lógica da Aba 1 ---
    def iniciar_analise(self):
        url = self.txt_url.text().strip()
        if not url: return

        self.lbl_status.setText("Analisando (Tentando 5 estratégias)...")
        self.lbl_status.setStyleSheet("color: #00aaff;")
        self.btn_analyze.setEnabled(False)
        self.details_frame.setVisible(False)
        self.btn_download.setEnabled(False)

        # Inicia Thread
        self.worker_analysis = AnalysisWorker(self.engine, url)
        self.worker_analysis.finished.connect(self.on_analysis_finished)
        self.worker_analysis.error.connect(self.on_analysis_error)
        self.worker_analysis.start()

    def on_analysis_finished(self, info, opts, strat_name):
        self.current_video_info = info
        self.current_video_opts = opts
        
        self.lbl_status.setText(f"Sucesso! Estratégia usada: {strat_name}")
        self.lbl_status.setStyleSheet("color: #4CAF50;")
        self.btn_analyze.setEnabled(True)
        
        # Preenche campos
        title = sanitizar_nome(info.get('title', 'video'))
        self.txt_filename.setText(title)
        
        # Preenche Resoluções
        self.cb_quality.clear()
        formats = info.get('formats', [])
        resolucoes = set()
        for f in formats:
            if f.get('height'): resolucoes.add(f['height'])
        lista = sorted(list(resolucoes), reverse=True)
        if not lista: lista = ["Melhor Qualidade"]
        
        self.cb_quality.addItems([str(x) for x in lista])
        
        self.details_frame.setVisible(True)
        self.btn_download.setEnabled(True)

    def on_analysis_error(self, err_msg):
        self.lbl_status.setText("Erro na análise.")
        self.lbl_status.setStyleSheet("color: #ff5555;")
        self.btn_analyze.setEnabled(True)
        QMessageBox.critical(self, "Erro", f"Falha ao analisar:\n{err_msg}")

    def iniciar_download(self):
        if not self.current_video_info: return
        
        url = self.txt_url.text()
        nome = self.txt_filename.text()
        pasta = self.cb_path.currentText()
        self.salvar_path(pasta)
        
        tipo = "audio" if self.rb_audio.isChecked() else "video"
        res = self.cb_quality.currentText()

        # UI Update
        self.btn_download.setEnabled(False)
        self.btn_analyze.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)

        # Thread de Download
        self.worker_download = DownloadWorker(self.engine, url, pasta, nome, tipo, res, self.current_video_opts)
        self.worker_download.progress.connect(self.update_progress)
        self.worker_download.finished.connect(self.on_download_finished)
        self.worker_download.error.connect(self.on_download_error)
        self.worker_download.start()

    def update_progress(self, val, text):
        self.progress_bar.setValue(int(val))
        self.lbl_status.setText(text)

    def on_download_finished(self):
        self.lbl_status.setText("Download Concluído!")
        self.btn_download.setEnabled(True)
        self.btn_analyze.setEnabled(True)
        self.progress_bar.setVisible(False)
        
        # Registra histórico
        self.registrar_historico()
        QMessageBox.information(self, "Sucesso", "Download finalizado com sucesso!")

    def on_download_error(self, err):
        self.lbl_status.setText("Erro no download.")
        self.btn_download.setEnabled(True)
        self.btn_analyze.setEnabled(True)
        QMessageBox.critical(self, "Erro", str(err))

    # ==========================
    # ABA 2: PLAYLIST (Simplificada para brevidade)
    # ==========================
    def setup_playlist_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.addWidget(QLabel("Para baixar Playlists, a lógica é similar."))
        layout.addWidget(QLabel("Use o mesmo sistema de threads da aba 1."))
        self.tabs.addTab(tab, "Playlist")

    # ==========================
    # ABA 3: HISTÓRICO
    # ==========================
    def setup_history_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # Tabela
        self.table = QTableWidget()
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels(["Data", "Título", "Tipo", "Tamanho", "Caminho"])
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch) # Título estica
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers) # Read only
        
        layout.addWidget(self.table)

        # Botões
        btn_layout = QHBoxLayout()
        btn_refresh = QPushButton("Atualizar")
        btn_refresh.clicked.connect(self.carregar_historico_tabela)
        
        btn_open = QPushButton("Abrir Pasta")
        btn_open.clicked.connect(self.abrir_item_historico)

        btn_layout.addWidget(btn_refresh)
        btn_layout.addWidget(btn_open)
        layout.addLayout(btn_layout)

        self.tabs.addTab(tab, "Histórico")
        self.carregar_historico_tabela()

    def registrar_historico(self):
        info = self.current_video_info
        item = {
            "title": info.get('title'),
            "type": "audio" if self.rb_audio.isChecked() else "video",
            "path": self.cb_path.currentText(),
            "size": info.get('filesize') or info.get('filesize_approx'),
            "date": datetime.now().strftime("%d/%m/%Y %H:%M")
        }
        self.history.insert(0, item)
        salvar_json(HISTORY_FILE, self.history)
        self.carregar_historico_tabela()

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
        if os.path.exists(path):
            os.startfile(path)
        else:
            QMessageBox.warning(self, "Erro", "Pasta não encontrada.")

    # --- Auxiliares ---
    def escolher_pasta(self):
        folder = QFileDialog.getExistingDirectory(self, "Selecionar Pasta")
        if folder:
            self.cb_path.setCurrentText(folder)
            self.salvar_path(folder)

    def salvar_path(self, folder):
        if folder not in self.settings["paths"]:
            self.settings["paths"].insert(0, folder)
            self.settings["paths"] = self.settings["paths"][:10]
            salvar_json(SETTINGS_FILE, self.settings)