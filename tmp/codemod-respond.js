const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const p = path.normalize(path.join(dir, ent.name));
    if (!p.startsWith(root + path.sep)) continue;
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(root).filter(f => /controller/i.test(path.basename(f)) && f.endsWith('.js'));

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // Replace json response patterns
  src = src.replace(/res\.status\(([^\)]*)\)\.json\(/g, 'respond(res, $1, ');
  src = src.replace(/res\.json\(/g, 'respond(res, 200, ');

  if (src !== original) {
    // Add import if missing
    if (!/require\(['\"](?:\.\.\/)+utils\/respond['\"]\)/.test(src)) {
      const rel = path.relative(path.dirname(file), path.join(root, 'utils', 'respond')).replace(/\\/g, '/');
      const reqPath = rel.startsWith('.') ? rel : './' + rel;
      const line = `const respond = require('${reqPath}');\n`;

      const lines = src.split(/\r?\n/);
      let insertAt = 0;
      while (insertAt < lines.length && (lines[insertAt].startsWith('/*') || lines[insertAt].startsWith('*') || lines[insertAt].startsWith('*/') || lines[insertAt].trim() === '')) {
        insertAt++;
      }
      while (insertAt < lines.length && lines[insertAt].startsWith('//')) insertAt++;
      lines.splice(insertAt, 0, line.trimEnd());
      src = lines.join('\n');
    }

    fs.writeFileSync(file, src, 'utf8');
    console.log('updated', path.relative(root, file));
  }
}
