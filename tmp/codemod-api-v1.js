const fs = require('fs');
const path = require('path');

const root = process.cwd();
const exts = new Set(['.js', '.ts', '.tsx', '.jsx', '.ejs', '.html']);
const skipDirs = new Set(['node_modules', '.git', 'tmp', 'logs']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

const files = walk(root);
let updated = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;

  src = src.replace(/fetch\(\s*(["'`])\/api\//g, 'fetch($1/api/v1/');
  src = src.replace(/axios\.(get|post|put|patch|delete)\(\s*(["'`])\/api\//g, 'axios.$1($2/api/v1/');

  if (src !== orig) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('updated', path.relative(root, file));
    updated++;
  }
}

console.log('total updated files:', updated);
