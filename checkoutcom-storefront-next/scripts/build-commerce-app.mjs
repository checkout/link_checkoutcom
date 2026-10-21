#!/usr/bin/env node
/**
 * Build the Commerce App Package (CAP) for the commerce-apps registry.
 *
 *   npm run package:app
 *
 * Assembles dist/commerce-checkoutcom-app-v<version>/ in the registry layout and
 * zips it to dist/checkoutcom-v<version>.zip, then prints the SHA-256 for the
 * registry manifest. The version must agree in commerce-app/commerce-app.json,
 * package.json and the cartridge (config.js VERSION).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = JSON.parse(readFileSync(join(root, 'commerce-app/commerce-app.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const cartridgeVersion = /var VERSION = '([^']+)'/.exec(
    readFileSync(join(root, 'cartridges/int_checkoutcom_next/cartridge/scripts/checkoutcom/config.js'), 'utf8')
)?.[1];

if (app.version !== pkg.version || app.version !== cartridgeVersion) {
    console.error(`Version mismatch: commerce-app.json ${app.version}, package.json ${pkg.version}, config.js ${cartridgeVersion}`);
    process.exit(1);
}

const name = `commerce-${app.id}-app-v${app.version}`;
const dist = join(root, 'dist');
const out = join(dist, name);
const zipName = `${app.id}-v${app.version}.zip`;
const zipPath = join(dist, zipName);

rmSync(out, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(out, { recursive: true });

const skip = (source) => !/(^|\/)(\.DS_Store|\.tern-project|node_modules)(\/|$)/.test(source);
const copy = (from, to) => {
    const source = join(root, from);

    if (!existsSync(source)) {
        console.error(`Missing ${from}`);
        process.exit(1);
    }
    cpSync(source, join(out, to), { recursive: true, filter: skip });
};

// App metadata, setup tasks, icon, README
copy('commerce-app/commerce-app.json', 'commerce-app.json');
copy('commerce-app/README.md', 'README.md');
copy('commerce-app/app-configuration', 'app-configuration');
copy('commerce-app/icons', 'icons');

// Cartridges in the registry layout; each keeps its .project (b2c cartridge discovery needs it)
copy('cartridges/int_checkoutcom_next', 'cartridges/site_cartridges/int_checkoutcom_next');
copy('cartridges/bm_checkoutcom', 'cartridges/bm_cartridges/bm_checkoutcom');

// Metadata (SITEID placeholder kept: the installer substitutes the site)
copy('impex', 'impex');

// Storefront extension, under the folder named after the app id
copy('storefront-next/src/extensions/checkoutcom', `storefront-next/src/extensions/${app.id}`);

execFileSync('zip', ['-rqX', zipName, name, '-x', '*.DS_Store', '-x', '__MACOSX/*'], { cwd: dist, stdio: 'inherit' });

const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex');

console.log(`Built dist/${name}/`);
console.log(`Built dist/${zipName}`);
console.log(`sha256 ${sha256}`);
