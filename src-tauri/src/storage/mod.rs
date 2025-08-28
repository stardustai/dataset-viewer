pub mod huggingface_client;
pub mod local_client;
pub mod manager;
pub mod oss;
pub mod oss_client;
pub mod traits;
pub mod webdav_client;

pub use manager::get_storage_manager;
#[allow(unused_imports)] // 这些类型通过Serde序列化在Tauri命令中使用
pub use traits::{ConnectionConfig, DirectoryResult, ListOptions, StorageFile, StorageRequest};
