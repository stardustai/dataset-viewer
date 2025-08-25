/**
 * 代码折叠解析工具
 * 支持 JSON、XML、YAML、HTML 等层级结构的折叠区间识别
 */

export interface FoldableRange {
  id: string;
  startLine: number;
  endLine: number;
  type: 'json-object' | 'json-array' | 'xml-element' | 'yaml-block' | 'html-element';
  level: number; // 嵌套层级
  summary: string; // 折叠时显示的摘要内容
  startContent: string; // 开始行的内容
  endContent: string; // 结束行的内容
}

/**
 * 解析JSON文件的可折叠区间
 */
export function parseJsonFoldingRanges(lines: string[]): FoldableRange[] {
  const ranges: FoldableRange[] = [];
  const stack: { line: number; char: string; type: 'object' | 'array'; indent: number }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.trim();
    const indent = line.length - line.trimStart().length;

    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
      continue;
    }

    // 更精确的括号匹配，考虑字符串中的括号
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
        continue;
      }

      // 只在字符串外部处理括号
      if (!inString) {
        // 处理对象开始
        if (char === '{') {
          // 检查这是否是一个新的对象开始（不在行的末尾有内容）
          const restOfLine = line.substring(charIndex + 1).trim();
          if (restOfLine === '' || restOfLine === ',' || restOfLine.startsWith(',')) {
            stack.push({
              line: lineIndex,
              char: '{',
              type: 'object',
              indent
            });
          }
        }

        // 处理数组开始
        else if (char === '[') {
          const restOfLine = line.substring(charIndex + 1).trim();
          if (restOfLine === '' || restOfLine === ',' || restOfLine.startsWith(',')) {
            stack.push({
              line: lineIndex,
              char: '[',
              type: 'array',
              indent
            });
          }
        }

        // 处理对象或数组结束
        else if (char === '}' || char === ']') {
          const expectedChar = char === '}' ? '{' : '[';
          const expectedType = char === '}' ? 'object' : 'array';

          // 找到匹配的开始括号
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].char === expectedChar && stack[i].type === expectedType) {
              const startInfo = stack[i];
              const startLine = startInfo.line;
              const endLine = lineIndex;

              // 只有当开始和结束不在同一行时才创建折叠区间
              if (endLine > startLine) {
                const level = Math.floor(startInfo.indent / 2);
                const summary = generateFoldingSummary(
                  lines,
                  startLine,
                  endLine,
                  startInfo.type
                );

                ranges.push({
                  id: `json-${startInfo.type}-${startLine}-${endLine}`,
                  startLine,
                  endLine,
                  type: startInfo.type === 'object' ? 'json-object' : 'json-array',
                  level,
                  summary,
                  startContent: lines[startLine],
                  endContent: lines[endLine]
                });
              }

              // 移除已匹配的项
              stack.splice(i, 1);
              break;
            }
          }
        }
      }
    }
  }

  // 按开始行排序
  return ranges.sort((a, b) => a.startLine - b.startLine);
}

/**
 * 解析XML文件的可折叠区间
 */
export function parseXmlFoldingRanges(lines: string[]): FoldableRange[] {
  const ranges: FoldableRange[] = [];
  const stack: { line: number; tagName: string; level: number }[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let match;

    tagRegex.lastIndex = 0;
    while ((match = tagRegex.exec(line)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];

      // 自闭合标签，跳过
      if (fullTag.endsWith('/>')) {
        continue;
      }

      // 结束标签
      if (fullTag.startsWith('</')) {
        // 寻找匹配的开始标签
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tagName === tagName) {
            const startInfo = stack[i];
            const startLine = startInfo.line;
            const endLine = lineIndex;

            // 创建折叠区间（如果跨行）
            if (endLine > startLine) {
              const level = startInfo.level;
              const summary = generateXmlFoldingSummary(lines, startLine, endLine, tagName);

              ranges.push({
                id: `xml-element-${tagName}-${startLine}-${endLine}`,
                startLine,
                endLine,
                type: 'xml-element',
                level,
                summary,
                startContent: lines[startLine],
                endContent: lines[endLine]
              });
            }

            stack.splice(i, 1);
            break;
          }
        }
      }

      // 开始标签
      else {
        stack.push({
          line: lineIndex,
          tagName,
          level: stack.length
        });
      }
    }
  }

  return ranges.sort((a, b) => a.startLine - b.startLine);
}

/**
 * 解析YAML文件的可折叠区间
 */
export function parseYamlFoldingRanges(lines: string[]): FoldableRange[] {
  const ranges: FoldableRange[] = [];
  const stack: { line: number; indent: number; key: string }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.trim();

    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // 计算缩进级别
    const indent = line.length - line.trimStart().length;

    // 检查是否是键值对的开始
    const keyMatch = trimmedLine.match(/^([^:]+):\s*$/);
    if (keyMatch) {
      const key = keyMatch[1].trim();

      // 处理堆栈，移除更高缩进级别的项
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        const poppedItem = stack.pop()!;
        const endLine = lineIndex - 1;

        if (endLine > poppedItem.line) {
          const level = Math.floor(poppedItem.indent / 2);
          const summary = `${poppedItem.key}: ... (${endLine - poppedItem.line + 1} lines)`;

          ranges.push({
            id: `yaml-block-${poppedItem.key}-${poppedItem.line}-${endLine}`,
            startLine: poppedItem.line,
            endLine,
            type: 'yaml-block',
            level,
            summary,
            startContent: lines[poppedItem.line],
            endContent: lines[endLine]
          });
        }
      }

      stack.push({
        line: lineIndex,
        indent,
        key
      });
    }
  }

  // 处理剩余的堆栈项
  while (stack.length > 0) {
    const item = stack.pop()!;
    const endLine = lines.length - 1;

    if (endLine > item.line) {
      const level = Math.floor(item.indent / 2);
      const summary = `${item.key}: ... (${endLine - item.line + 1} lines)`;

      ranges.push({
        id: `yaml-block-${item.key}-${item.line}-${endLine}`,
        startLine: item.line,
        endLine,
        type: 'yaml-block',
        level,
        summary,
        startContent: lines[item.line],
        endContent: lines[endLine]
      });
    }
  }

  return ranges.sort((a, b) => a.startLine - b.startLine);
}

/**
 * 根据文件扩展名自动解析折叠区间
 * 为了性能考虑，对大文件进行限制
 */
export function parseFoldingRanges(lines: string[], fileName: string): FoldableRange[] {
  // 性能优化：对于行数过多的文件，限制解析范围或跳过解析
  if (lines.length > 5000) {
    // 对于超过5000行的文件，只解析前2000行，避免性能问题
    const limitedLines = lines.slice(0, 2000);
    return parseFoldingRangesInternal(limitedLines, fileName);
  }

  return parseFoldingRangesInternal(lines, fileName);
}

/**
 * 内部解析函数
 */
function parseFoldingRangesInternal(lines: string[], fileName: string): FoldableRange[] {
  const ext = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();

  switch (ext) {
    case 'json':
    case 'jsonl':
      return parseJsonFoldingRanges(lines);

    case 'xml':
    case 'svg':
    case 'html':
    case 'htm':
      return parseXmlFoldingRanges(lines);

    case 'yaml':
    case 'yml':
      return parseYamlFoldingRanges(lines);

    default:
      // 对于其他文件类型，尝试JSON解析（很多配置文件实际上是JSON格式）
      // 但是要更保守，只有当文件看起来像JSON时才解析
      if (lines.length > 0) {
        const firstLine = lines[0]?.trim();
        const lastLine = lines[lines.length - 1]?.trim();
        if (firstLine.startsWith('{') && lastLine.endsWith('}')) {
          try {
            const jsonRanges = parseJsonFoldingRanges(lines);
            if (jsonRanges.length > 0) {
              return jsonRanges;
            }
          } catch (error) {
            // 忽略JSON解析错误
          }
        }
      }

      return [];
  }
}

/**
 * 生成折叠摘要文本
 */
function generateFoldingSummary(
  lines: string[],
  startLine: number,
  endLine: number,
  type: 'object' | 'array'
): string {
  const lineCount = endLine - startLine + 1;
  const startChar = type === 'object' ? '{' : '[';
  const endChar = type === 'object' ? '}' : ']';

  // 尝试从开始行获取键名作为预览（对于对象）
  let preview = '';
  if (type === 'object' && startLine > 0) {
    const prevLine = lines[startLine - 1]?.trim();
    if (prevLine) {
      // 寻找前面的键名
      const keyMatch = prevLine.match(/"([^"]+)":\s*\{?\s*$/);
      if (keyMatch) {
        preview = keyMatch[1];
        if (preview.length > 15) {
          preview = preview.substring(0, 15) + '...';
        }
        preview = `"${preview}": `;
      }
    }
  }

  // 对于数组，尝试显示元素数量预览
  if (type === 'array') {
    let itemCount = 0;
    for (let i = startLine + 1; i < endLine; i++) {
      const line = lines[i]?.trim();
      if (line && !line.startsWith('{') && !line.startsWith('[') && !line.startsWith('}') && !line.startsWith(']')) {
        itemCount++;
      }
    }
    if (itemCount > 0) {
      preview = `${itemCount} items, `;
    }
  }

  return `${preview}${startChar}...${endChar} (${lineCount} lines)`;
}

/**
 * 生成XML折叠摘要文本
 */
function generateXmlFoldingSummary(
  _lines: string[],
  startLine: number,
  endLine: number,
  tagName: string
): string {
  const lineCount = endLine - startLine + 1;
  return `<${tagName}> ... </${tagName}> (${lineCount} lines)`;
}


