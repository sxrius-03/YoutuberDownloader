use serde::{Deserialize, Serialize};
use std::fs::File;
use std::process::{Command, exit};

#[derive(Deserialize, Debug, Clone)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize, Debug, Clone)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: String,
    pub download_url: String,
}

#[tauri::command]
pub async fn check_for_updates() -> Result<Option<UpdateInfo>, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .user_agent("YoutubeDownloader-App")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get("https://api.github.com/repos/sxrius-03/YoutuberDownloader/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(None);
    }

    let release: GithubRelease = res.json().await.map_err(|e| e.to_string())?;
    let latest_version = release.tag_name.trim_start_matches(['v', 'V']).to_string();

    if latest_version != current_version && is_newer(&current_version, &latest_version) {
        // Find .exe installer asset
        let setup_asset = release.assets.iter().find(|a| a.name.ends_with(".exe"));
        if let Some(asset) = setup_asset {
            return Ok(Some(UpdateInfo {
                current_version,
                latest_version,
                release_notes: release.body.unwrap_or_default(),
                download_url: asset.browser_download_url.clone(),
            }));
        }
    }

    Ok(None)
}

fn is_newer(current: &str, latest: &str) -> bool {
    let c: Vec<u32> = current.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let l: Vec<u32> = latest.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let max_len = std::cmp::max(c.len(), l.len());
    for i in 0..max_len {
        let cv = *c.get(i).unwrap_or(&0);
        let lv = *l.get(i).unwrap_or(&0);
        if lv > cv {
            return true;
        }
        if lv < cv {
            return false;
        }
    }
    false
}

#[tauri::command]
pub async fn install_update(download_url: String) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let installer_name = format!("YoutubeDownloader-Setup-Update-{}.exe", timestamp);
    let installer_path = temp_dir.join(installer_name);

    let client = reqwest::Client::builder()
        .user_agent("YoutubeDownloader-App")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&download_url).send().await.map_err(|e| e.to_string())?;
    let mut dest = File::create(&installer_path).map_err(|e| e.to_string())?;
    let content = response.bytes().await.map_err(|e| e.to_string())?;
    std::io::copy(&mut &*content, &mut dest).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("powershell");
        cmd.creation_flags(0x08000000);
        cmd.arg("-WindowStyle")
            .arg("Hidden")
            .arg("-Command")
            .arg(format!(
                "Start-Process -FilePath '{}'",
                installer_path.to_string_lossy()
            ))
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(&installer_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    exit(0);
}
