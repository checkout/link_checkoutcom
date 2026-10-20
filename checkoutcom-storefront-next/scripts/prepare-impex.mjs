#!/usr/bin/env node
/**
 * Stage impex/install for a Site Import, replacing the SITEID placeholder folder
 * with real site ids, then import it with:  b2c job import dist/impex
 *
 * usage: node scripts/prepare-impex.mjs [--with-test-data] RefArchGlobal [RefArch ...]
 *
 * --with-test-data adds test/data/checkoutcom-test-data: a two product catalog,
 * USD/GBP/EUR price books, an inventory list and a flat-rate shipping method per
 * currency, for trying checkout on an empty sandbox site.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withTestData = process.argv.includes('--with-test-data');
const sites = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

if (sites.length === 0) {
    console.error('usage: node scripts/prepare-impex.mjs <siteId> [siteId ...]');
    process.exit(1);
}

const target = join(root, 'dist', 'impex');

if (existsSync(target)) {
    rmSync(target, { recursive: true });
}

mkdirSync(join(target, 'sites'), { recursive: true });
cpSync(join(root, 'impex', 'install', 'meta'), join(target, 'meta'), { recursive: true });
cpSync(join(root, 'impex', 'install', 'services.xml'), join(target, 'services.xml'));

for (const site of sites) {
    cpSync(join(root, 'impex', 'install', 'sites', 'SITEID'), join(target, 'sites', site), { recursive: true });
}

if (withTestData) {
    const data = join(root, 'test', 'data', 'checkoutcom-test-data');

    for (const folder of ['catalogs', 'pricebooks', 'inventory-lists']) {
        cpSync(join(data, folder), join(target, folder), { recursive: true });
    }

    for (const site of sites) {
        cpSync(join(data, 'sites', 'SITEID'), join(target, 'sites', site), { recursive: true });
    }
}

console.log(`Staged ${target} for ${sites.join(', ')}:`);
console.log(readdirSync(target, { recursive: true }).map((file) => `  ${file}`).join('\n'));
console.log('\nImport it with:  b2c job import dist/impex');
