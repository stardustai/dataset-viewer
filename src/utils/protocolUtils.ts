import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Convert protocol URL to Tauri-compatible URL
 * On Windows, Tauri converts custom protocols to http://protocol.localhost/path
 * This function handles the conversion for all custom protocols
 *
 * @param protocolUrl - The protocol URL (e.g., local://C/Users/file.txt)
 * @param protocol - The protocol name (e.g., 'local', 'webdav', 'ssh')
 * @returns Tauri-compatible URL that can be used with fetch
 */
export async function convertProtocolUrl(protocolUrl: string, protocol: string): Promise<string> {
  // Extract the protocol prefix (e.g., local://, webdav://, ssh://)
  const protocolPrefix = `${protocol}://`;

  if (protocolUrl.startsWith(protocolPrefix)) {
    // Extract the path after the protocol
    const path = protocolUrl.replace(protocolPrefix, '');

    // Use Tauri's convertFileSrc to convert to platform-specific URL
    // On Mac: returns the original protocol URL
    // On Windows: converts to http://protocol.localhost/path
    return convertFileSrc(path, protocol);
  }

  // If it doesn't start with the expected protocol, return as-is
  return protocolUrl;
}
