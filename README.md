# Clanker 2.0

Clanker 2.0 is a Discord bot launcher with a terminal UI, token setup flow, detailed bot diagnostics, and a built-in project explorer.

## Requirements

- Node.js 18 or newer
- npm
- A Discord bot token

## Setup

1. Install dependencies:

    ```bash
    npm install
    ```

2. Copy `.env.example` to `.env` and set your token:

    ```env
    TOKEN=your_discord_bot_token
    ```

3. Start the launcher:

    ```bash
    npm start
    ```

## Commands

- `npm start` - open the Clanker CLI launcher.
- `npm run bot` - run the Discord bot directly.
- `npm run explorer` - open the project explorer directly.
- `npm run dev` - run the bot with Node watch mode.
- `npm test` - run syntax checks for the main scripts.

## Bot Diagnostics

When the bot reaches Discord's ready state, it prints an ASCII-safe diagnostics report. The report includes application metadata, owner/team details, bot user details, cached guild/channel statistics, global command fetch results, gateway/shard status, runtime memory/CPU information, and remote recovery configuration.

The CLI, explorer, and shell launcher avoid emoji and box-drawing characters so the output stays readable in Windows Terminal, PowerShell, Git Bash, SSH sessions, and hosting consoles.

## Script Launchers

- Windows: double-click or run `start.bat`.
- Bash/Git Bash/WSL/macOS/Linux: run `./start.sh`.

Both launchers now switch to the project directory before starting Node. This prevents `.env`, `cli.js`, or `index.js` from being resolved from the wrong working directory.

You can also pass a token directly:

```bash
./start.sh YOUR_TOKEN
```

```bat
start.bat YOUR_TOKEN
```

## Project Explorer

The explorer can browse files, show project statistics, search text, export reports, and show Git information.

Open it from the CLI menu or run:

```bash
npm run explorer
```

## Remote Recovery

Remote recovery lets the running Discord bot send you the project files from the server or VPS where it is currently running.

This only works if this updated bot code is running on that remote machine. If the old bot is already running somewhere and you cannot deploy code, use SSH, SFTP, the hosting file manager, or the provider control panel instead.

Enable it in `.env` on the remote machine:

```env
CLANKER_REMOTE_RECOVERY=1
CLANKER_OWNER_IDS=YOUR_DISCORD_USER_ID
CLANKER_RECOVERY_PREFIX=!clanker
```

Optional root override:

```env
CLANKER_RECOVERY_ROOT=/path/to/project
```

If `CLANKER_RECOVERY_ROOT` is empty, recovery uses the folder that contains `index.js`.

Commands:

```text
!clanker recover help
!clanker recover where
!clanker recover tree 4
!clanker recover file index.js
!clanker recover dump
!clanker recover archive
```

Files and archives are sent to the owner by DM. The bot excludes `.env`, `.git`, `node_modules`, `.clanker.json`, logs, database files, and private key extensions by default.

Discord must allow the bot to read message content for these prefix commands. Enable the Message Content Intent in the Discord Developer Portal if commands are not detected.

## Notes

- `.env` and `.clanker.json` are ignored by Git.
- Do not commit real Discord tokens.
- The bot stays online by default. For temporary diagnostic runs, set `CLANKER_AUTO_EXIT_AFTER_READY_MS` to a positive millisecond value.
