#!/usr/bin/env node
/**
 * Validate every impex file against the official Salesforce B2C XSDs, which ship
 * with @salesforce/b2c-tooling-sdk (a dependency of the b2c CLI and of
 * storefront-next-dev). Requires xmllint (preinstalled on macOS).
 *
 * usage: node scripts/validate-impex.mjs   (B2C_XSD_DIR overrides the XSD location)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function findXsdDir() {
    if (process.env.B2C_XSD_DIR) {
        return process.env.B2C_XSD_DIR;
    }

    const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    const candidates = [
        join(npmRoot, '@salesforce/b2c-cli/node_modules/@salesforce/b2c-tooling-sdk/data/xsd'),
        join(npmRoot, '@salesforce/b2c-tooling-sdk/data/xsd'),
    ];

    return candidates.find((dir) => existsSync(join(dir, 'metadata.xsd')));
}

const SCHEMAS = [
    [/meta\/.*\.xml$/, 'metadata.xsd'],
    [/services\.xml$/, 'services.xsd'],
    [/payment-methods\.xml$/, 'paymentmethod.xsd'],
    [/payment-processors\.xml$/, 'paymentprocessor.xsd'],
    [/catalogs\/.*\.xml$/, 'catalog.xsd'],
    [/pricebooks\/.*\.xml$/, 'pricebook.xsd'],
    [/inventory-lists\/.*\.xml$/, 'inventory.xsd'],
    [/shipping\.xml$/, 'shipping.xsd'],
];

const xsdDir = findXsdDir();

if (!xsdDir) {
    console.error('Official XSDs not found. Install the b2c CLI (npm i -g @salesforce/b2c-cli) or set B2C_XSD_DIR.');
    process.exit(1);
}

let failed = 0;

const files = ['impex', 'test/data'].flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true }).filter((f) => f.endsWith('.xml')).map((f) => join(root, dir, f))
);

for (const path of files) {
    const schema = SCHEMAS.find(([pattern]) => pattern.test(path))?.[1];

    try {
        execFileSync('xmllint', ['--noout', '--schema', join(xsdDir, schema), path], { stdio: 'pipe' });
        console.log(`  ok    ${relative(root, path)}`);
    } catch (error) {
        failed += 1;
        console.log(`  FAIL  ${relative(root, path)}\n${String(error.stderr)}`);
    }
}

process.exit(failed ? 1 : 0);
