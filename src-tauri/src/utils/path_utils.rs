use crate::storage::traits::StorageError;
use std::path::PathBuf;

/// 路径工具函数
pub struct PathUtils;

impl PathUtils {
    /// 展开路径中的 ~ 到用户主目录
    ///
    /// # 示例
    /// ```rust
    /// // "~" -> "/Users/username"
    /// // "~/documents" -> "/Users/username/documents"
    /// // "/absolute/path" -> "/absolute/path" (不变)
    /// ```
    pub fn expand_home_dir(path: &str) -> Result<String, StorageError> {
        if path.starts_with('~') {
            if let Some(home_dir) = dirs::home_dir() {
                let expanded_path = if path == "~" {
                    home_dir
                } else if let Some(stripped) = path.strip_prefix("~/") {
                    home_dir.join(stripped)
                } else {
                    // 处理 ~username 这种形式，目前不支持，返回原路径
                    PathBuf::from(path)
                };
                return Ok(expanded_path.to_string_lossy().to_string());
            } else {
                return Err(StorageError::ConnectionFailed(
                    "Cannot determine home directory".to_string(),
                ));
            }
        }
        Ok(path.to_string())
    }
}
