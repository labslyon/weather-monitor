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

function beijingParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

function parseTarget(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid target time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid target time: ${value}`);
  return hour * 60 + minute;
}

async function readLastSent(stateFile) {
  try {
    const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    return state.last_sent_beijing_date || null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');
  await fs.appendFile(process.env.GITHUB_OUTPUT, `${lines}\n`, 'utf8');
}

const eventName = option('event', process.env.GITHUB_EVENT_NAME || 'push');
const target = option('target', '09:30');
const stateFile = path.resolve(ROOT, option('state', 'state/wecom-digest.json'));
const nowValue = option('now');
const now = nowValue ? new Date(nowValue) : new Date();
if (Number.isNaN(now.getTime())) throw new Error(`Invalid current time: ${nowValue}`);

const beijing = beijingParts(now);
const lastSent = await readLastSent(stateFile);
const afterTarget = beijing.minutes >= parseTarget(target);

let shouldRun = true;
let reason = 'non-scheduled event';
if (eventName === 'schedule' && !afterTarget) {
  shouldRun = false;
  reason = `before ${target} Asia/Shanghai`;
} else if (eventName === 'schedule' && lastSent === beijing.date) {
  shouldRun = false;
  reason = `digest already sent on ${beijing.date}`;
} else if (eventName === 'schedule') {
  reason = `first eligible run on ${beijing.date}`;
}

const result = {
  should_run: String(shouldRun),
  beijing_date: beijing.date,
  reason
};
await writeOutputs(result);
console.log(JSON.stringify({ ...result, event: eventName, last_sent: lastSent }));
