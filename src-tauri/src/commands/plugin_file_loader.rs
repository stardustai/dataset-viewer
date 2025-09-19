use crate::commands::plugin_installer::get_plugin_cache_dir;
use std::fs;
use std::path::PathBuf;
use tauri::command;

/**
 * 统一的插件错误处理辅助函数
 */
fn plugin_error(context: &str, error: impl std::fmt::Display) -> String {
    format!("Plugin {}: {}", context, error)
}

/**
 * 插件文件路径解析结果
 */
#[derive(Debug)]
struct PluginFilePath {
    /// 缓存目录中的路径
    cache_path: PathBuf,
    /// 项目根目录中的路径
    project_path: PathBuf,
    /// 项目根目录
    project_root: PathBuf,
    /// 缓存目录
    cache_dir: PathBuf,
}

impl PluginFilePath {
    /**
     * 检查文件是否存在（优先检查缓存目录）
     */
    fn exists(&self) -> bool {
        // 先检查缓存目录
        if self.cache_path.exists() {
            if let (Ok(canonical_cache_path), Ok(canonical_cache_dir)) = (
                self.cache_path.canonicalize(),
                self.cache_dir.canonicalize(),
            ) {
                if canonical_cache_path.starts_with(&canonical_cache_dir) {
                    return true;
                }
            }
        }

        // 再检查项目根目录
        if self.project_path.exists() {
            if let (Ok(canonical_project_path), Ok(canonical_project_root)) = (
                self.project_path.canonicalize(),
                self.project_root.canonicalize(),
            ) {
                if canonical_project_path.starts_with(&canonical_project_root) {
                    return true;
                }
            }
        }

        false
    }

    /**
     * 读取文件内容（优先从缓存目录读取）
     */
    fn read(&self) -> Result<Vec<u8>, String> {
        // 先尝试从缓存目录读取
        if self.cache_path.exists() {
            let canonical_cache_path = self
                .cache_path
                .canonicalize()
                .map_err(|e| plugin_error("path canonicalization failed", e))?;
            let canonical_cache_dir = self
                .cache_dir
                .canonicalize()
                .map_err(|e| plugin_error("cache directory canonicalization failed", e))?;

            if canonical_cache_path.starts_with(&canonical_cache_dir) {
                return fs::read(&self.cache_path).map_err(|e| {
                    plugin_error(
                        &format!("file read failed ({})", self.cache_path.display()),
                        e,
                    )
                });
            }
        }

        // 再尝试从项目根目录读取
        if self.project_path.exists() {
            let canonical_project_path = self
                .project_path
                .canonicalize()
                .map_err(|e| plugin_error("project path canonicalization failed", e))?;
            let canonical_project_root = self
                .project_root
                .canonicalize()
                .map_err(|e| plugin_error("project root canonicalization failed", e))?;

            if canonical_project_path.starts_with(&canonical_project_root) {
                return fs::read(&self.project_path).map_err(|e| {
                    plugin_error(
                        &format!("file read failed ({})", self.project_path.display()),
                        e,
                    )
                });
            }
        }

        Err(plugin_error(
            "file not found",
            "plugin file not found or inaccessible",
        ))
    }
}

/**
 * 解析插件文件路径，支持缓存目录和项目根目录
 */
fn resolve_plugin_file_path(file_path: &str) -> Result<PluginFilePath, String> {
    // 获取插件缓存目录
    let cache_dir =
        get_plugin_cache_dir().map_err(|e| plugin_error("cache directory access failed", e))?;

    // 获取项目根目录
    let current_dir =
        std::env::current_dir().map_err(|e| plugin_error("current directory access failed", e))?;
    let project_root = if current_dir.ends_with("src-tauri") {
        current_dir.parent().unwrap_or(&current_dir).to_path_buf()
    } else {
        current_dir
    };

    // 清理路径前缀
    let relative_path = if file_path.starts_with(".plugins/") {
        &file_path[9..] // 移除 ".plugins/" 前缀
    } else if file_path.starts_with("./plugins/") {
        &file_path[10..] // 移除 "./plugins/" 前缀
    } else if file_path.starts_with("plugins/") {
        &file_path[8..] // 移除 "plugins/" 前缀
    } else {
        file_path
    };

    Ok(PluginFilePath {
        cache_path: cache_dir.join(relative_path),
        project_path: project_root.join(file_path),
        project_root,
        cache_dir,
    })
}

/**
 * 读取插件文件内容（支持二进制文件）
 * 统一处理开发模式和生产模式的插件文件加载
 */
#[command]
#[specta::specta]
pub async fn load_plugin_file(file_path: String) -> Result<Vec<u8>, String> {
    println!("Loading plugin file: {}", file_path);

    let resolved_path = resolve_plugin_file_path(&file_path)?;
    println!("Cache directory: {}", resolved_path.cache_dir.display());
    println!("Trying cache path: {}", resolved_path.cache_path.display());
    println!(
        "Trying project path: {}",
        resolved_path.project_path.display()
    );

    resolved_path.read()
}

/**
 * 检查插件文件是否存在
 */
#[command]
#[specta::specta]
pub async fn plugin_check_file_exists(file_path: String) -> Result<bool, String> {
    let resolved_path = resolve_plugin_file_path(&file_path)?;
    Ok(resolved_path.exists())
}

/**
 * 处理 plugin-resource:// 协议请求
 */
pub async fn handle_plugin_resource_request(
    uri: String,
) -> Result<tauri::http::Response<Vec<u8>>, String> {
    // 解析 plugin-resource://pluginId/resourcePath
    let parsed_uri = uri
        .parse::<url::Url>()
        .map_err(|e| format!("Invalid URI format: {}", e))?;

    let plugin_id = parsed_uri.host_str().unwrap_or("");
    let path = parsed_uri.path();
    let resource_path = path.strip_prefix('/').unwrap_or(path);

    println!(
        "🔌 Plugin ID: '{}', Resource path: '{}'",
        plugin_id, resource_path
    );

    // 加载插件资源
    let content =
        load_plugin_resource_by_discovery(plugin_id.to_string(), resource_path.to_string()).await?;

    println!(
        "✅ Successfully loaded plugin resource: {} bytes",
        content.len()
    );

    // 使用公共工具获取 Content-Type
    let content_type =
        crate::utils::protocol_handler::ProtocolHandler::get_content_type(resource_path);

    // 构建响应
    let response = tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", content_type)
        .header("Access-Control-Allow-Origin", "*")
        .header(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS",
        )
        .header("Access-Control-Allow-Headers", "*")
        .body(content)
        .map_err(|e| format!("Failed to build response: {}", e))?;

    println!(
        "✅ Plugin resource loaded: {} for plugin: {}",
        resource_path, plugin_id
    );
    Ok(response)
}

/**
 * 使用插件发现系统加载插件资源
 */
pub async fn load_plugin_resource_by_discovery(
    plugin_id: String,
    resource_path: String,
) -> Result<Vec<u8>, String> {
    println!(
        "🔍 Loading plugin resource: '{}' for plugin: '{}'",
        resource_path, plugin_id
    );

    // 统一错误处理函数
    let plugin_error = |context: &str, error: String| -> String {
        format!("Plugin resource {}: {}", context, error)
    };

    // 获取插件缓存目录
    let cache_dir = get_plugin_cache_dir()
        .map_err(|e| plugin_error("cache directory access failed", e.to_string()))?;
    println!("🔍 Plugin cache directory: {}", cache_dir.display());

    // 使用插件发现系统查找插件
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
                        // 根据entry_path的格式判断插件类型
                        let plugin_dir = if entry_path.starts_with(".plugins/") {
                            // 缓存目录中的插件
                            cache_dir.join(
                                plugin_dir_relative
                                    .strip_prefix(".plugins/")
                                    .unwrap_or(plugin_dir_relative),
                            )
                        } else {
                            // npm link的插件，使用项目根目录
                            let current_dir = std::env::current_dir().unwrap_or_default();
                            let project_root = if current_dir.ends_with("src-tauri") {
                                current_dir.parent().unwrap_or(&current_dir)
                            } else {
                                &current_dir
                            };
                            project_root.join(plugin_dir_relative)
                        };

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
                                    plugin_error("path canonicalization failed", e.to_string())
                                })?;

                            // 对于npm link插件，允许项目根目录下的路径
                            let current_dir = std::env::current_dir().unwrap_or_default();
                            let project_root = if current_dir.ends_with("src-tauri") {
                                current_dir.parent().unwrap_or(&current_dir)
                            } else {
                                &current_dir
                            };
                            let canonical_project_root =
                                project_root.canonicalize().map_err(|e| {
                                    plugin_error(
                                        "project root canonicalization failed",
                                        e.to_string(),
                                    )
                                })?;
                            let canonical_cache_dir = cache_dir.canonicalize().map_err(|e| {
                                plugin_error(
                                    "cache directory canonicalization failed",
                                    e.to_string(),
                                )
                            })?;

                            // 允许缓存目录或项目根目录下的文件
                            if canonical_resource_path.starts_with(&canonical_cache_dir)
                                || canonical_resource_path.starts_with(&canonical_project_root)
                            {
                                println!("✅ Path security check passed");
                                return std::fs::read(&resource_file_path).map_err(|e| {
                                    plugin_error(
                                        &format!(
                                            "file read failed ({})",
                                            resource_file_path.display()
                                        ),
                                        e.to_string(),
                                    )
                                });
                            } else {
                                println!(
                                    "❌ Path security check failed - outside allowed directories"
                                );
                                return Err(plugin_error(
                                    "access denied",
                                    "resource path outside allowed directories".to_string(),
                                ));
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
            Err(plugin_error(
                "not found",
                format!("{} for plugin {}", resource_path, plugin_id),
            ))
        }
        Err(e) => {
            println!("❌ Failed to discover plugins: {}", e);
            Err(plugin_error("discovery failed", e.to_string()))
        }
    }
}
