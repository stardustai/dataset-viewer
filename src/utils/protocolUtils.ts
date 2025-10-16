import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Convert protocol URL to Tauri-compatible URL
 * On Windows, Tauri converts custom protocols to http://protocol.localhost/path
 * This function handles the conversion for all custom protocols
 *
 * @param protocolUrl - The protocol URL (e.g., local://C/Users/file.txt or local://C/Users/archive.zip?entry=file.txt)
 * @param protocol - The protocol name (e.g., 'local', 'webdav', 'ssh')
 * @returns Tauri-compatible URL that can be used with fetch
 */
export async function convertProtocolUrl(protocolUrl: string, protocol: string): Promise<string> {
  // Extract the protocol prefix (e.g., local://, webdav://, ssh://)
  const protocolPrefix = `${protocol}://`;

  if (protocolUrl.startsWith(protocolPrefix)) {
    // Extract the path after the protocol
    let pathWithQuery = protocolUrl.replace(protocolPrefix, '');
    
    // Separate path from query parameters (for archive file entries)
    let path = pathWithQuery;
    let queryString = '';
    const queryIndex = pathWithQuery.indexOf('?');
    if (queryIndex !== -1) {
      path = pathWithQuery.substring(0, queryIndex);
      queryString = pathWithQuery.substring(queryIndex); // includes the '?'
    }

    // Use Tauri's convertFileSrc to convert to platform-specific URL
    // On Mac: returns the original protocol URL
    // On Windows: converts to http://protocol.localhost/path
    const convertedUrl = convertFileSrc(path, protocol);
    
    // Append query string back if it exists
    return convertedUrl + queryString;
  }

  // If it doesn't start with the expected protocol, return as-is
  return protocolUrl;
}
