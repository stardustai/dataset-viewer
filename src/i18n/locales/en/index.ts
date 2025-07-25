import { common } from './common';
import { connection } from './connection';
import { fileBrowser } from './fileBrowser';
import { fileViewer } from './fileViewer';
import { errors } from './errors';
import { settings } from './settings';

export const en = {
  ...common,
  ...connection,
  ...fileBrowser,
  ...fileViewer,
  ...errors,
  ...settings,
};
