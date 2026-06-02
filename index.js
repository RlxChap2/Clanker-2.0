const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Events, Client, Partials, GatewayIntentBits, ChannelType } = require('discord.js');

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

    const autoExitMs = Number(process.env.CLANKER_AUTO_EXIT_AFTER_READY_MS || 0);
    if (Number.isFinite(autoExitMs) && autoExitMs > 0) {
        setTimeout(() => {
            console.log(col(A.gray, 'Exiting...'));
            c.destroy();
            process.exit(0);
        }, autoExitMs);
    }
});

client.login(token).catch((err) => {
    console.error(`Discord login failed: ${err.message}`);
    process.exit(1);
});
