import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { extractThumbnailFromHtml } from './thumbnailExtractor.js';

// Claude Sonnet 4.5 is retired on 2026-11-30; use Claude Sonnet 5.5.
const MODEL = 'claude-sonnet-5-5';

function assertNotRefused(response: Anthropic.Message): void {
  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category ?? 'unknown';
    throw new Error(`Claude declined the request (category: ${category})`);
  }
}

interface SummaryResult {
  summary: string;
  details: string;
  translatedTitle: string;
  tags: string[];
  validImageUrl?: string;
}

interface CombinedSummaryData {
  summary: string;
  translatedTitle: string;
  tags: string[];
}

function cleanSummaryOutput(rawSummary: string): string {
  // Remove common AI explanation patterns from summary
  const cleaningPatterns = [
    // Remove introductions
    /^(Here's a 3-line summary in polite Japanese|以下が3行のまとめです|3行まとめは以下の通りです).*?[：:]?\s*\n+/i,
    /^(以下に|こちらが).*?3行.*?(まとめ|要約).*?[：:]?\s*\n+/i,

    // Remove conclusions
    /\n+.*?(以上が|これが).*?3行.*?(まとめ|要約).*?$/i,
    /\n+.*?となります。?$/i,
  ];

  let cleaned = rawSummary;

  // Apply cleaning patterns
  for (const pattern of cleaningPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove excessive whitespace
  cleaned = cleaned
    .replace(/\n{2,}/g, '\n') // Multiple line breaks to single
    .replace(/^\s+/, '') // Leading whitespace
    .replace(/\s+$/, ''); // Trailing whitespace

  return cleaned;
}

function convertRelativeToAbsolute(imageUrl: string, baseUrl: string): string {
  try {
    // If already absolute, return as is
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl;
    }

    // Handle protocol-relative URLs
    if (imageUrl.startsWith('//')) {
      const parsedBase = new URL(baseUrl);
      return `${parsedBase.protocol}${imageUrl}`;
    }

    // Convert relative to absolute
    return new URL(imageUrl, baseUrl).href;
  } catch {
    return imageUrl; // Return original if conversion fails
  }
}

function cleanDetailsOutput(rawDetails: string, baseUrl?: string): string {
  // Remove HTML tags except for media-related ones
  let cleaned = rawDetails;

  // Preserve image and video tags by temporarily replacing them
  const mediaPlaceholders: { [key: string]: string } = {};
  let placeholderIndex = 0;

  // Preserve markdown images and convert relative URLs to absolute
  cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const placeholder = `__MEDIA_PLACEHOLDER_${placeholderIndex++}__`;
    const absoluteUrl = baseUrl ? convertRelativeToAbsolute(url, baseUrl) : url;
    mediaPlaceholders[placeholder] = `![${alt}](${absoluteUrl})`;
    return placeholder;
  });

  // Preserve all markdown links and convert relative URLs to absolute
  cleaned = cleaned.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_, linkText, url) => {
    const placeholder = `__MEDIA_PLACEHOLDER_${placeholderIndex++}__`;
    const absoluteUrl = baseUrl ? convertRelativeToAbsolute(url, baseUrl) : url;
    mediaPlaceholders[placeholder] = `[${linkText}](${absoluteUrl})`;
    return placeholder;
  });

  // Convert HTML attributes with URLs to absolute paths before removing tags
  if (baseUrl) {
    // Handle src attributes
    cleaned = cleaned.replace(/src="([^"]+)"/g, (_, url) => {
      const absoluteUrl = convertRelativeToAbsolute(url, baseUrl);
      return `src="${absoluteUrl}"`;
    });

    // Handle href attributes
    cleaned = cleaned.replace(/href="([^"]+)"/g, (_, url) => {
      const absoluteUrl = convertRelativeToAbsolute(url, baseUrl);
      return `href="${absoluteUrl}"`;
    });
  }

  // Remove all HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Convert standalone URLs that might appear in text
  if (baseUrl) {
    // Match URLs that start with / but are not already absolute
    cleaned = cleaned.replace(/(?:^|\s)(\/[^\s<>]+)(?=\s|$)/g, (match, url) => {
      const absoluteUrl = convertRelativeToAbsolute(url, baseUrl);
      return match.replace(url, absoluteUrl);
    });
  }

  // Restore media placeholders
  Object.keys(mediaPlaceholders).forEach((placeholder) => {
    cleaned = cleaned.replace(placeholder, mediaPlaceholders[placeholder]);
  });

  // Remove common AI explanation patterns
  const cleaningPatterns = [
    // Remove explanatory introductions
    /^(はい、)?以下に?.*?(詳細|内容|説明)を?(日本語で)?.*?(提供|記載|説明)(いたします|します).*?\n\n?/i,
    /^記事の詳細.*?[：:]?\s*\n+/i,
    /^Details of the article.*?[：:]?\s*\n+/i,

    // Remove meta-commentary
    /\n\n?注[：:].*$/i,
    /\n\n?(以上が|これで).*?(詳細|説明).*?(です|となります)\.?$/i,
  ];

  // Apply cleaning patterns
  for (const pattern of cleaningPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove excessive whitespace
  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n') // Multiple line breaks to double
    .replace(/^\s+/, '') // Leading whitespace
    .replace(/\s+$/, ''); // Trailing whitespace

  return cleaned;
}

function truncateContent(content: string, maxTokens: number = 100000): string {
  // Claude side prompt overhead (≈2k tokens) を見越して余裕を確保
  const reservedPromptTokens = 2000;
  const effectiveMaxTokens = maxTokens - reservedPromptTokens;
  // More conservative token estimation: 1 token ≈ 3 characters for mixed content
  const maxChars = effectiveMaxTokens * 3;

  console.log(
    `  🔍 コンテンツ長: ${content.length}文字, 制限: ${maxChars}文字 (${effectiveMaxTokens}トークン + ${reservedPromptTokens}予約)`
  );

  if (content.length <= maxChars) {
    console.log('  ✅ コンテンツは制限内です');
    return content;
  }

  console.log('  ⚠️  コンテンツが長すぎます。切り詰めます...');

  // Try to truncate at paragraph or sentence boundaries
  const truncated = content.substring(0, maxChars);

  // Find the last paragraph break
  const lastParagraph = truncated.lastIndexOf('\n\n');
  if (lastParagraph > maxChars * 0.8) {
    const result = truncated.substring(0, lastParagraph);
    console.log(`  ✂️  段落区切りで切り詰め: ${result.length}文字`);
    return result;
  }

  // Find the last sentence break
  const lastSentence = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('？')
  );
  if (lastSentence > maxChars * 0.8) {
    const result = truncated.substring(0, lastSentence + 1);
    console.log(`  ✂️  文区切りで切り詰め: ${result.length}文字`);
    return result;
  }

  // Fallback（上限ギリギリを死守）
  const result = truncated.slice(0, maxChars - 3) + '...';
  console.log(`  ✂️  文字数制限で切り詰め: ${result.length}文字`);
  return result;
}

async function generateCombinedSummaryData(
  title: string,
  truncatedContent: string,
  anthropic: Anthropic
): Promise<CombinedSummaryData> {
  // Structured outputs replace the forced tool call (forced tool_choice returns 400 on Sonnet 5.5).
  const schema = {
    type: 'object',
    properties: {
      translatedTitle: {
        type: 'string',
        description:
          'Article title translated to natural Japanese. If the original title is already in Japanese, return it as-is. Always respond in Japanese only.',
      },
      summary: {
        type: 'string',
        description:
          'Exactly 3 lines of concise Japanese summary in polite form (ですます調). Each line should capture a key point. No empty lines between the 3 lines.',
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
        },
        description:
          'Array of 3-8 relevant tags. Use Japanese for common terms, keep proper nouns in original language. Replace spaces and commas with underscores. Focus on main topics, technologies, concepts, and themes.',
      },
    },
    required: ['translatedTitle', 'summary', 'tags'],
    additionalProperties: false,
  };

  const systemPrompt = `You are an expert Japanese content analyst and translator. You excel at creating concise summaries, natural translations, and relevant tags in Japanese.`;

  const userPrompt = `Analyze the following article and extract comprehensive summary data.

**Requirements:**
- Translate title to natural Japanese (if not already Japanese)
- Create exactly 3 lines of summary in polite Japanese (ですます調)  
- Generate 3-8 relevant tags using Japanese conventions
- Be concise but informative
- Focus on main ideas and conclusions

Article Title: ${title}

HTML Content:
${truncatedContent}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema },
    },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  assertNotRefused(response);
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Summary response was truncated (max_tokens reached)');
  }

  const jsonText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (!jsonText) {
    throw new Error('Structured summary response not found');
  }

  const result = JSON.parse(jsonText) as CombinedSummaryData;

  // Clean the summary output
  const cleanedSummary = cleanSummaryOutput(result.summary);

  return {
    translatedTitle: result.translatedTitle.trim() || title,
    summary: cleanedSummary,
    tags: result.tags || [],
  };
}

// LLM-based thumbnail extraction removed - now using HTML parsing approach

async function generateDetails(
  title: string,
  truncatedContent: string,
  anthropic: Anthropic,
  baseUrl: string
): Promise<string> {
  const systemPrompt = `You are an expert Japanese content analyst and translator. You can analyze and translate content from any language into Japanese. Your specialty is creating detailed, comprehensive descriptions of articles in Japanese while preserving key information and media elements.`;

  const userPrompt = `以下の記事コンテンツの詳細な日本語の説明を作成してください。

**要件:**
- メインコンテンツの詳細なカバレッジを提供（完全な翻訳ではなく、包括的な詳細）
- 丁寧な日本語（ですます調）で統一
- 適切なmardown形式で出力
- コンテンツ内の画像や動画をmarkdown要素として含める:
  - 画像: ![description](url) または ![alt text](url)
  - 動画: [Video: description](url) または埋め込みコードが利用可能な場合
- 重要な技術的詳細、引用、例を保持
- 適切なヘッダーとフォーマットで構造化
- 説明、前置き、メタコメンタリーは含めない
- 詳細コンテンツから直接始める
- どの言語のコンテンツでも日本語で説明してください

記事タイトル: ${title}

HTMLコンテンツ:
${truncatedContent}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  assertNotRefused(response);

  const rawDetails = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return cleanDetailsOutput(rawDetails, baseUrl);
}

export async function shortenTitle(title: string, maxLength: number = 40): Promise<string> {
  const apiKey = config.getApiKey();
  const anthropic = new Anthropic({ apiKey });

  try {
    const systemPrompt = `You are an expert at creating concise, meaningful titles in Japanese. You can condense long titles while preserving their essential meaning.`;

    const userPrompt = `以下のタイトルを${maxLength}文字以内に短縮してください。

**要件:**
- タイトルの核心的な意味を保持
- ${maxLength}文字以内に収める
- ファイル名として適切な形式
- 重要なキーワードを優先
- 自然な日本語

元のタイトル: ${title}

短縮されたタイトルのみを返してください。説明や前置きは不要です。`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    assertNotRefused(response);

    const shortenedTitle = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    return shortenedTitle || title.substring(0, maxLength);
  } catch (error) {
    // Fallback to simple truncation if API fails
    console.warn('    ⚠️  タイトル短縮に失敗しました。切り詰めます...');
    return title.substring(0, maxLength);
  }
}

export async function summarizeContent(
  title: string,
  htmlContent: string,
  baseUrl: string,
  isSilent = false,
  simplifyMode = false
): Promise<SummaryResult> {
  const apiKey = config.getApiKey();
  const anthropic = new Anthropic({ apiKey });

  try {
    // 1回だけコンテンツを切り詰めて両方に使用
    const truncatedContent = truncateContent(htmlContent);

    if (!isSilent) {
      console.log('    🔄 要約・タイトル・タグを生成中...');
    }
    const { summary, translatedTitle, tags } = await generateCombinedSummaryData(title, truncatedContent, anthropic);

    // Skip details generation in simplify mode, but still extract thumbnail
    let validImageUrl: string | undefined;
    let details = '';

    if (!simplifyMode) {
      if (!isSilent) {
        console.log('    🔄 サムネイル画像を抽出中...');
      }
      validImageUrl = extractThumbnailFromHtml(htmlContent, baseUrl);

      if (!isSilent) {
        console.log('    🔄 詳細を生成中...');
      }
      details = await generateDetails(title, truncatedContent, anthropic, baseUrl);
    } else {
      // Still extract thumbnail in simplify mode for better visual
      validImageUrl = extractThumbnailFromHtml(htmlContent, baseUrl);
    }

    return { summary, details, translatedTitle, tags, validImageUrl };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Claude API error: ${error.message}`);
    }
    throw error;
  }
}
