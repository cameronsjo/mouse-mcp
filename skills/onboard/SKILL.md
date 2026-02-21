---
name: mouse-mcp
description: "Get started with mouse-mcp -- what it is, how to set it up, and how to use it"
---


Guide the user through getting started with **mouse-mcp** (Disney Parks MCP Server).

## About

An MCP server that provides Disney parks data to Claude Code. Returns structured data for attractions (height requirements, Lightning Lane, thrill levels), dining (service type, reservations, character dining), and other park entities. Uses Disney Finder API with ThemeParks.wiki fallback and SQLite caching.

## Prerequisites

Check that the user has the following installed/configured:

- Node.js 20+ (`node --version`)
- No API keys required for basic usage -- data is sourced from public Disney APIs
- Optionally: an OpenAI API key for higher-quality embeddings (otherwise uses local Transformers.js)

## Setup

Walk the user through initial setup:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the TypeScript:

   ```bash
   npm run build
   ```

3. Optionally copy and configure the environment file:

   ```bash
   cp .env.example .env
   ```

   The defaults work out of the box. Edit `.env` to change log level, database path, or embedding provider.

4. Configure the MCP server in Claude Code. Add to your MCP config:

   ```json
   {
     "mcpServers": {
       "disney": {
         "command": "node",
         "args": ["/Users/cameron/Projects/mouse-mcp/dist/index.js"]
       }
     }
   }
   ```

## First Use

Guide the user through their first interaction with the product:

1. Start in development mode for quick testing:

   ```bash
   npm run dev
   ```

2. Or connect via Claude Code with the MCP config above and ask:

   > "What are the thrill rides at Magic Kingdom?"

   Claude will call `disney_attractions` with `destination: "wdw"` and `filters.thrillLevel: "thrill"`.

3. Try a fuzzy entity lookup:

   > "Tell me about Space Mountain"

   Claude will call `disney_entity` with `name: "Space Mountain"` and return height requirements, Lightning Lane status, thrill level, and more.

4. Use the MCP Inspector for direct tool testing:

   ```bash
   npm run inspector
   ```

## Key Files

Point the user to the most important files for understanding the project:

- `src/index.ts` -- MCP server entry point and tool registration
- `src/tools/` -- Tool implementations: destinations, attractions, dining, entity, status
- `src/sources/` -- API clients: Disney Finder (primary), ThemeParks.wiki (fallback)
- `src/cache/` -- SQLite caching with FTS5 full-text search
- `.env.example` -- All supported environment variables with defaults
- `package.json` -- Scripts, dependencies, engine requirements
- `Dockerfile` -- Container build
- `docker-compose.yml` -- Docker Compose deployment

## Common Tasks

- **Development mode**: `npm run dev` (auto-reload via tsx watch)
- **Build**: `npm run build`
- **Type check**: `npm run check`
- **Run tests**: `npm test`
- **Full validation**: `npm run validate` (typecheck + lint + format check + tests)
- **Test with MCP Inspector**: `npm run inspector`
- **Run with Docker**: `docker compose up --build`
