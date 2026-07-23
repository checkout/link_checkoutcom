'use strict';

/**
 * Assembles the Commerce App Package (CAP) for the Salesforce Commerce Apps
 * registry (https://github.com/SalesforceCommerceCloud/commerce-apps).
 *
 * Sources:
 *   commerce-app/                     -> CAP root files (manifest, tasks, impex, icons)
 *   Cartridges/int_checkoutcom_sfra   -> cartridges/site_cartridges/
 *   Cartridges/bm_checkoutcom         -> cartridges/bm_cartridges/
 *
 * Output (in dist/):
 *   commerce-<id>-app-v<version>/     -> staged package
 *   <id>-v<version>.zip               -> submission artifact
 *   manifest-entry.json               -> entry for commerce-apps-manifest/manifest.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const srcApp = path.join(repoRoot, 'commerce-app');
const distDir = path.join(repoRoot, 'dist');

const JUNK = ['.DS_Store', 'Thumbs.db', '__MACOSX', '.project', '.tern-project', '.gitignore'];

/**
 * Copy filter: skips OS junk and IDE dotfiles.
 * @param {string} src - source path being copied
 * @returns {boolean} true to copy
 */
function copyFilter(src) {
    return JUNK.indexOf(path.basename(src)) === -1;
}

const manifest = JSON.parse(fs.readFileSync(path.join(srcApp, 'commerce-app.json'), 'utf8'));
const capRootName = 'commerce-' + manifest.id + '-app-v' + manifest.version;
const zipName = manifest.id + '-v' + manifest.version + '.zip';
const stageDir = path.join(distDir, capRootName);

console.log('Building ' + capRootName);

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

// 1. CAP root files (manifest, README, app-configuration, impex, icons)
fs.cpSync(srcApp, stageDir, { recursive: true, filter: copyFilter });

// 2. Cartridges (copied from the canonical Cartridges/ sources)
const cartridgeMap = {
    'int_checkoutcom_sfra': path.join('cartridges', 'site_cartridges', 'int_checkoutcom_sfra'),
    'bm_checkoutcom': path.join('cartridges', 'bm_cartridges', 'bm_checkoutcom')
};
Object.keys(cartridgeMap).forEach(function (name) {
    const from = path.join(repoRoot, 'Cartridges', name);
    if (!fs.existsSync(from)) {
        throw new Error('Missing cartridge: ' + from);
    }
    fs.cpSync(from, path.join(stageDir, cartridgeMap[name]), { recursive: true, filter: copyFilter });
    console.log('  + ' + cartridgeMap[name]);
});

// 3. Sanity checks
['commerce-app.json', 'README.md', path.join('app-configuration', 'tasksList.json'),
    path.join('impex', 'install', 'services.xml'), path.join('impex', 'uninstall', 'services.xml')]
    .forEach(function (required) {
        if (!fs.existsSync(path.join(stageDir, required))) {
            throw new Error('Required CAP file missing: ' + required);
        }
    });
const iconName = ['checkoutcom.svg', 'checkoutcom.png', 'checkoutcom.jpg', 'checkoutcom.jpeg']
    .find(function (name) { return fs.existsSync(path.join(stageDir, 'icons', name)); });
if (!iconName) {
    console.warn('  ! icons/checkoutcom.<svg|png> not found — add the brand icon before submitting (see commerce-app/icons/README.md)');
}
console.warn('  ! reminder: run "npm run build" first if client JS under cartridge/client changed');

// 4. Zip (junk already filtered during staging)
execFileSync('zip', ['-r', '-q', zipName, capRootName], { cwd: distDir });

// 5. SHA256 + registry manifest entry
const zipPath = path.join(distDir, zipName);
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
const entry = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    iconName: iconName || 'checkoutcom.png',
    domain: manifest.domain,
    type: 'app',
    provider: 'thirdParty',
    version: manifest.version,
    zip: zipName,
    sha256: sha256
};
if (manifest.storefrontSupport) {
    entry.storefrontSupport = manifest.storefrontSupport;
}
fs.writeFileSync(path.join(distDir, 'manifest-entry.json'), JSON.stringify(entry, null, 4) + '\n');

console.log('\nDone:');
console.log('  ' + path.relative(repoRoot, zipPath));
console.log('  sha256: ' + sha256);
console.log('\nTo submit to the Commerce Apps registry:');
console.log('  1. Fork/clone https://github.com/SalesforceCommerceCloud/commerce-apps');
console.log('  2. Place the ZIP at payment/' + manifest.id + '/' + zipName);
console.log('  3. New app only: add payment/' + manifest.id + '/catalog.json with {"latest":{"version":"INIT","tag":"INIT"},"versions":[]}');
console.log('  4. Add dist/manifest-entry.json content to commerce-apps-manifest/manifest.json under "payment"');
console.log('  5. Add name/description for "' + manifest.id + '" to commerce-apps-manifest/translations/en-US.json');
console.log('  6. Commit only the ZIP, manifest.json and catalog.json — never the extracted directory — and open a PR');
