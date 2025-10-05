/**
 * 流式点云加载器
 * 支持边加载边解析边渲染
 */

export interface StreamingChunk {
  positions: Float32Array;
  colors: Float32Array;
  originalColors: Float32Array | null;
  intensityValues: Float32Array | null;
  pointCount: number;
  chunkIndex: number;
}

export interface StreamingProgress {
  loaded: number;
  total: number;
  percentage: number;
  chunksProcessed: number;
  pointsProcessed: number;
  stage: 'loading' | 'parsing';
}

export type OnProgressCallback = (progress: StreamingProgress) => void;
export type OnChunkReadyCallback = (chunk: StreamingChunk) => void;

const CHUNK_SIZE = 1024 * 1024; // 1MB

export class StreamingPCDLoader {
  private onProgress?: OnProgressCallback;
  private onChunkReady?: OnChunkReadyCallback;

  constructor(callbacks?: {
    onProgress?: OnProgressCallback;
    onChunkReady?: OnChunkReadyCallback;
  }) {
    this.onProgress = callbacks?.onProgress;
    this.onChunkReady = callbacks?.onChunkReady;
  }

  async loadStreaming(arrayBuffer: ArrayBuffer): Promise<void> {
    // 开始解析阶段 (0-100%)
    this.onProgress?.({
      loaded: 0,
      total: arrayBuffer.byteLength,
      percentage: 0,
      chunksProcessed: 0,
      pointsProcessed: 0,
      stage: 'parsing',
    });

    // 读取文件头
    const headerSize = Math.min(10000, arrayBuffer.byteLength);
    const headerText = new TextDecoder().decode(arrayBuffer.slice(0, headerSize));

    // 查找 DATA 行（不区分大小写）
    const dataMatch = headerText.match(/\nDATA\s+(\w+)/i);
    if (!dataMatch) {
      throw new Error('Invalid PCD file format: DATA line not found');
    }

    const headerEnd = dataMatch.index!;
    const dataType = dataMatch[1].toLowerCase();

    const header = this.parseHeader(headerText.substring(0, headerEnd));
    // 使用从 DATA 行直接提取的类型，而不是从 header 解析的
    header.data = dataType;

    const dataLineEnd = headerText.indexOf('\n', headerEnd + 1);
    const dataStart = dataLineEnd + 1;

    if (header.data === 'ascii') {
      await this.streamASCIIData(arrayBuffer, dataStart, header);
    } else if (header.data === 'binary') {
      await this.streamBinaryData(arrayBuffer, dataStart, header);
    } else if (header.data === 'binary_compressed') {
      await this.streamBinaryCompressedData(arrayBuffer, dataStart, header);
    } else {
      throw new Error(`Unsupported data format: ${header.data}`);
    }
  }

  private parseHeader(headerText: string) {
    const lines = headerText.split('\n');
    const header: any = {
      version: '',
      fields: [],
      size: [],
      type: [],
      count: [],
      width: 0,
      height: 0,
      points: 0,
      data: 'ascii',
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length === 0) continue;

      const key = parts[0].toLowerCase();

      switch (key) {
        case 'version':
          header.version = parts[1];
          break;
        case 'fields':
          header.fields = parts.slice(1);
          break;
        case 'size':
          header.size = parts.slice(1).map(Number);
          break;
        case 'type':
          header.type = parts.slice(1);
          break;
        case 'count':
          header.count = parts.slice(1).map(Number);
          break;
        case 'width':
          header.width = parseInt(parts[1]);
          break;
        case 'height':
          header.height = parseInt(parts[1]);
          break;
        case 'points':
          header.points = parseInt(parts[1]);
          break;
        case 'data':
          header.data = parts[1].toLowerCase();
          break;
      }
    }

    return header;
  }

  private async streamASCIIData(arrayBuffer: ArrayBuffer, dataStart: number, header: any) {
    const totalPoints = header.points;
    const xIndex = header.fields.indexOf('x');
    const yIndex = header.fields.indexOf('y');
    const zIndex = header.fields.indexOf('z');
    const rgbIndex = header.fields.indexOf('rgb');
    const rIndex = header.fields.indexOf('r');
    const gIndex = header.fields.indexOf('g');
    const bIndex = header.fields.indexOf('b');
    const intensityIndex = header.fields.indexOf('intensity');

    let offset = dataStart;
    let leftover = '';
    let processedPoints = 0;
    let chunkIndex = 0;
    let chunkPositions: number[] = [];
    let chunkColors: number[] = [];
    let chunkIntensities: number[] = [];

    // 计算全局高度范围（用于着色）
    let minZ = Infinity;
    let maxZ = -Infinity;

    while (offset < arrayBuffer.byteLength && processedPoints < totalPoints) {
      const chunkEnd = Math.min(offset + CHUNK_SIZE, arrayBuffer.byteLength);
      const chunkData = new TextDecoder().decode(arrayBuffer.slice(offset, chunkEnd));
      const fullText = leftover + chunkData;
      const lines = fullText.split('\n');
      leftover = lines.pop() || '';

      for (const line of lines) {
        if (line.trim().length === 0 || line.startsWith('#')) continue;

        const values = line
          .trim()
          .split(/\s+/)
          .map(v => parseFloat(v));

        if (values.length >= header.fields.length) {
          const x = values[xIndex];
          const y = values[yIndex];
          const z = values[zIndex];

          if (isFinite(x) && isFinite(y) && isFinite(z)) {
            chunkPositions.push(x, y, z);

            // 更新高度范围
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);

            // 处理颜色 - 只有真正有颜色数据时才保存
            let hasRealColor = false;
            let r = 0,
              g = 0,
              b = 0;

            if (rgbIndex >= 0 && values[rgbIndex] !== undefined && values[rgbIndex] !== 0) {
              const rgb = Math.floor(values[rgbIndex]);
              // 从 sRGB 转换到线性空间
              r = this.sRGBToLinear(((rgb >> 16) & 0xff) / 255);
              g = this.sRGBToLinear(((rgb >> 8) & 0xff) / 255);
              b = this.sRGBToLinear((rgb & 0xff) / 255);
              hasRealColor = true;
            } else if (rIndex >= 0 && gIndex >= 0 && bIndex >= 0) {
              // 从 sRGB 转换到线性空间
              r = this.sRGBToLinear(values[rIndex] / 255);
              g = this.sRGBToLinear(values[gIndex] / 255);
              b = this.sRGBToLinear(values[bIndex] / 255);
              hasRealColor = r !== 0 || g !== 0 || b !== 0;
            }

            if (hasRealColor) {
              chunkColors.push(r, g, b);
            }

            // 处理反射率
            if (intensityIndex >= 0 && values[intensityIndex] !== undefined) {
              const intensity = values[intensityIndex];
              // 归一化到 0-1 范围（假设原始值在 0-255 或 0-1 范围）
              const normalizedIntensity = intensity > 1 ? intensity / 255 : intensity;
              chunkIntensities.push(normalizedIntensity);
            }

            processedPoints++;

            // 每 50000 个点发送一个块
            if (chunkPositions.length >= 50000 * 3) {
              this.emitChunk(
                chunkPositions,
                chunkColors,
                chunkIntensities,
                chunkIndex++,
                minZ,
                maxZ
              );
              chunkPositions = [];
              chunkColors = [];
              chunkIntensities = [];
            }

            if (processedPoints >= totalPoints) break;
          }
        }
      }

      offset = chunkEnd;

      // 报告解析进度 (0-100%)
      const parseProgress = (offset - dataStart) / (arrayBuffer.byteLength - dataStart);
      const totalProgress = parseProgress * 100;

      this.onProgress?.({
        loaded: offset,
        total: arrayBuffer.byteLength,
        percentage: totalProgress,
        chunksProcessed: chunkIndex,
        pointsProcessed: processedPoints,
        stage: 'parsing',
      });

      // 让出控制权，避免阻塞 UI
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // 发送剩余的点
    if (chunkPositions.length > 0) {
      this.emitChunk(chunkPositions, chunkColors, chunkIntensities, chunkIndex++, minZ, maxZ);
    }

    // 最终进度
    this.onProgress?.({
      loaded: arrayBuffer.byteLength,
      total: arrayBuffer.byteLength,
      percentage: 100,
      chunksProcessed: chunkIndex,
      pointsProcessed: processedPoints,
      stage: 'parsing',
    });
  }

  private async streamBinaryData(arrayBuffer: ArrayBuffer, dataStart: number, header: any) {
    const totalPoints = header.points;
    const xIndex = header.fields.indexOf('x');
    const yIndex = header.fields.indexOf('y');
    const zIndex = header.fields.indexOf('z');
    const rgbIndex = header.fields.indexOf('rgb');
    const intensityIndex = header.fields.indexOf('intensity');

    // 计算每个点的字节大小和字段偏移
    let pointSize = 0;
    const fieldOffsets: number[] = [];
    for (let i = 0; i < header.fields.length; i++) {
      fieldOffsets.push(pointSize);
      pointSize += header.size[i] * header.count[i];
    }

    let processedPoints = 0;
    let chunkIndex = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const dataView = new DataView(arrayBuffer, dataStart);
    const pointsPerChunk = Math.max(1000, Math.floor(CHUNK_SIZE / pointSize));

    while (processedPoints < totalPoints) {
      const pointsInThisChunk = Math.min(pointsPerChunk, totalPoints - processedPoints);
      const chunkPositions: number[] = [];
      const chunkColors: number[] = [];
      const chunkIntensities: number[] = [];

      for (let i = 0; i < pointsInThisChunk; i++) {
        const pointOffset = (processedPoints + i) * pointSize;

        // 检查是否超出边界
        if (pointOffset + pointSize > dataView.byteLength) {
          console.warn('[StreamingLoader] Reached end of data at point', processedPoints + i);
          break;
        }

        try {
          const x = dataView.getFloat32(pointOffset + fieldOffsets[xIndex], true);
          const y = dataView.getFloat32(pointOffset + fieldOffsets[yIndex], true);
          const z = dataView.getFloat32(pointOffset + fieldOffsets[zIndex], true);

          if (isFinite(x) && isFinite(y) && isFinite(z)) {
            chunkPositions.push(x, y, z);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);

            // 处理 RGB 颜色
            let r = 0.5,
              g = 0.5,
              b = 0.5;
            if (rgbIndex >= 0 && fieldOffsets[rgbIndex] !== undefined) {
              try {
                const rgbValue = dataView.getUint32(pointOffset + fieldOffsets[rgbIndex], true);
                // 从 sRGB 转换到线性空间
                r = this.sRGBToLinear(((rgbValue >> 16) & 0xff) / 255);
                g = this.sRGBToLinear(((rgbValue >> 8) & 0xff) / 255);
                b = this.sRGBToLinear((rgbValue & 0xff) / 255);
              } catch (e) {
                // RGB 读取失败，使用默认颜色
              }
            }
            chunkColors.push(r, g, b);

            // 处理反射率
            if (intensityIndex >= 0 && fieldOffsets[intensityIndex] !== undefined) {
              try {
                const intensity = dataView.getFloat32(
                  pointOffset + fieldOffsets[intensityIndex],
                  true
                );
                // 归一化到 0-1 范围
                const normalizedIntensity = intensity > 1 ? intensity / 255 : intensity;
                chunkIntensities.push(normalizedIntensity);
              } catch (e) {
                // 反射率读取失败
              }
            }
          }
        } catch (e) {
          console.error('[StreamingLoader] Error reading point', processedPoints + i, e);
          break;
        }
      }

      if (chunkPositions.length > 0) {
        this.emitChunk(chunkPositions, chunkColors, chunkIntensities, chunkIndex++, minZ, maxZ);
      }

      processedPoints += pointsInThisChunk;

      // 报告解析进度 (0-100%)
      const parseProgress = processedPoints / totalPoints;
      const totalProgress = parseProgress * 100;

      this.onProgress?.({
        loaded: dataStart + processedPoints * pointSize,
        total: arrayBuffer.byteLength,
        percentage: totalProgress,
        chunksProcessed: chunkIndex,
        pointsProcessed: processedPoints,
        stage: 'parsing',
      });

      // 让出控制权
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  private async streamBinaryCompressedData(
    arrayBuffer: ArrayBuffer,
    dataStart: number,
    header: any
  ) {
    // binary_compressed 格式使用 LZF 压缩
    // 格式: compressed_size (uint32) | uncompressed_size (uint32) | compressed_data
    const dataView = new DataView(arrayBuffer, dataStart);

    const compressedSize = dataView.getUint32(0, true);
    const uncompressedSize = dataView.getUint32(4, true);

    // 报告解压缩开始
    this.onProgress?.({
      loaded: dataStart,
      total: arrayBuffer.byteLength,
      percentage: 0,
      chunksProcessed: 0,
      pointsProcessed: 0,
      stage: 'parsing',
    });

    // 提取压缩数据
    const compressedData = new Uint8Array(arrayBuffer, dataStart + 8, compressedSize);

    // 解压缩数据
    let decompressedData: Uint8Array;
    try {
      decompressedData = this.lzfDecompress(compressedData, uncompressedSize);

      // 报告解压缩完成
      this.onProgress?.({
        loaded: dataStart + compressedSize,
        total: arrayBuffer.byteLength,
        percentage: 25,
        chunksProcessed: 0,
        pointsProcessed: 0,
        stage: 'parsing',
      });
    } catch (err) {
      console.error('Failed to decompress PCD data:', err);
      throw new Error('Failed to decompress binary_compressed PCD data');
    }

    // 将解压后的数据作为 binary 格式处理
    await this.streamBinaryData(decompressedData.buffer as ArrayBuffer, 0, header);
  }

  private sRGBToLinear(c: number): number {
    // sRGB 到线性空间的转换
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  private lzfDecompress(input: Uint8Array, outputSize: number): Uint8Array {
    const output = new Uint8Array(outputSize);
    let iidx = 0;
    let oidx = 0;

    try {
      while (iidx < input.length && oidx < outputSize) {
        const ctrl = input[iidx++];

        if (ctrl < 32) {
          // 字面量运行
          const literalLength = ctrl + 1;
          if (iidx + literalLength > input.length || oidx + literalLength > outputSize) {
            throw new Error('LZF: Invalid literal length');
          }
          for (let i = 0; i < literalLength; i++) {
            output[oidx++] = input[iidx++];
          }
        } else {
          // 反向引用
          let len = ctrl >> 5;
          if (len === 7) {
            if (iidx >= input.length) {
              throw new Error('LZF: Unexpected end of input');
            }
            len += input[iidx++];
          }
          len += 2;

          if (iidx >= input.length) {
            throw new Error('LZF: Unexpected end of input');
          }

          let ref = oidx - ((ctrl & 0x1f) << 8) - input[iidx++] - 1;

          if (ref < 0 || ref >= oidx) {
            throw new Error('LZF: Invalid back reference');
          }

          if (oidx + len > outputSize) {
            throw new Error('LZF: Output buffer overflow');
          }

          for (let i = 0; i < len; i++) {
            output[oidx++] = output[ref++];
          }
        }
      }

      return output;
    } catch (err) {
      console.error('LZF decompression error:', err);
      throw err;
    }
  }

  private emitChunk(
    positions: number[],
    colors: number[],
    intensities: number[],
    chunkIndex: number,
    minZ: number,
    maxZ: number
  ) {
    const pointCount = positions.length / 3;

    // 保存原始颜色（只有当颜色数组长度匹配时才认为有有效颜色）
    const hasValidColors = colors.length === pointCount * 3;
    const originalColors = hasValidColors ? new Float32Array(colors) : null;

    // 保存反射率（只有当反射率数组长度匹配时才认为有有效反射率）
    const hasValidIntensity = intensities.length === pointCount;
    const intensityValues = hasValidIntensity ? new Float32Array(intensities) : null;

    if (chunkIndex === 0) {
      console.log('[StreamingLoader] First chunk info:', {
        hasValidColors,
        colorsLength: colors.length,
        hasValidIntensity,
        intensityLength: intensities.length,
        expectedLength: pointCount * 3,
      });
    }

    // 生成高度着色
    const heightColors: number[] = [];
    const zRange = maxZ - minZ;
    for (let i = 0; i < pointCount; i++) {
      const z = positions[i * 3 + 2];
      const t = zRange > 0 ? (z - minZ) / zRange : 0.5;

      // 蓝色 -> 绿色 -> 红色渐变
      let r, g, b;
      if (t < 0.5) {
        const s = t * 2;
        r = s * 0.2;
        g = 0.4 + s * 0.6;
        b = 1.0 - s * 0.8;
      } else {
        const s = (t - 0.5) * 2;
        r = 0.2 + s * 0.8;
        g = 1.0 - s * 0.4;
        b = 0.2 - s * 0.2;
      }
      heightColors.push(r, g, b);
    }

    this.onChunkReady?.({
      positions: new Float32Array(positions),
      colors: new Float32Array(heightColors),
      originalColors,
      intensityValues,
      pointCount,
      chunkIndex,
    });
  }
}
