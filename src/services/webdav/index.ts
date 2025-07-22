// Main WebDAV service - using direct import to avoid module resolution issues
import { webdavService as service } from './service';

// Re-export the service
export const webdavService = service;

// Re-export types for external use
export type { WebDAVServerCapabilities, WebDAVRequestOptions, WebDAVResponse } from './types';
