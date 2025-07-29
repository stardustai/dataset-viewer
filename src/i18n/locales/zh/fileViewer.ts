export const fileViewer = {
  // 文件查看器界面
  'file.viewer': '文件查看器',
  'viewer.go.back': '返回',
  'viewer.download': '下载',
  'viewer.percent.loaded': '{{percent}}% 已加载',

  // 搜索功能
  'search.in.file': '在文件中搜索...',
  'viewer.search.placeholder': '在文件中搜索...',
  'viewer.search.results': '{{current}} / {{total}}',
  'search.results': '搜索结果',
  'previous.result': '上一个结果',
  'next.result': '下一个结果',
  'viewer.previous.result': '上一个结果',
  'viewer.next.result': '下一个结果',

  // 文件内容搜索
  'search.entire.file': '全文件搜索',
  'search.entire.file.large': '在整个文件中搜索（至少2个字符）...',
  'search.loaded.content': '在已加载内容中搜索（至少2个字符）...',
  'search.results.limited.500': '（已显示前500个）',
  'search.results.limited.5000': '（已显示前5000个）',
  'search.sampling.description': '采样结果过多，仅显示前500个匹配项',
  'search.too.many.results': '结果过多，仅显示前5000个匹配项',
  'search.sampling': '（采样）',
  'line.number': '行 {{line}}',
  'line.content': '第 {{line}} 行内容',

  // 加载控制
  'load.more': '加载更多内容',
  'loaded': '已加载',
  'viewer.load.more': '加载更多内容',
  'viewer.load.all': '加载全部内容',
  'viewer.fully.loaded': '文件已完全加载',
  'viewer.position.info': '已查看 {{current}} / {{total}} ({{percent}}%)',
  'file.shown': '已显示',
  'file.complete': '完整文件',
  'file.remaining': '剩余',
  'load.more.chunk': '加载更多 (512KB)',
  'load.complete.content': '加载完整内容',

  // 查看器功能
  'viewer.toggle.wrap': '切换自动换行',
  'viewer.jump.percent': '跳转到百分比位置',
  'viewer.jump.percent.large': '跳转到文件的百分比位置（大文件模式）',
  'viewer.jump': '跳转',
  'viewer.line.numbers.estimated': '显示行号为估算值（从约第 {{startLine}} 行开始）',

  // 媒体查看器
  'viewer.zoom.in': '放大',
  'viewer.zoom.out': '缩小',
  'viewer.rotate': '旋转',
  'viewer.reset': '重置视图',

  // 复制功能
  'copy.full.path': '复制完整路径',
  'copy.line.content': '复制行内容',
  'copied.to.clipboard': '已复制到剪贴板',
  'copy.failed': '复制失败',

  // 格式化功能
  'format.json': '格式化JSON',
  'format.json.success': 'JSON格式化成功',
  'format.json.failed': 'JSON格式化失败：内容不是有效的JSON',
  'formatted.content': '格式化内容',
  'original.content': '原始内容',

  // 加载状态
  'loading.file': '正在加载文件 "{{filename}}"...',
  'loading.analyzing.archive': '正在分析压缩文件...',
  'loading.preview': '加载预览...',
  'loading.more.content': '正在加载更多内容...',
  'loading.text': '加载中...',
  'preparing.preview': '正在准备预览...',
  'select.file.for.preview': '选择一个文件进行预览',

  // 流状态
  'stream.paused': '已暂停',
  'stream.completed': '加载完成',
  'stream.error': '错误',

  // 压缩文件
  'archive.empty': '压缩文件为空',
  'folder.selected': '已选择文件夹',
  'folder.info.message': '这是一个文件夹。压缩文件中的文件夹仅用于组织文件结构，无法进入或预览内容。',

  // 数据表格查看器
  'data.table.viewer': '数据表格查看器',
  'data.table.loading': '正在加载数据...',
  'data.table.error': '加载数据时出错',
  'data.table.rows': '行',
  'data.table.columns': '列',
  'data.table.search.global': '全局搜索...',
  'data.table.search.column': '搜索此列...',
  'data.table.filter': '过滤',
  'data.table.clear.filter': '清除过滤',
  'data.table.load.more': '加载更多',
  'data.table.loading.more': '正在加载更多...',
  'data.table.loaded.rows': '已加载 {{loaded}} / {{total}} 行',
  'data.table.all.loaded': '已加载全部数据',
  'data.table.show.columns': '显示列',
  'data.table.hide.columns': '隐藏列',
  'data.table.sort.asc': '升序排列',
  'data.table.sort.desc': '降序排列',
  'data.table.clear.sort': '清除排序',
  'data.table.cell.view.full': '查看完整内容',
  'data.table.cell.click.view': '点击查看完整内容',
  'data.table.cell.copy': '复制单元格内容',
  'data.table.modal.title': '完整内容',
  'data.table.modal.close': '关闭',
  'data.table.null.value': 'null',
  'data.table.items.count': '{{count}} 项',
  'data.table.sheet.switch': '切换工作表',
  'data.table.sheet': '工作表',
  'data.table.data.type': '数据类型',
  'data.table.char.length': '字符长度',
  'data.table.chars': '字符',
  'data.table.array.items': 'Array ({{count}} 项)',
  'data.table.showing.rows': '显示 {{showing}} / {{total}} 已加载行',
  'data.table.metadata.rows': '行数',
  'data.table.metadata.columns': '列数',
  'data.table.metadata.loaded': '已加载',
  'data.table.metadata.size': '文件大小',
};
