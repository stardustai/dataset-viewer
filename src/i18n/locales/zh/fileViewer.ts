export const fileViewer = {
  // 文件查看器界面
  'file.viewer': '文件查看器',
  'viewer.go.back': '返回',
  'viewer.download': '下载',

  // 搜索功能
  'search.in.file': '在文件中搜索...',
  'viewer.search.results': '{{current}} / {{total}}',
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
  image: '图片',

  // 加载控制
  loaded: '已加载',
  'viewer.position.info': '已查看 {{current}} / {{total}} ({{percent}}%)',

  // 目录浏览器加载更多

  // 查看器功能
  'viewer.jump.percent': '跳转到百分比位置',
  'viewer.jump.percent.large': '跳转到文件的百分比位置（大文件模式）',
  'viewer.jump': '跳转',

  // 语法高亮
  'syntax.highlighting.enable': '开启语法高亮',
  'syntax.highlighting.disable': '关闭语法高亮',

  // 媒体查看器
  'viewer.zoom.in': '放大',
  'viewer.zoom.out': '缩小',
  'viewer.rotate': '旋转',
  'viewer.reset': '重置视图',

  // 复制功能
  // Copy functionality
  'copy.full.path': '复制完整路径',
  copied: '已复制',
  'copied.to.clipboard': '已复制到剪贴板',
  'copy.failed': '复制失败',

  // 格式化功能
  'format.json': '格式化JSON',
  'format.xml': '格式化XML',
  'formatted.json': '已格式化',
  'formatted.xml': '已格式化',
  'original.content': '原始内容',

  // 加载状态
  'loading.file': '正在加载文件 "{{filename}}"...',
  'loading.analyzing.archive': '正在分析压缩文件...',
  'loading.preview': '加载预览...',
  'loading.more.content': '正在加载更多内容...',
  'preparing.preview': '正在准备预览...',
  'select.file.for.preview': '选择一个文件进行预览',

  // 流状态

  // 压缩文件
  'folder.selected': '已选择文件夹',
  'folder.info.message':
    '这是一个文件夹。压缩文件中的文件夹仅用于组织文件结构，无法进入或预览内容。',
  'archive.root': 'Home',

  // 数据表格查看器
  'data.table.loading': '正在加载数据文件 "{{fileName}}"...',
  'data.table.loading.initial': '正在加载初始数据 ({{loaded}}/{{total}})...',
  'data.table.search.placeholder': '在数据中搜索...',
  'data.table.load.more': '加载更多 ({{count}} 条记录剩余)',
  'data.table.loading.more': '正在加载更多数据...',
  'data.table.showing.filtered': '显示 {{showing}} / {{total}} 条已加载记录',
  'data.table.columns.toggle': '显示/隐藏列控制面板',
  'data.table.columns.visibility': '列可见性',
  'data.table.null.value': 'null',
  'data.table.cell.click.view': '点击查看完整内容',
  'data.table.cell.view.full': '查看完整内容',
  'data.table.cell.double.click.view': '双击查看详情',
  'data.table.cell.details': '单元格详情',
  'line.content.title': '第 {{line}} 行内容',
  'content.stats.chars': '字符数: {{characters}}',
  'cell.position': '位置: {{column}} 列, 第 {{row}} 行',
  'data.table.cell.copy': '复制内容',

  // 分块加载相关
  'file.loaded.chunks': '已加载 {{chunks}} 个分块 ({{size}})',
  'scroll.to.load.more': '滚动加载更多',
  'error.load.more': '加载更多内容失败',
  'file.not.loaded': '文件未加载',
  'load.full.content': '加载完整内容',
  'error.load.full.content': '加载完整内容失败',
  'media.large.file.manual.load': '大型媒体文件，点击加载',
  'data.large.file.manual.load': '大型数据文件，点击加载',
  'pointcloud.file.manual.load': '点云文件，点击加载',

  // AV1 视频播放器
  'av1.player.loading': '正在加载 AV1 解码器...',

  'av1.player.initializing': '正在初始化视频...',
  'av1.player.decoding': '正在解码视频帧...',
  'av1.player.error.load': '加载 AV1 解码器失败',
  'av1.player.error.init': '初始化 AV1 解码器失败',
  'av1.player.error.decode': '解码视频失败',

  // Markdown 查看器
  'markdown.preview': 'Markdown 预览',
  'markdown.parsing': '正在解析 Markdown...',

  // Word 文档查看器
  'word.viewer': 'Word 文档查看器',
  'word.doc.legacy.title': '旧版 Word 文档',
  'word.doc.legacy.message':
    '此文件是旧版本的 Word 文档格式 (.doc)，需要专门的解析器。\n\n建议：\n1. 下载文件并使用 Microsoft Word 打开\n2. 将文件转换为 .docx 格式以获得更好的支持',
  'word.rtf.extract.failed': '无法提取 RTF 文档内容。请下载文件以查看完整内容。',
  'word.rtf.parse.error': '解析 RTF 文档时出错。请下载文件以查看完整内容。',
  'word.unsupported.format': '不支持的文件格式',
  'word.load.failed': '加载文档失败。请尝试下载文件以查看内容。',

  // 演示文稿查看器
  'presentation.fileSize': '文件大小: {{size}} MB',
  'presentation.slideCount': '{{count}} 张幻灯片',
  'presentation.preview.title': 'PowerPoint 演示文稿预览',
  'presentation.preview.description':
    '此文件是 PowerPoint 演示文稿格式，包含幻灯片、动画和多媒体内容。',
  'presentation.preview.limitation.title': '预览限制',
  'presentation.preview.limitation.description':
    '由于演示文稿的复杂性，无法在浏览器中完整显示所有内容和效果。建议下载文件并使用 PowerPoint 或兼容软件打开以获得最佳体验。',
  'presentation.load.error': '加载演示文稿失败。请尝试下载文件以查看内容。',
  'loading.presentation': '正在加载演示文稿 "{{filename}}"...',
  'av1.player.error.invalid.format': '无效的 AV1 视频格式',
  'av1.player.error.noData': '没有可用的视频数据',
  'av1.player.play': '播放',
  'av1.player.pause': '暂停',
  'av1.player.reset': '重置',
  'av1.player.frame': '帧 {{current}} / {{total}}',
  'av1.player.fps': 'FPS: {{fps}}',

  // 演示文稿查看器 - 额外翻译
  'presentation.table.no.data': '表格 (无数据)',
  'presentation.speaker.notes': '演讲者备注',

  // 不支持格式的文本查看选项
  'viewer.open.as.text': '以文本格式打开',
  'viewer.unsupported.format.message': '此文件格式不被直接支持，您可以尝试以文本格式查看。',

  // 右键菜单
  'context.menu.open.as.text': '以文本格式打开',
  'context.menu.open.with': '打开方式',

  // 内置查看器名称
  'viewer.builtin': '内置查看器',

  // 长行优化
  'expand.long.line': '展开',
  'collapse.long.line': '收起',
  characters: '字符数',
  lines: '行数',

  // View modes

  // PCD 点云文件查看器
  'pcd.loading': '正在加载点云数据...',
  'pcd.error.loadFailed': '加载PCD文件失败',
  'pcd.mouseHint': '鼠标拖拽旋转，滚轮缩放，右键平移',
  'pcd.pointCloudInfo': '点云信息',
  'pcd.totalPoints': '正在渲染 {{count}} 个点',

  // 代码折叠
  'fold.range': '折叠区间',
  'unfold.range': '展开区间',
  'large.node': '大节点',

  // 插件相关
  'plugin.loading': '正在加载插件...',
  'plugin.notFound': '未找到适用于文件 "{{filename}}" 的插件',
  'plugin.noSuitablePlugin': '未找到适合此文件类型的插件',
};
