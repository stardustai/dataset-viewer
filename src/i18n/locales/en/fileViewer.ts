export const fileViewer = {
  // File viewer interface
  'file.viewer': 'File Viewer',
  'viewer.go.back': 'Go back',
  'viewer.download': 'Download',
  'viewer.percent.loaded': '{{percent}}% loaded',

  // Search functionality
  'search.in.file': 'Search in file...',
  'viewer.search.placeholder': 'Search in file...',
  'viewer.search.results': '{{current}} of {{total}}',
  'search.results': 'search results',
  'previous.result': 'Previous result',
  'next.result': 'Next result',
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
  'line.content': 'Line {{line}} content',
  'image': 'Image',
  'truncated.image': 'Truncated Image',
  'image.truncated.title': 'Image Data Truncated',
  'image.truncated.description': 'This line contains image data, but it has been truncated for display. Please expand the full line content to view the image.',

  // Loading control
  'load.more': 'Load More Content',
  'loaded': 'loaded',
  'viewer.load.more': 'Load More Content',
  'viewer.load.all': 'Load All Content',
  'viewer.fully.loaded': 'File fully loaded',
  'viewer.position.info': 'Viewed {{current}} / {{total}} ({{percent}}%)',
  'file.shown': 'Shown',
  'file.complete': 'Complete file',
  'file.remaining': 'Remaining',
  'load.more.chunk': 'Load More (512KB)',
  'load.complete.content': 'Load Complete Content',

  // Directory browser load more
  'directory.load.more': 'Load More Files',
  'directory.loading.more': 'Loading more files...',
  'directory.loaded.files': '{{count}} files loaded',
  'directory.has.more': 'More files available',

  // Viewer functionality
  'viewer.toggle.wrap': 'Toggle word wrap',
  'viewer.jump.percent': 'Jump to percentage',
  'viewer.jump.percent.large': 'Jump to file position by percentage (large file mode)',
  'viewer.jump': 'Jump',
  'viewer.line.numbers.estimated': 'Line numbers are estimated (starting from approx. line {{startLine}})',

  // Syntax highlighting
  'syntax.highlighting': 'Syntax Highlighting',
  'syntax.highlighting.enable': 'Enable syntax highlighting',
  'syntax.highlighting.disable': 'Disable syntax highlighting',
  'syntax.highlighting.language': 'Language: {{language}}',

  // Media viewer
  'viewer.zoom.in': 'Zoom in',
  'viewer.zoom.out': 'Zoom out',
  'viewer.rotate': 'Rotate',
  'viewer.reset': 'Reset view',

  // Copy functionality
  'copy.full.path': 'Copy full path',
  'copy.line.content': 'Copy line content',
  'copied.to.clipboard': 'Copied to clipboard',
  'copy.failed': 'Copy failed',

  // Format functionality
  'format.json': 'Format JSON',
  'format.json.success': 'JSON formatted successfully',
  'format.json.failed': 'JSON format failed: content is not valid JSON',
  'format.xml': 'Format XML',
  'format.xml.success': 'XML formatted successfully',
  'format.xml.failed': 'XML format failed: content is not valid XML',
  'formatted.content': 'Formatted Content',
	'formatted.json': 'Formatted',
	'formatted.xml': 'Formatted',
  'original.content': 'Original Content',

  // Loading status
  'loading.file': 'Loading file "{{filename}}"...',
  'loading.analyzing.archive': 'Analyzing archive...',
  'loading.preview': 'Loading preview...',
  'loading.more.content': 'Loading more content...',
  'loading.text': 'Loading...',
  'preparing.preview': 'Preparing preview...',
  'select.file.for.preview': 'Select a file to preview',

  // Stream status
  'stream.paused': 'Paused',
  'stream.completed': 'Loading completed',
  'stream.error': 'Error',

  // Archive files
  'archive.empty': 'Archive is empty',
  'folder.selected': 'Folder Selected',
  'folder.info.message': 'This is a folder. Folders in archives are used for organizing file structure and cannot be entered or previewed.',
  'archive.root': 'Home',
  'archive.back': 'Back',

  // Data Table Viewer
  'data.table.viewer': 'Data Table Viewer',
  'data.table.loading': 'Loading data file "{{fileName}}"...',
  'data.table.error': 'Error loading data',
  'data.table.rows': 'Rows',
  'data.table.columns': 'Columns',
  'data.table.search.placeholder': 'Search data...',
  'data.table.search.global': 'Global search...',
  'data.table.search.column': 'Search this column...',
  'data.table.filter': 'Filter',
  'data.table.clear.filter': 'Clear filter',
  'data.table.load.more': 'Load more ({{count}} records remaining)',
  'data.table.loading.more': 'Loading more data...',
  'data.table.loaded.rows': 'Loaded {{loaded}} / {{total}} rows',
  'data.table.showing.filtered': 'Showing {{showing}} / {{total}} loaded records',
  'data.table.sheet.label': 'Sheet',
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
  'data.table.cell.location': 'Location: {{column}} column, row {{row}}',
  'data.table.cell.copy': 'Copy cell content',
  'data.table.modal.title': 'Full Content',
  'data.table.modal.close': 'Close',
  'data.table.null.value': 'null',
  'data.table.items.count': '{{count}} items',
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
  'media.large.file.manual.load': 'Large media files require manual loading',
  'data.large.file.manual.load': 'Large data files require manual loading',

  // AV1 video player
  'av1.player.loading': 'Loading AV1 decoder...',
  'av1.player.initializing': 'Initializing video...',
  'av1.player.decoding': 'Decoding video frames...',
  'av1.player.error.load': 'Failed to load AV1 decoder',
  'av1.player.error.init': 'Failed to initialize AV1 decoder',
  'av1.player.error.decode': 'Failed to decode video',

  // Markdown 查看器
  'markdown.preview': 'Markdown Preview',
  'markdown.rendered': 'Rendered View',
  'markdown.raw': 'Raw Content',
  'markdown.parsing': 'Parsing Markdown...',

  // Word document viewer
  'word.viewer': 'Word Document Viewer',
  'word.extracted.text': 'Extracted Text',
  'word.raw.content': 'Raw Content',
  'word.doc.unsupported': 'This is an old version Word document format',
  'word.doc.suggestion': 'Please download and open with Microsoft Word, or convert to .docx format',
  'word.preview.limitation': 'This is a simplified document preview. For the best viewing experience, please download and open with dedicated Word processing software.',

  // Presentation viewer
  'presentation.viewer': 'Presentation Viewer',
  'presentation.fileSize': 'File size: {{size}} MB',
  'presentation.slideCount': '{{count}} slides',
  'presentation.preview.title': 'PowerPoint Presentation Preview',
  'presentation.preview.description': 'This file is a PowerPoint presentation format containing slides, animations, and multimedia content.',
  'presentation.preview.limitation.title': 'Preview Limitations',
  'presentation.preview.limitation.description': 'Due to the complexity of presentations, not all content and effects can be fully displayed in the browser. We recommend downloading the file and opening it with PowerPoint or compatible software for the best experience.',
  'presentation.download.to.view': 'Download file to view complete presentation',
  'presentation.load.error': 'Failed to load presentation. Please try downloading the file to view content.',
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
  'viewer.unsupported.format.message': 'This file format is not directly supported, but you can try viewing it as text.',

  // Long line optimization
  'expand.long.line': 'Expand',
  'collapse.long.line': 'Collapse',
  'characters': 'Characters',
  'lines': 'Lines',

  // View modes
  'virtual.viewer': 'Virtual Viewer',
  'virtual.view': 'Virtual View',
  'simple.view': 'Simple View',

  // PCD Point Cloud Viewer
  'pcd.loading': 'Loading point cloud data...',
  'pcd.error.loadFailed': 'Failed to load PCD file',
  'pcd.mouseHint': 'Drag to rotate, scroll to zoom, right-click to pan',
  'pcd.pointCloudInfo': 'Point Cloud Info',
  'pcd.totalPoints': 'Rendering {{count}} points',

  // Code folding
  'fold.range': 'Fold range',
  'unfold.range': 'Unfold range',

};
