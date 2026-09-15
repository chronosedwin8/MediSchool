// Dev helper: waits for the first TypeScript build, then starts the API.
// `node --watch-path=dist` restarts this script on every rebuild.
const fs = require('node:fs');
const path = require('node:path');

const entry = path.join(__dirname, '..', 'dist', 'main.js');
const start = Date.now();
(function wait() {
  if (fs.existsSync(entry)) return require(entry);
  if (Date.now() - start > 120000) {
    console.error('dist/main.js not found after 120 s');
    process.exit(1);
  }
  setTimeout(wait, 500);
})();
