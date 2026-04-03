const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'api/index.ts');
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/pool\.query/g, 'dbQuery');
// But wait, in the dbQuery function itself, it uses pool.query.
// We need to revert that specific one.
content = content.replace(/return dbQuery\(text, params\);/g, 'return pool.query(text, params);');
fs.writeFileSync(file, content);
console.log('Done');
