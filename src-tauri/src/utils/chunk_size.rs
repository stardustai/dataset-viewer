/// 通用的块大小计算工具
///
/// 根据文件大小和使用场景动态计算最优的块大小

/// 通用块大小计算，适用于下载和文件传输
pub fn calculate_optimal_chunk_size(file_size: u64) -> usize {
    const MB_10: u64 = 10 * 1024 * 1024; // 10MB
    const MB_100: u64 = 100 * 1024 * 1024; // 100MB
    const GB_1: u64 = 1024 * 1024 * 1024; // 1GB

    if file_size <= MB_10 {
        // 小文件使用 8KB 块
        8 * 1024
    } else if file_size <= MB_100 {
        // 中等文件使用 64KB 块
        64 * 1024
    } else if file_size <= GB_1 {
        // 大文件使用 256KB 块
        256 * 1024
    } else {
        // 超大文件使用 1MB 块
        1024 * 1024
    }
}

/// 针对本地文件读取优化的块大小计算
/// 本地磁盘IO通常可以使用稍大的块大小
pub fn calculate_local_read_chunk_size(file_size: u64) -> usize {
    const MB_1: u64 = 1024 * 1024; // 1MB
    const MB_50: u64 = 50 * 1024 * 1024; // 50MB
    const GB_1: u64 = 1024 * 1024 * 1024; // 1GB

    if file_size <= MB_1 {
        // 小文件使用 16KB 块
        16 * 1024
    } else if file_size <= MB_50 {
        // 中等文件使用 64KB 块
        64 * 1024
    } else if file_size <= GB_1 {
        // 大文件使用 512KB 块
        512 * 1024
    } else {
        // 超大文件使用 2MB 块
        2 * 1024 * 1024
    }
}
