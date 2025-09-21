pub mod auth;
pub mod parser;

// 重新导出认证相关功能
pub use auth::{
    build_aws_auth_headers, build_oss_auth_headers, generate_aws_presigned_url,
    generate_oss_presigned_url,
};

// 重新导出解析相关功能
pub use parser::{
    build_full_path, build_object_url, extract_object_key, parse_list_objects_response,
};
