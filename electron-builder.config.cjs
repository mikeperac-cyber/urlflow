const fs = require('node:fs');
const path = require('node:path');
const base = require('./package.json').build;
const { readReleaseConfig } = require('./dist-electron/updateConfig.cjs');

const mode = process.env.URL_FLOW_PACKAGE_MODE || 'release';
if (!['release', 'local', 'portable'].includes(mode)) throw new Error('Use npm run dist, dist:local or dist:portable.');
const marker = JSON.parse(fs.readFileSync(path.join(__dirname, 'dist-electron/package-mode.json'), 'utf8'));
if (marker.mode !== mode) throw new Error('The Electron build mode does not match packaging. Use the npm dist command for this target.');
const release = mode === 'release' ? readReleaseConfig(process.env) : null;

module.exports = {
  ...base,
  extends: null,
  directories: { ...base.directories, output: mode === 'release' ? base.directories.output : `${base.directories.output}/${mode}` },
  electronLanguages: ['en-US', 'tr'],
  forceCodeSigning: Boolean(release),
  publish: release ? [{ provider: 'generic', url: release.feedUrl }] : null,
  win: {
    ...base.win,
    verifyUpdateCodeSignature: true,
    ...(release ? { signtoolOptions: { ...base.win.signtoolOptions, publisherName: release.publisherName } } : {}),
  },
  nsis: {
    ...base.nsis,
    deleteAppDataOnUninstall: false,
    ...(mode === 'local' ? { artifactName: 'URL-Flow-Setup-${version}-LOCAL.${ext}' } : {}),
  },
};
