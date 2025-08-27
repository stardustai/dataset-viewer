pub mod auth;
pub mod parser;

// 重新导出认证相关功能
pub use auth::{build_oss_auth_headers, build_aws_auth_headers, generate_oss_presigned_url, generate_aws_presigned_url};

// 重新导出解析相关功能
pub use parser::{
    extract_object_key, build_full_path, build_object_url,
    normalize_uri_for_signing, parse_list_objects_response
};
