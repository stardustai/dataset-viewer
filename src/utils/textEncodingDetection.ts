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
 * Detect text encoding using jschardet
 * @param buffer Raw file content as Uint8Array
 * @returns Detected encoding information
 */
export function detectTextEncoding(buffer: Uint8Array): EncodingDetectionResult {
  try {
    const result = jschardet.detect(buffer);
    
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
    'GB2312': 'gb2312',
    'GBK': 'gbk',
    'GB18030': 'gb18030',
    'BIG5': 'big5',
    'UTF-8': 'utf-8',
    'UTF-16LE': 'utf-16le',
    'UTF-16BE': 'utf-16be',
    'SHIFT_JIS': 'shift_jis',
    'EUC-JP': 'euc-jp',
    'EUC-KR': 'euc-kr',
    'ISO-8859-1': 'iso-8859-1',
    'ISO-8859-2': 'iso-8859-2',
    'WINDOWS-1252': 'windows-1252',
    'ascii': 'ascii',
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
    'gb18030': 'gbk',
    'gbk': 'gb2312',
    'gb2312': 'utf-8',
    'big5': 'utf-8',
    'shift_jis': 'utf-8',
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
 */
export function detectEncodingWithFallback(
  buffer: Uint8Array,
  confidenceThreshold: number = 0.7
): EncodingDetectionResult {
  const detected = detectTextEncoding(buffer);
  
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