#!/usr/bin/env node
'use strict';

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execSync, exec } = require('child_process');
const readline = require('readline');
const zlib    = require('zlib');

// ═══════════════════════════════════════════════
//   ANSI ENGINE
// ═══════════════════════════════════════════════
const A = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', italic: '\x1b[3m', underline: '\x1b[4m',
  black: '\x1b[30m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m', gray: '\x1b[90m',
  bRed: '\x1b[91m', bGreen: '\x1b[92m', bYellow: '\x1b[93m', bBlue: '\x1b[94m',
  bMagenta: '\x1b[95m', bCyan: '\x1b[96m', bWhite: '\x1b[97m',
  bgBlack: '\x1b[40m', bgRed: '\x1b[41m', bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m', bgCyan: '\x1b[46m', bgGray: '\x1b[100m',
};

function asciiText(value) {
  return String(value ?? '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '')
    .replace(/[ \t]+/g, ' ');
}

const cl    = (a, t) => `${a}${asciiText(t)}${A.reset}`;
const strip = s => asciiText(String(s).replace(/\x1b\[[0-9;]*m/g, ''));
const W     = () => { try { return Math.min(process.stdout.columns || 90, 130); } catch { return 90; } };
const clear = () => process.stdout.write('\x1bc');

// ═══════════════════════════════════════════════
//   FILE TYPE ICONS & COLORS
// ═══════════════════════════════════════════════
const FILE_ICONS = {
  // JavaScript
  '.js':   { icon: '󰌞', color: A.bYellow  },
  '.mjs':  { icon: '󰌞', color: A.bYellow  },
  '.cjs':  { icon: '󰌞', color: A.bYellow  },
  '.ts':   { icon: '󰛦', color: A.bBlue    },
  '.tsx':  { icon: '󰛦', color: A.bBlue    },
  '.jsx':  { icon: '󰜈', color: A.bCyan    },
  // Config
  '.json': { icon: '󰘦', color: A.bGreen   },
  '.env':  { icon: '󰒔', color: A.bGreen   },
  '.yaml': { icon: '󰈙', color: A.bRed     },
  '.yml':  { icon: '󰈙', color: A.bRed     },
  '.toml': { icon: '󰈙', color: A.bRed     },
  // Docs
  '.md':   { icon: '󰍔', color: A.white    },
  '.txt':  { icon: '󰈙', color: A.gray     },
  '.pdf':  { icon: '󰈦', color: A.bRed     },
  // Web
  '.html': { icon: '󰌝', color: A.bRed     },
  '.css':  { icon: '󰌜', color: A.bBlue    },
  '.scss': { icon: '󰌜', color: A.bMagenta },
  // Scripts
  '.sh':   { icon: '', color: A.bGreen   },
  '.bat':  { icon: '', color: A.bCyan    },
  '.ps1':  { icon: '', color: A.bBlue    },
  // Archives
  '.zip':  { icon: '󰛫', color: A.bYellow  },
  '.tar':  { icon: '󰛫', color: A.bYellow  },
  '.gz':   { icon: '󰛫', color: A.bYellow  },
  // Images
  '.png':  { icon: '󰈟', color: A.bMagenta },
  '.jpg':  { icon: '󰈟', color: A.bMagenta },
  '.svg':  { icon: '󰜡', color: A.bYellow  },
  '.gif':  { icon: '󰈟', color: A.bMagenta },
  // Lock / special
  '.lock': { icon: '󰌾', color: A.gray     },
  '.log':  { icon: '󰌒', color: A.gray     },
};

const DIR_COLORS = {
  'node_modules' : A.gray,
  '.git'         : A.gray,
  'dist'         : A.bYellow,
  'build'        : A.bYellow,
  'src'          : A.bCyan,
  'commands'     : A.bBlue,
  'events'       : A.bGreen,
  'handlers'     : A.bMagenta,
  'utils'        : A.bCyan,
  'config'       : A.bRed,
  'models'       : A.bYellow,
  'middleware'   : A.bMagenta,
};

function fileIcon(name, isDir) {
  if (isDir) {
    const dc = DIR_COLORS[name] || A.bBlue;
    return { icon: '󰉋', color: dc };
  }
  const ext = path.extname(name).toLowerCase();
  return FILE_ICONS[ext] || { icon: '󰈙', color: A.white };
}

// Syntax highlighting (basic)
function syntaxHighlight(line, ext) {
  if (!['.js','.mjs','.cjs','.ts','.jsx','.tsx'].includes(ext)) return cl(A.white, line);

  return line
    // strings
    .replace(/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g, m => cl(A.bGreen, m))
    // keywords
    .replace(/\b(const|let|var|function|async|await|return|if|else|for|while|class|new|import|export|require|module|try|catch|throw|typeof|instanceof|null|undefined|true|false|this|super|extends|from|of|in)\b/g,
             m => cl(A.bMagenta, m))
    // numbers
    .replace(/\b(\d+(\.\d+)?)\b/g, m => cl(A.bYellow, m))
    // comments
    .replace(/(\/\/.*$|\/\*[\s\S]*?\*\/)/g, m => cl(A.gray + A.italic, m))
    // function calls
    .replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, m => cl(A.bBlue, m))
    // brackets / operators
    .replace(/([{}[\]()=><+\-*/%&|^~!?:,;.])/g, m => cl(A.bCyan, m));
}

// ═══════════════════════════════════════════════
//   HELPERS
// ═══════════════════════════════════════════════
function fmtSize(bytes) {
  if (bytes < 1024)       return `${bytes}B`;
  if (bytes < 1048576)    return `${(bytes/1024).toFixed(1)}KB`;
  if (bytes < 1073741824) return `${(bytes/1048576).toFixed(1)}MB`;
  return `${(bytes/1073741824).toFixed(1)}GB`;
}

function fmtDate(d) {
  return new Date(d).toLocaleString();
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch { return 0; }
}

function isText(filePath) {
  const textExts = ['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.md','.txt','.env',
                    '.yaml','.yml','.toml','.html','.css','.scss','.sh','.bat','.ps1',
                    '.gitignore','.log','.lock','.xml','.svg','.ini','.cfg'];
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  return textExts.includes(ext) || ['.env','dockerfile','makefile','readme'].some(k => base.includes(k));
}

// IGNORE LIST
const IGNORE = new Set([
  'node_modules', '.git', '.DS_Store', 'Thumbs.db',
  '__pycache__', '.pytest_cache', 'dist', 'build',
  'coverage', '.nyc_output', '.cache',
]);

// ═══════════════════════════════════════════════
//   BOX / DIVIDER
// ═══════════════════════════════════════════════
function box(title, lines, accent = A.bCyan, width = 60) {
  const iW  = width - 2;
  const top = '╔' + '═'.repeat(iW) + '╗';
  const bot = '╚' + '═'.repeat(iW) + '╝';
  const mid = '╠' + '═'.repeat(iW) + '╣';
  const tPad = Math.max(0, Math.floor((iW - strip(title).length) / 2));
  const titleRow = '║' + ' '.repeat(tPad) + title + ' '.repeat(Math.max(0, iW - tPad - strip(title).length)) + '║';

  console.log(cl(accent, top));
  console.log(cl(accent, titleRow));
  console.log(cl(accent, mid));
  lines.forEach(ln => {
    const sLen = strip(ln).length;
    const pad  = Math.max(0, iW - 2 - sLen);
    console.log(cl(accent, '║') + ' ' + ln + ' '.repeat(pad) + ' ' + cl(accent, '║'));
  });
  console.log(cl(accent, bot));
}

function divider(label = '', accent = A.bCyan) {
  const w   = W();
  const txt = label ? ` ${label} ` : '';
  const side = Math.floor((w - strip(txt).length) / 2);
  console.log(cl(accent, '─'.repeat(side)) + cl(A.bold + A.bWhite, txt) + cl(accent, '─'.repeat(Math.max(0, w - side - strip(txt).length))));
}

function header(title, subtitle = '') {
  const w = W();
  console.log('\n' + cl(A.bCyan, '═'.repeat(w)));
  const t = ` 🗂️  ${title} `;
  const tPad = Math.max(0, Math.floor((w - strip(t).length) / 2));
  console.log(' '.repeat(tPad) + cl(A.bold + A.bCyan, t));
  if (subtitle) {
    const sPad = Math.max(0, Math.floor((w - strip(subtitle).length) / 2));
    console.log(' '.repeat(sPad) + cl(A.gray, subtitle));
  }
  console.log(cl(A.bCyan, '═'.repeat(w)) + '\n');
}

// ═══════════════════════════════════════════════
//   MENU SELECTOR
// ═══════════════════════════════════════════════
async function menu(prompt, choices, showBack = false) {
  const all = showBack
    ? [...choices, { label: cl(A.gray, '← Back'), value: '__back__', hint: '' }]
    : choices;

  return new Promise(resolve => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.log(cl(A.bRed, '\n  Project Explorer requires an interactive terminal.\n'));
      resolve('exit');
      return;
    }

    let selected = 0;

    const render = () => {
      process.stdout.write('\x1b[?25l');
      all.forEach((ch, i) => {
        const isSelected = i === selected;
        const prefix  = isSelected ? `  ${cl(A.bCyan + A.bold, '▶')} ` : '    ';
        const label   = isSelected ? cl(A.bWhite + A.bold, strip(ch.label)) : cl(A.gray, strip(ch.label));
        const hint    = ch.hint ? cl(A.dim, `  ${ch.hint}`) : '';
        process.stdout.write(prefix + label + hint + '\n');
      });
      process.stdout.write(`\x1b[${all.length}A`);
    };

    console.log(cl(A.bCyan + A.bold, `\n  ${prompt}`));
    console.log(cl(A.gray, '  ↑ ↓ navigate  •  Enter select  •  Ctrl+C quit\n'));
    render();

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    const onKey = (_, key) => {
      if (!key) return;
      if (key.name === 'up')    { selected = (selected - 1 + all.length) % all.length; render(); }
      if (key.name === 'down')  { selected = (selected + 1) % all.length; render(); }
      if (key.name === 'return') {
        process.stdin.removeListener('keypress', onKey);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdout.write(`\x1b[${all.length}B\x1b[?25h\n`);
        resolve(all[selected].value);
      }
      if (key.name === 'c' && key.ctrl) { process.stdout.write('\x1b[?25h\n'); process.exit(0); }
    };
    process.stdin.on('keypress', onKey);
  });
}

// simple text input
async function prompt(question, def = '') {
  return new Promise(resolve => {
    const hint = def ? cl(A.gray, ` (default: ${def})`) : '';
    process.stdout.write(`  ${cl(A.bYellow, '›')} ${cl(A.bWhite, question)}${hint}: `);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.on('line', ans => {
      rl.close();
      resolve(ans.trim() || def);
    });
  });
}

// press any key
async function pressAny(msg = 'Press any key to continue...') {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) {
      console.log('');
      resolve();
      return;
    }

    process.stdout.write(cl(A.gray, `\n  ${msg}`));
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    const onKey = () => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write('\n');
      resolve();
    };
    process.stdin.once('keypress', onKey);
  });
}

// spinner
function spinner(text) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const iv = setInterval(() => {
    process.stdout.write(`\r  ${cl(A.bCyan, frames[i++ % frames.length])} ${cl(A.gray, text)}   `);
  }, 80);
  return {
    succeed: m => { clearInterval(iv); process.stdout.write(`\r  ${cl(A.bGreen, '✔')} ${cl(A.bWhite, m)}\n`); },
    fail:    m => { clearInterval(iv); process.stdout.write(`\r  ${cl(A.bRed,   '✘')} ${cl(A.bRed,   m)}\n`); },
    update:  m => { process.stdout.write(`\r  ${cl(A.bCyan, frames[i % frames.length])} ${cl(A.gray, m)}   `); },
    stop:    ()=> { clearInterval(iv); process.stdout.write('\r' + ' '.repeat(60) + '\r'); },
  };
}

// ═══════════════════════════════════════════════
//   TREE SCANNER
// ═══════════════════════════════════════════════
function scanDir(dirPath, ignore = IGNORE) {
  const result = { dirs: 0, files: 0, totalSize: 0, lines: 0, byExt: {} };

  function walk(p) {
    let entries;
    try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }

    for (const e of entries) {
      if (ignore.has(e.name)) continue;
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        result.dirs++;
        walk(full);
      } else {
        result.files++;
        try {
          const stat = fs.statSync(full);
          result.totalSize += stat.size;
          const ext = path.extname(e.name).toLowerCase() || 'no-ext';
          result.byExt[ext] = (result.byExt[ext] || 0) + 1;
          if (isText(full)) result.lines += countLines(full);
        } catch {}
      }
    }
  }
  walk(dirPath);
  return result;
}

// ═══════════════════════════════════════════════
//   1. PROJECT STRUCTURE TREE
// ═══════════════════════════════════════════════
function printTree(dirPath, prefix = '', isLast = true, depth = 0, maxDepth = 6, ignore = IGNORE) {
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return; }

  // Sort: dirs first, then files, both alphabetically
  entries = entries
    .filter(e => !ignore.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  entries.forEach((e, i) => {
    const last     = i === entries.length - 1;
    const branch   = last ? '└── ' : '├── ';
    const newPfx   = prefix + (last ? '    ' : '│   ');
    const full     = path.join(dirPath, e.name);
    const isDir    = e.isDirectory();
    const { icon, color } = fileIcon(e.name, isDir);

    let meta = '';
    if (!isDir) {
      try {
        const stat  = fs.statSync(full);
        const lines = isText(full) ? ` ${countLines(full)}L` : '';
        meta = cl(A.dim, ` ${fmtSize(stat.size)}${lines}`);
      } catch {}
    }

    const nameStr = isDir
      ? cl(color + A.bold, e.name + '/')
      : cl(color, e.name);

    console.log(
      cl(A.gray, prefix + branch) +
      cl(color, icon + ' ') +
      nameStr +
      meta
    );

    if (isDir && depth < maxDepth) {
      printTree(full, newPfx, last, depth + 1, maxDepth, ignore);
    } else if (isDir && depth >= maxDepth) {
      console.log(cl(A.gray, newPfx + '└── ') + cl(A.dim, '...'));
    }
  });
}

async function viewStructure(projectPath) {
  clear();
  header('PROJECT STRUCTURE', projectPath);

  const sp = spinner('Scanning project...');
  const stats = scanDir(projectPath);
  sp.succeed('Scan complete');

  // Summary cards
  console.log('');
  const w = W();
  const cards = [
    { label: 'Directories', value: stats.dirs,              color: A.bBlue    },
    { label: 'Files',       value: stats.files,             color: A.bCyan    },
    { label: 'Total Size',  value: fmtSize(stats.totalSize), color: A.bGreen   },
    { label: 'Lines Code',  value: stats.lines,             color: A.bYellow  },
  ];
  const cW = Math.floor((w - cards.length - 1) / cards.length);
  const top    = cards.map(() => cl(A.bCyan, '╔' + '═'.repeat(cW - 2) + '╗')).join('');
  const vals   = cards.map(c => {
    const v = String(c.value); const p = Math.max(0, Math.floor((cW - 2 - v.length) / 2));
    return cl(A.bCyan,'║') + ' '.repeat(p) + cl(A.bold + c.color, v) + ' '.repeat(Math.max(0, cW - 2 - p - v.length)) + cl(A.bCyan,'║');
  }).join('');
  const lbls   = cards.map(c => {
    const l = c.label; const p = Math.max(0, Math.floor((cW - 2 - l.length) / 2));
    return cl(A.bCyan,'║') + ' '.repeat(p) + cl(A.gray, l) + ' '.repeat(Math.max(0, cW - 2 - p - l.length)) + cl(A.bCyan,'║');
  }).join('');
  const bot    = cards.map(() => cl(A.bCyan, '╚' + '═'.repeat(cW - 2) + '╝')).join('');
  console.log(top); console.log(vals); console.log(lbls); console.log(bot);

  // File type breakdown
  if (Object.keys(stats.byExt).length > 0) {
    console.log('');
    divider('File Types', A.bCyan);
    const sorted = Object.entries(stats.byExt).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxCount = sorted[0][1];
    sorted.forEach(([ext, count]) => {
      const barW = Math.round((count / maxCount) * 30);
      const { color } = FILE_ICONS[ext] || { color: A.gray };
      const bar = cl(color, '█'.repeat(barW)) + cl(A.dim, '░'.repeat(30 - barW));
      console.log(`  ${cl(color, (ext || 'no-ext').padEnd(10))} [${bar}] ${cl(A.bWhite, count)}`);
    });
  }

  // Tree
  console.log('');
  divider('Directory Tree', A.bCyan);
  console.log('');

  const rootName = path.basename(projectPath);
  const { color } = fileIcon(rootName, true);
  console.log(cl(color + A.bold, `󰉋 ${rootName}/`));
  printTree(projectPath);

  console.log('');
  await pressAny();
}

// ═══════════════════════════════════════════════
//   2. FILE VIEWER
// ═══════════════════════════════════════════════
function getAllFiles(dirPath, ignore = IGNORE, rel = '') {
  const result = [];
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return result; }

  entries
    .filter(e => !ignore.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })
    .forEach(e => {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      const full    = path.join(dirPath, e.name);
      if (e.isDirectory()) {
        result.push(...getAllFiles(full, ignore, relPath));
      } else {
        result.push({ name: e.name, rel: relPath, full, isText: isText(full) });
      }
    });
  return result;
}

async function viewFileContents(projectPath) {
  while (true) {
    clear();
    header('FILE VIEWER', 'Browse and read files in your project');

    const sp = spinner('Scanning files...');
    const files = getAllFiles(projectPath);
    sp.succeed(`Found ${files.length} files`);
    console.log('');

    if (files.length === 0) {
      console.log(cl(A.bRed, '  No files found.'));
      await pressAny();
      return;
    }

    // Build menu choices
    const choices = files.map(f => {
      const { icon, color } = fileIcon(f.name, false);
      const size = (() => { try { return fmtSize(fs.statSync(f.full).size); } catch { return '?'; } })();
      return {
        label : `${cl(color, icon + ' ')}${cl(A.bWhite, f.rel.padEnd(50))}${cl(A.gray, size)}`,
        value : f,
        hint  : '',
      };
    });
    choices.push({ label: cl(A.gray, '← Main Menu'), value: '__back__', hint: '' });

    const chosen = await menu('Select a file to view:', choices);
    if (chosen === '__back__') return;

    await readFile(chosen);
  }
}

async function readFile(file) {
  clear();
  header(`FILE VIEWER`, file.rel);

  if (!file.isText) {
    box(
      cl(A.bYellow, '⚠  Binary File'),
      [
        cl(A.gray, 'This file is not text-readable.'),
        '',
        `${cl(A.gray, 'Path :')} ${cl(A.bWhite, file.full)}`,
        `${cl(A.gray, 'Size :')} ${cl(A.bWhite, fmtSize(fs.statSync(file.full).size))}`,
      ],
      A.bYellow, 60
    );
    await pressAny();
    return;
  }

  let content;
  try { content = fs.readFileSync(file.full, 'utf8'); }
  catch (e) {
    console.log(cl(A.bRed, `  ✘ Cannot read file: ${e.message}`));
    await pressAny();
    return;
  }

  const lines  = content.split('\n');
  const ext    = path.extname(file.name).toLowerCase();
  const stat   = fs.statSync(file.full);
  const w      = W();

  // File metadata
  const metaItems = [
    `${cl(A.gray,'Path')}  ${cl(A.bWhite, file.full)}`,
    `${cl(A.gray,'Size')}  ${cl(A.bYellow, fmtSize(stat.size))}   ` +
    `${cl(A.gray,'Lines')} ${cl(A.bYellow, lines.length)}   ` +
    `${cl(A.gray,'Modified')} ${cl(A.bWhite, fmtDate(stat.mtime))}`,
  ];
  metaItems.forEach(m => console.log('  ' + m));
  console.log('');
  divider('', A.bCyan);

  // Line number width
  const lnW = String(lines.length).length;

  // Render with syntax highlighting + line numbers
  const maxLines = 300; // show first 300 lines max in terminal
  const shown = lines.slice(0, maxLines);

  shown.forEach((rawLine, i) => {
    const lineNum = cl(A.dim, String(i + 1).padStart(lnW) + ' │ ');
    const highlighted = syntaxHighlight(rawLine, ext);
    // Truncate very long lines
    const stripped = strip(highlighted);
    const display  = stripped.length > w - lnW - 6
      ? highlighted.slice(0, w - lnW - 6) + cl(A.gray, '…')
      : highlighted;
    console.log(lineNum + display);
  });

  if (lines.length > maxLines) {
    console.log('');
    console.log(cl(A.bYellow, `  … ${lines.length - maxLines} more lines not shown (file has ${lines.length} total)`));
  }

  divider('', A.bCyan);
  console.log('');

  // Action sub-menu
  const action = await menu('What to do with this file?', [
    { label: '🔍  Search in file',          value: 'search', hint: '' },
    { label: '📊  File statistics',         value: 'stats',  hint: '' },
    { label: '📋  Copy path to clipboard',  value: 'copy',   hint: '' },
    { label: '📁  Open containing folder',  value: 'folder', hint: '' },
    { label: '← Back to file list',        value: '__back__', hint: '' },
  ]);

  if (action === '__back__') return;
  if (action === 'search')  await searchInFile(file, lines);
  if (action === 'stats')   await fileStats(file, content, lines, ext);
  if (action === 'copy')    copyToClipboard(file.full);
  if (action === 'folder')  openFolder(path.dirname(file.full));

  await pressAny();
}

async function searchInFile(file, lines) {
  console.log('');
  const query = await prompt('Search term (case-insensitive)');
  if (!query) return;

  const results = [];
  lines.forEach((line, i) => {
    const idx = line.toLowerCase().indexOf(query.toLowerCase());
    if (idx !== -1) results.push({ lineNum: i + 1, line, idx, query });
  });

  console.log('');
  divider(`Search: "${query}" — ${results.length} matches`, A.bYellow);

  if (results.length === 0) {
    console.log(cl(A.bRed, '  No matches found.'));
    return;
  }

  const lnW = String(lines.length).length;
  results.slice(0, 50).forEach(r => {
    const before = r.line.slice(0, r.idx);
    const match  = r.line.slice(r.idx, r.idx + query.length);
    const after  = r.line.slice(r.idx + query.length);
    const lineNum = cl(A.dim, String(r.lineNum).padStart(lnW) + ' │ ');
    console.log(lineNum + cl(A.white, before) + cl(A.bYellow + A.bold, match) + cl(A.white, after));
  });

  if (results.length > 50) {
    console.log(cl(A.gray, `  … and ${results.length - 50} more matches`));
  }
}

async function fileStats(file, content, lines, ext) {
  console.log('');
  divider('File Statistics', A.bCyan);

  const words     = content.split(/\s+/).filter(Boolean).length;
  const chars     = content.length;
  const emptyLines = lines.filter(l => l.trim() === '').length;
  const codeLines  = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;
  const commentL   = lines.filter(l => l.trim().startsWith('//')).length;
  const avgLen     = lines.length > 0 ? Math.round(chars / lines.length) : 0;
  const longest    = Math.max(...lines.map(l => l.length));

  const statsData = [
    ['Total Lines',   lines.length],
    ['Code Lines',    codeLines],
    ['Comment Lines', commentL],
    ['Empty Lines',   emptyLines],
    ['Total Words',   words],
    ['Total Chars',   chars],
    ['Avg Line Len',  avgLen],
    ['Longest Line',  longest],
    ['File Type',     ext || 'unknown'],
  ];

  statsData.forEach(([k, v]) => {
    console.log(`  ${cl(A.bCyan, k.padEnd(18))} ${cl(A.bWhite, v)}`);
  });
}

function copyToClipboard(text) {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      execSync(`echo ${text} | clip`);
    } else if (platform === 'darwin') {
      execSync(`echo '${text}' | pbcopy`);
    } else {
      execSync(`echo '${text}' | xclip -selection clipboard 2>/dev/null || echo '${text}' | xsel --clipboard 2>/dev/null`);
    }
    console.log(cl(A.bGreen, '\n  ✔ Path copied to clipboard!'));
  } catch {
    console.log(cl(A.bYellow, `\n  Path: ${text}`));
    console.log(cl(A.gray,   '  (Copy manually — clipboard not available)'));
  }
}

function openFolder(folderPath) {
  try {
    const platform = process.platform;
    if (platform === 'win32')       execSync(`explorer "${folderPath}"`);
    else if (platform === 'darwin') execSync(`open "${folderPath}"`);
    else                            execSync(`xdg-open "${folderPath}" 2>/dev/null`);
    console.log(cl(A.bGreen, '\n  ✔ Folder opened!'));
  } catch {
    console.log(cl(A.gray, `\n  Folder: ${folderPath}`));
  }
}

// ═══════════════════════════════════════════════
//   3. PROJECT EXPORT / DOWNLOAD
// ═══════════════════════════════════════════════

// Pure Node.js ZIP writer (no external deps)
function writeZip(sourceDir, destPath, ignore = IGNORE) {
  // We'll use tar format if zip not available, fallback to manual copy
  // Try system zip first
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      // PowerShell Compress-Archive
      const ignorePatterns = [...ignore].join('|');
      execSync(
        `powershell -Command "Get-ChildItem '${sourceDir}' -Recurse | Where-Object { $_.FullName -notmatch '(${ignorePatterns})' } | Compress-Archive -DestinationPath '${destPath}' -Force"`,
        { stdio: 'pipe' }
      );
    } else {
      // Unix zip with exclusions
      const excludes = [...ignore].map(d => `--exclude='./${d}/*' --exclude='./${d}'`).join(' ');
      execSync(
        `cd '${sourceDir}' && zip -r '${destPath}' . ${excludes} -x "*.zip" 2>/dev/null`,
        { stdio: 'pipe' }
      );
    }
    return { method: 'zip' };
  } catch {
    // Fallback: manual recursive copy
    return manualCopy(sourceDir, destPath.replace('.zip', '_copy'), ignore);
  }
}

function manualCopy(src, dest, ignore = IGNORE) {
  fs.mkdirSync(dest, { recursive: true });

  function copyDir(from, to) {
    let entries;
    try { entries = fs.readdirSync(from, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (ignore.has(e.name)) continue;
      const srcPath  = path.join(from, e.name);
      const destPath = path.join(to, e.name);
      if (e.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyDir(srcPath, destPath);
      } else {
        try { fs.copyFileSync(srcPath, destPath); } catch {}
      }
    }
  }

  copyDir(src, dest);
  return { method: 'copy', dest };
}

async function exportProject(projectPath) {
  clear();
  header('EXPORT PROJECT', 'Package and save your project');

  const projectName = path.basename(projectPath);

  // Scan first
  const sp = spinner('Calculating project size...');
  const stats = scanDir(projectPath);
  sp.succeed('Done');

  console.log('');
  box(
    cl(A.bCyan, '📦  Project Summary'),
    [
      `${cl(A.gray, 'Project  :')} ${cl(A.bWhite, projectName)}`,
      `${cl(A.gray, 'Files    :')} ${cl(A.bYellow, stats.files)}`,
      `${cl(A.gray, 'Dirs     :')} ${cl(A.bYellow, stats.dirs)}`,
      `${cl(A.gray, 'Size     :')} ${cl(A.bYellow, fmtSize(stats.totalSize))}`,
      `${cl(A.gray, 'Lines    :')} ${cl(A.bYellow, stats.lines)}`,
      '',
      cl(A.dim, 'node_modules and .git are excluded automatically'),
    ],
    A.bCyan, 60
  );

  console.log('');

  const action = await menu('Export type:', [
    { label: '📦  ZIP Archive',             value: 'zip',       hint: 'compressed .zip file' },
    { label: '📁  Copy to another folder',  value: 'copy',      hint: 'full folder copy'     },
    { label: '🖥️   Open project in Explorer', value: 'open',    hint: 'open folder directly' },
    { label: '📊  Export structure report', value: 'report',    hint: '.txt tree report'     },
    { label: '← Back',                     value: '__back__',   hint: '' },
  ]);

  if (action === '__back__') return;

  if (action === 'open') {
    openFolder(projectPath);
    await pressAny();
    return;
  }

  if (action === 'zip') {
    const defaultOut = path.join(os.homedir(), 'Desktop', `${projectName}_export.zip`);
    console.log('');
    const outPath = await prompt('Save ZIP to (full path)', defaultOut);
    console.log('');

    const sp2 = spinner('Creating ZIP archive...');
    try {
      const result = writeZip(projectPath, outPath);
      if (result.method === 'zip') {
        sp2.succeed(`ZIP created: ${outPath}`);
        try {
          const zipStat = fs.statSync(outPath);
          console.log(cl(A.gray, `  Size: ${fmtSize(zipStat.size)}`));
        } catch {}
      } else {
        sp2.succeed(`Copied to: ${result.dest}`);
      }
    } catch (e) {
      sp2.fail(`Failed: ${e.message}`);
    }
  }

  if (action === 'copy') {
    const defaultOut = path.join(os.homedir(), 'Desktop', `${projectName}_copy`);
    console.log('');
    const outPath = await prompt('Copy to folder', defaultOut);
    console.log('');

    const sp2 = spinner('Copying project...');
    try {
      manualCopy(projectPath, outPath);
      sp2.succeed(`Copied to: ${outPath}`);
    } catch (e) {
      sp2.fail(`Failed: ${e.message}`);
    }
  }

  if (action === 'report') {
    const defaultOut = path.join(projectPath, 'project-structure.txt');
    console.log('');
    const outPath = await prompt('Save report to', defaultOut);
    console.log('');

    const sp2 = spinner('Generating report...');
    try {
      const lines = [];
      lines.push(`CLANKER 2.0 — PROJECT STRUCTURE REPORT`);
      lines.push(`Generated: ${new Date().toLocaleString()}`);
      lines.push(`Project: ${projectPath}`);
      lines.push(`${'─'.repeat(60)}`);
      lines.push(`Directories : ${stats.dirs}`);
      lines.push(`Files       : ${stats.files}`);
      lines.push(`Total Size  : ${fmtSize(stats.totalSize)}`);
      lines.push(`Lines Code  : ${stats.lines}`);
      lines.push(`${'─'.repeat(60)}`);
      lines.push('');
      lines.push('FILE TYPES:');
      Object.entries(stats.byExt).sort((a,b) => b[1]-a[1]).forEach(([ext, count]) => {
        lines.push(`  ${ext.padEnd(12)} ${count} files`);
      });
      lines.push('');
      lines.push('DIRECTORY TREE:');

      // Build plain tree
      function plainTree(dir, prefix = '') {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        entries = entries.filter(e => !IGNORE.has(e.name)).sort((a,b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });
        entries.forEach((e, i) => {
          const last   = i === entries.length - 1;
          const branch = last ? '└── ' : '├── ';
          const full   = path.join(dir, e.name);
          let meta = '';
          if (!e.isDirectory()) {
            try {
              const s = fs.statSync(full);
              meta = ` (${fmtSize(s.size)})`;
            } catch {}
          }
          lines.push(prefix + branch + e.name + (e.isDirectory() ? '/' : meta));
          if (e.isDirectory()) plainTree(full, prefix + (last ? '    ' : '│   '));
        });
      }

      lines.push(path.basename(projectPath) + '/');
      plainTree(projectPath);

      fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
      sp2.succeed(`Report saved: ${outPath}`);
    } catch (e) {
      sp2.fail(`Failed: ${e.message}`);
    }
  }

  console.log('');
  await pressAny();
}

// ═══════════════════════════════════════════════
//   4. PROJECT STATS DASHBOARD
// ═══════════════════════════════════════════════
async function statsDashboard(projectPath) {
  clear();
  header('PROJECT DASHBOARD', 'Deep statistics and analysis');

  const sp = spinner('Analyzing project...');

  // Deep scan
  const allFiles = getAllFiles(projectPath);
  const totalSize = allFiles.reduce((a, f) => {
    try { return a + fs.statSync(f.full).size; } catch { return a; }
  }, 0);

  const byExt    = {};
  const byFolder = {};
  let totalLines = 0;
  let newestFile = null;
  let oldestFile = null;
  let newestTime = 0;
  let oldestTime = Infinity;

  allFiles.forEach(f => {
    const ext = path.extname(f.name).toLowerCase() || 'no-ext';
    byExt[ext] = (byExt[ext] || 0) + 1;

    const folder = f.rel.split('/').slice(0, 2).join('/');
    byFolder[folder] = (byFolder[folder] || 0) + 1;

    if (f.isText) {
      const lines = countLines(f.full);
      totalLines += lines;
    }

    try {
      const stat = fs.statSync(f.full);
      if (stat.mtimeMs > newestTime) { newestTime = stat.mtimeMs; newestFile = f; }
      if (stat.mtimeMs < oldestTime) { oldestTime = stat.mtimeMs; oldestFile = f; }
    } catch {}
  });

  sp.succeed('Analysis complete');

  // ── Summary ──
  console.log('');
  divider('Overview', A.bCyan);
  const overview = [
    ['Project Path',   projectPath],
    ['Project Name',   path.basename(projectPath)],
    ['Total Files',    allFiles.length],
    ['Total Size',     fmtSize(totalSize)],
    ['Total Lines',    totalLines],
    ['Text Files',     allFiles.filter(f => f.isText).length],
    ['Binary Files',   allFiles.filter(f => !f.isText).length],
    ['Newest File',    newestFile ? `${newestFile.rel} (${fmtDate(newestTime)})` : 'N/A'],
    ['Oldest File',    oldestFile ? `${oldestFile.rel} (${fmtDate(oldestTime)})` : 'N/A'],
  ];
  overview.forEach(([k, v]) => {
    const vStr = String(v);
    const trunc = vStr.length > W() - 30 ? vStr.slice(0, W() - 33) + '…' : vStr;
    console.log(`  ${cl(A.bCyan, k.padEnd(20))} ${cl(A.bWhite, trunc)}`);
  });

  // ── Extension breakdown ──
  console.log('');
  divider('File Types Breakdown', A.bYellow);
  const sortedExt = Object.entries(byExt).sort((a, b) => b[1] - a[1]);
  const maxExtCount = sortedExt[0]?.[1] || 1;
  sortedExt.forEach(([ext, count]) => {
    const { color } = FILE_ICONS[ext] || { color: A.gray };
    const barW = Math.round((count / maxExtCount) * 25);
    const pct  = ((count / allFiles.length) * 100).toFixed(1);
    const bar  = cl(color, '█'.repeat(barW)) + cl(A.dim, '░'.repeat(25 - barW));
    console.log(`  ${cl(color, ext.padEnd(10))} [${bar}] ${cl(A.bWhite, String(count).padStart(4))} files  ${cl(A.gray, pct + '%')}`);
  });

  // ── Largest files ──
  console.log('');
  divider('Top 10 Largest Files', A.bRed);
  const withSizes = allFiles.map(f => {
    try { return { ...f, size: fs.statSync(f.full).size }; } catch { return { ...f, size: 0 }; }
  });
  withSizes.sort((a, b) => b.size - a.size).slice(0, 10).forEach((f, i) => {
    const { color } = fileIcon(f.name, false);
    console.log(`  ${cl(A.gray, String(i + 1).padStart(2) + '.')} ${cl(color, f.rel.padEnd(45))} ${cl(A.bYellow, fmtSize(f.size))}`);
  });

  // ── Most recently modified ──
  console.log('');
  divider('10 Most Recently Modified', A.bGreen);
  withSizes.sort((a, b) => {
    try { return fs.statSync(b.full).mtimeMs - fs.statSync(a.full).mtimeMs; } catch { return 0; }
  }).slice(0, 10).forEach((f, i) => {
    const { color } = fileIcon(f.name, false);
    let mtime = 'N/A';
    try { mtime = fmtDate(fs.statSync(f.full).mtime); } catch {}
    console.log(`  ${cl(A.gray, String(i + 1).padStart(2) + '.')} ${cl(color, f.rel.padEnd(35))} ${cl(A.gray, mtime)}`);
  });

  // ── package.json info ──
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      console.log('');
      divider('package.json Info', A.bMagenta);
      const pkgInfo = [
        ['Name',         pkg.name || 'N/A'],
        ['Version',      pkg.version || 'N/A'],
        ['Description',  pkg.description || 'N/A'],
        ['Main',         pkg.main || 'N/A'],
        ['Author',       typeof pkg.author === 'string' ? pkg.author : pkg.author?.name || 'N/A'],
        ['License',      pkg.license || 'N/A'],
        ['Node Engine',  pkg.engines?.node || 'N/A'],
        ['Scripts',      Object.keys(pkg.scripts || {}).join(', ') || 'None'],
        ['Dependencies', Object.keys(pkg.dependencies || {}).join(', ') || 'None'],
        ['Dev Deps',     Object.keys(pkg.devDependencies || {}).join(', ') || 'None'],
      ];
      pkgInfo.forEach(([k, v]) => {
        const vStr = String(v);
        const trunc = vStr.length > W() - 30 ? vStr.slice(0, W() - 33) + '…' : vStr;
        console.log(`  ${cl(A.bMagenta, k.padEnd(20))} ${cl(A.bWhite, trunc)}`);
      });
    } catch {}
  }

  console.log('');
  await pressAny();
}

// ═══════════════════════════════════════════════
//   5. FIND FILE / SEARCH IN PROJECT
// ═══════════════════════════════════════════════
async function searchProject(projectPath) {
  clear();
  header('PROJECT SEARCH', 'Find files or search content');

  const type = await menu('Search type:', [
    { label: '📄  Find file by name',         value: 'name',    hint: '' },
    { label: '🔍  Search text in all files',  value: 'content', hint: '' },
    { label: '← Back',                        value: '__back__', hint: '' },
  ]);

  if (type === '__back__') return;

  console.log('');
  const query = await prompt(type === 'name' ? 'File name (partial match)' : 'Search text');
  if (!query) return;

  console.log('');
  const sp = spinner(`Searching for "${query}"...`);
  const allFiles = getAllFiles(projectPath);
  const results  = [];

  if (type === 'name') {
    allFiles.forEach(f => {
      if (f.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({ file: f, matches: [] });
      }
    });
  } else {
    allFiles.filter(f => f.isText).forEach(f => {
      try {
        const lines = fs.readFileSync(f.full, 'utf8').split('\n');
        const matches = [];
        lines.forEach((line, i) => {
          if (line.toLowerCase().includes(query.toLowerCase())) {
            matches.push({ lineNum: i + 1, line: line.trim() });
          }
        });
        if (matches.length > 0) results.push({ file: f, matches });
      } catch {}
    });
  }

  sp.succeed(`Found ${results.length} result(s) for "${query}"`);
  console.log('');

  if (results.length === 0) {
    console.log(cl(A.bRed, '  No results found.'));
    await pressAny();
    return;
  }

  divider(`Results (${results.length})`, A.bYellow);
  console.log('');

  results.slice(0, 30).forEach((r, i) => {
    const { icon, color } = fileIcon(r.file.name, false);
    console.log(
      `  ${cl(A.gray, String(i + 1).padStart(2) + '.')} ` +
      cl(color, icon + ' ') +
      cl(A.bWhite + A.bold, r.file.rel)
    );
    r.matches.slice(0, 3).forEach(m => {
      const lineStr = m.line.length > W() - 20 ? m.line.slice(0, W() - 23) + '…' : m.line;
      const highlighted = lineStr.replace(
        new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        match => cl(A.bYellow + A.bold, match)
      );
      console.log(`       ${cl(A.gray, 'Line ' + m.lineNum + ':')} ${highlighted}`);
    });
    if (r.matches.length > 3) {
      console.log(cl(A.gray, `       … +${r.matches.length - 3} more matches in this file`));
    }
    console.log('');
  });

  if (results.length > 30) {
    console.log(cl(A.gray, `  … and ${results.length - 30} more results`));
  }

  await pressAny();
}

// ═══════════════════════════════════════════════
//   6. GIT INFO (if .git exists)
// ═══════════════════════════════════════════════
async function gitInfo(projectPath) {
  clear();
  header('GIT INFO', 'Repository status and history');

  const gitDir = path.join(projectPath, '.git');
  if (!fs.existsSync(gitDir)) {
    box(
      cl(A.bYellow, '⚠  No Git Repository'),
      [
        cl(A.gray, 'This project has no .git directory.'),
        '',
        cl(A.dim, 'Run: git init'),
      ],
      A.bYellow, 50
    );
    await pressAny();
    return;
  }

  const run = cmd => {
    try { return execSync(cmd, { cwd: projectPath, stdio: 'pipe' }).toString().trim(); }
    catch { return 'N/A'; }
  };

  const sp = spinner('Fetching git info...');

  const branch    = run('git branch --show-current');
  const remote    = run('git remote get-url origin');
  const status    = run('git status --short');
  const lastCommit = run('git log -1 --pretty=format:"%h — %s — %an — %ar"');
  const commitCount = run('git rev-list --count HEAD');
  const tags      = run('git tag | tail -5');
  const stash     = run('git stash list | wc -l').trim();

  sp.succeed('Done');
  console.log('');

  divider('Repository Info', A.bGreen);
  const gitData = [
    ['Branch',        branch],
    ['Remote Origin', remote],
    ['Total Commits', commitCount],
    ['Last Commit',   lastCommit],
    ['Stash Entries', stash],
    ['Recent Tags',   tags || 'None'],
  ];
  gitData.forEach(([k, v]) => {
    const vStr = String(v);
    const trunc = vStr.length > W() - 25 ? vStr.slice(0, W() - 28) + '…' : vStr;
    console.log(`  ${cl(A.bGreen, k.padEnd(18))} ${cl(A.bWhite, trunc)}`);
  });

  if (status && status !== 'N/A') {
    console.log('');
    divider('Working Tree Status', A.bYellow);
    if (status.trim() === '') {
      console.log(cl(A.bGreen, '  ✔ Clean — nothing to commit'));
    } else {
      status.split('\n').forEach(line => {
        const code = line.slice(0, 2).trim();
        const file = line.slice(3);
        const color = code === 'M' ? A.bYellow : code === '?' ? A.gray : code === 'D' ? A.bRed : A.bGreen;
        const label = code === 'M' ? 'modified' : code === '??' ? 'untracked' : code === 'D' ? 'deleted' : code === 'A' ? 'added' : code;
        console.log(`  ${cl(color, label.padEnd(12))} ${cl(A.bWhite, file)}`);
      });
    }
  }

  // Last 10 commits
  const log = run('git log --oneline -10');
  if (log && log !== 'N/A') {
    console.log('');
    divider('Last 10 Commits', A.bCyan);
    log.split('\n').forEach(line => {
      const [hash, ...rest] = line.split(' ');
      console.log(`  ${cl(A.bYellow, hash)} ${cl(A.white, rest.join(' '))}`);
    });
  }

  console.log('');
  await pressAny();
}

// ═══════════════════════════════════════════════
//   BANNER
// ═══════════════════════════════════════════════
function printBanner() {
  const w = W();
  console.log(cl(A.bCyan, '═'.repeat(w)));
  const logo = [
    '  ██████╗██╗      █████╗ ███╗   ██╗██╗  ██╗███████╗██████╗ ',
    ' ██╔════╝██║     ██╔══██╗████╗  ██║██║ ██╔╝██╔════╝██╔══██╗',
    ' ██║     ██║     ███████║██╔██╗ ██║█████╔╝ █████╗  ██████╔╝',
    ' ██║     ██║     ██╔══██║██║╚██╗██║██╔═██╗ ██╔══╝  ██╔══██╗',
    ' ╚██████╗███████╗██║  ██║██║ ╚████║██║  ██╗███████╗██║  ██║',
    '  ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝',
  ];
  logo.forEach(row => {
    const pad = Math.max(0, Math.floor((w - row.length) / 2));
    console.log(' '.repeat(pad) + cl(A.bCyan, row));
  });
  const sub = '━━━━━━━━━━━━ 2.0 • Explorer ━━━━━━━━━━━━';
  const spad = Math.max(0, Math.floor((w - sub.length) / 2));
  console.log(' '.repeat(spad) + cl(A.bold + A.bMagenta, sub));
  console.log(cl(A.bCyan, '═'.repeat(w)));
}

// ═══════════════════════════════════════════════
//   MAIN MENU
// ═══════════════════════════════════════════════
// ASCII-safe presentation overrides for terminals that do not render Unicode well.
function fileIcon(name, isDir) {
  const ext = path.extname(name).toLowerCase();
  if (isDir) return { icon: '[DIR]', color: DIR_COLORS[name] || A.bBlue };
  const known = FILE_ICONS[ext];
  return { icon: ext ? '[FILE]' : '[TXT]', color: known?.color || A.white };
}

function box(title, lines, accent = A.bCyan, width = 60) {
  const iW = width - 2;
  const cleanTitle = strip(title).trim();
  const top = '+' + '-'.repeat(iW) + '+';
  const mid = '+' + '-'.repeat(iW) + '+';
  const bot = '+' + '-'.repeat(iW) + '+';
  const tPad = Math.max(0, Math.floor((iW - cleanTitle.length) / 2));
  const titleRow = '|' + ' '.repeat(tPad) + cleanTitle + ' '.repeat(Math.max(0, iW - tPad - cleanTitle.length)) + '|';

  console.log(cl(accent, top));
  console.log(cl(accent, titleRow));
  console.log(cl(accent, mid));
  lines.forEach((ln) => {
    const text = strip(ln);
    const pad = Math.max(0, iW - 2 - text.length);
    console.log(cl(accent, '|') + ' ' + text + ' '.repeat(pad) + ' ' + cl(accent, '|'));
  });
  console.log(cl(accent, bot));
}

function divider(label = '', accent = A.bCyan) {
  const w = W();
  const txt = label ? ` ${strip(label).trim()} ` : '';
  const side = Math.max(0, Math.floor((w - txt.length) / 2));
  console.log(cl(accent, '-'.repeat(side)) + cl(A.bold + A.bWhite, txt) + cl(accent, '-'.repeat(Math.max(0, w - side - txt.length))));
}

function header(title, subtitle = '') {
  const w = W();
  console.log('\n' + cl(A.bCyan, '='.repeat(w)));
  const t = ` ${strip(title).trim()} `;
  const tPad = Math.max(0, Math.floor((w - t.length) / 2));
  console.log(' '.repeat(tPad) + cl(A.bold + A.bCyan, t));
  if (subtitle) {
    const cleanSubtitle = strip(subtitle).trim();
    const sPad = Math.max(0, Math.floor((w - cleanSubtitle.length) / 2));
    console.log(' '.repeat(sPad) + cl(A.gray, cleanSubtitle));
  }
  console.log(cl(A.bCyan, '='.repeat(w)) + '\n');
}

function spinner(text) {
  const frames = ['-', '\\', '|', '/'];
  let i = 0;
  const iv = setInterval(() => {
    process.stdout.write(`\r  ${cl(A.bCyan, frames[i++ % frames.length])} ${cl(A.gray, text)}   `);
  }, 80);
  return {
    succeed: (m) => {
      clearInterval(iv);
      process.stdout.write(`\r  ${cl(A.bGreen, 'OK')} ${cl(A.bWhite, m)}\n`);
    },
    fail: (m) => {
      clearInterval(iv);
      process.stdout.write(`\r  ${cl(A.bRed, 'ERR')} ${cl(A.bRed, m)}\n`);
    },
    update: (m) => {
      process.stdout.write(`\r  ${cl(A.bCyan, frames[i % frames.length])} ${cl(A.gray, m)}   `);
    },
    stop: () => {
      clearInterval(iv);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    },
  };
}

function printBanner() {
  const w = W();
  console.log(cl(A.bCyan, '='.repeat(w)));
  const title = 'CLANKER 2.0 EXPLORER';
  const subtitle = 'Project Browser | Files | Search | Git';
  console.log(' '.repeat(Math.max(0, Math.floor((w - title.length) / 2))) + cl(A.bold + A.bCyan, title));
  console.log(' '.repeat(Math.max(0, Math.floor((w - subtitle.length) / 2))) + cl(A.gray, subtitle));
  console.log(cl(A.bCyan, '='.repeat(w)));
}

async function main() {
  // Resolve project path (arg or cwd)
  let projectPath = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

  if (!fs.existsSync(projectPath)) {
    console.log(cl(A.bRed, `\n  ✘ Path not found: ${projectPath}\n`));
    process.exit(1);
  }

  while (true) {
    clear();
    printBanner();

    console.log('');
    box(
      cl(A.bCyan, '📂  Project'),
      [
        `${cl(A.gray, 'Path  :')} ${cl(A.bWhite, projectPath)}`,
        `${cl(A.gray, 'Name  :')} ${cl(A.bYellow, path.basename(projectPath))}`,
      ],
      A.bCyan, Math.min(W() - 4, 80)
    );
    console.log('');

    const action = await menu('Select an option:', [
      { label: '🌳  View Project Structure',      value: 'structure', hint: 'directory tree + file types' },
      { label: '📄  View File Contents',          value: 'files',     hint: 'browse and read any file'    },
      { label: '📊  Project Dashboard',           value: 'stats',     hint: 'deep analysis & statistics'  },
      { label: '🔍  Search in Project',           value: 'search',    hint: 'find files or text'          },
      { label: '📦  Export / Download Project',   value: 'export',    hint: 'ZIP, copy, or report'        },
      { label: '🔀  Git Info',                    value: 'git',       hint: 'commits, status, branches'   },
      { label: '📂  Change Project Path',         value: 'chpath',    hint: ''                            },
      { label: '❌  Exit',                        value: 'exit',      hint: '' },
    ]);

    if (action === 'exit')      { console.log(cl(A.gray, '\n  Goodbye 👋\n')); process.exit(0); }
    if (action === 'structure') await viewStructure(projectPath);
    if (action === 'files')     await viewFileContents(projectPath);
    if (action === 'stats')     await statsDashboard(projectPath);
    if (action === 'search')    await searchProject(projectPath);
    if (action === 'export')    await exportProject(projectPath);
    if (action === 'git')       await gitInfo(projectPath);
    if (action === 'chpath') {
      console.log('');
      const newPath = await prompt('Enter new project path', projectPath);
      if (fs.existsSync(newPath)) {
        projectPath = path.resolve(newPath);
        console.log(cl(A.bGreen, `  ✔ Switched to: ${projectPath}`));
      } else {
        console.log(cl(A.bRed, '  ✘ Path not found.'));
      }
      await pressAny();
    }
  }
}

main().catch(err => {
  console.error(cl(A.bRed, `\n  ✘ Fatal: ${err.message}\n`));
  process.exit(1);
});
