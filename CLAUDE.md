# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build and Run
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run in development mode with tsx
- `npm run start` - Run the compiled CLI tool
- `npm run lint` - Type check without emitting files

### Development Workflow
```bash
# Test with a URL in development mode
npm run dev https://example.com/article

# Build and test production version
npm run build
npm run start https://example.com/article

# Configure API key
npm run start -- --config
```

## Architecture

### Core Components

1. **CLI Entry Point** (`src/index.ts`)
   - Uses Commander.js for argument parsing
   - Handles --config flag for API key setup
   - Orchestrates the entire summarization flow

2. **Content Fetching** (`src/fetcher.ts`)
   - Primary fetch using node-fetch
   - Fallback to Puppeteer for JavaScript-rendered content
   - Handles anti-bot measures with proper user agents

3. **Article Extraction** (`src/extractor.ts`)
   - Uses @extractus/article-extractor for intelligent content parsing
   - Falls back to DOM-based extraction with JSDOM
   - Removes scripts, styles, and extracts clean text

4. **Summarization** (`src/summarizer.ts`)
   - Integrates with Anthropic Claude API
   - Uses system prompts for Japanese language expertise
   - Generates both 3-line summary and full translation

5. **Configuration** (`src/config.ts`)
   - Uses Configstore for persistent API key storage
   - Validates API key format (must start with "sk-")

6. **Output** (`src/markdown.ts`)
   - Creates markdown files with emoji prefix
   - Formats with proper date stamps and structure

### Key Dependencies
- `@anthropic-ai/sdk` - Official Anthropic SDK
- `puppeteer` - Headless browser for complex pages
- `@extractus/article-extractor` - Smart article extraction
- `commander` - CLI framework
- `inquirer` - Interactive prompts
- `configstore` - Persistent configuration

### Error Handling
The tool includes comprehensive error handling:
- Invalid URLs are validated before processing
- Network errors fall back to headless browser
- API errors are caught and displayed clearly
- Content extraction failures provide meaningful messages

### TypeScript Configuration
- ES2022 target with ES modules
- Strict mode enabled
- Source maps for debugging
- Declaration files generated