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

#[derive(Debug, Deserialize)]
struct NpmPackageInfo {
    #[allow(dead_code)]
    name: String,
    version: String,
    dist: NpmDist,
}

#[derive(Debug, Deserialize)]
struct NpmDist {
    tarball: String,
}

/**
 * 统一的插件安装接口
 * 自动判断使用 npm link、本地缓存还是 npm registry
 */
#[command]
#[specta::specta]
pub async fn install_plugin(package_name: String) -> Result<PluginInstallResult, String> {
    println!("Installing plugin: {}", package_name);

    // 0. 如果插件在禁用列表中，从禁用列表移除（重新启用）
    let plugin_id = if package_name.starts_with("@dataset-viewer/plugin-") {
        package_name
            .strip_prefix("@dataset-viewer/plugin-")
            .unwrap_or(&package_name)
            .to_string()
    } else {
        package_name.clone()
    };

    if let Ok(cache_dir) = get_plugin_cache_dir() {
        let disabled_plugins_file = cache_dir.join("disabled_plugins.json");
        if disabled_plugins_file.exists() {
            if let Ok(content) = fs::read_to_string(&disabled_plugins_file) {
                if let Ok(mut disabled_plugins) = serde_json::from_str::<Vec<String>>(&content) {
                    if let Some(pos) = disabled_plugins.iter().position(|x| *x == plugin_id) {
                        disabled_plugins.remove(pos);

                        // 保存更新后的禁用列表
                        if let Ok(json_content) = serde_json::to_string_pretty(&disabled_plugins) {
                            if fs::write(&disabled_plugins_file, json_content).is_ok() {
                                println!(
                                    "Removed plugin {} from disabled list (re-enabling)",
                                    plugin_id
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    // 1. 优先检查 npm link（开发环境）
    if let Ok(result) = try_npm_link_plugin(&package_name).await {
        println!("Found npm linked plugin: {}", package_name);
        return Ok(result);
    }

    // 2. 检查本地缓存
    if let Ok(result) = try_local_cache_plugin(&package_name).await {
        println!("Found cached plugin: {}", package_name);
        return Ok(result);
    }

    // 3. 从 npm registry 下载
    println!("Downloading plugin from npm registry: {}", package_name);
    download_and_install_plugin(&package_name).await
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
 * 支持从本地缓存和 npm link 中卸载
 */
#[command]
#[specta::specta]
pub async fn uninstall_plugin(plugin_id: String) -> Result<PluginUninstallResult, String> {
    println!("Uninstalling plugin: {}", plugin_id);

    // 构建可能的包名
    let package_name = if plugin_id.starts_with("@dataset-viewer/plugin-") {
        plugin_id.clone()
    } else {
        format!("@dataset-viewer/plugin-{}", plugin_id)
    };

    // 1. 尝试移除本地缓存的插件
    if let Ok(cache_dir) = get_plugin_cache_dir() {
        let plugin_dir = cache_dir.join(&package_name);
        if plugin_dir.exists() {
            match fs::remove_dir_all(&plugin_dir) {
                Ok(_) => {
                    println!("Removed cached plugin directory: {:?}", plugin_dir);
                    return Ok(PluginUninstallResult {
                        success: true,
                        plugin_id,
                        message: "Plugin successfully uninstalled from cache".to_string(),
                    });
                }
                Err(e) => {
                    return Err(format!("Failed to remove plugin directory: {}", e));
                }
            }
        }

        // 2. 对于 npm link 的插件，创建永久禁用标记
        // 创建一个全局的禁用列表文件
        let disabled_plugins_file = cache_dir.join("disabled_plugins.json");

        // 读取现有的禁用列表
        let mut disabled_plugins: Vec<String> = if disabled_plugins_file.exists() {
            match fs::read_to_string(&disabled_plugins_file) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        };

        // 添加到禁用列表（如果不存在）
        if !disabled_plugins.contains(&plugin_id) {
            disabled_plugins.push(plugin_id.clone());

            // 保存禁用列表
            let json_content = serde_json::to_string_pretty(&disabled_plugins)
                .map_err(|e| format!("Failed to serialize disabled plugins: {}", e))?;

            fs::write(&disabled_plugins_file, json_content)
                .map_err(|e| format!("Failed to write disabled plugins file: {}", e))?;

            println!("Added plugin {} to disabled list", plugin_id);
        }
    }

    Ok(PluginUninstallResult {
        success: true,
        plugin_id,
        message: "Plugin permanently disabled. It will no longer appear in the plugin list."
            .to_string(),
    })
}

/**
 * 禁用插件
 * 通过创建禁用标记文件来禁用插件
 */
#[command]
#[specta::specta]
pub async fn toggle_plugin(plugin_id: String, enabled: bool) -> Result<bool, String> {
    println!("Toggling plugin {}: enabled = {}", plugin_id, enabled);

    let cache_dir =
        get_plugin_cache_dir().map_err(|e| format!("Failed to get cache directory: {}", e))?;

    let disabled_plugins_file = cache_dir.join("disabled_plugins.json");

    // 读取现有的禁用列表
    let mut disabled_plugins: Vec<String> = if disabled_plugins_file.exists() {
        match fs::read_to_string(&disabled_plugins_file) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

    if enabled {
        // 启用插件：从禁用列表中移除
        if let Some(index) = disabled_plugins.iter().position(|x| x == &plugin_id) {
            disabled_plugins.remove(index);
            println!("Plugin {} enabled (removed from disabled list)", plugin_id);
        }
    } else {
        // 禁用插件：添加到禁用列表
        if !disabled_plugins.contains(&plugin_id) {
            disabled_plugins.push(plugin_id.clone());
            println!("Plugin {} disabled (added to disabled list)", plugin_id);
        }
    }

    // 保存禁用列表
    let json_content = serde_json::to_string_pretty(&disabled_plugins)
        .map_err(|e| format!("Failed to serialize disabled plugins: {}", e))?;

    fs::write(&disabled_plugins_file, json_content)
        .map_err(|e| format!("Failed to write disabled plugins file: {}", e))?;

    Ok(enabled)
}

/**
 * 获取所有已激活的插件
 * 返回已安装且未被禁用的插件列表
 */
#[command]
#[specta::specta]
pub async fn get_active_plugins(
) -> Result<Vec<crate::commands::plugin_discovery::PluginInfo>, String> {
    use crate::commands::plugin_discovery::{
        discover_plugins, PluginInfo, PluginMetadata, PluginSource,
    };
    use std::collections::HashMap;

    let all_plugins = discover_plugins().await?;

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

/**
 * 激活插件 (别名为 toggle_plugin(plugin_id, true))
 */
#[command]
#[specta::specta]
pub async fn activate_plugin(plugin_id: String) -> Result<bool, String> {
    toggle_plugin(plugin_id, true).await
}

/**
 * 停用插件 (别名为 toggle_plugin(plugin_id, false))
 */
#[command]
#[specta::specta]
pub async fn deactivate_plugin(plugin_id: String) -> Result<bool, String> {
    toggle_plugin(plugin_id, false).await
}

/**
 * 从本地路径安装插件
 */
#[command]
#[specta::specta]
pub async fn install_plugin_from_local(
    plugin_path: String,
) -> Result<crate::commands::plugin_discovery::PluginInfo, String> {
    use crate::commands::plugin_discovery::{
        discover_plugins, PluginInfo, PluginMetadata, PluginSource,
    };
    use std::collections::HashMap;

    // 验证插件路径
    let path = PathBuf::from(&plugin_path);
    if !path.exists() {
        return Err("Plugin path does not exist".to_string());
    }

    let plugin_json = path.join("plugin.json");
    if !plugin_json.exists() {
        return Err("plugin.json not found in the specified path".to_string());
    }

    // 读取和验证 plugin.json
    let plugin_content = fs::read_to_string(&plugin_json)
        .map_err(|e| format!("Failed to read plugin.json: {}", e))?;

    let plugin_metadata: serde_json::Value = serde_json::from_str(&plugin_content)
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

    copy_dir(&path, &plugin_cache_dir)
        .map_err(|e| format!("Failed to copy plugin files: {}", e))?;

    println!(
        "Plugin {} installed from local path: {}",
        plugin_id, plugin_path
    );

    // 返回插件信息 - 转换为 PluginInfo 类型
    let all_plugins = discover_plugins().await?;

    if let Some(local_plugin) = all_plugins.into_iter().find(|p| p.id == plugin_id) {
        let version = local_plugin.version.clone(); // 先克隆版本
        Ok(PluginInfo {
            metadata: PluginMetadata {
                id: local_plugin.id.clone(),
                name: local_plugin.name,
                version: version.clone(),
                description: local_plugin.description,
                author: local_plugin.author,
                supported_extensions: local_plugin.supported_extensions,
                mime_types: HashMap::new(),
                icon: None,
                official: local_plugin.official,
                category: "viewer".to_string(),
                min_app_version: "1.0.0".to_string(),
            },
            source: PluginSource {
                source_type: "local".to_string(),
                path: Some(local_plugin.local_path.clone()),
                package_name: Some(format!("@dataset-viewer/plugin-{}", local_plugin.id)),
                version: Some(version),
                url: None,
            },
            installed: local_plugin.local,
            active: local_plugin.enabled,
            entry_path: {
                // 从 package.json 读取正确的入口文件
                let package_json_path = format!("{}/package.json", local_plugin.local_path);
                if let Ok(package_content) = std::fs::read_to_string(&package_json_path) {
                    if let Ok(package_json) =
                        serde_json::from_str::<serde_json::Value>(&package_content)
                    {
                        // 优先使用 module 字段（ES模块），然后是 main 字段
                        if let Some(module_path) =
                            package_json.get("module").and_then(|v| v.as_str())
                        {
                            Some(format!("{}/{}", local_plugin.local_path, module_path))
                        } else if let Some(main_path) =
                            package_json.get("main").and_then(|v| v.as_str())
                        {
                            Some(format!("{}/{}", local_plugin.local_path, main_path))
                        } else {
                            Some(format!("{}/index.js", local_plugin.local_path))
                        }
                    } else {
                        Some(format!("{}/index.js", local_plugin.local_path))
                    }
                } else {
                    Some(format!("{}/index.js", local_plugin.local_path))
                }
            },
        })
    } else {
        Err(format!("Failed to find installed plugin: {}", plugin_id))
    }
}

/**
 * 从 URL 安装插件
 */
#[command]
#[specta::specta]
pub async fn install_plugin_from_url(
    _plugin_url: String,
) -> Result<crate::commands::plugin_discovery::PluginInfo, String> {
    // TODO: 实现从URL下载和安装插件的逻辑
    Err("install_plugin_from_url not implemented yet".to_string())
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
