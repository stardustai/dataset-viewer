/**
 * URL utility functions for safe URL parsing and formatting
 */

/**
 * Safely extracts hostname from a URL string
 * @param url - The URL string to parse
 * @returns The hostname if valid, otherwise the original URL
 */
export function getHostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Formats a connection display name based on connection config
 * @param config - The connection configuration object
 * @returns Formatted display name
 */
export function formatConnectionDisplayName(config: any): string {
  if (!config) return '';

  switch (config.type) {
    case 'local':
      return config.rootPath || '';

    case 'oss':
      return `OSS: ${config.username || config.accessKeyId || ''}`;

    case 'huggingface':
      return `HuggingFace: ${config.organization || 'hub'}`;

    default:
      // For WebDAV and other URL-based connections
      if (config.username && config.url) {
        const hostname = getHostnameFromUrl(config.url);
        return hostname !== config.url ? `${config.username}@${hostname}` : config.url;
      }
      return config.url ? getHostnameFromUrl(config.url) : '';
  }
}

/**
 * Generates a service name with hostname for WebDAV connections
 * @param url - The WebDAV URL
 * @param serviceName - The service name prefix (default: 'WebDAV')
 * @returns Formatted service name
 */
export function formatServiceName(url: string, serviceName: string = 'WebDAV'): string {
  const hostname = getHostnameFromUrl(url);
  return hostname !== url ? `${serviceName}(${hostname})` : `${serviceName}(${url})`;
}
