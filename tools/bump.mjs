// Bumps the game version in web/version.json and package.json.
// Usage: node tools/bump.mjs [patch|minor|major]   (default patch)
// The patch number counts 0..10 and then rolls into the minor number, so 0.10.10 becomes 0.11.0, not 0.10.11.
// A minor bump resets the patch number, a major bump resets minor and patch.
import { readFileSync, writeFileSync } from 'node:fs';
const PATCH_MAX = 10;
const root = new URL('../', import.meta.url);
const level = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(level)) { console.error('level must be patch, minor or major'); process.exit(1); }
const vf = new URL('web/version.json', root), pf = new URL('package.json', root);
let [major, minor, patch] = JSON.parse(readFileSync(vf, 'utf8')).version.split('.').map(Number);
if (level === 'major') { major++; minor = 0; patch = 0; }
else if (level === 'minor') { minor++; patch = 0; }
else { patch++; if (patch > PATCH_MAX) { minor++; patch = 0; } }
const version = `${major}.${minor}.${patch}`;
writeFileSync(vf, JSON.stringify({ version }) + '\n');
const pkg = JSON.parse(readFileSync(pf, 'utf8')); pkg.version = version; writeFileSync(pf, JSON.stringify(pkg, null, 2) + '\n');
console.log(version);
