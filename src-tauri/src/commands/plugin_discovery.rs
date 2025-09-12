use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::Path;
use tauri::command;

// 导入插件安装模块以访问缓存目录函数
use super::plugin_installer::get_plugin_cache_dir;

/**
 * 计算插件的入口文件路径
 */
fn calculate_entry_path(
    package_json_path: &Path,
    package_info: &PluginPackageInfo,
) -> Option<String> {
    let plugin_dir = package_json_path.parent()?;
    let dist_dir = plugin_dir.join("dist");

    // 如果 package.json 中指定了 main 字段，优先使用
    if let Some(main) = &package_info.main {
        let entry_path = plugin_dir.join(main);
        if entry_path.exists() {
            return Some(entry_path.to_string_lossy().to_string());
        }
    }

    // 否则按优先级查找常见的入口文件
    let possible_entries = ["index.esm.js", "index.js", "index.mjs"];
    for entry in possible_entries.iter() {
        let entry_path = dist_dir.join(entry);
        if entry_path.exists() {
            return Some(entry_path.to_string_lossy().to_string());
        }
    }

    // 如果都没找到，返回 None
    None
}

/**
 * 检查插件是否被永久禁用
 */
fn is_plugin_disabled(plugin_id: &str) -> bool {
    if let Ok(cache_dir) = get_plugin_cache_dir() {
        let disabled_plugins_file = cache_dir.join("disabled_plugins.json");
        if disabled_plugins_file.exists() {
            if let Ok(content) = fs::read_to_string(&disabled_plugins_file) {
                if let Ok(disabled_plugins) = serde_json::from_str::<Vec<String>>(&content) {
                    return disabled_plugins.contains(&plugin_id.to_string());
                }
            }
        }
    }
    false
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
}

/**
 * 统一的插件发现接口
 * 返回所有可用的插件，包括npm link的和本地目录的
 */
#[command]
#[specta::specta]
pub async fn discover_plugins() -> Result<Vec<LocalPluginInfo>, String> {
    println!("Starting plugin discovery...");
    let mut all_plugins = Vec::new();

    // 1. 获取npm link的插件（包括被禁用的，因为可以重新安装）
    println!("Discovering npm linked plugins...");
    match get_npm_linked_plugins_internal().await {
        Ok(mut linked_plugins) => {
            println!("Found {} npm linked plugins", linked_plugins.len());

            // 所有 npm link 的插件都标记为已安装（local = true）
            // 通过 enabled 字段来区分是否启用
            for plugin in &mut linked_plugins {
                plugin.local = true; // npm link 的插件都算已安装
                plugin.enabled = !is_plugin_disabled(&plugin.id); // 根据禁用列表设置启用状态

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

    // 注意：不再扫描本地目录，插件应该通过 npm link 方式发现

    // 2. 在生产模式下，可以在这里添加npm仓库搜索逻辑
    if !is_development_mode() {
        println!("Production mode: would search npm registry here");
        // TODO: 添加npm仓库搜索功能
    }

    println!(
        "Plugin discovery complete. Total found: {}",
        all_plugins.len()
    );
    Ok(all_plugins)
}

/**
 * 检查插件是否有效
 */
#[command]
#[specta::specta]
pub async fn validate_plugin_path(path: String) -> Result<Option<LocalPluginInfo>, String> {
    let plugin_path = Path::new(&path);
    let package_json_path = plugin_path.join("package.json");

    if !package_json_path.exists() {
        return Ok(None);
    }

    match parse_plugin_package_for_validation(&package_json_path) {
        Ok(plugin_info) => Ok(Some(plugin_info)),
        Err(_) => Ok(None), // 不是有效的插件，但不返回错误
    }
}

/**
 * 简化的插件package.json解析（仅用于验证）
 */
fn parse_plugin_package_for_validation(
    package_json_path: &Path,
) -> Result<LocalPluginInfo, String> {
    let content = std::fs::read_to_string(package_json_path)
        .map_err(|e| format!("Failed to read package.json: {}", e))?;

    let package_info: PluginPackageInfo = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse package.json: {}", e))?;

    // 检查包名是否符合插件命名规范
    if !package_info.name.starts_with("@dataset-viewer/plugin-") {
        return Err("Package name does not match plugin naming convention".to_string());
    }

    // 检查是否包含插件相关关键字
    let keywords = package_info.keywords.clone().unwrap_or_default();
    let is_plugin = keywords.iter().any(|k| {
        let kw = k.to_lowercase();
        kw.contains("dataset-viewer") || kw.contains("plugin")
    });

    if !is_plugin {
        return Err("Package does not appear to be a dataset-viewer plugin".to_string());
    }

    // 提取插件ID（移除前缀）
    let plugin_id = package_info.name.replace("@dataset-viewer/plugin-", "");

    // 简化的扩展名提取
    let supported_extensions = keywords
        .iter()
        .filter(|k| k.len() >= 2 && k.len() <= 5 && k.chars().all(|c| c.is_ascii_alphanumeric()))
        .cloned()
        .collect();

    // 检查是否是官方插件
    let is_official = package_info
        .author
        .as_ref()
        .map(|a| {
            let author_lower = a.to_lowercase();
            author_lower.contains("dataset-viewer")
                || author_lower.contains("datasetviewer")
                || author_lower.contains("dataset-viewer-team")
        })
        .unwrap_or(false);

    // 先计算入口路径，避免后面借用冲突
    let entry_path = calculate_entry_path(&package_json_path, &package_info);

    Ok(LocalPluginInfo {
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
        version: package_info.version,
        description: package_info
            .description
            .unwrap_or_else(|| "Local plugin".to_string()),
        author: package_info.author.unwrap_or_else(|| "Unknown".to_string()),
        supported_extensions,
        official: is_official,
        keywords,
        local: true,
        local_path: package_json_path
            .parent()
            .unwrap_or_else(|| Path::new(""))
            .to_string_lossy()
            .to_string(),
        enabled: !is_plugin_disabled(&plugin_id), // 检查插件是否被禁用
        entry_path,
    })
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
                // 解析输出，查找 @dataset-viewer/plugin- 开头的包
                for (line_num, line) in stdout.lines().enumerate() {
                    println!("Line {}: '{}'", line_num, line);

                    if line.contains("@dataset-viewer/plugin-") {
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
                                        "*** package.json not found at: {}",
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
                    println!("*** No @dataset-viewer/plugin- lines found in output");
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

    // 检查包名是否符合插件命名规范
    if !package_info.name.starts_with("@dataset-viewer/plugin-") {
        return Err("Package name does not match plugin naming convention".to_string());
    }

    // 检查是否包含插件相关关键字
    let keywords = package_info.keywords.clone().unwrap_or_default();
    let is_plugin = keywords.iter().any(|k| {
        let kw = k.to_lowercase();
        kw.contains("dataset-viewer") || kw.contains("plugin")
    });

    if !is_plugin {
        return Err("Package does not appear to be a dataset-viewer plugin".to_string());
    }

    // 提取插件ID（移除前缀）
    let plugin_id = package_info.name.replace("@dataset-viewer/plugin-", "");

    // 简化的扩展名提取
    let supported_extensions = keywords
        .iter()
        .filter(|k| k.len() >= 2 && k.len() <= 5 && k.chars().all(|c| c.is_ascii_alphanumeric()))
        .cloned()
        .collect();

    // 检查是否是官方插件
    let is_official = package_info
        .author
        .as_ref()
        .map(|a| {
            let author_lower = a.to_lowercase();
            author_lower.contains("dataset-viewer")
                || author_lower.contains("datasetviewer")
                || author_lower.contains("dataset-viewer-team")
        })
        .unwrap_or(false);

    // 先计算入口路径，避免后面借用冲突
    let entry_path = calculate_entry_path(&package_json_path, &package_info);

    Ok(LocalPluginInfo {
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
        version: package_info.version,
        description: package_info
            .description
            .unwrap_or_else(|| "Linked plugin".to_string()),
        author: package_info.author.unwrap_or_else(|| "Unknown".to_string()),
        supported_extensions,
        official: is_official,
        keywords,
        local: true,
        local_path: link_path.to_string(),
        enabled: !is_plugin_disabled(&plugin_id), // 检查插件是否被禁用
        entry_path,
    })
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

        if package_name.starts_with("@dataset-viewer/plugin-") {
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
