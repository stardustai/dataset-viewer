/**
 * Simple encoding detection utilities for CSV files
 * Provides heuristic detection for common Chinese encodings
 */

export interface EncodingDetectionResult {
  encoding: string;
  confidence: number;
  reason: string;
}

/**
 * Detect potential encoding based on file content patterns
 * This is a simple heuristic-based approach
 */
export function detectPossibleEncoding(content: Uint8Array): EncodingDetectionResult[] {
  const results: EncodingDetectionResult[] = [];
  
  // Convert to string with different encodings for analysis
  const asUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(content);
  
  // Check for UTF-8 BOM
  if (content.length >= 3 && content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF) {
    results.push({
      encoding: 'utf-8',
      confidence: 0.9,
      reason: 'UTF-8 BOM detected'
    });
  }
  
  // Check for replacement characters (indicates encoding issues)
  const replacementCharCount = (asUtf8.match(/\uFFFD/g) || []).length;
  
  if (replacementCharCount === 0) {
    results.push({
      encoding: 'utf-8',
      confidence: 0.8,
      reason: 'Valid UTF-8 content'
    });
  } else if (replacementCharCount > 0) {
    // If there are replacement characters, it might be a different encoding
    results.push({
      encoding: 'gbk',
      confidence: 0.7,
      reason: 'UTF-8 decoding issues detected, possibly GBK'
    });
    
    results.push({
      encoding: 'gb2312',
      confidence: 0.6,
      reason: 'UTF-8 decoding issues detected, possibly GB2312'
    });
  }
  
  // Sort by confidence
  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Suggest encoding based on filename and content
 */
export function suggestEncoding(filename: string, content?: Uint8Array): string {
  // Check filename for hints
  const lowerFilename = filename.toLowerCase();
  
  // If content is provided, use detection
  if (content) {
    const detected = detectPossibleEncoding(content);
    if (detected.length > 0 && detected[0].confidence > 0.7) {
      return detected[0].encoding;
    }
  }
  
  // Default fallback
  return 'utf-8';
}