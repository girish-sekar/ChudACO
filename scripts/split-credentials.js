const fs = require('fs');
const path = require('path');

// Usage: node split-credentials.js [input.txt ...] [--out-dir dir]
const args = process.argv.slice(2);
const outDirIndex = args.indexOf('--out-dir');
const outDir = path.resolve(outDirIndex >= 0 ? args.splice(outDirIndex, 2)[1] : '.');
const files = args.length ? args : ['ryen.txt', 'will.txt', 'edgar.txt', 'aco.txt'].map((f) =>
  path.join(process.env.HOME, 'Downloads', f)
);

const emailPassword = [];
const imapCredentials = [];
const seenEmailPass = new Set();
const seenImap = new Set();

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(':::');
    if (parts.length < 2) continue;

    const emailPassKey = parts[0] + ':' + parts[1];
    if (!seenEmailPass.has(emailPassKey)) {
      seenEmailPass.add(emailPassKey);
      emailPassword.push(emailPassKey);
    }

    if (parts.length >= 4) {
      const imapKey = parts[2] + ':' + parts[3];
      if (!seenImap.has(imapKey)) {
        seenImap.add(imapKey);
        imapCredentials.push(imapKey);
      }
    }
  }
}

fs.writeFileSync(path.join(outDir, 'email_password.txt'), emailPassword.join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'imap_credentials.txt'), imapCredentials.join('\n') + '\n');

console.log('Files written to', outDir);
console.log('  email_password.txt:', emailPassword.length, 'entries');
console.log('  imap_credentials.txt:', imapCredentials.length, 'entries');
