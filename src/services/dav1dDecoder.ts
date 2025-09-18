/**
 * dav1d WebAssembly 解码器服务
 * 基于 VideoLAN 的 dav1d 库，提供高性能的 AV1 解码
 */
import dav1dModule from 'dav1d.js';
import * as MP4Box from 'mp4box';

export interface AV1Frame {
  width: number;
  height: number;
  data: Uint8Array;
}

export class Dav1dDecoderService {
  private decoder: any = null;
  private isInitialized = false;
  private isLoading = false;
  private inputData: Uint8Array | null = null;
  private frameIndex = 0;
  private frameQueue: Uint8Array[] = [];
  private currentFrameIndex = 0;
  private isDataPrepared = false;
  private frameRate = 30; // 默认帧率

  /**
   * 检查浏览器是否原生支持 AV1
   */
  static supportsNativeAV1(): boolean {
    const video = document.createElement('video');
    return video.canPlayType('video/mp4; codecs="av01.0.05M.08"') !== '';
  }

  /**
   * 初始化解码器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized || this.isLoading) {
      return;
    }

    this.isLoading = true;

    try {
      // 动态导入 wasm 文件
      const wasmModule = await import('dav1d.js/dav1d.wasm?url');
      const wasmURL = wasmModule.default;

      // 创建解码器实例
      this.decoder = await dav1dModule.create({
        wasmURL: wasmURL,
      });

      this.isInitialized = true;
    } catch (error) {
      this.isInitialized = false;
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 设置解码器并加载视频数据
   */
  async setupDecoder(videoData: Uint8Array): Promise<void> {
    if (!this.isInitialized || !this.decoder) {
      throw new Error(
        `Decoder not initialized - isInitialized: ${this.isInitialized}, decoder: ${!!this.decoder}`
      );
    }

    try {
      // 重置状态
      this.reset();

      // 存储输入数据
      this.inputData = new Uint8Array(videoData);

      // 检测文件格式并准备帧队列
      await this.prepareFrameQueue();
    } catch (error) {
      throw new Error(`Decoder setup failed: ${error}`);
    }
  }

  /**
   * 获取总帧数
   */
  getTotalFrames(): number {
    if (!this.isDataPrepared || this.frameQueue.length === 0) {
      return 0;
    }

    return this.frameQueue.length;
  }

  /**
   * 获取当前帧索引
   */
  getCurrentFrameIndex(): number {
    return this.frameIndex;
  }

  /**
   * 检查数据是否已准备好
   */
  isDataReady(): boolean {
    return this.isDataPrepared && this.frameQueue.length > 0;
  }

  /**
   * 获取视频帧率
   */
  getFrameRate(): number {
    return this.frameRate;
  }

  /**
   * 重置播放位置到开始
   */
  resetPlayback(): void {
    this.currentFrameIndex = 0;
    this.frameIndex = 0;
  }

  /**
   * 跳转到指定帧
   */
  seekToFrame(frameIndex: number): void {
    if (!this.isDataPrepared || frameIndex < 0) {
      return;
    }

    const maxFrame = this.frameQueue.length - 1;
    this.currentFrameIndex = Math.min(frameIndex, maxFrame);
    this.frameIndex = this.currentFrameIndex;
  }

  /**
   * 重置解码器状态
   */
  private reset(): void {
    this.frameIndex = 0;
    this.frameQueue = [];
    this.currentFrameIndex = 0;
    this.isDataPrepared = false;
  }

  /**
   * 准备帧队列
   */
  private async prepareFrameQueue(): Promise<void> {
    if (!this.inputData) {
      throw new Error('No input data');
    }

    const formatInfo = this.detectFileFormat(this.inputData);

    switch (formatInfo.format) {
      case 'mp4':
        this.frameQueue = await this.extractAV1SamplesFromMP4(this.inputData);
        break;
      case 'ivf':
        this.frameQueue = this.extractFramesFromIVF(this.inputData, formatInfo.headerSize);
        break;
      case 'raw':
        this.frameQueue = this.extractFramesFromRaw(this.inputData);
        break;
    }

    this.isDataPrepared = true;
  }

  /**
   * 检测文件格式并返回解析信息
   */
  private detectFileFormat(data: Uint8Array): {
    format: 'ivf' | 'mp4' | 'raw';
    headerSize: number;
    frameCount: number;
  } {
    if (data.length < 32) {
      throw new Error('File too short to analyze');
    }

    // 检查 IVF 格式
    const signature = new TextDecoder().decode(data.slice(0, 4));
    if (signature === 'DKIF') {
      const headerLength = new DataView(data.buffer).getUint16(6, true);
      const frameCount = new DataView(data.buffer).getUint32(24, true);

      // 解析帧率信息 (IVF格式: timebase_denominator在偏移16, timebase_numerator在偏移20)
      const timebaseDen = new DataView(data.buffer).getUint32(16, true);
      const timebaseNum = new DataView(data.buffer).getUint32(20, true);
      if (timebaseNum > 0 && timebaseDen > 0) {
        this.frameRate = timebaseDen / timebaseNum;
      }

      return { format: 'ivf', headerSize: headerLength, frameCount };
    }

    // 检查 MP4 格式
    if (
      signature === 'ftyp' ||
      (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70)
    ) {
      return { format: 'mp4', headerSize: 0, frameCount: 0 };
    }

    return { format: 'raw', headerSize: 0, frameCount: 0 };
  }

  /**
   * 从IVF格式提取帧数据
   */
  private extractFramesFromIVF(data: Uint8Array, headerSize: number): Uint8Array[] {
    const frames: Uint8Array[] = [];
    let offset = headerSize;

    while (offset + 12 <= data.length) {
      // 读取帧大小 (前 4 字节，小端序)
      const frameSize = new DataView(data.buffer).getUint32(offset, true);
      offset += 12; // 跳过 12 字节帧头

      if (offset + frameSize <= data.length) {
        frames.push(data.slice(offset, offset + frameSize));
        offset += frameSize;
      } else {
        break;
      }
    }

    return frames;
  }

  /**
   * 从Raw格式提取帧数据
   */
  private extractFramesFromRaw(data: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    let offset = 0;

    while (offset < data.length) {
      const obu = this.parseOBUAt(data, offset);
      if (obu && obu.length > 0) {
        frames.push(obu);
        offset += obu.length;
      } else {
        offset++;
      }
    }

    return frames;
  }

  /**
   * 统一的LEB128读取方法
   */
  private readLEB128(
    data: Uint8Array,
    startOffset: number
  ): { value: number; nextOffset: number } | null {
    let offset = startOffset;
    let value = 0;
    let shift = 0;

    while (offset < data.length && shift < 32) {
      const byte = data[offset++];
      value |= (byte & 0x7f) << shift;

      if ((byte & 0x80) === 0) {
        return { value, nextOffset: offset };
      }

      shift += 7;
    }

    return null;
  }

  /**
   * 从MP4文件提取AV1样本数据
   */
  private async extractAV1SamplesFromMP4(data: Uint8Array): Promise<Uint8Array[]> {
    const samples: Uint8Array[] = [];

    return new Promise(resolve => {
      const mp4boxfile = MP4Box.createFile();
      let av1TrackId: number | null = null;
      let resolved = false;

      const finalize = () => {
        if (!resolved) {
          resolved = true;
          if (samples.length === 0) {
            this.extractOBUsFromData(data, samples);
          }
          resolve(samples);
        }
      };

      mp4boxfile.onError = finalize;

      mp4boxfile.onReady = (info: any) => {
        av1TrackId =
          info.tracks.find(
            (t: any) => t.codec && (t.codec.startsWith('av01') || t.codec.startsWith('AV01'))
          )?.id || null;

        if (av1TrackId) {
          mp4boxfile.setExtractionOptions(av1TrackId, null, { nbSamples: 100 });
          mp4boxfile.start();
        } else {
          finalize();
        }
      };

      mp4boxfile.onSamples = (_id: number, _user: any, sampleArray: any[]) => {
        for (const sample of sampleArray) {
          if (sample.data?.length > 0) {
            const sampleData = new Uint8Array(sample.data);
            const obuType = (sampleData[0] >> 3) & 0x0f;

            if (obuType === 0 || obuType > 15) {
              const parsedOBUs = this.parseMP4AV1Sample(sampleData);
              if (parsedOBUs.length > 0) {
                const combined = new Uint8Array(
                  parsedOBUs.reduce((sum, obu) => sum + obu.length, 0)
                );
                let offset = 0;
                for (const obu of parsedOBUs) {
                  combined.set(obu, offset);
                  offset += obu.length;
                }
                samples.push(combined);
              }
            } else {
              samples.push(sampleData);
            }
          }
        }
        finalize();
      };

      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      (arrayBuffer as any).fileStart = 0;
      mp4boxfile.appendBuffer(arrayBuffer as ArrayBuffer);
      mp4boxfile.flush();

      setTimeout(finalize, 3000); // 3秒超时
    });
  }

  private extractOBUsFromData(data: Uint8Array, samples: Uint8Array[]): void {
    // 使用统一的Raw格式提取逻辑
    const extractedFrames = this.extractFramesFromRaw(data);
    samples.push(...extractedFrames);
  }

  private parseOBUAt(data: Uint8Array, startOffset: number): Uint8Array | null {
    if (startOffset >= data.length) return null;

    let offset = startOffset;
    const obuHeader = data[offset];
    const hasSize = (obuHeader & 0x02) !== 0;
    const hasExtension = (obuHeader & 0x04) !== 0;

    offset++; // 跳过 OBU 头

    // 跳过扩展头
    if (hasExtension && offset < data.length) {
      offset++;
    }

    let obuSize = 0;
    if (hasSize) {
      // 读取 LEB128 编码的大小
      const sizeResult = this.readLEB128(data, offset);
      if (!sizeResult) return null;
      obuSize = sizeResult.value;
      offset = sizeResult.nextOffset;
    } else {
      // 没有大小字段，扫描寻找下一个有效的 OBU 头或数据结束
      obuSize = this.findNextOBUBoundary(data, offset) - offset;
    }

    if (offset + obuSize > data.length) {
      obuSize = data.length - offset;
    }

    return data.slice(startOffset, offset + obuSize);
  }

  /**
   * 扫描寻找下一个有效的 OBU 头边界
   */
  private findNextOBUBoundary(data: Uint8Array, startOffset: number): number {
    // 从当前偏移开始扫描，寻找下一个有效的 OBU 头
    for (let i = startOffset + 1; i < data.length; i++) {
      if (this.isValidOBUHeader(data, i)) {
        return i;
      }
    }
    // 如果没有找到下一个 OBU 头，返回数据结束位置
    return data.length;
  }

  /**
   * 检查指定位置是否为有效的 OBU 头
   */
  private isValidOBUHeader(data: Uint8Array, offset: number): boolean {
    if (offset >= data.length) return false;

    const obuHeader = data[offset];
    const obuType = (obuHeader >> 3) & 0x0f;

    // 检查 OBU 类型是否有效 (0-15 范围内的已定义类型)
    const validOBUTypes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    if (!validOBUTypes.includes(obuType)) {
      return false;
    }

    // 检查保留位是否为0
    const reservedBit = obuHeader & 0x01;
    if (reservedBit !== 0) {
      return false;
    }

    const hasExtension = (obuHeader & 0x04) !== 0;
    const hasSize = (obuHeader & 0x02) !== 0;

    let checkOffset = offset + 1;

    // 跳过扩展头
    if (hasExtension && checkOffset < data.length) {
      checkOffset++;
    }

    // 如果有大小字段，尝试读取 LEB128
    if (hasSize && checkOffset < data.length) {
      const sizeResult = this.readLEB128(data, checkOffset);
      if (!sizeResult) {
        return false;
      }
      // 检查大小是否合理（不超过剩余数据长度）
      if (sizeResult.value > data.length - sizeResult.nextOffset) {
        return false;
      }
    }

    return true;
  }

  /**
   * 简化的BMP解析 - 仅处理基本的24/32位BMP格式
   */
  private parseBMP(
    bmpData: Uint8Array
  ): { width: number; height: number; data: Uint8ClampedArray } | null {
    if (bmpData.length < 54 || bmpData[0] !== 0x42 || bmpData[1] !== 0x4d) {
      return null;
    }

    const dataView = new DataView(bmpData.buffer, bmpData.byteOffset);
    const dataOffset = dataView.getUint32(10, true);
    const width = dataView.getUint32(18, true);
    const heightRaw = dataView.getInt32(22, true);
    const height = Math.abs(heightRaw);
    const bitsPerPixel = dataView.getUint16(28, true);

    if (
      width <= 0 ||
      height <= 0 ||
      width > 8192 ||
      height > 8192 ||
      (bitsPerPixel !== 24 && bitsPerPixel !== 32) ||
      dataOffset >= bmpData.length
    ) {
      return null;
    }

    const bytesPerPixel = bitsPerPixel / 8;
    const rowSize = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
    const rgbaData = new Uint8ClampedArray(width * height * 4);
    const isTopDown = heightRaw < 0;

    for (let y = 0; y < height; y++) {
      const srcY = isTopDown ? y : height - 1 - y;
      const srcRowOffset = dataOffset + srcY * rowSize;

      for (let x = 0; x < width; x++) {
        const srcOffset = srcRowOffset + x * bytesPerPixel;
        const dstOffset = (y * width + x) * 4;

        if (srcOffset + bytesPerPixel > bmpData.length) break;

        // BGR(A) to RGBA conversion
        rgbaData[dstOffset] = bmpData[srcOffset + 2]; // R
        rgbaData[dstOffset + 1] = bmpData[srcOffset + 1]; // G
        rgbaData[dstOffset + 2] = bmpData[srcOffset]; // B
        rgbaData[dstOffset + 3] = bitsPerPixel === 32 ? bmpData[srcOffset + 3] : 255; // A
      }
    }

    return { width, height, data: rgbaData };
  }

  private parseMP4AV1Sample(sampleData: Uint8Array): Uint8Array[] {
    const obus: Uint8Array[] = [];
    let offset = 0;

    while (offset < sampleData.length) {
      // 读取OBU长度（LEB128格式）
      const lengthResult = this.readLEB128(sampleData, offset);
      if (!lengthResult) {
        break;
      }

      const obuLength = lengthResult.value;
      offset = lengthResult.nextOffset;

      // 检查是否有足够的数据
      if (offset + obuLength > sampleData.length) {
        break;
      }

      // 提取OBU数据
      const obuData = sampleData.slice(offset, offset + obuLength);
      if (obuData.length > 0) {
        obus.push(obuData);
      }

      offset += obuLength;
    }

    return obus;
  }

  // 获取下一帧
  /**
   * 获取下一帧
   */
  async getNextFrame(): Promise<AV1Frame | null> {
    if (!this.decoder) {
      throw new Error('Decoder not properly initialized');
    }

    // 确保数据已准备
    if (!this.isDataPrepared && this.inputData) {
      await this.prepareFrameQueue();
    }

    // 检查是否还有帧可用
    if (this.currentFrameIndex >= this.frameQueue.length) {
      return null;
    }

    // 尝试解码当前帧
    while (this.currentFrameIndex < this.frameQueue.length) {
      const frameData = this.frameQueue[this.currentFrameIndex++];
      const frame = await this.tryDecodeFrame(frameData);

      if (frame) {
        this.frameIndex++;
        return frame;
      }
      // 继续尝试下一帧
    }

    return null;
  }

  /**
   * 尝试解码帧数据
   */
  private async tryDecodeFrame(frameData: Uint8Array): Promise<AV1Frame | null> {
    if (frameData.length === 0) return null;

    try {
      const result = this.decoder.decodeFrameAsBMP(frameData);

      if (result?.width && result?.height && result?.data) {
        // 检查是否为BMP格式数据
        if (result.data[0] === 0x42 && result.data[1] === 0x4d) {
          const bmpData = this.parseBMP(result.data);
          return bmpData
            ? {
                width: bmpData.width,
                height: bmpData.height,
                data: new Uint8Array(bmpData.data),
              }
            : null;
        }

        return {
          width: result.width,
          height: result.height,
          data: result.data,
        };
      }
    } catch {
      // 解码失败是正常的，特别是对于非帧数据的 OBU
    }

    return null;
  }

  /**
   * 解码单个帧数据
   */
  async decodeFrame(frameData: Uint8Array): Promise<AV1Frame | null> {
    if (!this.decoder) {
      throw new Error('Decoder not initialized');
    }

    return this.tryDecodeFrame(frameData);
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    try {
      this.decoder?.cleanup();
    } catch {
      // 清理错误静默处理
    }

    this.decoder = null;
    this.inputData = null;
    this.reset();
    this.isInitialized = false;
    this.isLoading = false;
  }
}

export const dav1dDecoderService = new Dav1dDecoderService();
