#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ═══════════════════════════════════════════════
//   ANSI COLOR ENGINE — no external dependencies
// ═══════════════════════════════════════════════
const A = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
  italic:    '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground
  black:     '\x1b[30m',
  red:       '\x1b[31m',
  green:     '\x1b[32m',
  yellow:    '\x1b[33m',
  blue:      '\x1b[34m',
  magenta:   '\x1b[35m',
  cyan:      '\x1b[36m',
  white:     '\x1b[37m',
  gray:      '\x1b[90m',

  // Bright Foreground
  bRed:      '\x1b[91m',
  bGreen:    '\x1b[92m',
  bYellow:   '\x1b[93m',
  bBlue:     '\x1b[94m',
  bMagenta:  '\x1b[95m',
  bCyan:     '\x1b[96m',
  bWhite:    '\x1b[97m',

  // Background
  bgBlack:   '\x1b[40m',
  bgRed:     '\x1b[41m',
  bgBlue:    '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan:    '\x1b[46m',
};

function asciiText(value) {
  return String(value ?? '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '')
    .replace(/[ \t]+/g, ' ');
}

function asciiChar(value, fallback = '-') {
  const text = asciiText(value).trim();
  return text.length === 1 ? text : fallback;
}

const c = (color, text) => `${color}${asciiText(text)}${A.reset}`;
const clearScreen = () => process.stdout.write('\x1bc');
const stripAnsi = text => asciiText(String(text).replace(/\x1b\[[0-9;]*m/g, ''));
const APP_ROOT = __dirname;

// ═══════════════════════════════════════════════
//   TERMINAL WIDTH HELPER
// ═══════════════════════════════════════════════
function termWidth() {
  try { return process.stdout.columns || 80; } catch { return 80; }
}

function centerText(text, width) {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, Math.floor((width - stripped.length) / 2));
  return ' '.repeat(pad) + text;
}

function line(char = '─', color = A.gray, width = termWidth()) {
  return c(color, char.repeat(width));
}

// ═══════════════════════════════════════════════
//   BANNER
// ═══════════════════════════════════════════════
function printBanner() {
  const w = termWidth();
  const accent = A.bCyan;
  const dim    = A.gray;

  console.log('');
  console.log(line('═', accent, w));
  console.log('');

  const logo = [
    '  ██████╗██╗      █████╗ ███╗   ██╗██╗  ██╗███████╗██████╗ ',
    ' ██╔════╝██║     ██╔══██╗████╗  ██║██║ ██╔╝██╔════╝██╔══██╗',
    ' ██║     ██║     ███████║██╔██╗ ██║█████╔╝ █████╗  ██████╔╝',
    ' ██║     ██║     ██╔══██║██║╚██╗██║██╔═██╗ ██╔══╝  ██╔══██╗',
    ' ╚██████╗███████╗██║  ██║██║ ╚████║██║  ██╗███████╗██║  ██║',
    '  ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝',
  ];

  logo.forEach(row => console.log(centerText(c(accent, row), w)));
  console.log(centerText(c(A.bold + A.bMagenta, '━━━━━━━━━━━━ 2.0 ━━━━━━━━━━━━'), w));
  console.log('');
  console.log(centerText(c(dim, 'Discord Bot Launcher  •  Production CLI'), w));
  console.log('');
  console.log(line('═', accent, w));
  console.log('');
}

// ═══════════════════════════════════════════════
//   BOX DRAWER
// ═══════════════════════════════════════════════
function box(title, lines, accentColor = A.bCyan, width = 60) {
  const innerW = width - 2;
  const titleStr = ` ${title} `;
  const titlePad = Math.max(0, Math.floor((innerW - titleStr.replace(/\x1b\[[0-9;]*m/g, '').length) / 2));
  const topBar   = '╔' + '═'.repeat(innerW) + '╗';
  const titleBar = '║' + ' '.repeat(titlePad) + titleStr + ' '.repeat(Math.max(0, innerW - titlePad - titleStr.replace(/\x1b\[[0-9;]*m/g, '').length)) + '║';
  const midBar   = '╠' + '═'.repeat(innerW) + '╣';
  const botBar   = '╚' + '═'.repeat(innerW) + '╝';

  console.log(c(accentColor, topBar));
  console.log(c(accentColor, titleBar));
  console.log(c(accentColor, midBar));
  lines.forEach(ln => {
    const stripped = ln.replace(/\x1b\[[0-9;]*m/g, '');
    const padding  = Math.max(0, innerW - 2 - stripped.length);
    console.log(c(accentColor, '║') + ' ' + ln + ' '.repeat(padding) + ' ' + c(accentColor, '║'));
  });
  console.log(c(accentColor, botBar));
}

// ═══════════════════════════════════════════════
//   PRETTY TABLE
// ═══════════════════════════════════════════════
function prettyTable(title, icon, data, accentColor = A.bCyan) {
  const w = termWidth();
  const innerW = w - 2;
  const titleStr = ` ${icon}  ${title} `;

  console.log('');
  console.log(c(accentColor, '╔' + '═'.repeat(innerW) + '╗'));
  const tLen = titleStr.length;
  const tPad = Math.floor((innerW - tLen) / 2);
  console.log(c(accentColor, '║') + ' '.repeat(tPad) + c(A.bold + accentColor, titleStr) + ' '.repeat(Math.max(0, innerW - tPad - tLen)) + c(accentColor, '║'));
  console.log(c(accentColor, '╠' + '═'.repeat(innerW) + '╣'));

  const keyW = 34;
  const valW = innerW - keyW - 5;

  Object.entries(data).forEach(([key, val], i) => {
    const rowColor = i % 2 === 0 ? '' : A.dim;
    const keyStr   = key.padEnd(keyW).slice(0, keyW);
    const valRaw   = String(val ?? 'N/A');
    const valStr   = valRaw.length > valW ? valRaw.slice(0, valW - 1) + '…' : valRaw.padEnd(valW);

    console.log(
      c(accentColor, '║') +
      ' ' +
      c(rowColor + A.bCyan, keyStr) +
      c(accentColor, ' │ ') +
      c(rowColor + A.bWhite, valStr) +
      ' ' +
      c(accentColor, '║')
    );
  });

  console.log(c(accentColor, '╚' + '═'.repeat(innerW) + '╝'));
}

// ═══════════════════════════════════════════════
//   SPINNER (pure Node)
// ═══════════════════════════════════════════════
function spinner(text) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const iv = setInterval(() => {
    process.stdout.write(`\r${c(A.bCyan, frames[i++ % frames.length])} ${c(A.gray, text)}   `);
  }, 80);
  return {
    succeed: (msg) => { clearInterval(iv); process.stdout.write(`\r${c(A.bGreen, '✔')} ${c(A.bWhite, msg)}\n`); },
    fail:    (msg) => { clearInterval(iv); process.stdout.write(`\r${c(A.bRed, '✘')} ${c(A.bRed, msg)}\n`); },
    stop:    ()    => { clearInterval(iv); process.stdout.write('\r'); },
  };
}

// ═══════════════════════════════════════════════
//   MENU SELECTOR
// ═══════════════════════════════════════════════
async function menu(prompt, choices) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.log(c(A.bCyan, `\n  ${prompt}`));
      choices.forEach((ch, i) => {
        const hint = ch.hint ? ` ${ch.hint}` : '';
        console.log(`  ${i + 1}. ${stripAnsi(ch.label)}${hint}`);
      });
      console.log(c(A.gray, `\n  Non-interactive shell detected; selected: ${stripAnsi(choices[0].label)}\n`));
      resolve(choices[0].value);
      return;
    }

    let selected = 0;

    const render = () => {
      process.stdout.write('\x1b[?25l'); // hide cursor
      choices.forEach((ch, i) => {
        const cursor = i === selected
          ? `  ${c(A.bCyan + A.bold, '▶')} ${c(A.bWhite + A.bold, ch.label)}  ${c(A.gray, ch.hint || '')}`
          : `    ${c(A.gray, ch.label)}`;
        process.stdout.write(cursor + '\n');
      });
      process.stdout.write(`\x1b[${choices.length}A`); // move cursor up
    };

    console.log(c(A.bCyan, `\n  ${prompt}`));
    console.log(c(A.gray, '  Use ↑ ↓ arrows  •  Enter to confirm\n'));
    render();

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    const choose = index => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write(`\x1b[${choices.length}B`); // move cursor down past menu
      process.stdout.write('\x1b[?25h'); // show cursor
      console.log('');
      resolve(choices[index].value);
    };

    const onKey = (str, key) => {
      if (!key) return;
      if (key.name === 'up')    { selected = (selected - 1 + choices.length) % choices.length; render(); }
      if (key.name === 'down')  { selected = (selected + 1) % choices.length; render(); }
      if (/^[1-9]$/.test(str || '')) {
        const numericIndex = Number(str) - 1;
        if (numericIndex < choices.length) choose(numericIndex);
      }
      if (key.name === 'return') {
        choose(selected);
      }
      if (key.name === 'c' && key.ctrl) {
        process.stdout.write('\x1b[?25h');
        process.exit(0);
      }
    };

    process.stdin.on('keypress', onKey);
  });
}

// ═══════════════════════════════════════════════
//   SECURE INPUT (masked password-style)
// ═══════════════════════════════════════════════
async function secureInput(prompt) {
  return new Promise(resolve => {
    process.stdout.write(`  ${c(A.bYellow, '🔑')} ${c(A.bWhite, prompt)} ${c(A.gray, '(hidden)')}: `);

    let token = '';

    if (process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
      process.stdin.setRawMode(true);
      readline.emitKeypressEvents(process.stdin);

      const onKey = (str, key) => {
        if (!key) return;
        if (key.name === 'c' && key.ctrl) { process.stdout.write('\n'); process.exit(0); }
        if (key.name === 'return') {
          process.stdin.removeListener('keypress', onKey);
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          rl.close();
          resolve(token.trim());
        } else if (key.name === 'backspace') {
          if (token.length > 0) {
            token = token.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (str && !key.ctrl && !key.meta) {
          token += str;
          process.stdout.write(c(A.gray, '•'));
        }
      };
      process.stdin.on('keypress', onKey);
    } else {
      const content = fs.readFileSync(0, 'utf8').trim();
      if (!content) {
        console.log(c(A.bRed, '\n  ✘ No token input available. Run the CLI in an interactive terminal or pass a token to start.sh.\n'));
        process.exit(1);
      }
      resolve(content.split(/\r?\n/)[0].trim());
    }
  });
}

// ═══════════════════════════════════════════════
//   TOKEN MANAGER
// ═══════════════════════════════════════════════
const ENV_PATH  = path.join(APP_ROOT, '.env');
const CONF_PATH = path.join(APP_ROOT, '.clanker.json');

function loadSavedToken() {
  try {
    // Try .env first
    if (fs.existsSync(ENV_PATH)) {
      const content = fs.readFileSync(ENV_PATH, 'utf8');
      const match   = content.match(/^TOKEN\s*=\s*(.+)$/m);
      if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
    // Try config json
    if (fs.existsSync(CONF_PATH)) {
      const conf = JSON.parse(fs.readFileSync(CONF_PATH, 'utf8'));
      if (conf.token) return conf.token;
    }
  } catch {}
  return null;
}

function saveToken(token, method) {
  if (method === 'env') {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    if (/^TOKEN\s*=/m.test(content)) {
      content = content.replace(/^TOKEN\s*=.*/m, `TOKEN=${token}`);
    } else {
      content = `TOKEN=${token}\n` + content;
    }
    fs.writeFileSync(ENV_PATH, content);
  } else if (method === 'json') {
    const conf = fs.existsSync(CONF_PATH)
      ? JSON.parse(fs.readFileSync(CONF_PATH, 'utf8'))
      : {};
    conf.token = token;
    fs.writeFileSync(CONF_PATH, JSON.stringify(conf, null, 2));
  }
}

function validateToken(token) {
  // Discord bot tokens: header.payload.hmac
  return /^[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}$/.test(token);
}

// ═══════════════════════════════════════════════
//   PROGRESS BAR
// ═══════════════════════════════════════════════
function progressBar(current, total, width = 30) {
  const pct   = current / total;
  const filled = Math.round(pct * width);
  const bar    = c(A.bCyan, '█'.repeat(filled)) + c(A.gray, '░'.repeat(width - filled));
  return `[${bar}] ${c(A.bWhite, Math.round(pct * 100) + '%')}`;
}

async function fakeLoading(msg, steps = 20) {
  return new Promise(resolve => {
    let i = 0;
    const iv = setInterval(() => {
      process.stdout.write(`\r  ${c(A.bCyan, '⟳')} ${c(A.gray, msg)} ${progressBar(i, steps)}   `);
      i++;
      if (i > steps) {
        clearInterval(iv);
        process.stdout.write(`\r  ${c(A.bGreen, '✔')} ${c(A.bWhite, msg)} ${progressBar(steps, steps)}\n`);
        resolve();
      }
    }, 40);
  });
}

// ═══════════════════════════════════════════════
//   MAIN FLOW
// ═══════════════════════════════════════════════
// ASCII-safe presentation overrides for terminals that do not render Unicode well.
function line(char = '-', color = A.gray, width = termWidth()) {
  return c(color, asciiChar(char, '-').repeat(width));
}

function printBannerAscii() {
  const w = termWidth();
  console.log('');
  console.log(line('=', A.bCyan, w));
  console.log(centerText(c(A.bold + A.bCyan, 'CLANKER 2.0'), w));
  console.log(centerText(c(A.gray, 'Discord Bot Launcher | Production CLI'), w));
  console.log(line('=', A.bCyan, w));
  console.log('');
}

function box(title, lines, accentColor = A.bCyan, width = 60) {
  const innerW = width - 2;
  const cleanTitle = stripAnsi(title).trim();
  const topBar = '+' + '-'.repeat(innerW) + '+';
  const midBar = '+' + '-'.repeat(innerW) + '+';
  const botBar = '+' + '-'.repeat(innerW) + '+';
  const titlePad = Math.max(0, Math.floor((innerW - cleanTitle.length) / 2));
  const titleRow = '|' + ' '.repeat(titlePad) + cleanTitle + ' '.repeat(Math.max(0, innerW - titlePad - cleanTitle.length)) + '|';

  console.log(c(accentColor, topBar));
  console.log(c(accentColor, titleRow));
  console.log(c(accentColor, midBar));
  lines.forEach((ln) => {
    const text = stripAnsi(ln);
    const padding = Math.max(0, innerW - 2 - text.length);
    console.log(c(accentColor, '|') + ' ' + text + ' '.repeat(padding) + ' ' + c(accentColor, '|'));
  });
  console.log(c(accentColor, botBar));
}

function progressBar(current, total, width = 30) {
  const pct = total > 0 ? current / total : 1;
  const filled = Math.round(pct * width);
  const bar = c(A.bCyan, '#'.repeat(filled)) + c(A.gray, '-'.repeat(Math.max(0, width - filled)));
  return `[${bar}] ${c(A.bWhite, Math.round(pct * 100) + '%')}`;
}

async function fakeLoading(msg, steps = 20) {
  return new Promise((resolve) => {
    let i = 0;
    const iv = setInterval(() => {
      process.stdout.write(`\r  ${c(A.bCyan, '...')} ${c(A.gray, msg)} ${progressBar(i, steps)}   `);
      i++;
      if (i > steps) {
        clearInterval(iv);
        process.stdout.write(`\r  ${c(A.bGreen, 'OK ')} ${c(A.bWhite, msg)} ${progressBar(steps, steps)}\n`);
        resolve();
      }
    }, 40);
  });
}

async function main() {
  clearScreen();
  printBannerAscii();

  // ── Check existing token ──
  let token = loadSavedToken();
  let tokenSource = 'existing';

  if (token) {
    const valid = validateToken(token);
    box(
      c(A.bGreen, '✔  Token Found'),
      [
        `${c(A.gray, 'Source  :')} ${c(A.bWhite, fs.existsSync(ENV_PATH) ? '.env file' : '.clanker.json')}`,
        `${c(A.gray, 'Preview :')} ${c(A.bYellow, token.slice(0, 10) + '•'.repeat(20) + token.slice(-6))}`,
        `${c(A.gray, 'Valid   :')} ${valid ? c(A.bGreen, 'YES ✔') : c(A.bRed, 'FORMAT WARNING ⚠')}`,
      ],
      A.bGreen,
      58
    );

    const action = await menu('What do you want to do?', [
      { label: '🚀  Launch Bot with saved token', hint: '(recommended)', value: 'launch'   },
      { label: '🗂️   Project Explorer',           hint: 'browse files, export, git...', value: 'explorer' },
      { label: '🔄  Enter a new token',           hint: '',             value: 'new'      },
      { label: '🗑️   Clear saved token',          hint: '',             value: 'clear'    },
      { label: '❌  Exit',                         hint: '',             value: 'exit'     },
    ]);

    if (action === 'exit') {
      console.log(c(A.gray, '\n  Goodbye! 👋\n'));
      process.exit(0);
    }

    if (action === 'explorer') {
      const explorerPath = path.join(APP_ROOT, 'explorer.js');
      if (!fs.existsSync(explorerPath)) {
        console.log(c(A.bRed, '\n  ✘ explorer.js not found. Make sure it is in the project folder.\n'));
      } else {
        const explorerProc = spawn(process.execPath, [explorerPath, APP_ROOT], {
          cwd: APP_ROOT,
          env: { ...process.env, FORCE_COLOR: '1' },
          stdio: 'inherit',
        });
        await new Promise(resolve => explorerProc.on('exit', resolve));
      }
      return main();
    }

    if (action === 'clear') {
      if (fs.existsSync(ENV_PATH)) {
        let content = fs.readFileSync(ENV_PATH, 'utf8');
        content = content.replace(/^TOKEN\s*=.*/m, 'TOKEN=');
        fs.writeFileSync(ENV_PATH, content);
      }
      if (fs.existsSync(CONF_PATH)) {
        const conf = JSON.parse(fs.readFileSync(CONF_PATH, 'utf8'));
        delete conf.token;
        fs.writeFileSync(CONF_PATH, JSON.stringify(conf, null, 2));
      }
      console.log(c(A.bGreen, '\n  ✔ Token cleared successfully.\n'));
      token = null;
    }

    if (action === 'new') token = null;
  }

  // ── New token input ──
  if (!token) {
    console.log('');
    box(
      c(A.bYellow, '🔑  Token Setup'),
      [
        c(A.gray, 'Go to: discord.com/developers/applications'),
        c(A.gray, 'Bot → Reset Token → Copy'),
        '',
        c(A.dim, 'Your token is hidden while typing.'),
        c(A.dim, 'It will be saved securely in .env'),
      ],
      A.bYellow,
      58
    );
    console.log('');

    let tries = 0;
    while (!token) {
      tries++;
      if (tries > 3) {
        console.log(c(A.bRed, '\n  ✘ Too many invalid attempts. Exiting.\n'));
        process.exit(1);
      }

      const input = await secureInput('Paste your Discord Bot Token');

      if (!input) {
        console.log(c(A.bRed, '  ✘ Token cannot be empty.\n'));
        continue;
      }

      if (!validateToken(input)) {
        console.log(c(A.bRed, '  ⚠ Token format looks wrong. Try again.\n'));
        // Still allow it — might be a new Discord format
      }

      token = input;
    }

    // ── Save preference ──
    const saveMethod = await menu('Where to save your token?', [
      { label: '📄  Save to .env file',      hint: '(recommended)', value: 'env'  },
      { label: '📋  Save to .clanker.json',  hint: '',              value: 'json' },
      { label: '⚡  Use only this session',  hint: '(no save)',     value: 'none' },
    ]);

    if (saveMethod !== 'none') {
      saveToken(token, saveMethod);
      console.log(c(A.bGreen, `  ✔ Token saved to ${saveMethod === 'env' ? '.env' : '.clanker.json'}\n`));
    }

    tokenSource = 'new';
  }

  // ── Write token to env for the bot process ──
  process.env.TOKEN = token;

  // ── Launch sequence ──
  console.log('');
  console.log(line('─', A.bCyan));
  console.log(c(A.bCyan, '\n  🚀  Initializing Clanker 2.0...\n'));

  await fakeLoading('Loading modules',      15);
  await fakeLoading('Validating token',     10);
  await fakeLoading('Connecting to Gateway', 18);

  console.log('');
  console.log(line('─', A.bCyan));
  console.log('');

  // ── Spawn bot process ──
  const botPath = path.join(APP_ROOT, 'index.js');
  if (!fs.existsSync(botPath)) {
    console.log(c(A.bRed, `  ✘ index.js not found at: ${botPath}\n`));
    process.exit(1);
  }

  const botProc = spawn(process.execPath, [botPath], {
    cwd: APP_ROOT,
    env: { ...process.env, TOKEN: token, FORCE_COLOR: '1' },
    stdio: 'inherit',
  });

  botProc.on('error', err => {
    console.log(c(A.bRed, `\n  ✘ Failed to start bot: ${err.message}\n`));
    process.exit(1);
  });

  botProc.on('exit', (code, signal) => {
    console.log('');
    console.log(line('═', A.bRed));
    if (code === 0) {
      console.log(c(A.bGreen, '\n  ✔ Bot exited cleanly.\n'));
    } else {
      console.log(c(A.bRed, `\n  ✘ Bot exited with code ${code} / signal ${signal}\n`));
    }
    console.log(line('═', A.bRed));
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    console.log(c(A.bYellow, '\n\n  ⚠  Shutting down Clanker 2.0...\n'));
    botProc.kill('SIGINT');
  });
}

main().catch(err => {
  console.error(c(A.bRed, `\n  ✘ Fatal error: ${err.message}\n`));
  process.exit(1);
});
