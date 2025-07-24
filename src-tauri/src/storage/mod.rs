pub mod traits;
pub mod manager;
pub mod webdav_client;

pub use traits::{StorageRequest, ConnectionConfig};
pub use manager::get_storage_manager;
