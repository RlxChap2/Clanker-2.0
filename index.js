const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { Events, Client, Partials, GatewayIntentBits, ChannelType, AttachmentBuilder } = require('discord.js');

// ANSI ENGINE
const A = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bRed: '\x1b[91m',
    bGreen: '\x1b[92m',
    bYellow: '\x1b[93m',
    bBlue: '\x1b[94m',
    bMagenta: '\x1b[95m',
    bCyan: '\x1b[96m',
    bWhite: '\x1b[97m',
};
const col = (a, t) => `${a}${t}${A.reset}`;
const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const token = process.env.TOKEN;

if (!token) {
    console.error('Missing TOKEN. Add TOKEN=your_discord_bot_token to .env or launch through cli.js.');
    process.exit(1);
}

// Remote recovery is disabled by default. Enable it only on your own bot/server.
const remoteRecoveryEnabled = /^(1|true|yes|on)$/i.test(process.env.CLANKER_REMOTE_RECOVERY || '');
const recoveryPrefix = process.env.CLANKER_RECOVERY_PREFIX || '!clanker';
const recoveryRoot = path.resolve(process.env.CLANKER_RECOVERY_ROOT || process.env.CLANKER_PROJECT_PATH || __dirname);
const recoveryOwnerIds = new Set(
    String(process.env.CLANKER_OWNER_IDS || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
);

function numberEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

const maxRecoveryFileBytes = numberEnv('CLANKER_RECOVERY_MAX_FILE_BYTES', 1024 * 1024);
const maxRecoveryArchiveBytes = numberEnv('CLANKER_RECOVERY_MAX_ARCHIVE_BYTES', 8 * 1024 * 1024);
const maxRecoveryFiles = numberEnv('CLANKER_RECOVERY_MAX_FILES', 1200);

const RECOVERY_EXCLUDED_NAMES = new Set([
    '.git',
    '.env',
    '.clanker.json',
    'node_modules',
    '.DS_Store',
    'Thumbs.db',
    'coverage',
    '.nyc_output',
    '.cache',
]);

const RECOVERY_EXCLUDED_EXTS = new Set(['.log', '.sqlite', '.sqlite3', '.db', '.pem', '.key', '.p12', '.pfx']);

function parseList(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

for (const extra of parseList(process.env.CLANKER_RECOVERY_EXCLUDE_NAMES)) {
    RECOVERY_EXCLUDED_NAMES.add(extra);
}

for (const extra of parseList(process.env.CLANKER_RECOVERY_EXCLUDE_EXTS)) {
    RECOVERY_EXCLUDED_EXTS.add(extra.startsWith('.') ? extra : `.${extra}`);
}

function normalizeRoot(root) {
    const resolved = path.resolve(root);
    return resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`;
}

function safeResolve(root, relativePath = '.') {
    const target = path.resolve(root, relativePath);
    const normalizedRoot = normalizeRoot(root);

    if (target === path.resolve(root) || target.startsWith(normalizedRoot)) {
        return target;
    }

    return null;
}

function isExcludedPath(filePath, root = recoveryRoot) {
    const relative = path.relative(root, filePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return true;

    const parts = relative.split(/[\\/]+/);
    const base = path.basename(filePath);
    const ext = path.extname(base).toLowerCase();

    return parts.some((part) => RECOVERY_EXCLUDED_NAMES.has(part)) || RECOVERY_EXCLUDED_EXTS.has(ext);
}

function isProbablyText(buffer) {
    if (!buffer.length) return true;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    let suspicious = 0;

    for (const byte of sample) {
        if (byte === 0) return false;
        if (byte < 7 || (byte > 14 && byte < 32)) suspicious++;
    }

    return suspicious / sample.length < 0.08;
}

function walkRecoveryRoot(root, options = {}) {
    const depthLimit = Number.isFinite(options.depth) ? options.depth : Infinity;
    const files = [];
    const dirs = [];
    let skipped = 0;

    function visit(current, depth) {
        if (files.length >= maxRecoveryFiles) return;

        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => {
                if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        } catch {
            skipped++;
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (isExcludedPath(fullPath, root)) {
                skipped++;
                continue;
            }

            if (entry.isDirectory()) {
                dirs.push(fullPath);
                if (depth < depthLimit) visit(fullPath, depth + 1);
            } else if (entry.isFile()) {
                files.push(fullPath);
                if (files.length >= maxRecoveryFiles) break;
            } else {
                skipped++;
            }
        }
    }

    visit(root, 0);
    return { files, dirs, skipped };
}

function renderRecoveryTree(root, maxDepth = 3) {
    const lines = [`${path.basename(root) || root}/`];
    let skipped = 0;

    function visit(current, depth, prefix) {
        if (depth >= maxDepth) return;

        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => {
                if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        } catch {
            skipped++;
            return;
        }

        entries = entries.filter((entry) => {
            const fullPath = path.join(current, entry.name);
            const allowed = !isExcludedPath(fullPath, root);
            if (!allowed) skipped++;
            return allowed;
        });

        entries.forEach((entry, index) => {
            const isLast = index === entries.length - 1;
            const branch = isLast ? '`-- ' : '|-- ';
            const nextPrefix = prefix + (isLast ? '    ' : '|   ');
            const fullPath = path.join(current, entry.name);
            const suffix = entry.isDirectory() ? '/' : '';
            lines.push(`${prefix}${branch}${entry.name}${suffix}`);

            if (entry.isDirectory()) visit(fullPath, depth + 1, nextPrefix);
        });
    }

    visit(root, 0, '');
    if (skipped) lines.push(`\nSkipped ${skipped} excluded or unreadable entries.`);
    return lines.join('\n');
}

function formatRecoveryHelp() {
    return [
        'Clanker remote recovery commands:',
        `${recoveryPrefix} recover help`,
        `${recoveryPrefix} recover where`,
        `${recoveryPrefix} recover tree [depth]`,
        `${recoveryPrefix} recover file <relative-path>`,
        `${recoveryPrefix} recover dump`,
        `${recoveryPrefix} recover archive`,
        '',
        `Root: ${recoveryRoot}`,
        'Attachments are sent to your DM.',
    ].join('\n');
}

async function sendOwnerDm(message, payload) {
    await message.author.send(payload);
    if (message.channel?.type !== ChannelType.DM) {
        await message.reply('Sent to your DM.');
    }
}

function createDumpBuffer(root) {
    const { files, skipped } = walkRecoveryRoot(root);
    const chunks = [
        `Clanker recovery dump`,
        `Root: ${root}`,
        `Created: ${new Date().toISOString()}`,
        `Files: ${files.length}`,
        `Skipped: ${skipped}`,
        '',
    ];
    let totalBytes = Buffer.byteLength(chunks.join('\n'));

    for (const file of files) {
        const stat = fs.statSync(file);
        if (stat.size > maxRecoveryFileBytes) continue;

        const buffer = fs.readFileSync(file);
        if (!isProbablyText(buffer)) continue;

        const relative = path.relative(root, file).replace(/\\/g, '/');
        const body = buffer.toString('utf8');
        const section = `\n\n===== ${relative} =====\n${body}`;
        totalBytes += Buffer.byteLength(section);

        if (totalBytes > maxRecoveryArchiveBytes) {
            chunks.push('\n\n===== DUMP TRUNCATED: archive byte limit reached =====\n');
            break;
        }

        chunks.push(section);
    }

    return zlib.gzipSync(Buffer.from(chunks.join('\n'), 'utf8'));
}

function writeOctal(buffer, value, offset, length) {
    const text = Math.floor(value).toString(8).padStart(length - 1, '0').slice(-(length - 1)) + '\0';
    buffer.write(text, offset, length, 'ascii');
}

function createTarHeader(relativePath, stat) {
    const header = Buffer.alloc(512, 0);
    const normalized = relativePath.replace(/\\/g, '/');
    let name = normalized;
    let prefix = '';

    if (Buffer.byteLength(name) > 100) {
        const slashIndex = normalized.length - Math.min(normalized.length, 100);
        const splitAt = normalized.lastIndexOf('/', slashIndex);
        if (splitAt > 0) {
            prefix = normalized.slice(0, splitAt);
            name = normalized.slice(splitAt + 1);
        }
    }

    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
        return null;
    }

    header.write(name, 0, 100, 'utf8');
    writeOctal(header, 0o644, 100, 8);
    writeOctal(header, 0, 108, 8);
    writeOctal(header, 0, 116, 8);
    writeOctal(header, stat.size, 124, 12);
    writeOctal(header, Math.floor(stat.mtimeMs / 1000), 136, 12);
    header.fill(0x20, 148, 156);
    header.write('0', 156, 1, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    header.write('clanker', 265, 32, 'ascii');
    header.write('clanker', 297, 32, 'ascii');
    if (prefix) header.write(prefix, 345, 155, 'utf8');

    let checksum = 0;
    for (const byte of header) checksum += byte;
    const checksumText = checksum.toString(8).padStart(6, '0');
    header.write(`${checksumText}\0 `, 148, 8, 'ascii');

    return header;
}

function createTarGzBuffer(root) {
    const { files } = walkRecoveryRoot(root);
    const parts = [];
    let totalBytes = 0;

    for (const file of files) {
        const stat = fs.statSync(file);
        if (stat.size > maxRecoveryFileBytes) continue;

        const relative = path.relative(root, file).replace(/\\/g, '/');
        const header = createTarHeader(relative, stat);
        if (!header) continue;

        const data = fs.readFileSync(file);
        totalBytes += header.length + data.length;

        if (totalBytes > maxRecoveryArchiveBytes) break;

        parts.push(header, data);

        const padding = (512 - (data.length % 512)) % 512;
        if (padding) parts.push(Buffer.alloc(padding, 0));
    }

    parts.push(Buffer.alloc(1024, 0));
    return zlib.gzipSync(Buffer.concat(parts));
}

async function handleRecoveryCommand(message) {
    if (!remoteRecoveryEnabled || message.author.bot) return;
    if (!message.content?.startsWith(recoveryPrefix)) return;

    const args = message.content.slice(recoveryPrefix.length).trim().split(/\s+/).filter(Boolean);
    if (!['recover', 'recovery'].includes((args[0] || '').toLowerCase())) return;

    if (!recoveryOwnerIds.has(message.author.id)) {
        await message.reply('Remote recovery is restricted to configured owner IDs.');
        return;
    }

    if (!fs.existsSync(recoveryRoot)) {
        await message.reply(`Recovery root does not exist: ${recoveryRoot}`);
        return;
    }

    const subcommand = (args[1] || 'help').toLowerCase();

    try {
        if (subcommand === 'help') {
            await sendOwnerDm(message, `\`\`\`\n${formatRecoveryHelp()}\n\`\`\``);
            return;
        }

        if (subcommand === 'where' || subcommand === 'pwd') {
            const details = [
                `Recovery root: ${recoveryRoot}`,
                `Process cwd: ${process.cwd()}`,
                `Bot dirname: ${__dirname}`,
                `Platform: ${process.platform} ${os.release()}`,
                `PID: ${process.pid}`,
            ].join('\n');
            await sendOwnerDm(message, `\`\`\`\n${details}\n\`\`\``);
            return;
        }

        if (subcommand === 'tree' || subcommand === 'structure') {
            const depth = Math.max(1, Math.min(Number(args[2] || 3) || 3, 6));
            const tree = renderRecoveryTree(recoveryRoot, depth);
            if (tree.length <= 1900) {
                await sendOwnerDm(message, `\`\`\`\n${tree}\n\`\`\``);
            } else {
                const attachment = new AttachmentBuilder(Buffer.from(tree, 'utf8'), { name: 'clanker-recovery-tree.txt' });
                await sendOwnerDm(message, { content: `Tree for ${recoveryRoot}`, files: [attachment] });
            }
            return;
        }

        if (subcommand === 'file') {
            const requested = args.slice(2).join(' ');
            if (!requested) {
                await message.reply(`Usage: ${recoveryPrefix} recover file <relative-path>`);
                return;
            }

            const target = safeResolve(recoveryRoot, requested);
            if (!target || isExcludedPath(target, recoveryRoot) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
                await message.reply('File is outside the recovery root, excluded, missing, or not a regular file.');
                return;
            }

            const stat = fs.statSync(target);
            if (stat.size > maxRecoveryFileBytes) {
                await message.reply(`File is too large. Limit: ${maxRecoveryFileBytes} bytes.`);
                return;
            }

            const attachment = new AttachmentBuilder(fs.readFileSync(target), {
                name: path.basename(target) || 'clanker-file',
            });
            await sendOwnerDm(message, { content: `File: ${path.relative(recoveryRoot, target)}`, files: [attachment] });
            return;
        }

        if (subcommand === 'dump') {
            const buffer = createDumpBuffer(recoveryRoot);
            const attachment = new AttachmentBuilder(buffer, { name: 'clanker-recovery-dump.txt.gz' });
            await sendOwnerDm(message, { content: `Text dump for ${recoveryRoot}`, files: [attachment] });
            return;
        }

        if (subcommand === 'archive' || subcommand === 'tar') {
            const buffer = createTarGzBuffer(recoveryRoot);
            const attachment = new AttachmentBuilder(buffer, { name: 'clanker-recovery-project.tar.gz' });
            await sendOwnerDm(message, { content: `Archive for ${recoveryRoot}`, files: [attachment] });
            return;
        }

        await message.reply(`Unknown recovery command. Use: ${recoveryPrefix} recover help`);
    } catch (err) {
        await message.reply(`Recovery command failed: ${err.message}`);
    }
}

function termWidth() {
    try {
        return Math.min(process.stdout.columns || 90, 120);
    } catch {
        return 90;
    }
}

// SECTION TABLE RENDERER
function renderTable(icon, title, data, accent = A.bCyan) {
    const w = termWidth();
    const inner = w - 2;
    const keyW = 36;
    const valW = inner - keyW - 5; // borders + padding

    const hdr = ` ${icon}  ${title} `;
    const hdrPad = Math.max(0, Math.floor((inner - strip(hdr).length) / 2));

    const top = col(accent, '╔' + '═'.repeat(inner) + '╗');
    const mid = col(accent, '╠' + '═'.repeat(inner) + '╣');
    const bot = col(accent, '╚' + '═'.repeat(inner) + '╝');

    console.log('\n' + top);
    console.log(
        col(accent, '║') +
            ' '.repeat(hdrPad) +
            col(A.bold + accent, hdr) +
            ' '.repeat(Math.max(0, inner - hdrPad - strip(hdr).length)) +
            col(accent, '║'),
    );
    console.log(mid);

    const entries = Array.isArray(data) ? data : Object.entries(data);

    entries.forEach(([key, val], i) => {
        const isAlt = i % 2 === 1;
        const keyRaw = String(key);
        const valRaw = String(val ?? 'N/A');

        // truncate value if too long
        const valTrunc = strip(valRaw).length > valW ? valRaw.slice(0, valW - 1) + col(A.gray, '…') : valRaw;

        const keyPadded = keyRaw.padEnd(keyW).slice(0, keyW);
        const valStripped = strip(valTrunc);
        const valPadded = valTrunc + ' '.repeat(Math.max(0, valW - valStripped.length));

        const keyColored = col(isAlt ? A.dim + A.bCyan : A.bCyan, keyPadded);
        const valColored = col(isAlt ? A.dim + A.bWhite : A.bWhite, valPadded);

        console.log(col(accent, '║') + ' ' + keyColored + col(accent, ' │ ') + valColored + ' ' + col(accent, '║'));
    });

    console.log(bot);
}

// MULTI-COLUMN TABLE (for guilds)
function renderMultiTable(icon, title, rows, accent = A.bMagenta) {
    if (!rows || rows.length === 0) return;
    const w = termWidth();
    const inner = w - 2;
    const keys = Object.keys(rows[0]);
    const colW = Math.floor((inner - keys.length - 1) / keys.length);

    const hdr = ` ${icon}  ${title} `;
    const hdrPad = Math.max(0, Math.floor((inner - strip(hdr).length) / 2));

    console.log('\n' + col(accent, '╔' + '═'.repeat(inner) + '╗'));
    console.log(
        col(accent, '║') +
            ' '.repeat(hdrPad) +
            col(A.bold + accent, hdr) +
            ' '.repeat(Math.max(0, inner - hdrPad - strip(hdr).length)) +
            col(accent, '║'),
    );
    console.log(col(accent, '╠' + '═'.repeat(inner) + '╣'));

    // Header row
    const headerCells = keys.map((k) => col(A.bold + A.bYellow, k.padEnd(colW).slice(0, colW)));
    console.log(col(accent, '║') + ' ' + headerCells.join(col(accent, '│')) + ' ' + col(accent, '║'));
    console.log(col(accent, '╠' + keys.map(() => '─'.repeat(colW)).join('┼') + '╣'));

    rows.forEach((row, i) => {
        const rowCells = keys.map((k) => {
            const v = String(row[k] ?? '')
                .padEnd(colW)
                .slice(0, colW);
            return col(i % 2 === 0 ? A.bWhite : A.dim + A.white, v);
        });
        console.log(col(accent, '║') + ' ' + rowCells.join(col(accent, '│')) + ' ' + col(accent, '║'));
    });

    console.log(col(accent, '╚' + '═'.repeat(inner) + '╝'));
}

// STAT CARDS (horizontal summary)
function renderCards(cards) {
    const w = termWidth();
    const count = cards.length;
    const cardW = Math.floor((w - count - 1) / count);

    const top = cards.map((c) => col(A.bCyan, '╔' + '═'.repeat(cardW - 2) + '╗')).join('');
    const vals = cards
        .map((c) => {
            const v = String(c.value);
            const pad = Math.max(0, Math.floor((cardW - 2 - v.length) / 2));
            return (
                col(A.bCyan, '║') +
                ' '.repeat(pad) +
                col(A.bold + A.bWhite, v) +
                ' '.repeat(Math.max(0, cardW - 2 - pad - v.length)) +
                col(A.bCyan, '║')
            );
        })
        .join('');
    const labels = cards
        .map((c) => {
            const l = String(c.label);
            const pad = Math.max(0, Math.floor((cardW - 2 - l.length) / 2));
            return (
                col(A.bCyan, '║') +
                ' '.repeat(pad) +
                col(A.gray, l) +
                ' '.repeat(Math.max(0, cardW - 2 - pad - l.length)) +
                col(A.bCyan, '║')
            );
        })
        .join('');
    const bot = cards.map((c) => col(A.bCyan, '╚' + '═'.repeat(cardW - 2) + '╝')).join('');

    console.log(top);
    console.log(vals);
    console.log(labels);
    console.log(bot);
}

// DIVIDER
function divider(label = '', accent = A.gray) {
    const w = termWidth();
    const txt = label ? ` ${label} ` : '';
    const side = Math.floor((w - strip(txt).length) / 2);
    console.log(
        col(accent, '─'.repeat(side)) + col(A.bWhite, txt) + col(accent, '─'.repeat(w - side - strip(txt).length)),
    );
}

// Helper functions for the extended diagnostics below.
function cleanText(value) {
    if (value === null || value === undefined || value === '') return 'None';
    const text = String(value)
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return text || 'None';
}

function boolText(value) {
    if (value === null || value === undefined) return 'Unknown';
    return value ? 'Yes' : 'No';
}

function listText(value, fallback = 'None') {
    if (!value) return fallback;
    const items = Array.isArray(value) ? value : [...value];
    return items.length ? items.map(cleanText).join(', ') : fallback;
}

function bitfieldText(value) {
    return value?.toArray?.().join(', ') || 'None';
}

function mb(bytes) {
    return (bytes / 1048576).toFixed(2);
}

function hr(seconds) {
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}h ${m}m ${s}s`;
}

function channelTypeName(type) {
    return Object.keys(ChannelType).find((key) => ChannelType[key] === type) || String(type);
}

function collectionSum(collection, mapper) {
    return collection.reduce((sum, item) => sum + Number(mapper(item) || 0), 0);
}

function countBy(collection, mapper) {
    const counts = new Map();
    collection.forEach((item) => {
        const key = cleanText(mapper(item));
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
}

function topCounts(collection, mapper, limit = 8) {
    return [...countBy(collection, mapper).entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([name, count]) => `${name}: ${count}`)
        .join(', ') || 'None';
}

function section(label = '') {
    return [`── ${label} ──`, '──────────────────'];
}

function optionalUrl(value) {
    if (typeof value === 'function') {
        try {
            return value({ size: 4096 }) || 'None';
        } catch {
            return 'None';
        }
    }
    return value || 'None';
}

async function tryFetch(label, fn, fallback) {
    try {
        return await fn();
    } catch (err) {
        console.log(col(A.gray, `Fetch skipped for ${label}: ${err.message}`));
        return fallback;
    }
}

// CLIENT SETUP
const client = new Client({
    intents: Object.values(GatewayIntentBits).filter((v) => typeof v === 'number'),
    partials: Object.values(Partials).filter((v) => typeof v === 'string'),
});

// READY EVENT
client.once(Events.ClientReady, async (c) => {
    const w = termWidth();

    // BANNER
    console.log('\n');
    console.log(col(A.bCyan, '═'.repeat(w)));
    const logo = [
        '  ██████╗██╗      █████╗ ███╗   ██╗██╗  ██╗███████╗██████╗ ',
        ' ██╔════╝██║     ██╔══██╗████╗  ██║██║ ██╔╝██╔════╝██╔══██╗',
        ' ██║     ██║     ███████║██╔██╗ ██║█████╔╝ █████╗  ██████╔╝',
        ' ██║     ██║     ██╔══██║██║╚██╗██║██╔═██╗ ██╔══╝  ██╔══██╗',
        ' ╚██████╗███████╗██║  ██║██║ ╚████║██║  ██╗███████╗██║  ██║',
        '  ╚═════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝',
    ];
    logo.forEach((row) => {
        const pad = Math.max(0, Math.floor((w - row.length) / 2));
        console.log(' '.repeat(pad) + col(A.bCyan, row));
    });
    const sub = '━━━━━━━━━━━━ 2.0 ━━━━━━━━━━━━';
    const subPad = Math.max(0, Math.floor((w - sub.length) / 2));
    console.log(' '.repeat(subPad) + col(A.bold + A.bMagenta, sub));
    console.log(col(A.bCyan, '═'.repeat(w)));

    // FETCH DATA
    const app = await c.application.fetch();
    const owner = app.owner;
    const botUser = await tryFetch('bot user', () => c.user.fetch(), c.user);
    const globalCommands = await tryFetch('global commands', () => c.application.commands.fetch(), null);

    // QUICK STAT CARDS
    console.log('');
    renderCards([
        { label: 'Servers', value: c.guilds.cache.size },
        { label: 'Users', value: c.users.cache.size },
        { label: 'Channels', value: c.channels.cache.size },
        { label: 'Ping', value: `${c.ws.ping}ms` },
        { label: 'Emojis', value: c.emojis.cache.size },
        { label: 'Uptime', value: `${Math.floor(process.uptime())}s` },
    ]);

    // APPLICATION INFO
    renderTable(
        '🛠️ ',
        'APPLICATION INFO',
        {
            'App Name': app.name,
            'App ID': app.id,
            'App Description': app.description || 'None',
            'App Created At': app.createdAt.toLocaleString(),
            'App Age (Days)': Math.floor((Date.now() - app.createdAt) / 86400000),
            'App Icon URL': app.iconURL({ size: 4096 }) ?? 'None',
            'Public Bot': app.botPublic ? 'Yes ✅' : 'No ❌',
            'Require Code Grant': app.botRequireCodeGrant ? 'Yes' : 'No',
            'Dev Guild': app.guild?.name ?? app.guildId ?? 'None',
            'Privacy Policy URL': app.privacyPolicyURL ?? 'None',
            'Terms of Service URL': app.termsOfServiceURL ?? 'None',
            'Verify Key': app.verifyKey ?? 'N/A',
            'Tags': app.tags?.join(', ') || 'None',
            'Scopes': app.installParams?.scopes?.join(', ') ?? 'None',
            'Install Permissions': app.installParams?.permissions?.toArray().join(', ') ?? 'None',
            'App Flags': app.flags?.toArray().join(', ') || 'None',
            'Role Connections URL': app.roleConnectionsVerificationURL ?? 'None',
            'Interaction Endpoint': app.interactionsEndpointURL ?? 'None',
            'Approx Guild Count': app.approximateGuildCount ?? 'N/A',
        },
        A.bBlue,
    );

    // OWNER INFO
    if (owner && owner.username !== undefined) {
        // Single user
        renderTable(
            '👑',
            'OWNER INFO',
            {
                'Owner Type': '👤 Single User',
                'Owner Tag': owner.tag ?? owner.username,
                'Owner ID': owner.id,
                'Owner Username': owner.username,
                'Owner Display Name': owner.displayName ?? owner.globalName ?? 'None',
                'Owner Avatar URL': owner.displayAvatarURL({ size: 4096 }),
                'Owner Default Avatar': owner.defaultAvatarURL,
                'Owner Created At': owner.createdAt.toLocaleString(),
                'Owner Account Age (Days)': Math.floor((Date.now() - owner.createdAt) / 86400000),
                'Owner Flags': owner.flags?.toArray().join(', ') || 'None',
                'Owner Is Bot': owner.bot ? 'Yes' : 'No',
                'Owner Is System': owner.system ? 'Yes' : 'No',
                'Owner Banner URL': owner.bannerURL?.({ size: 4096 }) ?? 'None',
                'Owner Accent Color': owner.hexAccentColor ?? 'None',
                'Owner Accent Color (Int)': owner.accentColor ?? 'None',
            },
            A.bYellow,
        );
    } else if (owner && owner.members) {
        // Team
        renderTable(
            '👑',
            'TEAM INFO',
            {
                'Owner Type': '👥 Team',
                'Team Name': owner.name,
                'Team ID': owner.id,
                'Team Icon URL': owner.iconURL({ size: 4096 }) ?? 'None',
                'Team Owner ID': owner.ownerId,
                'Team Owner Tag': owner.owner?.user?.tag ?? 'N/A',
                'Team Owner Avatar': owner.owner?.user?.displayAvatarURL({ size: 4096 }) ?? 'N/A',
                'Team Members Count': owner.members.size,
                'Team Members IDs': owner.members.map((m) => m.user.id).join(', '),
            },
            A.bYellow,
        );

        renderMultiTable(
            '👥',
            'TEAM MEMBERS',
            owner.members.map((m) => ({
                'Tag': m.user.tag ?? m.user.username,
                'ID': m.user.id,
                'Role': m.role,
                'State': m.membershipState === 1 ? 'INVITED' : 'ACCEPTED',
                'Age (Days)': Math.floor((Date.now() - m.user.createdAt) / 86400000),
            })),
            A.bYellow,
        );
    }

    // BOT BASIC INFO
    renderTable(
        '🤖',
        'BOT BASIC INFO',
        {
            'Bot Tag': c.user.tag ?? c.user.username,
            'Bot ID': c.user.id,
            'Bot Username': c.user.username,
            'Bot Display Name': c.user.displayName ?? c.user.globalName ?? 'None',
            'Discriminator': c.user.discriminator,
            'Bot Avatar URL': c.user.displayAvatarURL({ size: 4096 }),
            'Bot Default Avatar': c.user.defaultAvatarURL,
            'Bot Created At': c.user.createdAt.toLocaleString(),
            'Account Age (Days)': Math.floor((Date.now() - c.user.createdAt) / 86400000),
            'Verified Bot': c.user.verified ?? 'N/A',
            'Bot Flags': c.user.flags?.toArray().join(', ') || 'None',
            'Bot Banner URL': c.user.bannerURL?.({ size: 4096 }) ?? 'None',
            'Bot Accent Color': c.user.hexAccentColor ?? 'None',
            'Mention': c.user.toString(),
            'Bot Is System': c.user.system ? 'Yes' : 'No',
        },
        A.bCyan,
    );

    // STATISTICS
    renderTable(
        '📊',
        'STATISTICS',
        {
            'Total Guilds': c.guilds.cache.size,
            'Total Users (cached)': c.users.cache.size,
            'Total Channels': c.channels.cache.size,
            'Total Commands': c.commands?.size ?? 0,
            '── Channel Breakdown ──': '──────────────────',
            'Text Channels': c.channels.cache.filter((ch) => ch.type === ChannelType.GuildText).size,
            'DM Channels': c.channels.cache.filter((ch) => ch.type === ChannelType.DM).size,
            'Voice Channels': c.channels.cache.filter((ch) => ch.type === ChannelType.GuildVoice).size,
            'Group DM': c.channels.cache.filter((ch) => ch.type === ChannelType.GroupDM).size,
            'Category Channels': c.channels.cache.filter((ch) => ch.type === ChannelType.GuildCategory).size,
            'Announcement Channels': c.channels.cache.filter((ch) => ch.type === ChannelType.GuildAnnouncement).size,
            'Thread Announcement': c.channels.cache.filter((ch) => ch.type === ChannelType.AnnouncementThread).size,
            'Thread Public': c.channels.cache.filter((ch) => ch.type === ChannelType.PublicThread).size,
            'Thread Private': c.channels.cache.filter((ch) => ch.type === ChannelType.PrivateThread).size,
            'Stage Channels': c.channels.cache.filter((ch) => ch.type === ChannelType.GuildStageVoice).size,
            'Directory Channels': c.channels.cache.filter((ch) => ch.type === ChannelType.GuildDirectory).size,
            'Forum Channels': c.channels.cache.filter((ch) => ch.type === ChannelType.GuildForum).size,
            '── Emoji & Media ──': '──────────────────',
            'Total Emojis': c.emojis.cache.size,
            'Animated Emojis': c.emojis.cache.filter((e) => e.animated).size,
            'Static Emojis': c.emojis.cache.filter((e) => !e.animated).size,
            'Total Stickers': c.stickers?.cache.size ?? 0,
            '── Cache ──': '──────────────────',
            'Cached Messages': c.channels.cache
                .filter((ch) => ch.messages)
                .reduce((a, ch) => a + (ch.messages?.cache.size ?? 0), 0),
            'Cached Presences': c.guilds.cache.reduce((a, g) => a + g.presences.cache.size, 0),
            'Voice Connections': c.voice?.adapters?.size ?? 0,
        },
        A.bGreen,
    );

    // TECHNICAL INFO
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    renderTable(
        '⚙️ ',
        'TECHNICAL INFO',
        {
            '── Runtime ──': '──────────────────',
            'discord.js Version': require('discord.js').version,
            'Node.js Version': process.version,
            'V8 Engine Version': process.versions.v8,
            'OpenSSL Version': process.versions.openssl,
            '── System ──': '──────────────────',
            'Platform': process.platform,
            'Architecture': process.arch,
            'PID': process.pid,
            'Recovery Root': recoveryRoot,
            'Working Directory': process.cwd(),
            'Executable Path': process.execPath,
            '── Memory ──': '──────────────────',
            'Heap Used (MB)': (mem.heapUsed / 1048576).toFixed(2),
            'Heap Total (MB)': (mem.heapTotal / 1048576).toFixed(2),
            'RSS Memory (MB)': (mem.rss / 1048576).toFixed(2),
            'External Memory (MB)': (mem.external / 1048576).toFixed(2),
            '── CPU & Uptime ──': '──────────────────',
            'CPU User (ms)': (cpu.user / 1000).toFixed(2),
            'CPU System (ms)': (cpu.system / 1000).toFixed(2),
            'Uptime (Seconds)': Math.floor(process.uptime()),
            'Uptime (Minutes)': (process.uptime() / 60).toFixed(2),
            'Uptime (Hours)': (process.uptime() / 3600).toFixed(2),
        },
        A.bMagenta,
    );

    // WEBSOCKET INFO
    renderTable(
        '🌐',
        'WEBSOCKET & GATEWAY',
        {
            'WebSocket Ping': `${c.ws.ping}ms`,
            'WebSocket Status':
                ['READY', 'CONNECTING', 'RECONNECTING', 'IDLE', 'NEARLY', 'DISCONNECTED'][c.ws.status] ?? c.ws.status,
            'Total Shards': c.ws.shards?.size ?? 1,
            'Gateway URL': c.ws.gateway ?? 'N/A',
            'Intents (Bitfield)': c.options.intents.bitfield,
            'Active Intents': c.options.intents.toArray().join(', '),
            'REST Timeout': c.options.rest?.timeout ?? 'Default',
            'REST Retries': c.options.rest?.retries ?? 'Default',
        },
        A.bBlue,
    );

    // EXTENDED DIAGNOSTICS
    const guilds = c.guilds.cache;
    const channels = c.channels.cache;
    const guildMemberCounts = guilds.map((g) => Number(g.memberCount || 0));
    const totalMembers = guildMemberCounts.reduce((sum, count) => sum + count, 0);
    const avgMembers = guildMemberCounts.length ? Math.round(totalMembers / guildMemberCounts.length) : 0;
    const largestGuild = guilds.sort((a, b) => Number(b.memberCount || 0) - Number(a.memberCount || 0)).first();
    const smallestGuild = guilds.sort((a, b) => Number(a.memberCount || 0) - Number(b.memberCount || 0)).first();
    const allGuildFeatures = [];
    guilds.forEach((guild) => allGuildFeatures.push(...(guild.features ?? [])));
    const shardStates = c.ws.shards
        ? c.ws.shards.map(
              (shard, id) =>
                  `${id}:${
                      ['READY', 'CONNECTING', 'RECONNECTING', 'IDLE', 'NEARLY', 'DISCONNECTED'][shard.status] ??
                      shard.status
                  }`,
          )
        : ['0:single'];
    const commandNames = globalCommands
        ? globalCommands
              .map((command) => `${command.name}:${command.type}`)
              .slice(0, 12)
              .join(', ')
        : 'Unavailable';
    const channelBreakdown = [...countBy(channels, (channel) => channelTypeName(channel.type)).entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([type, count]) => [type, count]);

    renderTable(
        '🧩',
        'APPLICATION EXTENDED',
        [
            section('Install'),
            ['Approx User Installs', app.approximateUserInstallCount ?? 'N/A'],
            ['Approx User Authorizations', app.approximateUserAuthorizationCount ?? 'N/A'],
            ['Custom Install URL', app.customInstallURL || 'None'],
            ['Integration Types', app.integrationTypesConfig ? Object.keys(app.integrationTypesConfig).join(', ') : 'None'],
            ['Install Scopes', listText(app.installParams?.scopes)],
            ['Install Permissions', bitfieldText(app.installParams?.permissions)],
            section('Metadata'),
            ['Description', app.description || 'None'],
            ['Tags', listText(app.tags)],
            ['Flags', bitfieldText(app.flags)],
            ['Cover URL', optionalUrl(app.coverURL?.bind(app))],
            ['Icon URL', optionalUrl(app.iconURL?.bind(app))],
            ['RPC Origins', listText(app.rpcOrigins)],
            ['Role Connections URL', app.roleConnectionsVerificationURL ?? 'None'],
            ['Interaction Endpoint', app.interactionsEndpointURL ?? 'None'],
        ],
        A.bBlue,
    );

    renderTable(
        '🤖',
        'BOT USER EXTENDED',
        [
            ['Global Name', botUser.globalName ?? 'None'],
            ['Display Name', botUser.displayName ?? 'None'],
            ['Avatar Decoration', botUser.avatarDecorationURL?.() ?? 'None'],
            ['Fetched Banner URL', botUser.bannerURL?.({ size: 4096 }) ?? 'None'],
            ['Fetched Accent Color', botUser.hexAccentColor ?? 'None'],
            ['Fetched Flags', bitfieldText(botUser.flags)],
            ['Global Commands Fetched', globalCommands?.size ?? 'Unavailable'],
            ['Command Name/Type Preview', commandNames],
            ['Allowed Mentions Parse', listText(c.options.allowedMentions?.parse)],
            ['Partial Types', listText(c.options.partials)],
            ['Sweepers Configured', c.options.sweepers ? Object.keys(c.options.sweepers).join(', ') : 'Default'],
        ],
        A.bCyan,
    );

    renderTable(
        '🏰',
        'GUILD SUMMARY',
        [
            ['Total Member Count', totalMembers],
            ['Average Guild Size', avgMembers],
            ['Largest Guild', largestGuild ? `${largestGuild.name} (${largestGuild.memberCount ?? 0})` : 'None'],
            ['Smallest Guild', smallestGuild ? `${smallestGuild.name} (${smallestGuild.memberCount ?? 0})` : 'None'],
            ['Guild Features Top', topCounts(allGuildFeatures, (feature) => feature, 10)],
            ['Boost Subscriptions', collectionSum(guilds, (guild) => guild.premiumSubscriptionCount)],
            ['Guild Vanity URLs Cached', guilds.filter((guild) => guild.vanityURLCode).size],
            ['Guilds With Banners', guilds.filter((guild) => guild.banner).size],
            ['Guilds With Splash', guilds.filter((guild) => guild.splash).size],
            ['Preferred Locales', topCounts(guilds, (guild) => guild.preferredLocale || 'Unknown', 8)],
            ['NSFW Levels', topCounts(guilds, (guild) => guild.nsfwLevel ?? 'Unknown', 8)],
            ['Verification Levels', topCounts(guilds, (guild) => guild.verificationLevel ?? 'Unknown', 8)],
        ],
        A.bGreen,
    );

    renderTable('📡', 'CHANNEL TYPES', channelBreakdown.length ? channelBreakdown : [['None', 0]], A.bGreen);

    renderTable(
        '⚙️',
        'RUNTIME EXTENDED',
        [
            ['Project Root', __dirname],
            ['Process CWD', process.cwd()],
            ['Hostname', os.hostname()],
            ['OS Type', os.type()],
            ['OS Release', os.release()],
            ['OS Uptime', hr(os.uptime())],
            ['CPU Model', os.cpus()?.[0]?.model ?? 'Unknown'],
            ['CPU Cores', os.cpus()?.length ?? 'Unknown'],
            ['Load Average', os.loadavg?.().map((n) => n.toFixed(2)).join(', ') ?? 'Unavailable'],
            ['Total System Memory MB', mb(os.totalmem())],
            ['Free System Memory MB', mb(os.freemem())],
            ['Array Buffers MB', mb(mem.arrayBuffers ?? 0)],
            ['Heap Used MB', mb(mem.heapUsed)],
            ['Heap Total MB', mb(mem.heapTotal)],
            ['External MB', mb(mem.external)],
            ['RSS MB', mb(mem.rss)],
            ['Process Uptime', hr(process.uptime())],
            ['Shard States', shardStates.join(', ')],
            ['Gateway Ping', `${c.ws.ping}ms`],
        ],
        A.bMagenta,
    );

    renderTable(
        '🔐',
        'REMOTE RECOVERY',
        [
            ['Enabled', boolText(remoteRecoveryEnabled)],
            ['Owner IDs Configured', recoveryOwnerIds.size],
            ['Command Prefix', `${recoveryPrefix} recover`],
            ['Recovery Root', recoveryRoot],
            ['Default Tree Depth', 3],
            ['Max Files', maxRecoveryFiles],
            ['File Limit Bytes', maxRecoveryFileBytes],
            ['Dump/Archive Limit Bytes', maxRecoveryArchiveBytes],
            ['Excluded Entries', listText(RECOVERY_EXCLUDED_NAMES)],
            ['Excluded Extensions', listText(RECOVERY_EXCLUDED_EXTS)],
        ],
        remoteRecoveryEnabled ? A.bYellow : A.gray,
    );

    // TOP GUILDS
    const topGuilds = c.guilds.cache
        .sort((a, b) => b.memberCount - a.memberCount)
        .first(5)
        .map((g) => ({
            'Name': g.name.slice(0, 18),
            'ID': g.id,
            'Members': g.memberCount,
            'Boost Lvl': g.premiumTier,
            'Boosts': g.premiumSubscriptionCount ?? 0,
            'Locale': g.preferredLocale,
            'Created': g.createdAt.toLocaleDateString(),
        }));

    renderMultiTable('📋', 'FIRST 5 GUILDS (by members)', topGuilds, A.bYellow);

    // FOOTER
    console.log('');
    console.log(col(A.bCyan, '═'.repeat(w)));
    const done = `  ✅  Clanker 2.0 — ${c.user.tag}  •  Online & Ready  🚀  `;
    const donePad = Math.max(0, Math.floor((w - strip(done).length) / 2));
    console.log(' '.repeat(donePad) + col(A.bold + A.bGreen, done));
    console.log(col(A.bCyan, '═'.repeat(w)));
    console.log('');

    if (remoteRecoveryEnabled) {
        if (recoveryOwnerIds.size === 0) {
            console.log(col(A.bRed, 'Remote recovery is enabled but CLANKER_OWNER_IDS is empty. Commands are blocked.'));
        } else {
            console.log(col(A.bYellow, `Remote recovery enabled for root: ${recoveryRoot}`));
            console.log(col(A.gray, `Recovery command prefix: ${recoveryPrefix} recover`));
        }
    }

    const autoExitMs = Number(process.env.CLANKER_AUTO_EXIT_AFTER_READY_MS || 0);
    if (Number.isFinite(autoExitMs) && autoExitMs > 0) {
        setTimeout(() => {
            console.log(col(A.gray, 'Exiting...'));
            c.destroy();
            process.exit(0);
        }, autoExitMs);
    }
});

client.on(Events.MessageCreate, handleRecoveryCommand);

client.login(token).catch((err) => {
    console.error(`Discord login failed: ${err.message}`);
    process.exit(1);
});
