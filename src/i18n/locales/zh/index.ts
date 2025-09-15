import { common } from './common';
import { connection } from './connection';
import { fileBrowser } from './fileBrowser';
import { fileViewer } from './fileViewer';
import { errors } from './errors';
import { settings } from './settings';
import { download } from './download';
import { pluginManager } from './pluginManager';

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
