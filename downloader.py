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
        self.cookies_json = os.path.join(PATHS["root"], "cookies.json")
        
        # Configura ambiente para o QuickJS (necessário para decriptar 4K)
        qjs_dir = os.path.dirname(self.qjs_path)
        if os.path.exists(qjs_dir) and qjs_dir not in os.environ['PATH']:
            os.environ['PATH'] += os.pathsep + qjs_dir

        # Tenta converter cookies ao iniciar a engine
        self._converter_cookies()

    def _converter_cookies(self):
        """Converte cookies.json para formato Netscape se necessário."""
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
        except Exception as e:
            print(f"Erro ao converter cookies: {e}")

    def _limpar_cache(self):
        try:
            with yt_dlp.YoutubeDL() as ydl:
                ydl.cache.remove()
        except: pass

    def analisar_camaleao(self, url):
        """
        Executa a estratégia de 5 passos para driblar o erro 403.
        Retorna: (info_dict, opcoes_vencedoras, nome_da_estrategia)
        """
        self._limpar_cache()
        erros = []

        # Estratégias definidas em ordem de qualidade/prioridade
        estrategias = [
            ("Web Padrão", {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True}),
            ("Web + Cookies", {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 'cookiefile': self.cookies_txt}),
            ("iOS", {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 'extractor_args': {'youtube': {'player_client': ['ios']}}}),
            ("Android", {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 'extractor_args': {'youtube': {'player_client': ['android']}}}),
            ("Smart TV", {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 'extractor_args': {'youtube': {'player_client': ['tv']}}})
        ]

        for nome, opts in estrategias:
            # Pula estratégia de cookies se não tiver arquivo
            if nome == "Web + Cookies" and not os.path.exists(self.cookies_txt):
                continue

            try:
                print(f"Tentando estratégia: {nome}...")
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    return info, opts, nome
            except Exception as e:
                erros.append(f"{nome}: {str(e)}")
                # Se for erro de link inválido (não de bloqueio), para logo
                if "videoid" in str(e).lower() and "incomplete" in str(e).lower():
                    raise e

        raise Exception(f"Todas as estratégias falharam. Detalhes: {erros}")

    def baixar(self, url, pasta, nome_arquivo, tipo, resolucao, opcoes_base, progress_hook):
        """
        Realiza o download usando as opções que venceram na análise.
        """
        opts = opcoes_base.copy()
        
        # Configurações de Saída
        opts.update({
            'outtmpl': os.path.join(pasta, f"{nome_arquivo}.%(ext)s"),
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path),
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True
        })

        # Configurações de Formato
        if tipo == 'audio':
            opts.update({
                'format': 'bestaudio/best',
                'keepvideo': False,
                'postprocessors': [{'key': 'FFmpegExtractAudio','preferredcodec': 'mp3'}]
            })
        else:
            # Lógica de resolução
            if resolucao and resolucao.isdigit():
                opts['format'] = f'bestvideo[height<={resolucao}]+bestaudio/best'
            else:
                opts['format'] = 'bestvideo+bestaudio/best'
            opts['merge_output_format'] = 'mp4'

        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=True)