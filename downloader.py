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
        
        # Configura ambiente para o QuickJS (necessário para decriptar 4K em alguns casos)
        qjs_dir = os.path.dirname(self.qjs_path)
        if os.path.exists(qjs_dir) and qjs_dir not in os.environ['PATH']:
            os.environ['PATH'] += os.pathsep + qjs_dir

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
        Estratégia Camaleão V2 (Focada em Android Creator para evitar DRM)
        """
        self._limpar_cache()
        erros = []
        
        # Verifica se tem cookies para decidir se tenta a estratégia Web/TV com login
        tem_cookies = os.path.exists(self.cookies_txt)

        # LISTA DE ESTRATÉGIAS ATUALIZADA (Fevereiro 2026)
        estrategias = [
            # 1. ANDROID CREATOR: Geralmente ignora bloqueios de bot e não tem DRM de música
            ("Android Creator", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
                'extractor_args': {'youtube': {'player_client': ['android_creator']}}
            }),
            
            # 2. ANDROID PADRÃO: O mais robusto historicamente
            ("Android", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
                'extractor_args': {'youtube': {'player_client': ['android']}}
            }),

            # 3. WEB (Só se tiver cookies - arriscado sem PO Token, mas tenta)
            ("Web + Cookies", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 
                'cookiefile': self.cookies_txt
            }) if tem_cookies else None,

            # 4. IOS (Tentativa válida, mas frequentemente bloqueada)
            ("iOS", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
                'extractor_args': {'youtube': {'player_client': ['ios']}}
            }),
            
            # 5. SMART TV (Último recurso - Falha em músicas com DRM, bom para vídeos restritos por idade)
            ("Smart TV", {
                'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
                'extractor_args': {'youtube': {'player_client': ['tv']}}
            }),
        ]

        # Filtra estratégias None (caso não tenha cookies)
        estrategias = [e for e in estrategias if e is not None]

        for nome, opts in estrategias:
            try:
                print(f"Tentando estratégia: {nome}...")
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    return info, opts, nome
            except Exception as e:
                msg_erro = str(e).lower()
                erros.append(f"{nome}: {msg_erro}")
                
                # Se for DRM, sabemos que essa estratégia nunca vai funcionar para esse vídeo
                if "drm" in msg_erro:
                    print(f"-> Falha por DRM na estratégia {nome}. Pulando...")
                    continue
                
                # Se o vídeo não existe, para tudo imediatamente
                if "videoid" in msg_erro and ("incomplete" in msg_erro or "exist" in msg_erro):
                    raise e

        raise Exception(f"Todas as estratégias falharam.\nLog: {erros}")

    def baixar(self, url, pasta, nome_arquivo, tipo, resolucao, opcoes_base, progress_hook):
        opts = opcoes_base.copy()
        
        # Configurações de Saída
        opts.update({
            'outtmpl': os.path.join(pasta, f"{nome_arquivo}.%(ext)s"),
            'ffmpeg_location': os.path.dirname(self.ffmpeg_path),
            'progress_hooks': [progress_hook],
            'nocheckcertificate': True,
            # Força o uso de ipv4 se ipv6 estiver causando timeout (comum no Brasil)
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
                # Tenta baixar o melhor vídeo até a resolução pedida
                opts['format'] = f'bestvideo[height<={resolucao}]+bestaudio/best'
            else:
                opts['format'] = 'bestvideo+bestaudio/best'
            opts['merge_output_format'] = 'mp4'

        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=True)