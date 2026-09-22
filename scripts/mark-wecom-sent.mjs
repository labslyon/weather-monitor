import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function beijingDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const date = option('date', beijingDate());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid Beijing date: ${date}`);

const stateFile = path.resolve(ROOT, option('state', 'state/wecom-digest.json'));
await fs.mkdir(path.dirname(stateFile), { recursive: true });
await fs.writeFile(stateFile, `${JSON.stringify({
  last_sent_beijing_date: date,
  recorded_at_utc: new Date().toISOString()
}, null, 2)}\n`, 'utf8');
console.log(date);
