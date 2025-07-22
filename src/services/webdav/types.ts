// WebDAV service specific types
export interface WebDAVServerCapabilities {
  supportsWebDAV: boolean;
  preferredMethod: 'PROPFIND' | 'GET' | 'AUTO';
  lastDetected: number;
}

export interface WebDAVRequestOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface WebDAVResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
