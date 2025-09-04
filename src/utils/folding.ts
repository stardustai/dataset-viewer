/**
 * 代码折叠系统 - 高性能实现
 * 支持增量解析、多级缓存、按需计算
 */

export interface FoldableRange {
  id: string;
  startLine: number;
  endLine: number;
  type: 'json-object' | 'json-array' | 'xml-element' | 'yaml-block' | 'html-element';
  level: number;
  summary: string;
  startContent: string;
  endContent: string;
}

interface SyntaxToken {
  line: number;
  char: number;
  type: 'bracket-open' | 'bracket-close' | 'tag-open' | 'tag-close' | 'key' | 'string' | 'comment';
  value: string;
  bracketType?: '{' | '}' | '[' | ']' | '<' | '>';
  tagName?: string;
}

// 缓存管理器
class CacheManager {
  private syntaxCache = new Map<string, Map<number, SyntaxToken[]>>();
  private foldingCache = new Map<string, Map<number, FoldableRange>>();
  private lastAccessTime = new Map<string, number>();
  private maxCacheSize = 100; // 最多缓存100个文件
  private cacheTimeout = 5 * 60 * 1000; // 5分钟过期

  getFileKey(fileName: string, contentHash: string): string {
    return `${fileName}:${contentHash}`;
  }

  // 获取语法标记缓存
  getSyntaxTokens(
    fileKey: string,
    lineRange: { start: number; end: number }
  ): Map<number, SyntaxToken[]> | null {
    const cache = this.syntaxCache.get(fileKey);
    if (!cache) return null;

    this.lastAccessTime.set(fileKey, Date.now());

    // 检查缓存是否覆盖所需范围
    const result = new Map<number, SyntaxToken[]>();
    let hasAllLines = true;

    for (let line = lineRange.start; line <= lineRange.end; line++) {
      const tokens = cache.get(line);
      if (tokens) {
        result.set(line, tokens);
      } else {
        hasAllLines = false;
        break;
      }
    }

    return hasAllLines ? result : null;
  }

  // 缓存语法标记
  cacheSyntaxTokens(fileKey: string, tokens: Map<number, SyntaxToken[]>): void {
    let cache = this.syntaxCache.get(fileKey);
    if (!cache) {
      cache = new Map();
      this.syntaxCache.set(fileKey, cache);
    }

    tokens.forEach((tokenList, lineNumber) => {
      cache!.set(lineNumber, tokenList);
    });

    this.lastAccessTime.set(fileKey, Date.now());
    this.cleanupCache();
  }

  // 获取折叠区间缓存
  getFoldingRange(fileKey: string, startLine: number): FoldableRange | null {
    const cache = this.foldingCache.get(fileKey);
    if (!cache) return null;

    this.lastAccessTime.set(fileKey, Date.now());
    return cache.get(startLine) || null;
  }

  // 缓存折叠区间
  cacheFoldingRange(fileKey: string, range: FoldableRange): void {
    let cache = this.foldingCache.get(fileKey);
    if (!cache) {
      cache = new Map();
      this.foldingCache.set(fileKey, cache);
    }

    cache.set(range.startLine, range);
    this.lastAccessTime.set(fileKey, Date.now());
    this.cleanupCache();
  }

  // 清理过期缓存
  private cleanupCache(): void {
    const now = Date.now();
    const filesToRemove: string[] = [];

    // 检查过期时间
    this.lastAccessTime.forEach((lastAccess, fileKey) => {
      if (now - lastAccess > this.cacheTimeout) {
        filesToRemove.push(fileKey);
      }
    });

    // 如果超过最大缓存大小，移除最旧的
    if (this.lastAccessTime.size > this.maxCacheSize) {
      const sortedByTime = Array.from(this.lastAccessTime.entries()).sort(([, a], [, b]) => a - b);

      const removeCount = this.lastAccessTime.size - this.maxCacheSize + filesToRemove.length;
      for (let i = 0; i < removeCount; i++) {
        const [fileKey] = sortedByTime[i];
        if (!filesToRemove.includes(fileKey)) {
          filesToRemove.push(fileKey);
        }
      }
    }

    // 清理缓存
    filesToRemove.forEach(fileKey => {
      this.syntaxCache.delete(fileKey);
      this.foldingCache.delete(fileKey);
      this.lastAccessTime.delete(fileKey);
    });
  }

  // 清理特定文件的缓存
  clearFileCache(fileKey: string): void {
    this.syntaxCache.delete(fileKey);
    this.foldingCache.delete(fileKey);
    this.lastAccessTime.delete(fileKey);
  }
}

// 全局缓存实例
const cacheManager = new CacheManager();

// 快速内容哈希函数
function fastHash(content: string): string {
  let hash = 0;
  if (content.length === 0) return hash.toString();

  // 采样策略：只计算开头、中间、结尾的哈希
  const sampleSize = Math.min(1000, content.length);
  const step = Math.max(1, Math.floor(content.length / sampleSize));

  for (let i = 0; i < content.length; i += step) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 转换为32位整数
  }

  return hash.toString();
}

// 高性能语法标记器
class SyntaxTokenizer {
  private fileType: string;

  constructor(fileName: string) {
    this.fileType = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
  }

  // 批量标记化指定行范围
  tokenizeRange(lines: string[], startLine: number, endLine: number): Map<number, SyntaxToken[]> {
    const result = new Map<number, SyntaxToken[]>();

    switch (this.fileType) {
      case 'json':
      case 'jsonl':
        this.tokenizeJsonRange(lines, startLine, endLine, result);
        break;
      case 'xml':
      case 'svg':
      case 'html':
      case 'htm':
        this.tokenizeXmlRange(lines, startLine, endLine, result);
        break;
      case 'yaml':
      case 'yml':
        this.tokenizeYamlRange(lines, startLine, endLine, result);
        break;
    }

    return result;
  }

  private tokenizeJsonRange(
    lines: string[],
    startLine: number,
    endLine: number,
    result: Map<number, SyntaxToken[]>
  ): void {
    for (let lineIndex = startLine; lineIndex <= endLine && lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const tokens: SyntaxToken[] = [];

      let inString = false;
      let escapeNext = false;

      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\' && inString) {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          tokens.push({
            line: lineIndex,
            char: charIndex,
            type: 'string',
            value: char,
          });
          continue;
        }

        if (!inString) {
          switch (char) {
            case '{':
              tokens.push({
                line: lineIndex,
                char: charIndex,
                type: 'bracket-open',
                value: char,
                bracketType: '{',
              });
              break;
            case '}':
              tokens.push({
                line: lineIndex,
                char: charIndex,
                type: 'bracket-close',
                value: char,
                bracketType: '}',
              });
              break;
            case '[':
              tokens.push({
                line: lineIndex,
                char: charIndex,
                type: 'bracket-open',
                value: char,
                bracketType: '[',
              });
              break;
            case ']':
              tokens.push({
                line: lineIndex,
                char: charIndex,
                type: 'bracket-close',
                value: char,
                bracketType: ']',
              });
              break;
          }
        }
      }

      result.set(lineIndex, tokens);
    }
  }

  private tokenizeXmlRange(
    lines: string[],
    startLine: number,
    endLine: number,
    result: Map<number, SyntaxToken[]>
  ): void {
    for (let lineIndex = startLine; lineIndex <= endLine && lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const tokens: SyntaxToken[] = [];

      const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;
      let match;

      while ((match = tagRegex.exec(line)) !== null) {
        const tagName = match[1];
        const isClosing = match[0].startsWith('</');
        const isSelfClosing = match[0].endsWith('/>');

        if (!isSelfClosing) {
          tokens.push({
            line: lineIndex,
            char: match.index,
            type: isClosing ? 'tag-close' : 'tag-open',
            value: match[0],
            tagName,
          });
        }
      }

      result.set(lineIndex, tokens);
    }
  }

  private tokenizeYamlRange(
    lines: string[],
    startLine: number,
    endLine: number,
    result: Map<number, SyntaxToken[]>
  ): void {
    for (let lineIndex = startLine; lineIndex <= endLine && lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const tokens: SyntaxToken[] = [];
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        result.set(lineIndex, tokens);
        continue;
      }

      const keyMatch = trimmedLine.match(/^([^:]+):\s*$/);
      if (keyMatch) {
        tokens.push({
          line: lineIndex,
          char: line.indexOf(keyMatch[1]),
          type: 'key',
          value: keyMatch[1],
        });
      }

      result.set(lineIndex, tokens);
    }
  }
}

// 高性能折叠区间计算器
export class FoldingProvider {
  private fileName: string;
  private contentHash: string;
  private tokenizer: SyntaxTokenizer;
  private fileKey: string;

  constructor(fileName: string, content: string) {
    this.fileName = fileName;
    this.contentHash = fastHash(content);
    this.tokenizer = new SyntaxTokenizer(fileName);
    this.fileKey = cacheManager.getFileKey(fileName, this.contentHash);
  }

  // 检查是否支持折叠
  supportsFolding(): boolean {
    const ext = this.fileName.substring(this.fileName.lastIndexOf('.') + 1).toLowerCase();
    return ['json', 'jsonl', 'xml', 'svg', 'html', 'htm', 'yaml', 'yml'].includes(ext);
  }

  // 快速检查行是否可能是折叠起始行
  isLikelyFoldingStart(line: string): boolean {
    const ext = this.fileName.substring(this.fileName.lastIndexOf('.') + 1).toLowerCase();
    const trimmedLine = line.trim();

    switch (ext) {
      case 'json':
      case 'jsonl':
        // 简化JSON折叠起始行的检测 - 只检查最常见的模式
        return (
          trimmedLine.endsWith('{') ||
          trimmedLine.endsWith('[') ||
          /[{\[]\s*,?\s*$/.test(trimmedLine)
        );
      case 'xml':
      case 'svg':
      case 'html':
      case 'htm':
        return /<[^\/][^>]*[^\/]>/.test(trimmedLine) && !trimmedLine.includes('</');
      case 'yaml':
      case 'yml':
        return /^[^:]+:\s*$/.test(trimmedLine);
      default:
        return false;
    }
  }

  // 高性能折叠区间查找
  getFoldingRangeAt(lines: string[], lineIndex: number): FoldableRange | null {
    if (!this.supportsFolding() || !this.isLikelyFoldingStart(lines[lineIndex] || '')) {
      return null;
    }

    // 首先检查缓存
    const cachedRange = cacheManager.getFoldingRange(this.fileKey, lineIndex);
    if (cachedRange) {
      return cachedRange;
    }

    // 计算折叠区间
    const range = this.computeFoldingRange(lines, lineIndex);
    if (range) {
      // 缓存结果
      cacheManager.cacheFoldingRange(this.fileKey, range);
    }

    return range;
  }

  // 批量获取可见范围内的折叠区间
  getFoldingRangesInRange(lines: string[], startLine: number, endLine: number): FoldableRange[] {
    if (!this.supportsFolding()) return [];

    const ranges: FoldableRange[] = [];
    const expandedStart = Math.max(0, startLine - 50);
    const expandedEnd = Math.min(lines.length - 1, endLine + 50);

    // 获取或生成语法标记
    let tokens = cacheManager.getSyntaxTokens(this.fileKey, {
      start: expandedStart,
      end: expandedEnd,
    });
    if (!tokens) {
      tokens = this.tokenizer.tokenizeRange(lines, expandedStart, expandedEnd);
      cacheManager.cacheSyntaxTokens(this.fileKey, tokens);
    }

    // 简化折叠检测算法
    for (
      let lineIndex = expandedStart;
      lineIndex <= expandedEnd && lineIndex < lines.length;
      lineIndex++
    ) {
      if (this.isLikelyFoldingStart(lines[lineIndex] || '')) {
        const range = this.getFoldingRangeAt(lines, lineIndex);
        if (range) {
          ranges.push(range);
        }
      }
    }

    // 排序并去重
    return ranges
      .sort((a, b) => a.startLine - b.startLine)
      .filter((range, index, arr) => {
        // 去除重复的范围
        if (index === 0) return true;
        const prev = arr[index - 1];
        return range.startLine !== prev.startLine || range.endLine !== prev.endLine;
      });
  }

  private computeFoldingRange(lines: string[], startLine: number): FoldableRange | null {
    const ext = this.fileName.substring(this.fileName.lastIndexOf('.') + 1).toLowerCase();

    switch (ext) {
      case 'json':
      case 'jsonl':
        return this.computeJsonFoldingRange(lines, startLine);
      case 'xml':
      case 'svg':
      case 'html':
      case 'htm':
        return this.computeXmlFoldingRange(lines, startLine);
      case 'yaml':
      case 'yml':
        return this.computeYamlFoldingRange(lines, startLine);
      default:
        return null;
    }
  }

  private computeJsonFoldingRange(lines: string[], startLineIndex: number): FoldableRange | null {
    const startLine = lines[startLineIndex]?.trim();
    if (!startLine) return null;

    let targetChar: string;
    let expectedEndChar: string;
    let foldType: 'json-object' | 'json-array';

    if (startLine.includes('{')) {
      targetChar = '{';
      expectedEndChar = '}';
      foldType = 'json-object';
    } else if (startLine.includes('[')) {
      targetChar = '[';
      expectedEndChar = ']';
      foldType = 'json-array';
    } else {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    // 处理起始行
    const startLineText = lines[startLineIndex];
    for (let i = 0; i < startLineText.length; i++) {
      const char = startLineText[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === targetChar) {
          depth++;
        } else if (char === expectedEndChar) {
          depth--;
          if (depth === 0) {
            return null; // 同行结束
          }
        }
      }
    }

    if (depth === 0) return null;

    // 自适应搜索范围：根据文件大小调整
    const totalLines = lines.length;
    const remainingLines = totalLines - startLineIndex;

    let maxSearchLines: number;
    if (totalLines <= 1000) {
      maxSearchLines = remainingLines;
    } else if (totalLines <= 10000) {
      maxSearchLines = Math.min(5000, remainingLines);
    } else {
      maxSearchLines = Math.min(10000, remainingLines);
    }

    const endSearchLimit = Math.min(lines.length, startLineIndex + maxSearchLines);

    // 搜索结束位置
    for (let lineIndex = startLineIndex + 1; lineIndex < endSearchLimit; lineIndex++) {
      const line = lines[lineIndex];

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\' && inString) {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === targetChar) {
            depth++;
          } else if (char === expectedEndChar) {
            depth--;
            if (depth === 0) {
              const level = Math.floor(
                (startLineText.length - startLineText.trimStart().length) / 2
              );
              const summary = this.generateFoldingSummary(
                lines,
                startLineIndex,
                lineIndex,
                foldType === 'json-object' ? 'object' : 'array'
              );

              return {
                id: `json-${foldType}-${startLineIndex}-${lineIndex}`,
                startLine: startLineIndex,
                endLine: lineIndex,
                type: foldType,
                level,
                summary,
                startContent: lines[startLineIndex],
                endContent: lines[lineIndex],
              };
            }
          }
        }
      }
    }

    return null;
  }

  private computeXmlFoldingRange(lines: string[], startLineIndex: number): FoldableRange | null {
    // XML 折叠逻辑的优化版本
    const startLine = lines[startLineIndex];
    const tagMatch = startLine.match(/<([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/);

    if (!tagMatch || startLine.includes('</') || startLine.endsWith('/>')) {
      return null;
    }

    const tagName = tagMatch[1];
    const closeTagPattern = new RegExp(`</${tagName}>`);

    const maxSearchLines = 500;
    const endSearchLimit = Math.min(lines.length, startLineIndex + maxSearchLines);

    for (let lineIndex = startLineIndex + 1; lineIndex < endSearchLimit; lineIndex++) {
      if (closeTagPattern.test(lines[lineIndex])) {
        const level = Math.floor((startLine.length - startLine.trimStart().length) / 2);
        const summary = `<${tagName}> ... </${tagName}> (${lineIndex - startLineIndex + 1} lines)`;

        return {
          id: `xml-element-${tagName}-${startLineIndex}-${lineIndex}`,
          startLine: startLineIndex,
          endLine: lineIndex,
          type: 'xml-element',
          level,
          summary,
          startContent: lines[startLineIndex],
          endContent: lines[lineIndex],
        };
      }
    }

    return null;
  }

  private computeYamlFoldingRange(lines: string[], startLineIndex: number): FoldableRange | null {
    // YAML 折叠逻辑的优化版本
    const startLine = lines[startLineIndex];
    const trimmedLine = startLine.trim();

    const keyMatch = trimmedLine.match(/^([^:]+):\s*$/);
    if (!keyMatch) return null;

    const key = keyMatch[1].trim();
    const indent = startLine.length - startLine.trimStart().length;

    const maxSearchLines = 200;
    const endSearchLimit = Math.min(lines.length, startLineIndex + maxSearchLines);

    for (let lineIndex = startLineIndex + 1; lineIndex < endSearchLimit; lineIndex++) {
      const line = lines[lineIndex];
      const currentIndent = line.length - line.trimStart().length;
      const currentTrimmed = line.trim();

      if (!currentTrimmed || currentTrimmed.startsWith('#')) {
        continue;
      }

      if (currentIndent <= indent) {
        const level = Math.floor(indent / 2);
        const summary = `${key}: ... (${lineIndex - startLineIndex} lines)`;

        return {
          id: `yaml-block-${key}-${startLineIndex}-${lineIndex - 1}`,
          startLine: startLineIndex,
          endLine: lineIndex - 1,
          type: 'yaml-block',
          level,
          summary,
          startContent: lines[startLineIndex],
          endContent: lines[lineIndex - 1],
        };
      }
    }

    // 到达文件末尾
    const level = Math.floor(indent / 2);
    const endLineIndex = Math.min(lines.length - 1, endSearchLimit - 1);
    const summary = `${key}: ... (${endLineIndex - startLineIndex + 1} lines)`;

    return {
      id: `yaml-block-${key}-${startLineIndex}-${endLineIndex}`,
      startLine: startLineIndex,
      endLine: endLineIndex,
      type: 'yaml-block',
      level,
      summary,
      startContent: lines[startLineIndex],
      endContent: lines[endLineIndex],
    };
  }

  private generateFoldingSummary(
    _lines: string[],
    startLine: number,
    endLine: number,
    type: 'object' | 'array'
  ): string {
    const lineCount = endLine - startLine + 1;
    const startChar = type === 'object' ? '{' : '[';
    const endChar = type === 'object' ? '}' : ']';

    // 简化摘要生成以提高性能
    return `${startChar}...${endChar} (${lineCount} lines)`;
  }

  // 清理缓存
  clearCache(): void {
    cacheManager.clearFileCache(this.fileKey);
  }
}

// 导出便捷函数
export function createFoldingProvider(fileName: string, content: string): FoldingProvider {
  return new FoldingProvider(fileName, content);
}
