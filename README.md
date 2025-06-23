# Article Summarizer JP

A CLI tool that fetches articles from URLs and summarizes them in Japanese using Anthropic Claude API.

## Features

- 🌐 Fetches content from any URL
- 📦 Supports multiple URLs in single command
- 🤖 Falls back to headless browser if regular fetch fails
- 📝 Generates 3-line Japanese summary
- 🈲 Provides full Japanese translation
- 💾 Saves output as Markdown files
- ⚙️ Configurable API key storage
- 📊 Shows detailed progress and results summary

## Prerequisites

- Node.js 14 or higher
- npm or yarn
- Anthropic API key (get one at https://console.anthropic.com/)

## Installation

### From npm (Recommended)

```bash
npm install -g article-summarizer-jp
```

### From source

```bash
# Clone the repository
git clone https://github.com/sKawashima/article-summarizer-jp.git
cd article-summarizer-jp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Before first use, configure your Anthropic API key:

```bash
article-summarizer-jp --config
# or use the short alias
asumjp --config
```

You'll be prompted to enter your API key, which will be securely stored.

## Usage

### Basic usage with URL argument

```bash
# Single URL
article-summarizer-jp https://example.com/article

# Multiple URLs (supports up to 5 concurrent processing)
article-summarizer-jp https://example.com/article1 https://example.com/article2 https://example.com/article3

# or use the short alias
asumjp https://example.com/article1 https://example.com/article2
```

### Interactive mode (prompts for URL)

```bash
article-summarizer-jp
# or
asumjp
```

### Watch mode (continuous URL input)

```bash
# Start watch mode for continuous URL input
article-summarizer-jp --watch
# or
asumjp -w

# Watch mode with date prefix
article-summarizer-jp --watch --date-prefix
# or
asumjp -w -d
```

### Filename options

```bash
# Add date prefix to filename (YYYY-MM-DD_title.md format)
article-summarizer-jp --date-prefix https://example.com/article
# or
asumjp -d https://example.com/article
```

### Development mode (if installed from source)

```bash
# Run in development mode with tsx
npm run dev https://example.com/article

# Run multiple URLs in development mode
npm run dev https://example.com/article1 https://example.com/article2

# Run with options in development mode
npm run dev -- --watch
npm run dev -- --date-prefix https://example.com/article

# Build and run production version
npm run build
npm run start https://example.com/article

# Type check without building
npm run lint
```

### Command line options

| Option | Short | Description |
|--------|-------|-------------|
| `--config` | - | Configure or reconfigure API key |
| `--watch` | `-w` | Start in watch mode for continuous URL input |
| `--date-prefix` | `-d` | Add date prefix to filename (YYYY-MM-DD_title.md format) |
| `--version` | `-V` | Display version number |
| `--help` | `-h` | Display help information |

## Output

The tool creates a Markdown file with the format:
- Filename: `📰 [Article Title].md`
- Content includes:
  - Original article link
  - Scraping date
  - 3-line summary in Japanese
  - Full Japanese translation

## Example Output

```markdown
# [Article Title](https://example.com/article)
scrap at [[2024-01-06]]

## 3行まとめ
1. First key point in Japanese
2. Second key point in Japanese
3. Third key point in Japanese

## 全文和訳
[Full Japanese translation of the article]
```

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Type check
npm run lint
```

## Publishing to npm

If you want to publish this package to npm:

### Prerequisites
- npm account (create at https://www.npmjs.com/)
- npm CLI logged in (`npm login`)

### Steps

1. **Update version** (choose one):
   ```bash
   # Patch version (1.1.0 → 1.1.1)
   npm version patch
   
   # Minor version (1.1.0 → 1.2.0)
   npm version minor
   
   # Major version (1.1.0 → 2.0.0)
   npm version major
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

3. **Publish to npm**:
   ```bash
   # Public package
   npm publish
   
   # Scoped package (if package name starts with @)
   npm publish --access public
   ```

4. **Verify publication**:
   ```bash
   npm info article-summarizer-jp
   ```

### Publishing checklist
- [ ] Tests pass (`npm test` if available)
- [ ] Build succeeds (`npm run build`)
- [ ] README is up to date
- [ ] Version is updated appropriately
- [ ] All changes are committed to git
- [ ] Package.json metadata is correct (description, keywords, etc.)

## Troubleshooting

### "API key not configured" error
Run `article-summarizer-jp --config` (or `asumjp --config`) to set up your API key.

### Content extraction fails
The tool automatically falls back to a headless browser (Puppeteer) if the initial fetch fails. This handles JavaScript-rendered content and pages with anti-bot measures.

### Rate limiting
If you encounter rate limiting from the Anthropic API, consider adding delays between requests or upgrading your API plan.

## License

ISC