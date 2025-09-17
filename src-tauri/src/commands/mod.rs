// Tauri 命令模块
// 按功能分类组织所有前端可调用的命令

pub mod archive; // 压缩包处理命令
pub mod download; // 下载管理命令
pub mod plugin_discovery; // 插件发现命令
pub mod plugin_file_loader; // 插件文件加载命令
pub mod plugin_installer; // 插件安装命令
pub mod storage; // 统一存储接口命令
pub mod system; // 其他系统控制命令

// 重新导出所有命令，便于在 lib.rs 中统一注册
pub use archive::*;
pub use download::*;
pub use plugin_discovery::*;
pub use plugin_file_loader::*;
pub use plugin_installer::*;
pub use storage::*;
pub use system::*;
