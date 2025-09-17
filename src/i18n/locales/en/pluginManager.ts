export const pluginManager = {
  // Basic titles and labels
  'plugin.title': 'Plugin Management',
  'plugin.management': 'Plugin Management',
  'plugin.manager.title': 'Plugin Manager',
  'plugin.manager.installed': 'Installed Plugins',
  'plugin.manager.available': 'Plugin Market',
  'plugin.manager.search.placeholder': 'Search plugins...',
  'plugin.manager.custom.placeholder': 'Plugin name or full package name',

  // Tab navigation
  'plugin.tabs.installed': 'Installed',
  'plugin.tabs.market': 'Market',

  // Plugin status
  'plugin.status.official': 'Official',
  'plugin.status.installed': 'Installed',
  'plugin.status.enabled': 'Enabled',
  'plugin.status.disabled': 'Disabled',

  // Plugin actions and buttons
  'plugin.action.install': 'Install',
  'plugin.action.uninstall': 'Uninstall Plugin',
  'plugin.action.delete': 'Delete',
  'plugin.action.enable': 'Enable',
  'plugin.action.disable': 'Disable',
  'plugin.action.refresh': 'Refresh',
  'plugin.action.toggle': 'Toggle Status',
  'plugin.action.update': 'Update',
  'plugin.action.check_update': 'Check Update',
  'plugin.action.check_all_updates': 'Check All Updates',

  // Button labels
  'plugin.button.install': 'Install',
  'plugin.button.uninstall': 'Uninstall',
  'plugin.button.enable': 'Enable',
  'plugin.button.disable': 'Disable',
  'plugin.button.update': 'Update',
  'plugin.button.refresh': 'Refresh',
  'plugin.button.refreshing': 'Refreshing...',
  'plugin.button.updating': 'Updating...',
  'plugin.button.check_update': 'Check for Updates',

  // Plugin sources
  'plugin.source.dev': 'Development',
  'plugin.source.npm': 'NPM',
  'plugin.source.local': 'Local',

  // Plugin information
  'plugin.info.author': 'Author',
  'plugin.info.version': 'v{{version}}',
  'plugin.info.supports': 'Supports: {{extensions}}',
  'plugin.info.path': 'Path: {{path}}',
  'plugin.info.formats': 'Supported Formats',

  // Version updates
  'plugin.update.available': 'Update Available',
  'plugin.update.current': 'Current Version: {{version}}',
  'plugin.update.latest': 'Latest Version: {{version}}',
  'plugin.update.checking': 'Checking for updates...',
  'plugin.update.updating': 'Updating...',
  'plugin.update.success': 'Plugin {{pluginId}} updated successfully',
  'plugin.update.failed': 'Failed to update plugin: {{error}}',
  'plugin.update.up_to_date': 'Already up to date',

  // Operation status messages
  'plugin.loading': 'Loading...',
  'plugin.installing': 'Installing...',
  'plugin.updating': 'Updating...',

  // List states
  'plugin.list.empty': 'No plugins installed yet',
  'plugin.empty.installed': 'No plugins installed yet',
  'plugin.empty.available': 'No plugins available',
  'plugin.empty.search': 'No matching plugins found',
  'plugin.market.empty': 'No plugins available',

  // Success messages
  'plugin.install.success': 'Plugin {{pluginId}} installed successfully',
  'plugin.uninstall.success': 'Plugin {{pluginId}} uninstalled successfully',
  'plugin.enable.success': 'Plugin {{pluginId}} enabled successfully',
  'plugin.disable.success': 'Plugin {{pluginId}} disabled successfully',

  // Error messages
  'plugin.install.failed': 'Failed to install plugin: {{error}}',
  'plugin.uninstall.failed': 'Failed to uninstall plugin: {{error}}',
  'plugin.enable.failed': 'Failed to enable plugin: {{error}}',
  'plugin.disable.failed': 'Failed to disable plugin: {{error}}',

  // Footer notices
  'plugin.security.notice':
    'Plugins are installed from npm registry or local paths, please ensure sources are trustworthy',
  'plugin.naming.convention': 'Naming Convention:',
  'plugin.updates.available': 'Updates Available',

  // Description
  'plugin.description':
    'Install and manage file viewer plugins to extend support for more file formats',

  // Error handling
  'plugin.error.file_not_found':
    'Plugin file not found{{pluginName}}, please check if the plugin is properly installed',
  'plugin.error.invalid_format':
    'Invalid plugin format{{pluginName}}, plugin version may be incompatible',
  'plugin.error.execution_error':
    'Plugin execution error{{pluginName}}, please contact the plugin developer',
  'plugin.error.dependency_error':
    'Plugin dependencies missing{{pluginName}}, please check plugin integrity',
  'plugin.error.network_error':
    'Network error{{pluginName}}, please check your internet connection and try again',
  'plugin.error.unknown_error': 'Plugin loading failed{{pluginName}}: {{message}}',
  'plugin.error.load_failed': 'Plugin loading failed, using default viewer',
  'plugin.error.retry_available': 'Loading failed, click to retry',
};
