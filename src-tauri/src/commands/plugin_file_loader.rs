use crate::commands::plugin_installer::get_plugin_cache_dir;
use std::fs;
use tauri::command;

/**
 * 根据插件ID和资源路径加载插件资源文件（支持二进制文件）
 */
pub async fn load_plugin_resource(
    plugin_id: String,
    resource_path: String,
) -> Result<Vec<u8>, String> {
    println!(
        "🔍 Loading plugin resource: '{}' for plugin: '{}'",
        resource_path, plugin_id
    );

    // 获取插件缓存目录
    let cache_dir = get_plugin_cache_dir()?;
    println!("🔍 Plugin cache directory: {}", cache_dir.display());

    // 首先尝试从插件发现系统中找到插件的实际目录
    use crate::commands::plugin_discovery::plugin_discover;

    match plugin_discover(Some(false)).await {
        Ok(plugins) => {
            println!("🔍 Found {} plugins", plugins.len());

            // 查找匹配的插件
            for plugin in plugins {
                println!(
                    "🔍 Checking plugin: id='{}', enabled={}, entry_path={:?}",
                    plugin.id, plugin.enabled, plugin.entry_path
                );

                if plugin.id == plugin_id && plugin.entry_path.is_some() {
                    let entry_path = plugin.entry_path.unwrap();
                    println!("✅ Found matching plugin with entry_path: '{}'", entry_path);

                    // 提取插件目录（去掉文件名部分）
                    if let Some(plugin_dir_relative) = std::path::Path::new(&entry_path).parent() {
                        let plugin_dir = cache_dir.join(
                            plugin_dir_relative
                                .strip_prefix(".plugins/")
                                .unwrap_or(plugin_dir_relative),
                        );

                        println!("🔍 Plugin directory: {}", plugin_dir.display());

                        // 构建资源文件的完整路径
                        let resource_file_path = plugin_dir.join(&resource_path);

                        println!(
                            "🔍 Trying to load resource from: {}",
                            resource_file_path.display()
                        );

                        // 检查文件是否存在
                        if resource_file_path.exists() {
                            println!("✅ Resource file exists!");

                            // 检查路径安全性（使用规范化路径）
                            let canonical_resource_path =
                                resource_file_path.canonicalize().map_err(|e| {
                                    format!("Failed to canonicalize resource path: {}", e)
                                })?;
                            let canonical_cache_dir = cache_dir.canonicalize().map_err(|e| {
                                format!("Failed to canonicalize cache directory: {}", e)
                            })?;

                            if canonical_resource_path.starts_with(&canonical_cache_dir) {
                                println!("✅ Path security check passed");
                                return std::fs::read(&resource_file_path).map_err(|e| {
                                    format!(
                                        "Failed to read resource file {}: {}",
                                        resource_file_path.display(),
                                        e
                                    )
                                });
                            } else {
                                println!(
                                    "❌ Path security check failed - outside plugin directory"
                                );
                                return Err(
                                    "Invalid resource path: outside plugin directory".to_string()
                                );
                            }
                        } else {
                            println!(
                                "❌ Resource file does not exist at: {}",
                                resource_file_path.display()
                            );
                        }
                    } else {
                        println!(
                            "❌ Failed to get parent directory from entry_path: {}",
                            entry_path
                        );
                    }
                }
            }

            println!("❌ No matching plugin found for id: '{}'", plugin_id);
            Err(format!(
                "Plugin resource not found: {} for plugin {}",
                resource_path, plugin_id
            ))
        }
        Err(e) => {
            println!("❌ Failed to discover plugins: {}", e);
            Err(format!("Failed to discover plugins: {}", e))
        }
    }
}

/**
 * 读取插件文件内容（支持二进制文件）
 * 用于生产模式下通过Tauri命令加载插件文件
 */
#[command]
#[specta::specta]
pub async fn load_plugin_file(file_path: String) -> Result<Vec<u8>, String> {
    println!("Loading plugin file: {}", file_path);

    // 获取插件缓存目录
    let cache_dir = get_plugin_cache_dir()?;

    // 处理路径：如果 file_path 以 .plugins/ 开头，则移除这个前缀
    // 因为 cache_dir 已经指向了 .plugins 目录
    let relative_path = if file_path.starts_with(".plugins/") {
        &file_path[9..] // 移除 ".plugins/" 前缀（9个字符）
    } else if file_path.starts_with("./plugins/") {
        &file_path[10..] // 移除 "./plugins/" 前缀（10个字符）
    } else {
        &file_path
    };

    // 构造完整的文件路径
    let full_path = cache_dir.join(relative_path);

    println!("Resolved full path: {}", full_path.display());

    // 检查文件是否存在
    if !full_path.exists() {
        return Err(format!("Plugin file not found: {}", full_path.display()));
    }

    // 检查路径安全性（使用规范化路径）
    let canonical_full_path = full_path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize file path: {}", e))?;
    let canonical_cache_dir = cache_dir
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize cache directory: {}", e))?;

    if !canonical_full_path.starts_with(&canonical_cache_dir) {
        return Err("Invalid file path: outside plugin directory".to_string());
    }

    // 读取文件内容（二进制）
    fs::read(&full_path)
        .map_err(|e| format!("Failed to read plugin file {}: {}", full_path.display(), e))
}

/**
 * 检查插件文件是否存在
 */
#[command]
#[specta::specta]
pub async fn plugin_check_file_exists(file_path: String) -> Result<bool, String> {
    let cache_dir = get_plugin_cache_dir()?;

    // 处理路径：如果 file_path 以 .plugins/ 开头，则移除这个前缀
    let relative_path = if file_path.starts_with(".plugins/") {
        &file_path[9..] // 移除 ".plugins/" 前缀
    } else if file_path.starts_with("./plugins/") {
        &file_path[10..] // 移除 "./plugins/" 前缀
    } else {
        &file_path
    };

    let full_path = cache_dir.join(relative_path);

    // 检查路径安全性（使用规范化路径）
    let canonical_full_path = full_path
        .canonicalize()
        .map_err(|_| "Failed to resolve file path".to_string())?;
    let canonical_cache_dir = cache_dir
        .canonicalize()
        .map_err(|_| "Failed to resolve cache directory".to_string())?;

    if !canonical_full_path.starts_with(&canonical_cache_dir) {
        return Err("Invalid file path: outside plugin directory".to_string());
    }

    Ok(full_path.exists())
}
