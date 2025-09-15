use crate::commands::plugin_installer::get_plugin_cache_dir;
use serde::{Deserialize, Serialize};
use specta::Type;

use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
struct NpmSearchResult {
    objects: Vec<NpmSearchObject>,
    total: u32,
    time: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NpmSearchObject {
    package: NpmPackageInfo,
    score: NpmScore,
    #[serde(rename = "searchScore")]
    search_score: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct NpmScore {
    #[serde(rename = "final")]
    final_score: f64,
    detail: NpmScoreDetail,
}

#[derive(Debug, Serialize, Deserialize)]
struct NpmScoreDetail {
    quality: f64,
    popularity: f64,
    maintenance: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct NpmPackageInfo {
    name: String,
    scope: Option<String>,
    version: String,
    description: Option<String>,
    keywords: Option<Vec<String>>,
    date: String,
    links: Option<NpmLinks>,
    author: Option<NpmAuthor>,
    publisher: Option<NpmPublisher>,
    maintainers: Option<Vec<NpmMaintainer>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NpmLinks {
    npm: Option<String>,
    homepage: Option<String>,
    repository: Option<String>,
    bugs: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NpmAuthor {
    name: String,
    email: Option<String>,
    username: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NpmPublisher {
    username: String,
    email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NpmMaintainer {
    username: String,
    email: Option<String>,
}

/**
 * 检查插件是否被显式启用
 * 只有在 enabled_plugins.json 文件中的插件才被认为是启用的
 */
fn is_plugin_enabled(plugin_id: &str) -> bool {
    if let Ok(cache_dir) = crate::commands::plugin_installer::get_plugin_cache_dir() {
        let enabled_plugins_file = cache_dir.join("enabled_plugins.json");
        if enabled_plugins_file.exists() {
            if let Ok(content) = fs::read_to_string(&enabled_plugins_file) {
                if let Ok(enabled_plugins) = serde_json::from_str::<Vec<String>>(&content) {
                    return enabled_plugins.contains(&plugin_id.to_string());
                }
            }
        }
    }
    false // 新插件默认禁用
}

/**
 * 计算插件的入口文件路径
 */
pub fn calculate_entry_path(
    package_json_path: &Path,
    package_info: &PluginPackageInfo,
) -> Option<String> {
    let plugin_dir = package_json_path.parent()?;
    let dist_dir = plugin_dir.join("dist");

    println!("Calculating entry path for package: {}", package_info.name);
    println!("Plugin dir: {:?}", plugin_dir);

    // 读取完整的 package.json 来检查 module 字段
    if let Ok(package_content) = std::fs::read_to_string(&package_json_path) {
        if let Ok(package_json) = serde_json::from_str::<serde_json::Value>(&package_content) {
            // 优先检查 module 字段（ESM格式，更适合浏览器环境）
            if let Some(module) = package_json.get("module").and_then(|v| v.as_str()) {
                let entry_path = plugin_dir.join(module);
                println!("Module field: {:?}", module);
                println!("Checking module field path: {:?}", entry_path);
                if entry_path.exists() {
                    let result = convert_to_relative_path(&entry_path);
                    println!("Using module field, relative path: {:?}", result);
                    return result;
                }
            }
        }
    }

    println!("Main field: {:?}", package_info.main);

    // 回退到 main 字段
    if let Some(main) = &package_info.main {
        let entry_path = plugin_dir.join(main);
        println!("Checking main field path: {:?}", entry_path);
        if entry_path.exists() {
            let result = convert_to_relative_path(&entry_path);
            println!("Using main field, relative path: {:?}", result);
            return result;
        }
    }

    // 否则按优先级查找常见的入口文件（优先ESM格式，配合依赖替换使用）
    let possible_entries = ["index.esm.js", "index.mjs", "index.js", "index.cjs.js"];
    for entry in possible_entries.iter() {
        let entry_path = dist_dir.join(entry);
        println!("Checking fallback path: {:?}", entry_path);
        if entry_path.exists() {
            let result = convert_to_relative_path(&entry_path);
            println!("Using fallback, relative path: {:?}", result);
            return result;
        }
    }

    println!("No entry path found!");
    // 如果都没找到，返回 None
    None
}

/**
 * 将绝对路径转换为相对于项目根目录的路径
 */
pub fn convert_to_relative_path(absolute_path: &Path) -> Option<String> {
    // 获取项目根目录（src-tauri的父目录）
    let current_dir = std::env::current_dir().ok()?;
    let project_root = if current_dir.ends_with("src-tauri") {
        current_dir.parent()?
    } else {
        &current_dir
    };

    // 计算相对路径
    let relative_path = absolute_path.strip_prefix(project_root).ok()?;

    // 转换为字符串，使用 / 作为分隔符（Web 标准）
    Some(relative_path.to_string_lossy().replace('\\', "/"))
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginPackageInfo {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub main: Option<String>,
    // 移除 repository 字段，因为它可能是对象或字符串，会导致解析问题
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub supported_extensions: Vec<String>,
    pub mime_types: std::collections::HashMap<String, String>,
    pub icon: Option<String>,
    pub official: bool,
    pub category: String,
    pub min_app_version: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub path: Option<String>,
    pub package_name: Option<String>,
    pub version: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct PluginInfo {
    pub metadata: PluginMetadata,
    pub source: PluginSource,
    pub installed: bool,
    pub active: bool,
    pub entry_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct LocalPluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub supported_extensions: Vec<String>,
    pub official: bool,
    pub keywords: Vec<String>,
    pub local: bool,
    pub local_path: String,
    pub enabled: bool,              // 插件是否启用
    pub entry_path: Option<String>, // 插件的入口文件路径
    pub source: String,             // 插件来源：npm-link, npm-registry, local-cache
}

/**
 * 获取npm link链接的插件（内部方法）
 */

/**
 * 统一的插件发现接口
 * 返回所有可用的插件，包括npm link的和本地目录的
 *
 * @param include_registry 是否包含npm仓库搜索（默认true，设为false可快速获取已安装插件）
 */
#[command]
#[specta::specta]
pub async fn plugin_discover(
    include_registry: Option<bool>,
) -> Result<Vec<LocalPluginInfo>, String> {
    let include_registry = include_registry.unwrap_or(true);

    if include_registry {
        println!("Loading plugin market (npm registry only)...");
        // 插件市场：只返回 npm 仓库中的插件，不包含已安装的
        search_npm_registry().await
    } else {
        println!("Loading installed plugins (local only)...");
        // 已安装插件：只返回本地已安装的插件
        get_installed_plugins().await
    }
}

/**
 * 获取已安装的插件（内部方法）
 * 只扫描本地缓存和npm link，不访问网络
 */
async fn get_installed_plugins() -> Result<Vec<LocalPluginInfo>, String> {
    println!("Getting installed plugins (local only)...");
    let mut all_plugins = Vec::new();

    // 1. 获取npm link的插件
    println!("Discovering npm linked plugins...");
    match get_npm_linked_plugins_internal().await {
        Ok(mut linked_plugins) => {
            println!("Found {} npm linked plugins", linked_plugins.len());

            // 所有 npm link 的插件都标记为已安装（local = true）
            // 通过 enabled 字段来区分是否启用
            for plugin in &mut linked_plugins {
                plugin.local = true; // npm link 的插件都算已安装
                plugin.enabled = is_plugin_enabled(&plugin.id); // 根据启用列表设置启用状态

                if plugin.enabled {
                    println!("Plugin {} is installed and enabled", plugin.id);
                } else {
                    println!("Plugin {} is installed but disabled", plugin.id);
                }
            }

            all_plugins.append(&mut linked_plugins);
        }
        Err(e) => {
            println!("Failed to get npm linked plugins: {}", e);
            // 继续执行，不因为npm链接失败而停止
        }
    }

    // 2. 扫描缓存目录中的已安装插件
    println!("Scanning plugin cache directory...");
    match get_cached_plugins().await {
        Ok(mut cached_plugins) => {
            println!(
                "Found {} plugins from cache directory",
                cached_plugins.len()
            );
            all_plugins.append(&mut cached_plugins);
        }
        Err(e) => {
            println!("Failed to scan cache directory: {}", e);
            // 继续执行，不因为缓存扫描失败而停止
        }
    }

    println!(
        "Installed plugins discovery complete. Total found: {}",
        all_plugins.len()
    );

    Ok(all_plugins)
}

/**
 * 获取npm link链接的插件（内部方法）
 */
pub async fn get_npm_linked_plugins_internal() -> Result<Vec<LocalPluginInfo>, String> {
    // 检查是否为开发模式
    if !is_development_mode() {
        println!("Production mode: skipping npm link scanning");
        return Ok(vec![]);
    }

    println!("Development mode: scanning npm linked plugins...");
    let mut plugins = Vec::new();

    // 首先测试简单的 pnpm 命令
    println!("Testing pnpm availability...");
    let test_output = std::process::Command::new("pnpm")
        .args(&["--version"])
        .output();

    match test_output {
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout);
            println!("pnpm version: {}", version.trim());
        }
        Err(e) => {
            println!("pnpm not available: {}", e);
            return Err("pnpm command not found".to_string());
        }
    }

    // 使用 pnpm list -g --depth=0 获取全局包列表
    println!("Executing: pnpm list -g --depth=0");
    let output = std::process::Command::new("pnpm")
        .args(&["list", "-g", "--depth=0"])
        .current_dir(std::env::current_dir().unwrap_or_default())
        .output();

    match output {
        Ok(output) => {
            println!(
                "pnpm command exit code: {}",
                output.status.code().unwrap_or(-1)
            );

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                println!("=== pnpm list output START ===");
                println!("{}", stdout);
                println!("=== pnpm list output END ===");

                let mut found_any_plugin_line = false;
                // 解析输出，查找插件包（支持两种命名方式）
                for (line_num, line) in stdout.lines().enumerate() {
                    println!("Line {}: '{}'", line_num, line);

                    // 支持官方插件和第三方插件两种命名方式
                    if line.contains("@dataset-viewer/plugin-")
                        || line.contains("dataset-viewer-plugin")
                    {
                        found_any_plugin_line = true;
                        println!("*** Found plugin line at {}: '{}'", line_num, line);

                        if line.contains("link:") {
                            println!("*** Line contains 'link:', processing...");
                            // 提取包名和路径
                            if let Some((package_name, link_path)) = extract_pnpm_link_info(line) {
                                println!("*** Extracted: {} -> {}", package_name, link_path);

                                // 解析 package.json
                                let package_json_path =
                                    std::path::Path::new(&link_path).join("package.json");
                                println!(
                                    "*** Looking for package.json at: {}",
                                    package_json_path.display()
                                );

                                // 首先检查链接的目录是否存在
                                if !std::path::Path::new(&link_path).exists() {
                                    println!("*** Link path does not exist: {}", link_path);
                                    continue;
                                }

                                if package_json_path.exists() {
                                    println!("*** Found package.json, parsing...");
                                    match parse_npm_linked_plugin(&package_json_path, &link_path) {
                                        Ok(plugin_info) => {
                                            println!(
                                                "*** Successfully parsed plugin: {}",
                                                plugin_info.name
                                            );
                                            plugins.push(plugin_info);
                                        }
                                        Err(e) => {
                                            println!(
                                                "*** Failed to parse linked plugin {}: {}",
                                                package_name, e
                                            );
                                        }
                                    }
                                } else {
                                    println!(
                                        "*** package.json not found at: {} (link path may be stale)",
                                        package_json_path.display()
                                    );
                                }
                            } else {
                                println!("*** Failed to extract package info from line");
                            }
                        } else {
                            println!("*** Line does not contain 'link:'");
                        }
                    }
                }

                if !found_any_plugin_line {
                    println!("*** No plugin packages found in output");
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("pnpm list command failed with stderr: {}", stderr);
                return Err(format!("pnpm list command failed: {}", stderr));
            }
        }
        Err(e) => {
            println!("Failed to execute pnpm command: {}", e);
            // 如果 pnpm 命令失败，尝试 npm
            return try_npm_list_global().await;
        }
    }

    // 设置插件状态
    for plugin in &mut plugins {
        plugin.local = true; // 所有发现的插件都标记为已安装
        plugin.enabled = is_plugin_enabled(&plugin.id); // 根据启用列表设置启用状态

        if plugin.enabled {
            println!("Plugin {} is installed and enabled", plugin.id);
        } else {
            println!("Plugin {} is installed but disabled", plugin.id);
        }
    }

    println!("Final result: Found {} linked plugins", plugins.len());
    Ok(plugins)
}

/**
 * 解析npm link的插件package.json文件
 */
fn parse_npm_linked_plugin(
    package_json_path: &Path,
    link_path: &str,
) -> Result<LocalPluginInfo, String> {
    let content = std::fs::read_to_string(package_json_path)
        .map_err(|e| format!("Failed to read package.json: {}", e))?;

    let package_info: PluginPackageInfo = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse package.json: {}", e))?;

    // 检查包名是否符合插件命名规范（支持官方和第三方插件）
    let (base_plugin_id, is_official) = if package_info.name.starts_with("@dataset-viewer/plugin-")
    {
        (
            package_info.name.replace("@dataset-viewer/plugin-", ""),
            true,
        )
    } else if package_info.name.starts_with("dataset-viewer-plugin") {
        (
            package_info.name.replace("dataset-viewer-plugin-", ""),
            false,
        )
    } else {
        return Err("Package name does not match plugin naming convention".to_string());
    };

    // 为npm link的插件添加后缀以区分开发版本
    let plugin_id = format!("{}-dev", base_plugin_id);

    // 检查是否包含插件相关关键字
    let keywords = package_info.keywords.clone().unwrap_or_default();
    let is_plugin = keywords.iter().any(|k| {
        let kw = k.to_lowercase();
        kw.contains("dataset-viewer") || kw.contains("plugin")
    });

    if !is_plugin {
        return Err("Package does not appear to be a dataset-viewer plugin".to_string());
    }

    // 简化的扩展名提取
    let supported_extensions = keywords
        .iter()
        .filter(|k| k.len() >= 2 && k.len() <= 5 && k.chars().all(|c| c.is_ascii_alphanumeric()))
        .cloned()
        .collect();

    // 先计算入口路径，避免后面借用冲突
    let entry_path = calculate_entry_path(&package_json_path, &package_info);

    Ok(LocalPluginInfo {
        id: plugin_id.clone(),
        name: format!(
            "{} (Dev)",
            base_plugin_id
                .split('-')
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => {
                            first.to_uppercase().collect::<String>() + &chars.collect::<String>()
                        }
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
                + " Viewer"
        ),
        version: package_info.version,
        description: package_info
            .description
            .unwrap_or_else(|| "Development plugin".to_string()),
        author: package_info
            .author
            .unwrap_or_else(|| "Developer".to_string()),
        supported_extensions,
        official: is_official,
        keywords,
        local: true,
        local_path: link_path.to_string(),
        enabled: is_plugin_enabled(&plugin_id), // 检查插件是否被启用
        entry_path,
        source: "npm-link".to_string(), // npm link 插件
    })
}

/**
 * 搜索 npm 仓库中的官方插件
 * 只搜索 @dataset-viewer/plugin-* 格式的包
 */
async fn search_npm_registry() -> Result<Vec<LocalPluginInfo>, String> {
    println!("Searching npm registry for dataset-viewer plugins...");

    // 使用 npm search API 搜索插件，通过关键词搜索
    let search_url = "https://registry.npmjs.org/-/v1/search";
    let query = "keywords:dataset-viewer keywords:plugin";
    let size = 50; // 最多返回50个结果

    let client = reqwest::Client::new();
    let response = client
        .get(search_url)
        .query(&[("text", query), ("size", &size.to_string())])
        .header("User-Agent", "dataset-viewer/1.0.0")
        .send()
        .await
        .map_err(|e| format!("Failed to search npm registry: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "npm search API returned status: {}",
            response.status()
        ));
    }

    let search_result: NpmSearchResult = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse npm search response: {}", e))?;

    println!(
        "npm search returned {} results",
        search_result.objects.len()
    );

    let mut plugins = Vec::new();

    for search_object in search_result.objects {
        let package = search_object.package;

        // 只处理官方插件包 (@dataset-viewer/plugin-*)
        if !package.name.starts_with("@dataset-viewer/plugin-") {
            continue;
        }

        let plugin_id = package.name.replace("@dataset-viewer/plugin-", "");

        // 检查关键字中是否包含插件相关信息
        let keywords = package.keywords.clone().unwrap_or_default();
        let is_plugin = keywords.iter().any(|k| {
            let kw = k.to_lowercase();
            kw.contains("dataset-viewer") || kw.contains("plugin")
        });

        if !is_plugin {
            println!("Skipping {} - doesn't appear to be a plugin", package.name);
            continue;
        }

        // 提取支持的文件扩展名
        let supported_extensions = keywords
            .iter()
            .filter(|k| {
                k.len() >= 2 && k.len() <= 5 && k.chars().all(|c| c.is_ascii_alphanumeric())
            })
            .cloned()
            .collect();

        let plugin_info = LocalPluginInfo {
            id: plugin_id.clone(),
            name: plugin_id
                .split('-')
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => {
                            first.to_uppercase().collect::<String>() + &chars.collect::<String>()
                        }
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
                + " Viewer",
            version: package.version,
            description: package
                .description
                .unwrap_or_else(|| "Official plugin".to_string()),
            author: package
                .author
                .map(|a| a.name)
                .or_else(|| package.publisher.map(|p| p.username))
                .unwrap_or_else(|| "Dataset Viewer Team".to_string()),
            supported_extensions,
            official: true, // npm 仓库中的都是官方插件
            keywords,
            local: false, // npm 仓库中的插件未安装
            local_path: String::new(),
            enabled: false, // 未安装的插件默认禁用
            entry_path: None,
            source: "npm-registry".to_string(),
        };

        println!(
            "Found npm plugin: {} v{}",
            plugin_info.name, plugin_info.version
        );
        plugins.push(plugin_info);
    }

    println!(
        "Successfully parsed {} official plugins from npm",
        plugins.len()
    );
    Ok(plugins)
}

/**
 * 检查是否为开发模式
 */
fn is_development_mode() -> bool {
    // 检查环境变量或调试模式
    std::env::var("NODE_ENV").unwrap_or_default() != "production" && cfg!(debug_assertions)
}

/**
 * 提取 pnpm list 输出中的包名和链接路径
 */
fn extract_pnpm_link_info(line: &str) -> Option<(String, String)> {
    // 解析类似这样的行:
    // @dataset-viewer/plugin-cad link:../../../../Documents/code/dataset_viewer/plugins/cad-plugin

    if let Some(link_pos) = line.find("link:") {
        let before_link = line[..link_pos].trim();
        let after_link = line[link_pos + 5..].trim();

        // 提取包名（去掉前面的空格和依赖标记）
        let package_name = before_link
            .split_whitespace()
            .last()
            .unwrap_or("")
            .to_string();
        println!("Extracted package name: '{}'", package_name);

        if package_name.starts_with("@dataset-viewer/plugin-")
            || package_name.starts_with("dataset-viewer-plugin")
        {
            // 将相对路径转换为绝对路径
            let link_path = resolve_relative_path(after_link);
            println!("Resolved path: '{}' -> '{}'", after_link, link_path);
            return Some((package_name, link_path));
        } else {
            println!("Package name does not match pattern: '{}'", package_name);
        }
    }

    None
}

/**
 * 解析相对路径为绝对路径
 */
fn resolve_relative_path(relative_path: &str) -> String {
    println!("Resolving relative path: '{}'", relative_path);

    // 获取当前工作目录
    if let Ok(current_dir) = std::env::current_dir() {
        println!("Current directory: {}", current_dir.display());
        let mut path = current_dir;

        // 处理相对路径
        for component in relative_path.split('/') {
            match component {
                "." => continue,
                ".." => {
                    path.pop();
                    println!("After '..': {}", path.display());
                }
                "" => continue,
                _ => {
                    path.push(component);
                    println!("After '{}': {}", component, path.display());
                }
            }
        }

        let resolved = path.to_string_lossy().to_string();
        println!("Final resolved path: {}", resolved);
        return resolved;
    }

    // 如果无法获取当前目录，返回原始路径
    println!("Failed to get current directory, returning original path");
    relative_path.to_string()
}

/**
 * 尝试使用 npm list -g 作为备用方案
 */
async fn try_npm_list_global() -> Result<Vec<LocalPluginInfo>, String> {
    println!("Trying npm as fallback...");
    let output = std::process::Command::new("npm")
        .args(&["list", "-g", "--depth=0"])
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                let _stdout = String::from_utf8_lossy(&output.stdout);
                let plugins = Vec::new();

                // npm list 的输出格式可能不同，这里需要相应的解析逻辑
                // 暂时返回空列表
                println!("npm list succeeded but parsing not implemented yet");
                Ok(plugins)
            } else {
                Err("Both pnpm and npm list commands failed".to_string())
            }
        }
        Err(_) => Err("Neither pnpm nor npm is available".to_string()),
    }
}

/**
 * 扫描缓存目录中的已安装插件
 */
async fn get_cached_plugins() -> Result<Vec<LocalPluginInfo>, String> {
    use std::fs;

    let cache_dir =
        get_plugin_cache_dir().map_err(|e| format!("Failed to get cache dir: {}", e))?;

    println!("Scanning cache directory: {}", cache_dir.display());

    let mut plugins = Vec::new();

    // 递归扫描缓存目录，处理scope和版本化的目录结构
    fn scan_directory(
        dir: &std::path::Path,
        plugins: &mut Vec<LocalPluginInfo>,
        depth: usize,
    ) -> Result<(), String> {
        if depth > 3 {
            // 防止无限递归
            return Ok(());
        }

        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() && !path.is_symlink() {
                // 跳过符号链接，避免重复扫描
                // 检查是否有package.json
                let package_json_path = path.join("package.json");
                if package_json_path.exists() {
                    // 这是一个包目录
                    match read_package_json(&package_json_path) {
                        Ok(basic_info) => {
                            // 检查是否是插件包
                            if basic_info.name.contains("plugin")
                                || basic_info.name.contains("@dataset-viewer")
                            {
                                println!("Found cached plugin package: {}", basic_info.name);

                                // 读取完整的插件包信息以获取正确的main字段
                                let content = fs::read_to_string(&package_json_path)
                                    .map_err(|e| format!("Failed to read package.json: {}", e))?;
                                let package_info: PluginPackageInfo =
                                    serde_json::from_str(&content).map_err(|e| {
                                        format!("Failed to parse package.json: {}", e)
                                    })?;

                                // 提取插件ID
                                let base_plugin_id =
                                    if package_info.name.starts_with("@dataset-viewer/plugin-") {
                                        package_info.name.replace("@dataset-viewer/plugin-", "")
                                    } else {
                                        package_info.name.clone()
                                    };

                                // 为缓存的插件使用原始ID（已安装版本）
                                let plugin_id = base_plugin_id.clone();

                                // 使用与npm link插件相同的入口文件查找逻辑
                                let entry_path =
                                    calculate_entry_path(&package_json_path, &package_info);

                                if let Some(entry_path) = entry_path {
                                    println!(
                                        "Final entry path for {}: {}",
                                        package_info.name, entry_path
                                    );

                                    // 从package.json提取支持的扩展名
                                    let keywords =
                                        package_info.keywords.clone().unwrap_or_default();
                                    let supported_extensions = keywords
                                        .iter()
                                        .filter(|k| {
                                            k.len() >= 2
                                                && k.len() <= 5
                                                && k.chars().all(|c| c.is_ascii_alphanumeric())
                                        })
                                        .cloned()
                                        .collect();

                                    let plugin = LocalPluginInfo {
                                        id: plugin_id.clone(),
                                        name: base_plugin_id
                                            .split('-')
                                            .map(|word| {
                                                let mut chars = word.chars();
                                                match chars.next() {
                                                    None => String::new(),
                                                    Some(first) => {
                                                        first.to_uppercase().collect::<String>()
                                                            + &chars.collect::<String>()
                                                    }
                                                }
                                            })
                                            .collect::<Vec<_>>()
                                            .join(" ")
                                            + " Viewer",
                                        version: package_info.version.clone(),
                                        description: package_info
                                            .description
                                            .clone()
                                            .unwrap_or_else(|| "Installed plugin".to_string()),
                                        author: package_info
                                            .author
                                            .clone()
                                            .unwrap_or_else(|| "Unknown".to_string()),
                                        supported_extensions,
                                        official: package_info.name.starts_with("@dataset-viewer/"),
                                        keywords,
                                        local: true, // 缓存中的插件都是已安装的
                                        local_path: path.to_string_lossy().to_string(),
                                        enabled: is_plugin_enabled(&plugin_id), // 检查是否启用
                                        entry_path: Some(entry_path),
                                        source: "local-cache".to_string(),
                                    };

                                    println!(
                                        "Found cached plugin: {} v{} (enabled: {})",
                                        plugin.name, plugin.version, plugin.enabled
                                    );
                                    plugins.push(plugin);
                                } else {
                                    println!(
                                        "Cached plugin {} missing entry file",
                                        package_info.name
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            println!("Failed to read package.json for {}: {}", path.display(), e);
                        }
                    }
                } else {
                    // 没有package.json，递归扫描子目录
                    scan_directory(&path, plugins, depth + 1)?;
                }
            }
        }

        Ok(())
    }

    scan_directory(&cache_dir, &mut plugins, 0)?;

    Ok(plugins)
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct PackageJsonInfo {
    name: String,
    version: String,
    main: Option<String>,
}

fn read_package_json(path: &std::path::Path) -> Result<PackageJsonInfo, String> {
    use std::fs;

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read package.json: {}", e))?;

    let package_info: PackageJsonInfo = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse package.json: {}", e))?;

    Ok(package_info)
}

/**
 * 读取插件文件内容
 */
#[command]
#[specta::specta]
pub async fn plugin_read_file(plugin_path: String) -> Result<String, String> {
    println!("Reading plugin file: {}", plugin_path);

    // 处理相对路径：如果是相对路径，转换为绝对路径
    let absolute_path = if Path::new(&plugin_path).is_absolute() {
        PathBuf::from(&plugin_path)
    } else {
        // 获取项目根目录
        let current_dir = std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?;
        let project_root = if current_dir.ends_with("src-tauri") {
            current_dir
                .parent()
                .ok_or("Failed to get project root directory")?
                .to_path_buf()
        } else {
            current_dir
        };

        // 拼接相对路径
        project_root.join(&plugin_path)
    };

    println!("Resolved absolute path: {:?}", absolute_path);

    // 安全检查：确保路径在允许的插件目录内
    let cache_dir = crate::commands::plugin_installer::get_plugin_cache_dir()
        .map_err(|e| format!("Failed to get plugin cache dir: {}", e))?;

    if !absolute_path.starts_with(&cache_dir) && !plugin_path.contains("@dataset-viewer/plugin-") {
        return Err(format!(
            "Access denied: plugin path not in allowed directories. Path: {:?}, Cache dir: {:?}",
            absolute_path, cache_dir
        ));
    }

    // 读取文件内容
    fs::read_to_string(&absolute_path).map_err(|e| format!("Failed to read plugin file: {}", e))
}
