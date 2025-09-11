import { common } from './common';
import { connection } from './connection';
import { download } from './download';
import { errors } from './errors';
import { fileBrowser } from './fileBrowser';
import { fileViewer } from './fileViewer';
import { settings } from './settings';
import { pluginManager } from './pluginManager';

export const en = {
  ...common,
  ...connection,
  ...fileBrowser,
  ...fileViewer,
  ...errors,
  ...settings,
  ...download,
  ...pluginManager,
};
