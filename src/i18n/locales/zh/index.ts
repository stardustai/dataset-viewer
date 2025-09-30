import { common } from './common';
import { connection } from './connection';
import { download } from './download';
import { errors } from './errors';
import { fileBrowser } from './fileBrowser';
import { fileViewer } from './fileViewer';
import { pluginManager } from './pluginManager';
import { settings } from './settings';

export const zh = {
  ...common,
  ...connection,
  ...fileBrowser,
  ...fileViewer,
  ...errors,
  ...settings,
  ...download,
  ...pluginManager,
};
