use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::Sha256;
use base64::Engine;

/// SHA256 哈希函数
pub fn sha256_hex(data: &str) -> String {
    use sha2::Digest;
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// HMAC-SHA1 计算函数（返回base64编码）
/// 用于阿里云OSS、华为OBS等标准OSS签名
pub fn hmac_sha1_base64(key: &str, data: &str) -> String {
    type HmacSha1 = Hmac<Sha1>;
    let mut mac = HmacSha1::new_from_slice(key.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(data.as_bytes());
    let result = mac.finalize();
    base64::engine::general_purpose::STANDARD.encode(result.into_bytes())
}

/// HMAC-SHA256 计算函数（字符串密钥）
/// 用于AWS S3 SigV4签名
pub fn hmac_sha256(key: &str, data: &str) -> Vec<u8> {
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(key.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

/// HMAC-SHA256 计算函数（字节数组密钥）
/// 用于AWS S3 SigV4签名
pub fn hmac_sha256_bytes(key: &[u8], data: &str) -> Vec<u8> {
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(key)
        .expect("HMAC can take key of any size");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}
