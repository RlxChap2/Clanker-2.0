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

## Notes

- `.env` and `.clanker.json` are ignored by Git.
- Do not commit real Discord tokens.
- The bot stays online by default. For temporary diagnostic runs, set `CLANKER_AUTO_EXIT_AFTER_READY_MS` to a positive millisecond value.
