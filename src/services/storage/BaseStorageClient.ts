import { invoke } from '@tauri-apps/api/core';
import {
  StorageClient,
  ConnectionConfig,
  DirectoryResult,
  FileContent,
  ListOptions,
  ReadOptions,
  StorageResponse
} from './types';

/**
 * 统一存储客户端基类
 * 提供所有存储类型的通用接口实现
 */
export abstract class BaseStorageClient implements StorageClient {
  protected abstract protocol: string;
  protected connected: boolean = false;

  /**
   * 发起存储请求的统一接口
   */
  protected async makeRequest(params: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    options?: any;
  }): Promise<StorageResponse> {
    return await invoke('storage_request', {
      protocol: this.protocol,
      method: params.method,
      url: params.url,
      headers: params.headers || {},
      body: params.body,
      options: params.options,
    });
  }

  /**
   * 发起二进制请求
   */
  protected async makeRequestBinary(params: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    options?: any;
  }): Promise<ArrayBuffer> {
    const response = await invoke<string>('storage_request_binary', {
      protocol: this.protocol,
      method: params.method,
      url: params.url,
      headers: params.headers || {},
      options: params.options,
    });

    // 转换为 ArrayBuffer
    const binaryString = atob(response);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * 带进度的下载接口
   * 使用 Tauri 后端提供的流式下载和进度事件
   */
  protected async downloadWithProgress(
    method: string,
    url: string,
    filename: string,
    headers: Record<string, string> = {}
  ): Promise<string> {
    return await invoke('download_file_with_progress', {
      method,
      url,
      headers,
      filename,
    });
  }
	// 抽象方法，由具体实现定义
  abstract connect(config: ConnectionConfig): Promise<boolean>;
  abstract disconnect(): void;
  abstract listDirectory(path: string, options?: ListOptions): Promise<DirectoryResult>;
  abstract getFileContent(path: string, options?: ReadOptions): Promise<FileContent>;
  abstract getFileSize(path: string): Promise<number>;
  abstract downloadFile(path: string): Promise<Blob>;

  isConnected(): boolean {
    return this.connected;
  }

  // 可选的带进度下载方法，由子类实现
  downloadFileWithProgress?(_path: string, _filename: string): Promise<string>;
}
