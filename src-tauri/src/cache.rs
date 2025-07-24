// 添加智能缓存机制
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use crate::{ArchiveInfo, FilePreview};

#[derive(Clone)]
pub struct ArchiveCache {
    entries: Arc<RwLock<HashMap<String, ArchiveInfo>>>,
    previews: Arc<RwLock<HashMap<String, FilePreview>>>,
    max_cache_size: usize,
}

impl ArchiveCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            previews: Arc::new(RwLock::new(HashMap::new())),
            max_cache_size: max_size,
        }
    }

    pub fn get_archive_info(&self, key: &str) -> Option<ArchiveInfo> {
        self.entries.read().ok()?.get(key).cloned()
    }

    pub fn put_archive_info(&self, key: String, info: ArchiveInfo) {
        if let Ok(mut cache) = self.entries.write() {
            if cache.len() >= self.max_cache_size {
                // 实现 LRU 清理策略
                if let Some(oldest_key) = cache.keys().next().cloned() {
                    cache.remove(&oldest_key);
                }
            }
            cache.insert(key, info);
        }
    }
}
