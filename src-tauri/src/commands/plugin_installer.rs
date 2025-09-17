use hex;
use reqwest;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
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
    #[serde(rename = "dist-tags")]
    dist_tags: NpmDistTags,
    versions: std::collections::HashMap<String, NpmVersionDetail>,
}

#[derive(Debug, Deserialize)]
struct NpmDistTags {
    latest: String,
}

#[derive(Debug, Deserialize)]
struct NpmVersionDetail {
    version: String,
    dist: NpmDist,
}

#[derive(Debug, Deserialize)]
struct NpmDist {
    tarball: String,
    shasum: Option<String>,
}

/**
 * 验证 tarball 的完整性
 */
fn verify_tarball_integrity(data: &[u8], expected_shasum: &str) -> Result<(), String> {
    let mut hasher = Sha1::new();
    hasher.update(data);
    let result = hasher.finalize();
    let actual_shasum = hex::encode(result);

    if actual_shasum == expected_shasum {
        Ok(())
    } else {
        Err(format!(
            "Tarball integrity verification failed. Expected: {}, Actual: {}",
            expected_shasum, actual_shasum
        ))
    }
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
    download_and_install_plugin(&package_name, &options).await
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

    // 2.5. 验证完整性（默认启用）
    if let Some(expected_shasum) = &package_info.dist.shasum {
        println!("Verifying tarball integrity for version {}...", version);
        verify_tarball_integrity(&tarball_bytes, expected_shasum)
            .map_err(|e| format!("Integrity verification failed: {}", e))?;
        println!("Tarball integrity verified successfully");
    } else {
        println!("Warning: No shasum available from npm registry for integrity verification");
    }

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
    let all_plugins = crate::commands::plugin_discovery::plugin_discover(Some(false)).await?;
    let current_plugin = all_plugins
        .iter()
        .find(|p| p.id == plugin_id && p.local)
        .ok_or_else(|| format!("Plugin {} not found or not installed", plugin_id))?;

    let current_version = &current_plugin.version;
    let package_name = format!("@dataset-viewer/plugin-{}", plugin_id);

    // 从 npm registry 获取最新版本信息
    let latest_version = get_latest_plugin_version(&package_name).await?;

    Ok(PluginVersionInfo {
        current: current_version.clone(),
        latest: latest_version,
        changelog_url: Some(format!(
            "https://www.npmjs.com/package/{}/v/{}",
            package_name, current_version
        )),
        publish_date: None, // 可以从 npm API 获取
    })
}

/**
 * 删除插件文件（用于更新和卸载时清理）
 */
async fn remove_plugin_files(plugin_id: &str) -> Result<i32, String> {
    let cache_dir = get_plugin_cache_dir()?;
    let package_name = format!("@dataset-viewer/plugin-{}", plugin_id);

    // 删除所有版本的插件文件
    let mut removed_count = 0;
    let mut removal_errors = Vec::new();

    // 递归扫描缓存目录，找到所有匹配的插件版本
    fn scan_and_remove_plugin_dirs(
        dir: &std::path::Path,
        package_name: &str,
        removed_count: &mut i32,
        removal_errors: &mut Vec<String>,
    ) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let entry_path = entry.path();
            let entry_name = entry.file_name().to_string_lossy().to_string();

            if entry_path.is_dir() {
                // 检查是否是该插件的版本目录（格式：plugin-{id}@{version}）
                let plugin_basename = package_name.split('/').last().unwrap_or(package_name);
                if entry_name.starts_with(&format!("{}@", plugin_basename)) {
                    println!("Removing plugin directory: {:?}", entry_path);

                    match std::fs::remove_dir_all(&entry_path) {
                        Ok(_) => {
                            *removed_count += 1;
                            println!("Successfully removed: {:?}", entry_path);
                        }
                        Err(e) => {
                            removal_errors.push(format!("Failed to remove {}: {}", entry_name, e));
                        }
                    }
                } else {
                    // 递归搜索子目录
                    let _ = scan_and_remove_plugin_dirs(
                        &entry_path,
                        package_name,
                        removed_count,
                        removal_errors,
                    );
                }
            }
        }
        Ok(())
    }

    match scan_and_remove_plugin_dirs(
        &cache_dir,
        &package_name,
        &mut removed_count,
        &mut removal_errors,
    ) {
        Ok(_) => {}
        Err(e) => {
            return Err(format!("Failed to scan cache directory: {}", e));
        }
    }

    // 也尝试删除符号链接（如果存在）
    let symlink_path = cache_dir.join(&package_name);
    if symlink_path.exists() {
        if let Err(e) = std::fs::remove_file(&symlink_path) {
            println!(
                "Warning: Failed to remove symlink {:?}: {}",
                symlink_path, e
            );
        } else {
            println!("Removed symlink: {:?}", symlink_path);
        }
    }

    if !removal_errors.is_empty() {
        return Err(format!(
            "Some files could not be removed: {}",
            removal_errors.join("; ")
        ));
    }

    println!(
        "Removed {} versions of plugin: {}",
        removed_count, plugin_id
    );
    Ok(removed_count)
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

    // 直接更新到最新版本（版本比较由前端处理）
    if version_info.current == version_info.latest {
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

    // 删除旧版本（类似卸载，但不删除配置）
    if let Err(e) = remove_plugin_files(&plugin_id).await {
        println!("Warning: Failed to remove old plugin files: {}", e);
        // 继续执行，不因为删除失败而中断更新
    }

    // 安装新版本
    let install_options = PluginInstallOptions {
        version: Some(version_info.latest.clone()),
        force_reinstall: true,
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
async fn download_and_install_plugin(
    package_name: &str,
    _options: &PluginInstallOptions,
) -> Result<PluginInstallResult, String> {
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

    // 获取最新版本的信息
    let latest_version = &package_info.dist_tags.latest;
    let version_info = package_info.versions.get(latest_version).ok_or_else(|| {
        format!(
            "Latest version {} not found in package info",
            latest_version
        )
    })?;

    // 2. 下载 tarball
    let tarball_response = client
        .get(&version_info.dist.tarball)
        .header("User-Agent", "dataset-viewer")
        .send()
        .await
        .map_err(|e| format!("Failed to download tarball: {}", e))?;

    let tarball_bytes = tarball_response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read tarball: {}", e))?;

    // 2.5. 验证完整性（默认启用）
    if let Some(expected_shasum) = &version_info.dist.shasum {
        println!("Verifying tarball integrity...");
        verify_tarball_integrity(&tarball_bytes, expected_shasum)
            .map_err(|e| format!("Integrity verification failed: {}", e))?;
        println!("Tarball integrity verified successfully");
    } else {
        println!("Warning: No shasum available from npm registry for integrity verification");
    }

    // 3. 解压并安装
    let install_path =
        extract_and_install_plugin(&package_name, latest_version, &tarball_bytes).await?;

    let plugin_id = package_name
        .strip_prefix("@dataset-viewer/plugin-")
        .unwrap_or(package_name);

    Ok(PluginInstallResult {
        success: true,
        plugin_id: plugin_id.to_string(),
        version: latest_version.to_string(),
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

    Ok(package_info.dist_tags.latest)
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

    // 1. 清理旧版本并创建安装目录
    let cache_dir = get_plugin_cache_dir()?;
    let install_dir = cache_dir.join(format!("{}@{}", package_name, version));

    // 清理同一插件的所有旧版本
    cleanup_old_plugin_versions(package_name, version, &cache_dir)?;

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
    // 读取 package.json 获取主入口文件
    let package_json_path = install_dir.join("package.json");
    if !package_json_path.exists() {
        return Err("Plugin does not contain package.json".to_string());
    }

    let package_json_content = fs::read_to_string(&package_json_path)
        .map_err(|e| format!("Failed to read package.json: {}", e))?;

    let package_info: serde_json::Value = serde_json::from_str(&package_json_content)
        .map_err(|e| format!("Invalid package.json format: {}", e))?;

    // 获取 main 字段指定的入口文件
    let main_file = package_info["main"].as_str().unwrap_or("dist/index.js"); // 默认值

    // 检查主入口文件是否存在
    let main_file_path = install_dir.join(main_file);
    if !main_file_path.exists() {
        return Err(format!(
            "Plugin main file '{}' specified in package.json does not exist",
            main_file
        ));
    }

    println!("✅ Found plugin main file: {}", main_file);

    // 4. 创建符号链接到当前版本
    let current_link = cache_dir.join(package_name);

    // 如果符号链接已存在，先删除它
    if current_link.exists() {
        println!("Removing existing symlink: {:?}", current_link);
        if current_link.is_symlink() {
            fs::remove_file(&current_link).ok(); // 忽略删除错误
        } else {
            // 如果存在的是目录，先删除目录
            fs::remove_dir_all(&current_link).ok(); // 忽略删除错误
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs as unix_fs;
        if let Err(e) = unix_fs::symlink(&install_dir, &current_link) {
            println!(
                "Warning: Failed to create symlink: {} - {}",
                current_link.display(),
                e
            );
            // 符号链接失败不应该阻止安装继续，因为插件已经成功解压
            // 只是用户可能需要通过完整版本路径访问插件
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs as windows_fs;
        if let Err(e) = windows_fs::symlink_dir(&install_dir, &current_link) {
            println!(
                "Warning: Failed to create symlink: {} - {}",
                current_link.display(),
                e
            );
            // 符号链接失败不应该阻止安装继续，因为插件已经成功解压
            // 只是用户可能需要通过完整版本路径访问插件
        }
    }

    // 5. 自动启用新安装的插件
    let plugin_id = package_name
        .strip_prefix("@dataset-viewer/plugin-")
        .unwrap_or(package_name);

    // 使用现有的toggle函数来启用插件
    match plugin_toggle(plugin_id.to_string(), true).await {
        Ok(_) => println!("Plugin {} installed and enabled successfully", plugin_id),
        Err(e) => {
            println!("Warning: Failed to auto-enable plugin {}: {}", plugin_id, e);
            // 不返回错误，因为安装已经成功
        }
    }

    Ok(install_dir.to_string_lossy().to_string())
}

/**
 * 获取插件缓存目录
 *
 * 目录策略:
 * - 开发模式: 项目根目录/.plugins (便于前端HTTP访问)
 * - 生产模式: 应用数据目录/plugins (Tauri应用数据目录)
 */
pub fn get_plugin_cache_dir() -> Result<PathBuf, String> {
    if is_development_mode() {
        // 开发模式：使用项目根目录下的 .plugins 文件夹
        // 这样 Vite 静态文件服务可以直接访问插件文件
        let current_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?;

        let project_root = if current_dir.ends_with("src-tauri") {
            current_dir
                .parent()
                .ok_or("Failed to get project root directory")?
        } else {
            &current_dir
        };

        let plugins_dir = project_root.join(".plugins");
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create .plugins directory: {}", e))?;

        Ok(plugins_dir)
    } else {
        // 生产模式：使用Tauri应用数据目录
        // 这样确保前端可以通过asset协议访问插件文件
        let app_data_dir = dirs::data_dir()
            .ok_or("Failed to get app data directory")?
            .join("ai.stardust.dataset-viewer")
            .join("plugins");

        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;

        Ok(app_data_dir)
    }
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
    let all_plugins = crate::commands::plugin_discovery::plugin_discover(Some(false)).await?;
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
                    // 先禁用插件
                    let _ = plugin_toggle(plugin_id.clone(), false).await;

                    // 使用复用的删除函数
                    match remove_plugin_files(&plugin_id).await {
                        Ok(removed_count) => {
                            if removed_count > 0 {
                                Ok(PluginUninstallResult {
                                    success: true,
                                    plugin_id,
                                    message: format!("Plugin has been completely uninstalled. ({} directories removed)", removed_count),
                                })
                            } else {
                                Ok(PluginUninstallResult {
                                    success: true,
                                    plugin_id,
                                    message: "Plugin has been disabled. (No files found to remove)"
                                        .to_string(),
                                })
                            }
                        }
                        Err(e) => {
                            // 即使删除失败，也算作部分成功
                            Ok(PluginUninstallResult {
                                success: true,
                                plugin_id,
                                message: format!("Plugin partially uninstalled: {}", e),
                            })
                        }
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

    let all_plugins = plugin_discover(Some(false)).await?;

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
                    // 使用与插件发现相同的逻辑生成入口路径
                    use crate::commands::plugin_discovery::{
                        calculate_entry_path, PluginPackageInfo,
                    };
                    use std::path::Path;

                    let package_json_path = Path::new(&plugin.local_path).join("package.json");
                    if let Ok(package_content) = std::fs::read_to_string(&package_json_path) {
                        if let Ok(package_info) =
                            serde_json::from_str::<PluginPackageInfo>(&package_content)
                        {
                            calculate_entry_path(&package_json_path, &package_info)
                        } else {
                            None
                        }
                    } else {
                        None
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

/**
 * 清理指定插件的旧版本
 * 保留当前要安装的版本，删除其他所有版本
 */
fn cleanup_old_plugin_versions(
    package_name: &str,
    current_version: &str,
    cache_dir: &PathBuf,
) -> Result<(), String> {
    println!("Cleaning up old versions of plugin: {}", package_name);

    // 读取缓存目录下所有条目
    let entries = match std::fs::read_dir(cache_dir) {
        Ok(entries) => entries,
        Err(_) => {
            // 缓存目录不存在或无法读取，不是错误
            return Ok(());
        }
    };

    let package_prefix = format!("{}@", package_name);
    let current_dir_name = format!("{}@{}", package_name, current_version);
    let mut removed_count = 0;

    for entry in entries {
        if let Ok(entry) = entry {
            let entry_name = entry.file_name().to_string_lossy().to_string();

            // 检查是否是同一个插件的不同版本目录
            if entry_name.starts_with(&package_prefix) && entry_name != current_dir_name {
                let entry_path = entry.path();

                if entry_path.is_dir() {
                    println!("Removing old plugin version: {}", entry_name);

                    if let Err(e) = std::fs::remove_dir_all(&entry_path) {
                        println!(
                            "Warning: Failed to remove old version {}: {}",
                            entry_name, e
                        );
                        // 继续处理其他版本，不中断整个过程
                    } else {
                        removed_count += 1;
                        println!("Successfully removed old version: {}", entry_name);
                    }
                }
            }
        }
    }

    println!(
        "Cleaned up {} old versions of plugin: {}",
        removed_count, package_name
    );
    Ok(())
}
