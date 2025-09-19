/**
 * Universal text encoding detection using jschardet
 * Provides automatic encoding detection for all text-based files
 */

import jschardet from 'jschardet';

export interface EncodingDetectionResult {
  encoding: string;
  confidence: number;
  language?: string;
}

/**
 * Detect text encoding using jschardet with performance optimization
 * Only uses a sample of the file for detection to avoid performance issues
 * @param buffer Raw file content as Uint8Array
 * @param maxSampleSize Maximum bytes to sample for detection (default: 8KB)
 * @returns Detected encoding information
 */
export function detectTextEncoding(
  buffer: Uint8Array,
  maxSampleSize: number = 8192
): EncodingDetectionResult {
  try {
    // For performance, only use a sample from the beginning of the file
    // jschardet doesn't need the entire file to detect encoding accurately
    const sampleSize = Math.min(buffer.length, maxSampleSize);
    const sample = buffer.slice(0, sampleSize);

    const result = jschardet.detect(String.fromCharCode(...new Uint8Array(sample)));

    if (!result || !result.encoding) {
      return {
        encoding: 'utf-8',
        confidence: 0.5,
      };
    }

    // Normalize encoding names to standard TextDecoder values
    const normalizedEncoding = normalizeEncoding(result.encoding);

    return {
      encoding: normalizedEncoding,
      confidence: result.confidence || 0,
      language: result.language,
    };
  } catch (error) {
    console.warn('Encoding detection failed:', error);
    return {
      encoding: 'utf-8',
      confidence: 0.5,
    };
  }
}

/**
 * Normalize jschardet encoding names to standard TextDecoder values
 */
function normalizeEncoding(encoding: string): string {
  const normalizedMap: Record<string, string> = {
    GB2312: 'gb2312',
    GBK: 'gbk',
    GB18030: 'gb18030',
    BIG5: 'big5',
    'UTF-8': 'utf-8',
    'UTF-16LE': 'utf-16le',
    'UTF-16BE': 'utf-16be',
    SHIFT_JIS: 'shift_jis',
    'EUC-JP': 'euc-jp',
    'EUC-KR': 'euc-kr',
    'ISO-8859-1': 'iso-8859-1',
    'ISO-8859-2': 'iso-8859-2',
    'WINDOWS-1252': 'windows-1252',
    ascii: 'ascii',
  };

  return normalizedMap[encoding.toUpperCase()] || encoding.toLowerCase();
}

/**
 * Check if an encoding is supported by TextDecoder
 */
export function isEncodingSupported(encoding: string): boolean {
  try {
    new TextDecoder(encoding);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a fallback encoding if the detected one is not supported
 */
export function getFallbackEncoding(primaryEncoding: string): string {
  if (isEncodingSupported(primaryEncoding)) {
    return primaryEncoding;
  }

  // Common fallbacks based on detected encoding
  const fallbackMap: Record<string, string> = {
    gb18030: 'gbk',
    gbk: 'gb2312',
    gb2312: 'utf-8',
    big5: 'utf-8',
    shift_jis: 'utf-8',
    'euc-jp': 'utf-8',
    'euc-kr': 'utf-8',
    'iso-8859-2': 'iso-8859-1',
    'windows-1252': 'iso-8859-1',
  };

  const fallback = fallbackMap[primaryEncoding.toLowerCase()];
  return fallback && isEncodingSupported(fallback) ? fallback : 'utf-8';
}

/**
 * Detect encoding with confidence threshold and fallback
 * Optimized for performance with large files
 */
export function detectEncodingWithFallback(
  buffer: Uint8Array,
  confidenceThreshold: number = 0.7
): EncodingDetectionResult {
  // Use different sample sizes based on file size for optimal performance
  let sampleSize: number;
  if (buffer.length < 1024) {
    // Small files: use entire content
    sampleSize = buffer.length;
  } else if (buffer.length < 100 * 1024) {
    // Medium files (< 100KB): use first 4KB
    sampleSize = 4096;
  } else {
    // Large files (>= 100KB): use first 8KB for better accuracy
    sampleSize = 8192;
  }

  const detected = detectTextEncoding(buffer, sampleSize);

  // If confidence is too low, use UTF-8 as fallback
  if (detected.confidence < confidenceThreshold) {
    return {
      encoding: 'utf-8',
      confidence: 0.8,
      language: 'universal',
    };
  }

  // Ensure the encoding is supported
  const finalEncoding = getFallbackEncoding(detected.encoding);

  return {
    ...detected,
    encoding: finalEncoding,
  };
}

/**
 * Quick encoding detection for small samples
 * Useful for preview or header detection scenarios
 */
export function detectEncodingFromSample(
  buffer: Uint8Array,
  sampleSize: number = 2048
): EncodingDetectionResult {
  return detectTextEncoding(buffer, sampleSize);
}
