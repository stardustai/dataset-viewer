pub mod oss_signer;
pub mod aws_signer;

// 重新导出主要的签名函数，方便使用
pub use oss_signer::{build_oss_auth_headers, generate_oss_presigned_url};
pub use aws_signer::{build_aws_auth_headers, generate_aws_presigned_url};
