import yt_dlp
import os
import json
import time
from app.utils import PATHS, get_binary_path, sanitizar_nome

class YouTubeEngine:
    def __init__(self):
        self.ffmpeg_path = get_binary_path("ffmpeg.exe")
        self.qjs_path = get_binary_path("qjs.exe")
        self.cookies_txt = os.path.join(PATHS["root"], "cookies.txt")
        if not os.path.exists(self.cookies_txt):
            self.cookies_txt = os.path.join(PATHS["bundle"], "cookies.txt")
            
        self.cookies_json = os.path.join(PATHS["root"], "cookies.json")
        if not os.path.exists(self.cookies_json):
            self.cookies_json = os.path.join(PATHS["bundle"], "cookies.json")
        
        qjs_dir = os.path.dirname(self.qjs_path)
        if os.path.exists(qjs_dir) and qjs_dir not in os.environ['PATH']:
            os.environ['PATH'] += os.pathsep + qjs_dir

        self._converter_cookies()

    def _converter_cookies(self):
        if os.path.exists(self.cookies_txt): return
        if not os.path.exists(self.cookies_json): return

        try:
            with open(self.cookies_json, 'r', encoding='utf-8') as f:
                dados = json.load(f)
            
            with open(self.cookies_txt, 'w', encoding='utf-8') as f:
                f.write("# Netscape HTTP Cookie File\n\n")
                for c in dados:
                    domain = c.get('domain', '')
                    if not domain.startswith('.'): domain = '.' + domain
                    path = c.get('path', '/')
                    secure = 'TRUE' if c.get('secure', False) else 'FALSE'
                    exp = str(int(c.get('expirationDate', c.get('expiry', time.time() + 31536000))))
                    f.write(f"{domain}\tTRUE\t{path}\t{secure}\t{exp}\t{c.get('name')}\t{c.get('value')}\n")
        except Exception: pass

    def _limpar_cache(self):
        try:
            with yt_dlp.YoutubeDL() as ydl:
                ydl.cache.remove()
        except: pass

    def analisar_camaleao(self, url, is_playlist=False):
        """
        Estratégia Camaleão V3.
        Aceita is_playlist=True para forçar extração rápida (extract_flat).
        """
        self._limpar_cache()
        erros = []
        tem_cookies = os.path.exists(self.cookies_txt)

        # AQUI ESTÁ A LÓGICA OTIMIZADA
        estrategias = [
            # Prioridade 1: Android Creator (Anti-Bloqueio e Anti-DRM)
            ("Android Creator", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
                'extractor_args': {'youtube': {'player_client': ['android_creator']}}
            }),
            # Prioridade 2: Android Padrão
            ("Android", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
                'extractor_args': {'youtube': {'player_client': ['android']}}
            }),
            # Prioridade 3: Web (Só se tiver cookies)
            ("Web + Cookies", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 
                'cookiefile': self.cookies_txt
            }) if tem_cookies else None,
            # Prioridade 4: iOS
            ("iOS", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
                'extractor_args': {'youtube': {'player_client': ['ios']}}
            }),
        ]
        # Remove estratégias vazias (None) caso não tenha cookies
        estrategias = [e for e in estrategias if e is not None]

        for nome, opts in estrategias:
            try:
                # Cópia das opções para não afetar as outras tentativas
                current_opts = opts.copy()
                
                # SE FOR PLAYLIST: Adiciona extract_flat para não baixar os vídeos na análise
                if is_playlist:
                    current_opts['extract_flat'] = True

                print(f"Tentando estratégia: {nome}...")
                with yt_dlp.YoutubeDL(current_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    return info, current_opts, nome
            except Exception as e:
                msg = str(e).lower()
                erros.append(f"{nome}: {msg}")
                # Se o erro for "video inexistente", não adianta tentar outras estratégias
                if "videoid" in msg and ("incomplete" in msg or "exist" in msg):
                    raise e

        raise Exception(f"Todas as estratégias falharam.\nLog: {erros}")

    def baixar(self, url, pasta, nome_arquivo, tipo, resolucao, opcoes_base, progress_hook):
        opts = opcoes_base.copy()
        
        # Remove a flag de playlist para baixar de verdade
        if 'extract_flat' in opts: del opts['extract_flat']

        opts.update({
            'outtmpl': os.path.join(pasta, f"{nome_arquivo}.%(ext)s"),
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path),
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True,
            'source_address': '0.0.0.0'
        })

        if tipo == 'audio':
            opts.update({
                'format': 'bestaudio/best',
                'keepvideo': False,
                'postprocessors': [{'key': 'FFmpegExtractAudio','preferredcodec': 'mp3'}]
            })
        else:
            if resolucao and resolucao.isdigit():
                opts['format'] = f'bestvideo[height<={resolucao}]+bestaudio/best'
            else:
                opts['format'] = 'bestvideo+bestaudio/best'
            opts['merge_output_format'] = 'mp4'

        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=True)