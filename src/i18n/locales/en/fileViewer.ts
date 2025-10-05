export const fileViewer = {
  // File viewer interface
  'file.viewer': 'File Viewer',
  'viewer.go.back': 'Go back',
  'viewer.download': 'Download',

  // Search functionality
  'search.in.file': 'Search in file...',
  'viewer.search.placeholder': 'Search in file...',
  'viewer.search.results': '{{current}} of {{total}}',
  'viewer.previous.result': 'Previous result',
  'viewer.next.result': 'Next result',

  // File content search
  'search.entire.file': 'Full file search',
  'search.entire.file.large': 'Search in entire file (at least 2 characters)...',
  'search.loaded.content': 'Search in loaded content (at least 2 characters)...',
  'search.results.limited.500': '(Showing first 500)',
  'search.results.limited.5000': '(Showing first 5000)',
  'search.sampling.description': 'Too many sampling results, showing only first 500 matches',
  'search.too.many.results': 'Too many results, showing only first 5000 matches',
  'search.sampling': '(Sampling)',
  'line.number': 'Line {{line}}',
  image: 'Image',

  // Loading control
  loaded: 'loaded',
  'viewer.load.more': 'Load More Content',
  'viewer.position.info': 'Viewed {{current}} / {{total}} ({{percent}}%)',
  'load.complete.content': 'Load Complete Content',

  // Directory browser load more

  // Viewer functionality
  'viewer.jump.percent': 'Jump to percentage',
  'viewer.jump.percent.large': 'Jump to file position by percentage (large file mode)',
  'viewer.jump': 'Jump',

  // Syntax highlighting
  'syntax.highlighting.enable': 'Enable syntax highlighting',
  'syntax.highlighting.disable': 'Disable syntax highlighting',

  // Media viewer
  'viewer.zoom.in': 'Zoom in',
  'viewer.zoom.out': 'Zoom out',
  'viewer.rotate': 'Rotate',
  'viewer.reset': 'Reset view',

  // Copy functionality
  'copy.full.path': 'Copy full path',
  copied: 'Copied',
  'copied.to.clipboard': 'Copied to clipboard',
  'copy.failed': 'Copy failed',

  // Format functionality
  'format.json': 'Format JSON',
  'format.xml': 'Format XML',
  'formatted.json': 'Formatted',
  'formatted.xml': 'Formatted',
  'original.content': 'Original Content',

  // Loading status
  'loading.file': 'Loading file "{{filename}}"...',
  'loading.analyzing.archive': 'Analyzing archive...',
  'loading.preview': 'Loading preview...',
  'loading.more.content': 'Loading more content...',
  'preparing.preview': 'Preparing preview...',
  'select.file.for.preview': 'Select a file to preview',

  // Stream status

  // Archive files
  'folder.selected': 'Folder Selected',
  'folder.info.message':
    'This is a folder. Folders in archives are used for organizing file structure and cannot be entered or previewed.',
  'archive.root': 'Home',

  // Data Table Viewer
  'data.table.loading': 'Loading data file "{{fileName}}"...',
  'data.table.loading.initial': 'Loading initial data ({{loaded}}/{{total}})...',
  'data.table.search.placeholder': 'Search data...',
  'data.table.load.more': 'Load more ({{count}} records remaining)',
  'data.table.loading.more': 'Loading more data...',
  'data.table.showing.filtered': 'Showing {{showing}} / {{total}} loaded records',
  'data.table.columns.toggle': 'Show/Hide column panel',
  'data.table.columns.visibility': 'Column visibility',
  'data.table.all.loaded': 'All data loaded',
  'data.table.show.columns': 'Show columns',
  'data.table.hide.columns': 'Hide columns',
  'data.table.sort.asc': 'Sort ascending',
  'data.table.sort.desc': 'Sort descending',
  'data.table.clear.sort': 'Clear sort',
  'data.table.cell.view.full': 'View full content',
  'data.table.cell.click.view': 'Click to view full content',
  'data.table.cell.double.click.view': 'Double click to view details',
  'data.table.cell.details': 'Cell Details',
  'line.content.title': 'Line {{line}} Content',
  'content.stats.chars': 'Characters: {{characters}}',
  'cell.position': 'Location: {{column}} column, row {{row}}',
  'data.table.cell.copy': 'Copy cell content',
  'data.table.null.value': 'null',
  'data.table.sheet.switch': 'Switch sheet',
  'data.table.sheet': 'Sheet',
  'data.table.data.type': 'Data Type',
  'data.table.char.length': 'Character Length',
  'data.table.chars': 'characters',
  'data.table.array.items': 'Array ({{count}} items)',
  'data.table.showing.rows': 'Showing {{showing}} of {{total}} loaded rows',

  // 分块加载相关
  'file.loaded.chunks': 'Loaded {{chunks}} chunks ({{size}})',
  'scroll.to.load.more': 'Scroll to load more',
  'error.load.more': 'Failed to load more content',
  'file.not.loaded': 'File not loaded',
  'load.full.content': 'Load Full Content',
  'error.load.full.content': 'Failed to load full content',
  'media.large.file.manual.load': 'Large media file, click to load',
  'data.large.file.manual.load': 'Large data file, click to load',
  'pointcloud.file.manual.load': 'Point cloud file, click to load',

  // AV1 video player
  'av1.player.loading': 'Loading AV1 decoder...',
  'av1.player.initializing': 'Initializing video...',
  'av1.player.decoding': 'Decoding video frames...',
  'av1.player.error.load': 'Failed to load AV1 decoder',
  'av1.player.error.init': 'Failed to initialize AV1 decoder',
  'av1.player.error.decode': 'Failed to decode video',

  // Markdown 查看器
  'markdown.preview': 'Markdown Preview',
  'markdown.parsing': 'Parsing Markdown...',

  // Word document viewer
  'word.viewer': 'Word Document Viewer',
  'word.doc.unsupported': 'This is an old version Word document format',
  'word.doc.suggestion': 'Please download and open with Microsoft Word, or convert to .docx format',
  'word.doc.legacy.title': 'Legacy Word Document',
  'word.doc.legacy.message':
    'This file is a legacy Word document format (.doc) that requires specialized parser.\n\nRecommendations:\n1. Download and open with Microsoft Word\n2. Convert to .docx format for better support',
  'word.rtf.extract.failed':
    'Unable to extract RTF document content. Please download the file to view complete content.',
  'word.rtf.parse.error':
    'Error parsing RTF document. Please download the file to view complete content.',
  'word.unsupported.format': 'Unsupported file format',
  'word.load.failed': 'Failed to load document. Please try downloading the file to view content.',

  // Presentation viewer
  'presentation.fileSize': 'File size: {{size}} MB',
  'presentation.slideCount': '{{count}} slides',
  'presentation.preview.title': 'PowerPoint Presentation Preview',
  'presentation.preview.description':
    'This file is a PowerPoint presentation format containing slides, animations, and multimedia content.',
  'presentation.preview.limitation.title': 'Preview Limitations',
  'presentation.preview.limitation.description':
    'Due to the complexity of presentations, not all content and effects can be fully displayed in the browser. We recommend downloading the file and opening it with PowerPoint or compatible software for the best experience.',
  'presentation.load.error':
    'Failed to load presentation. Please try downloading the file to view content.',
  'loading.presentation': 'Loading presentation "{{filename}}"...',
  'av1.player.error.invalid.format': 'Invalid AV1 video format',
  'av1.player.error.noData': 'No video data available',
  'av1.player.play': 'Play',
  'av1.player.pause': 'Pause',
  'av1.player.reset': 'Reset',
  'av1.player.frame': 'Frame {{current}} / {{total}}',
  'av1.player.fps': 'FPS: {{fps}}',

  // Presentation viewer - additional translations
  'presentation.table.no.data': 'Table (No Data)',
  'presentation.speaker.notes': 'Speaker Notes',

  // Unsupported format text view option
  'viewer.open.as.text': 'Open as Text',
  'viewer.unsupported.format.message':
    'This file format is not directly supported, but you can try viewing it as text.',

  // Context menu
  'context.menu.open.as.text': 'Open as Text',
  'context.menu.open.with': 'Open With',

  // Built-in viewer names
  'viewer.builtin': 'Built-in Viewer',

  // Long line optimization
  'expand.long.line': 'Expand',
  'collapse.long.line': 'Collapse',
  characters: 'Characters',
  lines: 'Lines',

  // View modes

  // PCD Point Cloud Viewer
  'pcd.error.loadFailed': 'Failed to load PCD file',
  'pcd.toolbar.rgb': 'RGB',
  'pcd.toolbar.height': 'Height',
  'pcd.toolbar.intensity': 'Intensity',
  'pcd.toolbar.rgbMode': 'Switch to RGB colors',
  'pcd.toolbar.heightMode': 'Switch to height colors',
  'pcd.toolbar.intensityMode': 'Switch to intensity mode',
  'pcd.toolbar.decreaseSize': 'Decrease point size',
  'pcd.toolbar.increaseSize': 'Increase point size',

  // Code folding
  'fold.range': 'Fold range',
  'unfold.range': 'Unfold range',
  'large.node': 'Large Node',

  // Plugin related
  'plugin.loading': 'Loading plugin...',
  'plugin.notFound': 'No plugin found for file "{{filename}}"',
  'plugin.noSuitablePlugin': 'No suitable plugin found for this file type',
};
