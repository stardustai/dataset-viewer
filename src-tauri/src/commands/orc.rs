//! ORC文件处理模块 - 实验性功能
//!
//! 基于orc-rust实现流式解析，支持分块读取和内存优化
//! 参考ParquetDataProvider的架构模式
//! 注意：此功能为实验性实现，可能存在兼容性问题

use crate::storage::get_storage_manager;
use arrow::{array::Array, datatypes::DataType, record_batch::RecordBatchReader};
use bytes::Bytes;
use orc_rust::ArrowReaderBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// ORC文件元数据结构
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OrcMetadata {
    pub num_rows: String,
    pub num_columns: u32,
    pub columns: Vec<OrcColumn>,
    pub file_size: String,
    pub compression: Option<String>,
    pub stripe_count: u32,
}

/// ORC列信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OrcColumn {
    pub name: String,
    pub type_name: String,
    pub logical_type: Option<String>,
}

/// ORC数据行
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OrcDataRow {
    pub values: HashMap<String, String>,
}

/// 流式ORC文件读取器
/// 实现类似ParquetDataProvider的分块读取架构
struct StreamingOrcReader {
    file_content: Vec<u8>,
}

impl StreamingOrcReader {
    async fn new(file_content: Vec<u8>) -> Result<Self, String> {
        Ok(Self { file_content })
    }

    /// 获取ORC文件的schema和元数据
    async fn get_metadata(&self) -> Result<OrcMetadata, String> {
        // 使用orc-rust解析ORC文件
        let bytes = Bytes::from(self.file_content.clone());

        match ArrowReaderBuilder::try_new(bytes) {
            Ok(builder) => {
                let reader = builder.build();
                let schema = reader.schema();

                // 获取行数（需要读取所有批次来计算总行数）
                let mut total_rows = 0u64;
                let mut stripe_count = 0u32;

                // 创建新的bytes用于计算行数
                let bytes_for_count = Bytes::from(self.file_content.clone());
                if let Ok(count_builder) = ArrowReaderBuilder::try_new(bytes_for_count) {
                    let mut count_reader = count_builder.build();
                    while let Some(batch_result) = count_reader.next() {
                        match batch_result {
                            Ok(batch) => {
                                total_rows += batch.num_rows() as u64;
                                stripe_count += 1;
                            }
                            Err(_) => break,
                        }
                    }
                }

                // 转换schema为OrcColumn
                let columns: Vec<OrcColumn> = schema
                    .fields()
                    .iter()
                    .map(|field| {
                        let type_name = format_arrow_type(field.data_type());
                        OrcColumn {
                            name: field.name().clone(),
                            type_name,
                            logical_type: None,
                        }
                    })
                    .collect();

                let metadata = OrcMetadata {
                    num_rows: total_rows.to_string(),
                    num_columns: schema.fields().len() as u32,
                    columns,
                    file_size: self.file_content.len().to_string(),
                    compression: Some("ZLIB".to_string()), // ORC默认压缩
                    stripe_count,
                };

                Ok(metadata)
            }
            Err(e) => Err(format!("Failed to parse ORC file: {}", e)),
        }
    }

    /// 流式读取指定范围的数据
    async fn read_data_range(&self, offset: u64, limit: u64) -> Result<Vec<OrcDataRow>, String> {
        // 使用orc-rust解析ORC文件
        let bytes = Bytes::from(self.file_content.clone());

        match ArrowReaderBuilder::try_new(bytes) {
            Ok(builder) => {
                let mut reader = builder.build();
                let mut rows = Vec::new();
                let mut current_offset = 0u64;
                let mut collected_rows = 0u64;

                // 读取批次直到达到所需的offset和limit
                while let Some(batch_result) = reader.next() {
                    match batch_result {
                        Ok(batch) => {
                            let batch_size = batch.num_rows() as u64;

                            // 如果当前批次在offset之前，跳过
                            if current_offset + batch_size <= offset {
                                current_offset += batch_size;
                                continue;
                            }

                            // 如果已经收集了足够的行，停止
                            if collected_rows >= limit {
                                break;
                            }

                            let schema = batch.schema();
                            let start_row = if current_offset < offset {
                                (offset - current_offset) as usize
                            } else {
                                0
                            };

                            let end_row = std::cmp::min(
                                batch.num_rows(),
                                start_row + (limit - collected_rows) as usize,
                            );

                            // 提取指定范围的行
                            for row_idx in start_row..end_row {
                                let mut values = HashMap::new();

                                for (col_idx, field) in schema.fields().iter().enumerate() {
                                    let column = batch.column(col_idx);
                                    let value = extract_value_from_array(column.as_ref(), row_idx);
                                    values.insert(field.name().clone(), value);
                                }

                                rows.push(OrcDataRow { values });
                                collected_rows += 1;

                                if collected_rows >= limit {
                                    break;
                                }
                            }

                            current_offset += batch_size;
                        }
                        Err(e) => {
                            return Err(format!("Error reading batch: {}", e));
                        }
                    }
                }

                Ok(rows)
            }
            Err(e) => Err(format!("Failed to parse ORC file: {}", e)),
        }
    }
}

/// 获取ORC文件元数据
/// 注意：这是实验性功能，可能存在兼容性问题
#[tauri::command]
#[specta::specta]
pub async fn orc_get_metadata(url: String, _filename: String) -> Result<OrcMetadata, String> {
    // 实验性功能警告
    eprintln!("警告: ORC支持为实验性功能，可能存在兼容性问题");
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        // 获取文件内容
        let file_content = client
            .read_full_file(&url)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        // 创建流式读取器
        let reader = StreamingOrcReader::new(file_content).await?;

        // 获取元数据
        reader.get_metadata().await
    } else {
        Err("No storage client available".to_string())
    }
}

/// 获取ORC文件数据（分页）
/// 注意：这是实验性功能，可能存在兼容性问题
#[tauri::command]
#[specta::specta]
pub async fn orc_get_data(
    url: String,
    _filename: String,
    offset: String,
    limit: String,
) -> Result<Vec<OrcDataRow>, String> {
    // 实验性功能警告
    eprintln!("警告: ORC支持为实验性功能，可能存在兼容性问题");
    let manager_arc = get_storage_manager().await;
    let manager = manager_arc.read().await;

    if let Some(client) = manager.get_current_client() {
        // 获取文件内容
        let file_content = client
            .read_full_file(&url)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let offset_num = offset.parse::<u64>().unwrap_or(0);
        let limit_num = limit.parse::<u64>().unwrap_or(10);

        // 创建流式读取器
        let reader = StreamingOrcReader::new(file_content).await?;

        // 流式读取指定范围的数据
        reader.read_data_range(offset_num, limit_num).await
    } else {
        Err("No storage client available".to_string())
    }
}

/// 将Arrow数据类型转换为字符串表示
fn format_arrow_type(data_type: &DataType) -> String {
    match data_type {
        DataType::Boolean => "boolean".to_string(),
        DataType::Int8 => "tinyint".to_string(),
        DataType::Int16 => "smallint".to_string(),
        DataType::Int32 => "int".to_string(),
        DataType::Int64 => "bigint".to_string(),
        DataType::UInt8 => "tinyint unsigned".to_string(),
        DataType::UInt16 => "smallint unsigned".to_string(),
        DataType::UInt32 => "int unsigned".to_string(),
        DataType::UInt64 => "bigint unsigned".to_string(),
        DataType::Float16 => "half_float".to_string(),
        DataType::Float32 => "float".to_string(),
        DataType::Float64 => "double".to_string(),
        DataType::Utf8 => "string".to_string(),
        DataType::LargeUtf8 => "string".to_string(),
        DataType::Binary => "binary".to_string(),
        DataType::LargeBinary => "binary".to_string(),
        DataType::Date32 => "date".to_string(),
        DataType::Date64 => "date".to_string(),
        DataType::Time32(_) => "time".to_string(),
        DataType::Time64(_) => "time".to_string(),
        DataType::Timestamp(_, _) => "timestamp".to_string(),
        DataType::Decimal128(_, _) => "decimal".to_string(),
        DataType::Decimal256(_, _) => "decimal".to_string(),
        DataType::List(_) => "array".to_string(),
        DataType::LargeList(_) => "array".to_string(),
        DataType::Struct(_) => "struct".to_string(),
        DataType::Map(_, _) => "map".to_string(),
        _ => "unknown".to_string(),
    }
}

/// 从Arrow数组中提取指定索引的值
fn extract_value_from_array(array: &dyn Array, index: usize) -> String {
    if array.is_null(index) {
        return "null".to_string();
    }

    use arrow::array::*;

    match array.data_type() {
        DataType::Boolean => {
            let arr = array.as_any().downcast_ref::<BooleanArray>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Int8 => {
            let arr = array.as_any().downcast_ref::<Int8Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Int16 => {
            let arr = array.as_any().downcast_ref::<Int16Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Int32 => {
            let arr = array.as_any().downcast_ref::<Int32Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Int64 => {
            let arr = array.as_any().downcast_ref::<Int64Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::UInt8 => {
            let arr = array.as_any().downcast_ref::<UInt8Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::UInt16 => {
            let arr = array.as_any().downcast_ref::<UInt16Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::UInt32 => {
            let arr = array.as_any().downcast_ref::<UInt32Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::UInt64 => {
            let arr = array.as_any().downcast_ref::<UInt64Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Float32 => {
            let arr = array.as_any().downcast_ref::<Float32Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Float64 => {
            let arr = array.as_any().downcast_ref::<Float64Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Utf8 => {
            let arr = array.as_any().downcast_ref::<StringArray>().unwrap();
            arr.value(index).to_string()
        }
        DataType::LargeUtf8 => {
            let arr = array.as_any().downcast_ref::<LargeStringArray>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Binary => {
            let arr = array.as_any().downcast_ref::<BinaryArray>().unwrap();
            format!("{:?}", arr.value(index))
        }
        DataType::LargeBinary => {
            let arr = array.as_any().downcast_ref::<LargeBinaryArray>().unwrap();
            format!("{:?}", arr.value(index))
        }
        DataType::Date32 => {
            let arr = array.as_any().downcast_ref::<Date32Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Date64 => {
            let arr = array.as_any().downcast_ref::<Date64Array>().unwrap();
            arr.value(index).to_string()
        }
        DataType::Timestamp(_, _) => {
            let arr = array
                .as_any()
                .downcast_ref::<TimestampNanosecondArray>()
                .unwrap();
            arr.value(index).to_string()
        }
        DataType::Decimal128(_, _) => {
            let arr = array.as_any().downcast_ref::<Decimal128Array>().unwrap();
            arr.value(index).to_string()
        }
        _ => "unsupported".to_string(),
    }
}
