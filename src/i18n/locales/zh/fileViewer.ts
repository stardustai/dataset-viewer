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
  'archive.root': '根目录',
  'archive.back': '返回上级',

  // 数据表格查看器
  'data.table.viewer': '数据表格查看器',
  'data.table.loading': '正在加载数据文件 "{{fileName}}"...',
  'data.table.error': '加载数据时出错',
  'data.table.rows': '行',
  'data.table.columns': '列',
  'data.table.search.placeholder': '在数据中搜索...',
  'data.table.search.global': '全局搜索...',
  'data.table.search.column': '搜索此列...',
  'data.table.filter': '过滤',
  'data.table.clear.filter': '清除过滤',
  'data.table.load.more': '加载更多 ({{count}} 条记录剩余)',
  'data.table.loading.more': '正在加载更多数据...',
  'data.table.loaded.rows': '已加载 {{loaded}} / {{total}} 行',
  'data.table.showing.filtered': '显示 {{showing}} / {{total}} 条已加载记录',
  'data.table.sheet.label': '工作表',
  'data.table.metadata.toggle': '显示/隐藏元数据',
  'data.table.columns.toggle': '显示/隐藏列控制面板',
  'data.table.columns.visibility': '列可见性',
  'data.table.metadata.rows': '行数',
  'data.table.metadata.columns': '列数',
  'data.table.metadata.loaded': '已加载',
  'data.table.metadata.fileSize': '文件大小',
  'data.table.null.value': 'null',
  'data.table.items.count': '{{count}} 项',
  'data.table.cell.click.view': '点击查看完整内容',
  'data.table.cell.view.full': '查看完整内容',
  'data.table.cell.double.click.view': '双击查看详情',
  'data.table.cell.details': '单元格详情',
  'data.table.cell.location': '位置: {{column}} 列, 第 {{row}} 行',
  'data.table.cell.copy': '复制内容',
  
  // 分块加载相关
  'file.loaded.chunks': '已加载 {{chunks}} 个分块 ({{size}})',
  'scroll.to.load.more': '滚动加载更多',
  'error.load.more': '加载更多内容失败',
  'file.not.loaded': '文件未加载',
  'load.full.content': '加载完整内容',
  'error.load.full.content': '加载完整内容失败',
  'media.large.file.manual.load': '大型媒体文件需要手动加载',
  'data.large.file.manual.load': '大型数据文件需要手动加载',

  // AV1 视频播放器
  'av1.player.loading': '正在加载 AV1 解码器...',
  'av1.player.initializing': '正在初始化视频...',
  'av1.player.decoding': '正在解码视频帧...',
  'av1.player.error.load': '加载 AV1 解码器失败',
  'av1.player.error.init': '初始化 AV1 解码器失败',
  'av1.player.error.decode': '解码视频失败',
  'av1.player.error.invalid.format': '无效的 AV1 视频格式',
  'av1.player.play': '播放',
  'av1.player.pause': '暂停',
  'av1.player.reset': '重置',
  'av1.player.frame': '帧 {{current}} / {{total}}',
  'av1.player.fps': 'FPS: {{fps}}',
};
