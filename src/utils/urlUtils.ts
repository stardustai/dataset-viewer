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
 * Formats a connection display name based on URL and username
 * @param url - The connection URL
 * @param username - The username (optional)
 * @returns Formatted display name
 */
export function formatConnectionDisplayName(url: string, username?: string): string {
  // Handle special URL schemes using regex
  const specialSchemeMatch = url.match(/^(\w+):\/\/(.+)$/);
  if (specialSchemeMatch) {
    const [, scheme, content] = specialSchemeMatch;
    // Skip http/https as they are regular URLs
    if (scheme !== 'http' && scheme !== 'https') {
      const displayScheme = scheme.charAt(0).toUpperCase() + scheme.slice(1);
      return `${displayScheme}: ${content}`;
    }
  }
  
  // For regular URLs, try to format with username@hostname
  if (username) {
    const hostname = getHostnameFromUrl(url);
    return hostname !== url ? `${username}@${hostname}` : url;
  }
  
  // Fallback to hostname only or original URL
  return getHostnameFromUrl(url);
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