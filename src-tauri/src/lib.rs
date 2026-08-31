use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn create_hidden_command<P: AsRef<std::ffi::OsStr>>(program: P) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AnalysisResult {
    pub title: String,
    pub resolutions: Vec<String>,
    pub opts: serde_json::Value,
    pub strategy: String,
    pub thumbnail: Option<String>,
    pub duration: Option<String>,
    pub uploader: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlaylistVideo {
    pub title: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlaylistResult {
    pub title: String,
    pub videos: Vec<PlaylistVideo>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DownloadProgressPayload {
    pub task_id: String,
    pub status: String,
    pub progress: f64,
    pub speed: String,
    pub eta: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    pub paths: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HistoryItem {
    pub title: String,
    pub path: String,
    pub date: String,
    pub r#type: String,
    pub size: serde_json::Value,
}

fn get_app_dir(app: &AppHandle) -> PathBuf {
    use tauri::Manager;
    let path = app.path().app_local_data_dir().unwrap_or_else(|_| {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            PathBuf::from(local_app_data).join("com.siriux.youtubedownloader")
        } else if let Ok(user_profile) = std::env::var("USERPROFILE") {
            PathBuf::from(user_profile).join(".youtubedownloader")
        } else {
            PathBuf::from("data")
        }
    });
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

fn get_bin_path(app: &AppHandle, binary_name: &str) -> PathBuf {
    use tauri::Manager;

    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Tauri resource directory (bundled package)
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("bin").join(binary_name));
        candidates.push(res_dir.join(binary_name));
        candidates.push(res_dir.join("resources").join("bin").join(binary_name));
        candidates.push(res_dir.join("resources").join(binary_name));
        candidates.push(res_dir.join("_up_").join("bin").join(binary_name));
    }

    // 2. Next to executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("bin").join(binary_name));
            candidates.push(exe_dir.join(binary_name));
            candidates.push(exe_dir.join("resources").join("bin").join(binary_name));
            candidates.push(exe_dir.join("resources").join(binary_name));
            candidates.push(exe_dir.join("_up_").join("bin").join(binary_name));
        }
    }

    // 3. Workspace / local dev directory
    candidates.push(PathBuf::from("bin").join(binary_name));
    candidates.push(PathBuf::from("../bin").join(binary_name));
    candidates.push(PathBuf::from("src-tauri/bin").join(binary_name));

    for p in candidates {
        if p.exists() {
            return p.canonicalize().unwrap_or(p);
        }
    }

    // 4. Fallback to binary name in PATH
    PathBuf::from(binary_name)
}

#[tauri::command]
async fn analyze_video(app: AppHandle, url: String) -> Result<AnalysisResult, String> {
    let yt_dlp = get_bin_path(&app, "yt-dlp.exe");
    let qjs = get_bin_path(&app, "qjs.exe");
    println!("[analyze_video] Using yt-dlp binary at: {:?}", yt_dlp);

    let mut cmd = create_hidden_command(&yt_dlp);
    cmd.args(&["--dump-json", "--no-playlist"]);
    cmd.arg("--remote-components").arg("ejs:github");
    cmd.arg("--js-runtimes").arg("node");
    if qjs.exists() {
        cmd.arg("--js-runtimes").arg(format!("quickjs:{}", qjs.to_string_lossy()));
    }
    cmd.arg("--extractor-args").arg("youtube:player_client=android_vr,web,mweb,ios");
    cmd.arg("--socket-timeout").arg("30");
    cmd.arg("--retries").arg("10");
    cmd.arg(&url);

    let output = cmd.output()
        .map_err(|e| format!("Falha ao executar yt-dlp: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        eprintln!("[analyze_video error] {}", err);
        return Err(format!("Erro no yt-dlp: {}", err.trim()));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let val: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;

    let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("video").to_string();
    let thumbnail = val.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string());
    let uploader = val.get("uploader").or_else(|| val.get("channel")).and_then(|v| v.as_str()).map(|s| s.to_string());
    let duration = val.get("duration").and_then(|v| v.as_i64()).map(|d| {
        let mins = d / 60;
        let secs = d % 60;
        format!("{:02}:{:02}", mins, secs)
    });

    let mut resolutions = Vec::new();
    if let Some(formats) = val.get("formats").and_then(|v| v.as_array()) {
        for f in formats {
            if let Some(height) = f.get("height").and_then(|v| v.as_i64()) {
                let h_str = height.to_string();
                if !resolutions.contains(&h_str) {
                    resolutions.push(h_str);
                }
            }
        }
    }

    resolutions.sort_by(|a, b| b.parse::<i32>().unwrap_or(0).cmp(&a.parse::<i32>().unwrap_or(0)));
    if resolutions.is_empty() {
        resolutions.push("Melhor".to_string());
    }

    Ok(AnalysisResult {
        title,
        resolutions,
        opts: serde_json::json!({}),
        strategy: "Direct".to_string(),
        thumbnail,
        duration,
        uploader,
    })
}

#[tauri::command]
async fn analyze_playlist(app: AppHandle, url: String) -> Result<PlaylistResult, String> {
    let yt_dlp = get_bin_path(&app, "yt-dlp.exe");
    let qjs = get_bin_path(&app, "qjs.exe");
    println!("[analyze_playlist] Using yt-dlp binary at: {:?}", yt_dlp);

    let mut cmd = create_hidden_command(&yt_dlp);
    cmd.args(&["--flat-playlist", "--dump-json"]);
    cmd.arg("--remote-components").arg("ejs:github");
    cmd.arg("--js-runtimes").arg("node");
    if qjs.exists() {
        cmd.arg("--js-runtimes").arg(format!("quickjs:{}", qjs.to_string_lossy()));
    }
    cmd.arg("--extractor-args").arg("youtube:player_client=android_vr,web,mweb,ios");
    cmd.arg("--socket-timeout").arg("30");
    cmd.arg("--retries").arg("10");
    cmd.arg(&url);

    let output = cmd.output()
        .map_err(|e| format!("Falha ao executar yt-dlp: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        eprintln!("[analyze_playlist error] {}", err);
        return Err(format!("Erro ao analisar playlist: {}", err.trim()));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut videos = Vec::new();
    let mut playlist_title = "Playlist".to_string();

    for line in stdout_str.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(pt) = val.get("playlist_title").and_then(|v| v.as_str()) {
                playlist_title = pt.to_string();
            }
            let title = val.get("title").and_then(|v| v.as_str()).unwrap_or("Vídeo").to_string();
            let video_url = val.get("url").or_else(|| val.get("webpage_url"))
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !video_url.is_empty() {
                videos.push(PlaylistVideo { title, url: video_url });
            }
        }
    }

    Ok(PlaylistResult {
        title: playlist_title,
        videos,
    })
}

#[tauri::command]
async fn start_download(
    app: AppHandle,
    task_id: String,
    url: String,
    path: String,
    filename: String,
    download_type: String,
    quality: String,
    container: Option<String>,
) -> Result<String, String> {
    let yt_dlp = get_bin_path(&app, "yt-dlp.exe");
    let ffmpeg = get_bin_path(&app, "ffmpeg.exe");
    let ffmpeg_dir = ffmpeg.parent().unwrap_or(Path::new(".")).to_string_lossy().to_string();
    let qjs = get_bin_path(&app, "qjs.exe");

    let task_id_clone = task_id.clone();
    let app_handle = app.clone();

    // Determine target format container
    let target_format = container
        .unwrap_or_else(|| {
            if download_type == "audio" { "mp3".to_string() } else { "mp4".to_string() }
        })
        .to_lowercase();

    // Sanitize destination filename to avoid illegal characters on Windows
    let safe_filename = filename
        .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_")
        .trim()
        .to_string();
    let safe_filename = if safe_filename.is_empty() { "video".to_string() } else { safe_filename };

    tokio::task::spawn_blocking(move || {
        let mut cmd = create_hidden_command(&yt_dlp);
        cmd.arg("--newline");
        cmd.arg("--no-mtime");
        cmd.arg("--windows-filenames");
        cmd.arg("--remote-components").arg("ejs:github");
        cmd.arg("--js-runtimes").arg("node");

        if qjs.exists() {
            cmd.arg("--js-runtimes").arg(format!("quickjs:{}", qjs.to_string_lossy()));
        }

        if ffmpeg.exists() {
            cmd.arg("--ffmpeg-location").arg(&ffmpeg_dir);
        }

        cmd.arg("--extractor-args").arg("youtube:player_client=android_vr,web,mweb,ios");
        cmd.arg("--socket-timeout").arg("30");
        cmd.arg("--retries").arg("10");
        cmd.arg("--fragment-retries").arg("10");

        let out_dir = if path.trim().is_empty() {
            match std::env::var("USERPROFILE") {
                Ok(up) => format!("{}\\Downloads", up),
                Err(_) => ".".to_string(),
            }
        } else {
            path.trim_end_matches(['/', '\\']).to_string()
        };

        // Ensure target directory exists
        let _ = fs::create_dir_all(&out_dir);

        let out_tmpl = format!("{}/{}.%(ext)s", out_dir, safe_filename);
        cmd.arg("-o").arg(&out_tmpl);

        if download_type == "audio" {
            cmd.arg("-x");
            cmd.arg("--audio-format").arg(&target_format);
            cmd.arg("--audio-quality").arg("0");
        } else {
            let digits: String = quality.chars().filter(|c| c.is_ascii_digit()).collect();
            if !digits.is_empty() && quality != "Melhor" {
                let fmt = format!("bestvideo[height<={0}]+bestaudio/best[height<={0}]/best", digits);
                cmd.arg("-f").arg(&fmt);
            } else {
                cmd.arg("-f").arg("bestvideo+bestaudio/best");
            }

            if target_format == "mkv" || target_format == "webm" || target_format == "mp4" {
                cmd.arg("--merge-output-format").arg(&target_format);
            } else {
                cmd.arg("--recode-video").arg(&target_format);
            }
        }
        cmd.arg(&url);

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        println!("[yt-dlp command] {:?}", cmd);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Falha ao iniciar yt-dlp: {}", e);
                eprintln!("[yt-dlp error] {}", err_msg);
                let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                    task_id: task_id_clone,
                    status: "error".to_string(),
                    progress: 0.0,
                    speed: "".to_string(),
                    eta: "".to_string(),
                    message: err_msg,
                });
                return;
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let re_percent = regex::Regex::new(r"(\d+(?:\.\d+)?)%").unwrap();
        let re_speed = regex::Regex::new(r"at\s+([\d\w\.\/]+)").unwrap();
        let re_eta = regex::Regex::new(r"ETA\s+([\d:]+)").unwrap();

        let mut stderr_lines: Vec<String> = Vec::new();
        let stderr_handle = if let Some(err_pipe) = stderr {
            Some(std::thread::spawn(move || {
                let reader = BufReader::new(err_pipe);
                let mut captured = Vec::new();
                for line in reader.lines() {
                    if let Ok(l) = line {
                        eprintln!("[yt-dlp stderr] {}", l);
                        captured.push(l);
                    }
                }
                captured
            }))
        } else {
            None
        };

        if let Some(out_pipe) = stdout {
            let reader = BufReader::new(out_pipe);
            for line in reader.lines() {
                if let Ok(l) = line {
                    println!("[yt-dlp stdout] {}", l);
                    if l.contains("[download]") {
                        let mut progress = 0.0;
                        if let Some(cap) = re_percent.captures(&l) {
                            if let Ok(p) = cap[1].parse::<f64>() {
                                progress = p;
                            }
                        }
                        let speed = re_speed.captures(&l).map(|c| c[1].to_string()).unwrap_or_default();
                        let eta = re_eta.captures(&l).map(|c| c[1].to_string()).unwrap_or_default();

                        let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                            task_id: task_id_clone.clone(),
                            status: "downloading".to_string(),
                            progress,
                            speed,
                            eta,
                            message: format!("Baixando: {}%", progress as i32),
                        });
                    } else if l.contains("[ExtractAudio]") || l.contains("[Merger]") || l.contains("[Fixup]") {
                        let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                            task_id: task_id_clone.clone(),
                            status: "processing".to_string(),
                            progress: 100.0,
                            speed: "".to_string(),
                            eta: "".to_string(),
                            message: "Convertendo / mesclando áudio e vídeo...".to_string(),
                        });
                    }
                }
            }
        }

        if let Some(handle) = stderr_handle {
            if let Ok(errs) = handle.join() {
                stderr_lines = errs;
            }
        }

        let status = child.wait();
        match status {
            Ok(s) if s.success() => {
                let history_file = get_app_dir(&app_handle).join("history.json");
                let mut history: Vec<HistoryItem> = if history_file.exists() {
                    fs::read_to_string(&history_file)
                        .ok()
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or_default()
                } else {
                    Vec::new()
                };

                let now = chrono::Local::now().format("%d/%m/%Y %H:%M").to_string();
                let display_type = format!("{} ({})", 
                    if download_type == "audio" { "Áudio" } else { "Vídeo" },
                    target_format.to_uppercase()
                );

                history.insert(0, HistoryItem {
                    title: safe_filename,
                    path: out_dir,
                    date: now,
                    r#type: display_type,
                    size: serde_json::json!("N/A"),
                });
                history.truncate(100);
                let _ = fs::write(&history_file, serde_json::to_string_pretty(&history).unwrap_or_default());

                let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                    task_id: task_id_clone,
                    status: "finished".to_string(),
                    progress: 100.0,
                    speed: "0".to_string(),
                    eta: "0".to_string(),
                    message: "Download concluído com sucesso!".to_string(),
                });
            }
            _ => {
                let err_msg = if !stderr_lines.is_empty() {
                    stderr_lines.join("\n")
                } else {
                    "Processo do yt-dlp encerrou com erro".to_string()
                };
                eprintln!("[yt-dlp error] Process exited with failure: {}", err_msg);
                let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                    task_id: task_id_clone,
                    status: "error".to_string(),
                    progress: 0.0,
                    speed: "".to_string(),
                    eta: "".to_string(),
                    message: err_msg,
                });
            }
        }
    });

    Ok(task_id)
}

#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let settings_file = get_app_dir(&app).join("settings.json");
    if settings_file.exists() {
        if let Ok(content) = fs::read_to_string(&settings_file) {
            if let Ok(s) = serde_json::from_str::<Settings>(&content) {
                return Ok(s);
            }
        }
    }
    let default_downloads = match std::env::var("USERPROFILE") {
        Ok(up) => format!("{}\\Downloads", up),
        Err(_) => "C:\\Downloads".to_string(),
    };
    let default_settings = Settings { paths: vec![default_downloads] };
    let _ = fs::write(&settings_file, serde_json::to_string_pretty(&default_settings).unwrap_or_default());
    Ok(default_settings)
}

#[tauri::command]
async fn save_setting_path(app: AppHandle, path: String) -> Result<Settings, String> {
    let mut settings = get_settings(app.clone()).await.unwrap_or(Settings { paths: vec![] });
    if !path.is_empty() && !settings.paths.contains(&path) {
        settings.paths.insert(0, path);
        settings.paths.truncate(10);
        let settings_file = get_app_dir(&app).join("settings.json");
        let _ = fs::write(&settings_file, serde_json::to_string_pretty(&settings).unwrap_or_default());
    }
    Ok(settings)
}

#[tauri::command]
async fn choose_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder.map(|p| p.to_string()));
    });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_history(app: AppHandle) -> Result<Vec<HistoryItem>, String> {
    let history_file = get_app_dir(&app).join("history.json");
    if history_file.exists() {
        if let Ok(content) = fs::read_to_string(&history_file) {
            if let Ok(items) = serde_json::from_str::<Vec<HistoryItem>>(&content) {
                return Ok(items);
            }
        }
    }
    Ok(vec![])
}

#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        create_hidden_command("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Path does not exist".to_string())
    }
}

pub mod updater;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            analyze_video,
            analyze_playlist,
            start_download,
            get_settings,
            save_setting_path,
            choose_folder,
            get_history,
            open_folder,
            updater::check_for_updates,
            updater::install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
