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
