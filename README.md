# Article Summarizer JP

A CLI tool that fetches articles from URLs and summarizes them in Japanese using Anthropic Claude API.

## Features

- 🌐 Fetches content from any URL
- 🤖 Falls back to headless browser if regular fetch fails
- 📝 Generates 3-line Japanese summary
- 🈲 Provides full Japanese translation
- 💾 Saves output as Markdown files
- ⚙️ Configurable API key storage

## Prerequisites

- Node.js 14 or higher
- npm or yarn
- Anthropic API key (get one at https://console.anthropic.com/)

## Installation

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
npm run start -- --config
```

You'll be prompted to enter your API key, which will be securely stored.

## Usage

### Basic usage with URL argument

```bash
npm run start https://example.com/article
```

### Interactive mode (prompts for URL)

```bash
npm run start
```

### Development mode

```bash
npm run dev https://example.com/article
```

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

## Troubleshooting

### "API key not configured" error
Run `npm run start -- --config` to set up your API key.

### Content extraction fails
The tool automatically falls back to a headless browser (Puppeteer) if the initial fetch fails. This handles JavaScript-rendered content and pages with anti-bot measures.

### Rate limiting
If you encounter rate limiting from the Anthropic API, consider adding delays between requests or upgrading your API plan.

## License

ISC