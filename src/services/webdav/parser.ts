import { WebDAVFile } from '../../types';

export class WebDAVDirectoryParser {

  parseDirectoryListing(xmlText: string, currentPath: string = ''): WebDAVFile[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Try both namespaced and non-namespaced element names
    let responses = xmlDoc.getElementsByTagName('response');
    if (responses.length === 0) {
      responses = xmlDoc.getElementsByTagNameNS('DAV:', 'response');
    }
    if (responses.length === 0) {
      responses = xmlDoc.getElementsByTagName('D:response');
    }

    const files: WebDAVFile[] = [];

    console.log('Parsing directory listing, currentPath:', currentPath, 'responses count:', responses.length);

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];

      // Try different ways to get href
      let hrefElement = response.getElementsByTagName('href')[0];
      if (!hrefElement) {
        hrefElement = response.getElementsByTagNameNS('DAV:', 'href')[0];
      }
      if (!hrefElement) {
        hrefElement = response.getElementsByTagName('D:href')[0];
      }

      const href = hrefElement?.textContent;
      if (!href) continue;

      // Skip the current directory entry
      const decodedHref = decodeURIComponent(href);
      console.log('Processing href:', decodedHref, 'currentPath:', currentPath);

      // Skip parent directory entries (should not appear in WebDAV XML but just in case)
      if (this.isParentDirectoryEntry(decodedHref)) {
        console.log('Skipping parent directory entry:', decodedHref);
        continue;
      }

      // Skip current directory entry
      if (this.isCurrentDirectoryEntry(decodedHref, currentPath)) {
        console.log('Skipping current directory entry:', decodedHref);
        continue;
      }

      const fileInfo = this.parseFileInfo(response);
      if (!fileInfo) continue;

      // Get basename from the path
      const basename = this.extractBasename(decodedHref);

      console.log('Adding file:', {
        filename: decodedHref,
        basename: basename,
        isDirectory: fileInfo.isDirectory,
        size: fileInfo.size
      });

      files.push({
        filename: decodedHref,
        basename: basename,
        lastmod: fileInfo.lastModified || new Date().toISOString(),
        size: fileInfo.size,
        type: fileInfo.isDirectory ? 'directory' : 'file',
        mime: fileInfo.isDirectory ? 'httpd/unix-directory' : 'application/octet-stream',
        etag: '',
      });
    }

    console.log('Parsed', files.length, 'files total');
    return files;
  }

  parseHTMLDirectoryListing(html: string): WebDAVFile[] {
    const files: WebDAVFile[] = [];

    try {
      // Try to parse HTML directory listing (common format for Apache/nginx)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('a[href]');

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href === '../' || href === '/' || href === '?') return;

        // Skip anchor links and query parameters
        if (href.startsWith('#') || href.startsWith('?')) return;

        // Get text content for more comprehensive parent directory detection
        const linkText = link.textContent?.trim() || '';

        // Skip parent directory link - check both href and text content
        if (this.isParentDirectoryLink(href, linkText)) {
          console.log('Skipping parent directory link:', href, linkText);
          return;
        }

        let filename = href;
        const isDirectory = href.endsWith('/');

        // Remove trailing slash for directory names to get clean filename
        if (isDirectory) {
          filename = filename.slice(0, -1);
        }

        // URL decode the filename
        try {
          filename = decodeURIComponent(filename);
        } catch (e) {
          console.warn('Failed to decode filename:', filename, e);
          // Use original filename if decoding fails
        }

        // Skip if filename is empty after processing
        if (!filename) return;

        // Get text content for display name (might be different from href)
        const displayName = linkText && linkText !== filename ? linkText : filename;

        // For directories, remove trailing slash from display name too
        const basename = isDirectory && displayName.endsWith('/') ? displayName.slice(0, -1) : displayName;

        // Try to extract file info from the table row
        const fileInfo = this.extractHTMLFileInfo(link, isDirectory);

        files.push({
          filename: filename,
          basename: basename,
          lastmod: fileInfo.lastmod,
          size: fileInfo.size,
          type: isDirectory ? 'directory' : 'file',
          mime: isDirectory ? 'httpd/unix-directory' : 'application/octet-stream',
          etag: '',
        });
      });

      // If no files found, try alternative parsing for JSON responses
      if (files.length === 0) {
        const jsonFiles = this.parseJSONDirectoryListing(html);
        files.push(...jsonFiles);
      }
    } catch (error) {
      console.warn('Failed to parse directory listing:', error);
    }

    return files;
  }

  private isParentDirectoryEntry(decodedHref: string): boolean {
    return decodedHref.endsWith('../') ||
           decodedHref.endsWith('/..') ||
           decodedHref === '..' ||
           decodedHref.includes('Parent Directory') ||
           decodedHref.includes('上级目录');
  }

  private isCurrentDirectoryEntry(decodedHref: string, currentPath: string): boolean {
    const normalizePathForComparison = (path: string): string => {
      // 移除末尾斜杠，然后再加上斜杠，确保一致性
      const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
      return cleanPath + '/';
    };

    const normalizedHref = normalizePathForComparison(decodedHref);
    const normalizedCurrentPath = normalizePathForComparison(currentPath);

    console.log('Normalized href:', normalizedHref);
    console.log('Normalized currentPath:', normalizedCurrentPath);

    // 如果 href 路径等于当前请求的路径，则跳过（这是当前目录本身）
    if (normalizedHref === normalizedCurrentPath) {
      console.log('Skipping current directory entry (exact match):', decodedHref);
      return true;
    }

    // 对于空的 currentPath（根目录），需要特殊处理
    if (currentPath === '' || currentPath === '/') {
      // 检查 href 是否指向根目录本身
      if (decodedHref === '/' || decodedHref === '') {
        console.log('Skipping root directory entry:', decodedHref);
        return true;
      }
    }

    // 额外的检查：如果 href 是当前目录的父路径包含情况
    if (currentPath && currentPath !== '' && currentPath !== '/') {
      // 检查 href 是否等于当前路径（忽略末尾斜杠）
      const currentPathClean = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
      const hrefClean = decodedHref.endsWith('/') ? decodedHref.slice(0, -1) : decodedHref;

      if (hrefClean === currentPathClean) {
        console.log('Skipping current directory entry (path match):', decodedHref);
        return true;
      }
    }

    return false;
  }

  private isParentDirectoryLink(href: string, linkText: string): boolean {
    return href === '../' ||
           href.includes('Parent Directory') ||
           linkText.includes('Parent Directory') ||
           linkText.includes('上级目录') ||
           linkText.includes('..') ||
           linkText === 'Parent' ||
           href === '..' ||
           href.endsWith('/..') ||
           href.endsWith('/..');
  }

  private parseFileInfo(response: Element): { isDirectory: boolean; size: number; lastModified?: string } | null {
    // Try different ways to get propstat
    let propstat = response.getElementsByTagName('propstat')[0];
    if (!propstat) {
      propstat = response.getElementsByTagNameNS('DAV:', 'propstat')[0];
    }
    if (!propstat) {
      propstat = response.getElementsByTagName('D:propstat')[0];
    }
    if (!propstat) return null;

    // Try different ways to get prop
    let prop = propstat.getElementsByTagName('prop')[0];
    if (!prop) {
      prop = propstat.getElementsByTagNameNS('DAV:', 'prop')[0];
    }
    if (!prop) {
      prop = propstat.getElementsByTagName('D:prop')[0];
    }
    if (!prop) return null;

    // Check for collection (directory)
    let resourceType = prop.getElementsByTagName('resourcetype')[0];
    if (!resourceType) {
      resourceType = prop.getElementsByTagNameNS('DAV:', 'resourcetype')[0];
    }
    if (!resourceType) {
      resourceType = prop.getElementsByTagName('lp1:resourcetype')[0];
    }

    let isDirectory = false;
    if (resourceType) {
      const collection = resourceType.getElementsByTagName('collection')[0] ||
                       resourceType.getElementsByTagNameNS('DAV:', 'collection')[0] ||
                       resourceType.getElementsByTagName('D:collection')[0];
      isDirectory = !!collection;
    }

    // Get content length
    let contentLengthElement = prop.getElementsByTagName('getcontentlength')[0];
    if (!contentLengthElement) {
      contentLengthElement = prop.getElementsByTagNameNS('DAV:', 'getcontentlength')[0];
    }
    if (!contentLengthElement) {
      contentLengthElement = prop.getElementsByTagName('lp1:getcontentlength')[0];
    }
    const contentLength = contentLengthElement?.textContent;

    // Get last modified
    let lastModifiedElement = prop.getElementsByTagName('getlastmodified')[0];
    if (!lastModifiedElement) {
      lastModifiedElement = prop.getElementsByTagNameNS('DAV:', 'getlastmodified')[0];
    }
    if (!lastModifiedElement) {
      lastModifiedElement = prop.getElementsByTagName('lp1:getlastmodified')[0];
    }
    const lastModified = lastModifiedElement?.textContent;

    return {
      isDirectory,
      size: contentLength ? parseInt(contentLength, 10) : 0,
      lastModified: lastModified || undefined
    };
  }

  private extractBasename(decodedHref: string): string {
    if (!decodedHref) return '';
    const cleanPath = decodedHref.endsWith('/') ? decodedHref.slice(0, -1) : decodedHref;
    return cleanPath.split('/').pop() || '';
  }

  private extractHTMLFileInfo(link: Element, isDirectory: boolean): { lastmod: string; size: number } {
    const row = link.closest('tr');
    let lastmod = new Date().toISOString();
    let size = 0;

    if (row) {
      const cells = row.querySelectorAll('td');
      // Common format: [icon] [name] [last modified] [size] [description]
      if (cells.length >= 3) {
        // Try to parse last modified date (usually in the 3rd column)
        const dateCell = cells[2]?.textContent?.trim();
        if (dateCell && dateCell !== '-' && dateCell !== '&nbsp;') {
          try {
            const parsedDate = new Date(dateCell);
            if (!isNaN(parsedDate.getTime())) {
              lastmod = parsedDate.toISOString();
            }
          } catch (e) {
            // Keep default date if parsing fails
          }
        }

        // Try to parse size (usually in the 4th column)
        const sizeCell = cells[3]?.textContent?.trim();
        if (sizeCell && sizeCell !== '-' && sizeCell !== '&nbsp;' && !isDirectory) {
          const sizeMatch = sizeCell.match(/(\d+)/);
          if (sizeMatch) {
            size = parseInt(sizeMatch[1], 10);
          }
        }
      }
    }

    return { lastmod, size };
  }

  private parseJSONDirectoryListing(html: string): WebDAVFile[] {
    const files: WebDAVFile[] = [];

    try {
      const jsonData = JSON.parse(html);
      if (Array.isArray(jsonData)) {
        jsonData.forEach((item: any) => {
          if (item.name || item.filename) {
            const filename = item.name || item.filename;
            const isDirectory = item.type === 'directory' || item.isDirectory || filename.endsWith('/');

            files.push({
              filename: filename,
              basename: filename,
              lastmod: item.lastModified || item.mtime || new Date().toISOString(),
              size: item.size || 0,
              type: isDirectory ? 'directory' : 'file',
              mime: isDirectory ? 'httpd/unix-directory' : 'application/octet-stream',
              etag: '',
            });
          }
        });
      }
    } catch (e) {
      // Not JSON, ignore
    }

    return files;
  }
}
