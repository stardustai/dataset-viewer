use reqwest;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::PathBuf;
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginInstallResult {
    pub success: bool,
    pub plugin_id: String,
    pub version: String,
    pub install_path: String,
    pub source: String, // "npm-link", "npm-registry", "local-cache"
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginUninstallResult {
    pub success: bool,
    pub plugin_id: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginVersionInfo {
    pub current: String,
    pub latest: String,
    pub has_update: bool,
    pub changelog_url: Option<String>,
    pub publish_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginUpdateResult {
    pub success: bool,
    pub plugin_id: String,
    pub old_version: String,
    pub new_version: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Type, Default)]
pub struct PluginInstallOptions {
    pub version: Option<String>,
    pub force_reinstall: bool,
    pub verify_integrity: bool,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub enum PluginInstallSource {
    Registry { package_name: String },
    Local { path: String },
    Url { url: String },
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginInstallRequest {
    pub source: PluginInstallSource,
    pub options: Option<PluginInstallOptions>,
}

#[derive(Debug, Deserialize)]
struct NpmPackageInfo {
    #[allow(dead_code)]
    name: String,
    version: String,
    dist: NpmDist,
}

#[derive(Debug, Deserialize)]
struct NpmVersionDetail {
    version: String,
    dist: NpmDist,
}

#[derive(Debug, Deserialize)]
struct NpmDist {
    tarball: String,
}

/**
 * 统一的插件安装接口
 * 支持从 npm registry、本地路径、URL 等多种来源安装插件
 * 前端无需感知安装细节，后端自动路由到相应的处理逻辑
 */
#[command]
#[specta::specta]
pub async fn plugin_install(request: PluginInstallRequest) -> Result<PluginInstallResult, String> {
    println!("Installing plugin with request: {:?}", request);

    match request.source {
        PluginInstallSource::Registry { package_name } => {
            install_from_registry(package_name, request.options.unwrap_or_default()).await
        }
        PluginInstallSource::Local { path } => install_from_local(path).await,
        PluginInstallSource::Url { url } => install_from_url(url).await,
    }
}

/**
 * 从 npm registry 安装插件的内部实现
 */
async fn install_from_registry(
    package_name: String,
    options: PluginInstallOptions,
) -> Result<PluginInstallResult, String> {
    println!(
        "Installing plugin from registry: {}, {:?}",
        package_name, options
    );

    // 如果指定了版本，直接从 npm registry 下载
    if let Some(version) = &options.version {
        return download_and_install_plugin_version(&package_name, version, &options).await;
    }

    // 1. 优先检查 npm link（开发环境）
    if !options.force_reinstall {
        if let Ok(result) = try_npm_link_plugin(&package_name).await {
            println!("Found npm linked plugin: {}", package_name);
            return Ok(result);
        }
    }

    // 2. 检查本地缓存（如果不强制重装）
    if !options.force_reinstall {
        if let Ok(result) = try_local_cache_plugin(&package_name).await {
            println!("Found cached plugin: {}", package_name);
            return Ok(result);
        }
    }

    // 3. 从 npm registry 下载最新版本
    println!("Downloading plugin from npm registry: {}", package_name);
    download_and_install_plugin(&package_name).await
}

/**
 * 从本地路径安装插件的内部实现
 */
async fn install_from_local(plugin_path: String) -> Result<PluginInstallResult, String> {
    use std::fs;
    use std::path::Path;

    println!("Installing plugin from local path: {}", plugin_path);

    let path = Path::new(&plugin_path);
    if !path.exists() {
        return Err("Plugin path does not exist".to_string());
    }

    if !path.is_dir() {
        return Err("Plugin path must be a directory".to_string());
    }

    // 检查 plugin.json 文件
    let plugin_json_path = path.join("plugin.json");
    if !plugin_json_path.exists() {
        return Err("plugin.json not found in the specified directory".to_string());
    }

    // 解析插件元数据
    let plugin_json_content = fs::read_to_string(&plugin_json_path)
        .map_err(|e| format!("Failed to read plugin.json: {}", e))?;

    let plugin_metadata: serde_json::Value = serde_json::from_str(&plugin_json_content)
        .map_err(|e| format!("Invalid plugin.json format: {}", e))?;

    let plugin_id = plugin_metadata["id"]
        .as_str()
        .ok_or("Missing plugin id in plugin.json")?
        .to_string();

    // 获取缓存目录
    let cache_dir =
        get_plugin_cache_dir().map_err(|e| format!("Failed to get cache directory: {}", e))?;

    let plugin_cache_dir = cache_dir.join(&plugin_id);

    // 复制插件文件到缓存目录
    if plugin_cache_dir.exists() {
        fs::remove_dir_all(&plugin_cache_dir)
            .map_err(|e| format!("Failed to remove existing plugin cache: {}", e))?;
    }

    copy_dir(&path.to_path_buf(), &plugin_cache_dir)
        .map_err(|e| format!("Failed to copy plugin files: {}", e))?;

    // 转换为 PluginInstallResult
    Ok(PluginInstallResult {
        success: true,
        plugin_id,
        version: plugin_metadata["version"]
            .as_str()
            .unwrap_or("unknown")
            .to_string(),
        install_path: plugin_cache_dir.to_string_lossy().to_string(),
        source: "local".to_string(),
    })
}

/**
 * 从 URL 安装插件的内部实现
 */
async fn install_from_url(plugin_url: String) -> Result<PluginInstallResult, String> {
    // TODO: 实现从URL下载和安装插件的逻辑
    println!("Installing plugin from URL: {}", plugin_url);
    Err("install_plugin_from_url not implemented yet".to_string())
}

/**
 * 尝试使用 npm link 的插件
 */
async fn try_npm_link_plugin(package_name: &str) -> Result<PluginInstallResult, String> {
    // 检查是否为开发模式
    if !is_development_mode() {
        return Err("Not in development mode".to_string());
    }

    // 使用现有的 npm link 发现逻辑
    let linked_plugins =
        crate::commands::plugin_discovery::get_npm_linked_plugins_internal().await?;

    for plugin in linked_plugins {
        let plugin_package_name = format!("@dataset-viewer/plugin-{}", plugin.id);
        if plugin_package_name == package_name || plugin.id == package_name {
            return Ok(PluginInstallResult {
                success: true,
                plugin_id: plugin.id,
                version: plugin.version,
                install_path: plugin.local_path,
                source: "npm-link".to_string(),
            });
        }
    }

    Err(format!("Plugin {} not found in npm links", package_name))
}

/**
 * 尝试使用本地缓存的插件
 */
async fn try_local_cache_plugin(package_name: &str) -> Result<PluginInstallResult, String> {
    let cache_dir = get_plugin_cache_dir()?;
    let plugin_dir = cache_dir.join(package_name);

    if plugin_dir.exists() {
        let package_json_path = plugin_dir.join("package.json");
        if package_json_path.exists() {
            let content = fs::read_to_string(&package_json_path)
                .map_err(|e| format!("Failed to read cached package.json: {}", e))?;

            let package_info: serde_json::Value = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse cached package.json: {}", e))?;

            let plugin_id = package_name
                .strip_prefix("@dataset-viewer/plugin-")
                .unwrap_or(package_name);

            return Ok(PluginInstallResult {
                success: true,
                plugin_id: plugin_id.to_string(),
                version: package_info["version"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string(),
                install_path: plugin_dir.to_string_lossy().to_string(),
                source: "local-cache".to_string(),
            });
        }
    }

    Err(format!("Plugin {} not found in local cache", package_name))
}

/**
 * 从 npm registry 下载并安装指定版本的插件
 */
async fn download_and_install_plugin_version(
    package_name: &str,
    version: &str,
    _options: &PluginInstallOptions,
) -> Result<PluginInstallResult, String> {
    // 1. 获取特定版本的包信息
    let registry_url = format!("https://registry.npmjs.org/{}/{}", package_name, version);
    let client = reqwest::Client::new();

    let response = client
        .get(&registry_url)
        .header("User-Agent", "dataset-viewer")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch package version info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Version {} of package {} not found in npm registry",
            version, package_name
        ));
    }

    let package_info: NpmVersionDetail = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse package version info: {}", e))?;

    // 2. 下载 tarball
    let tarball_response = client
        .get(&package_info.dist.tarball)
        .header("User-Agent", "dataset-viewer")
        .send()
        .await
        .map_err(|e| format!("Failed to download tarball: {}", e))?;

    let tarball_bytes = tarball_response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read tarball: {}", e))?;

    // 3. 解压并安装
    let install_path =
        extract_and_install_plugin(&package_name, &package_info.version, &tarball_bytes).await?;

    let plugin_id = package_name
        .strip_prefix("@dataset-viewer/plugin-")
        .unwrap_or(package_name);

    Ok(PluginInstallResult {
        success: true,
        plugin_id: plugin_id.to_string(),
        version: package_info.version,
        install_path,
        source: "npm-registry".to_string(),
    })
}

/**
 * 检查插件是否有可用更新
 */
#[command]
#[specta::specta]
pub async fn plugin_check_updates(plugin_id: String) -> Result<PluginVersionInfo, String> {
    println!("Checking updates for plugin: {}", plugin_id);

    // 获取当前安装的版本
    let all_plugins = crate::commands::plugin_discovery::plugin_discover().await?;
    let current_plugin = all_plugins
        .iter()
        .find(|p| p.id == plugin_id && p.local)
        .ok_or_else(|| format!("Plugin {} not found or not installed", plugin_id))?;

    let current_version = &current_plugin.version;
    let package_name = format!("@dataset-viewer/plugin-{}", plugin_id);

    // 从 npm registry 获取最新版本信息
    let latest_version = get_latest_plugin_version(&package_name).await?;

    // 比较版本号
    let has_update = compare_versions(current_version, &latest_version)?;

    Ok(PluginVersionInfo {
        current: current_version.clone(),
        latest: latest_version,
        has_update,
        changelog_url: Some(format!(
            "https://www.npmjs.com/package/{}/v/{}",
            package_name, current_version
        )),
        publish_date: None, // 可以从 npm API 获取
    })
}

/**
 * 更新插件到最新版本
 */
#[command]
#[specta::specta]
pub async fn plugin_update(plugin_id: String) -> Result<PluginUpdateResult, String> {
    println!("Updating plugin: {}", plugin_id);

    // 获取当前版本信息
    let version_info = plugin_check_updates(plugin_id.clone()).await?;

    if !version_info.has_update {
        return Ok(PluginUpdateResult {
            success: true,
            plugin_id,
            old_version: version_info.current.clone(),
            new_version: version_info.current,
            message: "Plugin is already up to date".to_string(),
        });
    }

    let package_name = format!("@dataset-viewer/plugin-{}", plugin_id);

    // 先停用插件
    let _ = plugin_toggle(plugin_id.clone(), false).await;

    // 安装新版本
    let install_options = PluginInstallOptions {
        version: Some(version_info.latest.clone()),
        force_reinstall: true,
        verify_integrity: false,
    };

    let install_request = PluginInstallRequest {
        source: PluginInstallSource::Registry {
            package_name: package_name.clone(),
        },
        options: Some(install_options),
    };

    match plugin_install(install_request).await {
        Ok(_) => Ok(PluginUpdateResult {
            success: true,
            plugin_id,
            old_version: version_info.current,
            new_version: version_info.latest,
            message: "Plugin updated successfully".to_string(),
        }),
        Err(e) => Err(format!("Failed to update plugin: {}", e)),
    }
}
/**
 * 从 npm registry 下载并安装插件
 */
async fn download_and_install_plugin(package_name: &str) -> Result<PluginInstallResult, String> {
    // 1. 获取包信息
    let registry_url = format!("https://registry.npmjs.org/{}", package_name);
    let client = reqwest::Client::new();

    let response = client
        .get(&registry_url)
        .header("User-Agent", "dataset-viewer")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch package info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Package {} not found in npm registry",
            package_name
        ));
    }

    let package_info: NpmPackageInfo = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse package info: {}", e))?;

    // 2. 下载 tarball
    let tarball_response = client
        .get(&package_info.dist.tarball)
        .header("User-Agent", "dataset-viewer")
        .send()
        .await
        .map_err(|e| format!("Failed to download tarball: {}", e))?;

    let tarball_bytes = tarball_response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read tarball: {}", e))?;

    // 3. 解压并安装
    let install_path =
        extract_and_install_plugin(&package_name, &package_info.version, &tarball_bytes).await?;

    let plugin_id = package_name
        .strip_prefix("@dataset-viewer/plugin-")
        .unwrap_or(package_name);

    Ok(PluginInstallResult {
        success: true,
        plugin_id: plugin_id.to_string(),
        version: package_info.version,
        install_path,
        source: "npm-registry".to_string(),
    })
}

/**
 * 获取插件的最新版本号
 */
async fn get_latest_plugin_version(package_name: &str) -> Result<String, String> {
    let registry_url = format!("https://registry.npmjs.org/{}", package_name);
    let client = reqwest::Client::new();

    let response = client
        .get(&registry_url)
        .header("User-Agent", "dataset-viewer")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch package info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Package {} not found", package_name));
    }

    let package_info: NpmPackageInfo = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse package info: {}", e))?;

    Ok(package_info.version)
}

/**
 * 比较两个版本号，返回是否有更新可用
 * 使用简单的语义版本比较
 */
fn compare_versions(current: &str, latest: &str) -> Result<bool, String> {
    if current == latest {
        return Ok(false);
    }

    // 简单的版本比较实现
    // 实际项目中可以使用 semver crate 进行更精确的比较
    let current_parts: Vec<u32> = current.split('.').map(|s| s.parse().unwrap_or(0)).collect();
    let latest_parts: Vec<u32> = latest.split('.').map(|s| s.parse().unwrap_or(0)).collect();

    let max_len = std::cmp::max(current_parts.len(), latest_parts.len());

    for i in 0..max_len {
        let current_part = current_parts.get(i).unwrap_or(&0);
        let latest_part = latest_parts.get(i).unwrap_or(&0);

        if latest_part > current_part {
            return Ok(true); // 有更新
        } else if latest_part < current_part {
            return Ok(false); // 当前版本更新
        }
    }

    Ok(false) // 版本相同
}

/**
 * 解压并安装插件到本地缓存
 */
async fn extract_and_install_plugin(
    package_name: &str,
    version: &str,
    tarball_bytes: &[u8],
) -> Result<String, String> {
    use flate2::read::GzDecoder;
    use std::io::Cursor;
    use tar::Archive;

    // 1. 创建安装目录
    let cache_dir = get_plugin_cache_dir()?;
    let install_dir = cache_dir.join(format!("{}@{}", package_name, version));

    if install_dir.exists() {
        fs::remove_dir_all(&install_dir)
            .map_err(|e| format!("Failed to remove existing plugin: {}", e))?;
    }

    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Failed to create install directory: {}", e))?;

    // 2. 解压 tarball
    let cursor = Cursor::new(tarball_bytes);
    let gz_decoder = GzDecoder::new(cursor);
    let mut archive = Archive::new(gz_decoder);

    for entry in archive
        .entries()
        .map_err(|e| format!("Failed to read archive: {}", e))?
    {
        let mut entry = entry.map_err(|e| format!("Failed to read archive entry: {}", e))?;
        let path = entry
            .path()
            .map_err(|e| format!("Failed to get entry path: {}", e))?;

        // 移除 "package/" 前缀
        let relative_path = path.strip_prefix("package").unwrap_or(&path);
        let target_path = install_dir.join(relative_path);

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        entry
            .unpack(&target_path)
            .map_err(|e| format!("Failed to extract file: {}", e))?;
    }

    // 3. 验证插件文件
    let dist_dir = install_dir.join("dist");
    if !dist_dir.exists() {
        return Err("Plugin does not contain dist directory".to_string());
    }

    // 检查主要文件是否存在
    let main_files = ["index.esm.js", "index.js", "index.umd.js"];
    let mut found_main = false;
    for main_file in main_files {
        if dist_dir.join(main_file).exists() {
            found_main = true;
            break;
        }
    }

    if !found_main {
        return Err("Plugin does not contain valid main file".to_string());
    }

    // 4. 创建符号链接到当前版本
    let current_link = cache_dir.join(package_name);
    if current_link.exists() {
        fs::remove_file(&current_link).ok(); // 忽略错误
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs as unix_fs;
        unix_fs::symlink(&install_dir, &current_link)
            .map_err(|e| format!("Failed to create symlink: {}", e))?;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs as windows_fs;
        windows_fs::symlink_dir(&install_dir, &current_link)
            .map_err(|e| format!("Failed to create symlink: {}", e))?;
    }

    Ok(install_dir.to_string_lossy().to_string())
}

/**
 * 获取插件缓存目录
 */
pub fn get_plugin_cache_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;

    let cache_dir = home_dir.join(".dataset-viewer").join("plugins");

    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;

    Ok(cache_dir)
}

/**
 * 检查是否为开发模式
 */
fn is_development_mode() -> bool {
    std::env::var("NODE_ENV").unwrap_or_default() != "production" && cfg!(debug_assertions)
}

/**
 * 卸载插件
 * 根据插件来源进行不同处理：
 * - npm-link: 只禁用，不删除文件
 * - npm-registry/local-cache: 禁用并删除文件
 */
#[command]
#[specta::specta]
pub async fn plugin_uninstall(plugin_id: String) -> Result<PluginUninstallResult, String> {
    println!("Uninstalling plugin: {}", plugin_id);

    // 首先获取插件信息以确定来源
    let all_plugins = crate::commands::plugin_discovery::plugin_discover().await?;
    let plugin_info = all_plugins.iter().find(|p| p.id == plugin_id);

    match plugin_info {
        Some(plugin) => {
            match plugin.source.as_str() {
                "npm-link" => {
                    // npm link 插件只禁用，不删除
                    match plugin_toggle(plugin_id.clone(), false).await {
                        Ok(_) => Ok(PluginUninstallResult {
                            success: true,
                            plugin_id,
                            message:
                                "Plugin has been disabled. (npm-link plugins cannot be deleted)"
                                    .to_string(),
                        }),
                        Err(e) => Err(format!("Failed to disable plugin: {}", e)),
                    }
                }
                "npm-registry" | "local-cache" => {
                    // npm 仓库安装的插件可以真正删除
                    let cache_dir = get_plugin_cache_dir()?;
                    let package_name = format!("@dataset-viewer/plugin-{}", plugin_id);
                    let plugin_dir = cache_dir.join(&package_name);

                    // 先禁用插件
                    let _ = plugin_toggle(plugin_id.clone(), false).await;

                    // 删除插件文件
                    if plugin_dir.exists() {
                        match std::fs::remove_dir_all(&plugin_dir) {
                            Ok(_) => {
                                println!("Removed plugin directory: {:?}", plugin_dir);
                                Ok(PluginUninstallResult {
                                    success: true,
                                    plugin_id,
                                    message: "Plugin has been completely uninstalled.".to_string(),
                                })
                            }
                            Err(e) => Err(format!("Failed to remove plugin directory: {}", e)),
                        }
                    } else {
                        // 文件不存在，只禁用
                        Ok(PluginUninstallResult {
                            success: true,
                            plugin_id,
                            message: "Plugin has been disabled. (Files not found)".to_string(),
                        })
                    }
                }
                _ => {
                    // 未知来源，只禁用
                    match plugin_toggle(plugin_id.clone(), false).await {
                        Ok(_) => Ok(PluginUninstallResult {
                            success: true,
                            plugin_id,
                            message: "Plugin has been disabled.".to_string(),
                        }),
                        Err(e) => Err(format!("Failed to disable plugin: {}", e)),
                    }
                }
            }
        }
        None => Err(format!("Plugin {} not found", plugin_id)),
    }
}

/**
 * 禁用插件
 * 通过管理启用列表来控制插件状态
 */
#[command]
#[specta::specta]
pub async fn plugin_toggle(plugin_id: String, enabled: bool) -> Result<bool, String> {
    println!("Toggling plugin {}: enabled = {}", plugin_id, enabled);

    let cache_dir =
        get_plugin_cache_dir().map_err(|e| format!("Failed to get cache directory: {}", e))?;

    let enabled_plugins_file = cache_dir.join("enabled_plugins.json");

    // 读取现有的启用列表
    let mut enabled_plugins: Vec<String> = if enabled_plugins_file.exists() {
        match fs::read_to_string(&enabled_plugins_file) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

    if enabled {
        // 启用插件：添加到启用列表
        if !enabled_plugins.contains(&plugin_id) {
            enabled_plugins.push(plugin_id.clone());
            println!("Plugin {} enabled (added to enabled list)", plugin_id);
        }
    } else {
        // 禁用插件：从启用列表中移除
        if let Some(index) = enabled_plugins.iter().position(|x| x == &plugin_id) {
            enabled_plugins.remove(index);
            println!("Plugin {} disabled (removed from enabled list)", plugin_id);
        }
    }

    // 保存启用列表
    let json_content = serde_json::to_string_pretty(&enabled_plugins)
        .map_err(|e| format!("Failed to serialize enabled plugins: {}", e))?;

    fs::write(&enabled_plugins_file, json_content)
        .map_err(|e| format!("Failed to write enabled plugins file: {}", e))?;

    Ok(enabled)
}

/**
 * 获取所有已激活的插件
 * 返回已安装且未被禁用的插件列表
 */
#[command]
#[specta::specta]
pub async fn plugin_get_active(
) -> Result<Vec<crate::commands::plugin_discovery::PluginInfo>, String> {
    use crate::commands::plugin_discovery::{
        plugin_discover, PluginInfo, PluginMetadata, PluginSource,
    };
    use std::collections::HashMap;

    let all_plugins = plugin_discover().await?;

    // 过滤出已安装且激活的插件，并转换为 PluginInfo 类型
    let active_plugins: Vec<PluginInfo> = all_plugins
        .into_iter()
        .filter(|plugin| plugin.local && plugin.enabled) // local=true 表示已安装，enabled=true 表示激活
        .map(|plugin| {
            // 将 LocalPluginInfo 转换为 PluginInfo
            let version = plugin.version.clone(); // 先克隆版本
            PluginInfo {
                metadata: PluginMetadata {
                    id: plugin.id.clone(),
                    name: plugin.name,
                    version: version.clone(),
                    description: plugin.description,
                    author: plugin.author,
                    supported_extensions: plugin.supported_extensions,
                    mime_types: HashMap::new(), // 暂时为空，后续可以从 plugin.json 中读取
                    icon: None,                 // 暂时为空
                    official: plugin.official,
                    category: "viewer".to_string(),       // 默认类别
                    min_app_version: "1.0.0".to_string(), // 默认版本要求
                },
                source: PluginSource {
                    source_type: if plugin.local {
                        "local".to_string()
                    } else {
                        "npm".to_string()
                    },
                    path: Some(plugin.local_path.clone()),
                    package_name: Some(format!("@dataset-viewer/plugin-{}", plugin.id)),
                    version: Some(version),
                    url: None,
                },
                installed: plugin.local,
                active: plugin.enabled,
                entry_path: if plugin.local && plugin.enabled {
                    // 尝试从 package.json 读取入口文件
                    let package_json_path = format!("{}/package.json", plugin.local_path);
                    if let Ok(package_content) = std::fs::read_to_string(&package_json_path) {
                        if let Ok(package_json) =
                            serde_json::from_str::<serde_json::Value>(&package_content)
                        {
                            // 优先使用 module 字段（ES模块），然后是 main 字段
                            if let Some(module_path) =
                                package_json.get("module").and_then(|v| v.as_str())
                            {
                                Some(format!("{}/{}", plugin.local_path, module_path))
                            } else if let Some(main_path) =
                                package_json.get("main").and_then(|v| v.as_str())
                            {
                                Some(format!("{}/{}", plugin.local_path, main_path))
                            } else {
                                // 回退到默认的 index.js
                                Some(format!("{}/index.js", plugin.local_path))
                            }
                        } else {
                            Some(format!("{}/index.js", plugin.local_path))
                        }
                    } else {
                        Some(format!("{}/index.js", plugin.local_path))
                    }
                } else {
                    None
                },
            }
        })
        .collect();

    Ok(active_plugins)
}

/// 递归复制目录的辅助函数
fn copy_dir(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
