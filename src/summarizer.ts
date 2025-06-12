import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { extractThumbnailFromHtml } from './thumbnailExtractor.js';

interface SummaryResult {
  summary: string;
  details: string;
  translatedTitle: string;
  tags: string[];
  validImageUrl?: string;
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
    .replace(/\n{2,}/g, '\n')    // Multiple line breaks to single
    .replace(/^\s+/, '')         // Leading whitespace
    .replace(/\s+$/, '');        // Trailing whitespace
  
  return cleaned;
}

function cleanDetailsOutput(rawDetails: string): string {
  // Remove HTML tags except for media-related ones
  let cleaned = rawDetails;
  
  // Preserve image and video tags by temporarily replacing them
  const mediaPlaceholders: { [key: string]: string } = {};
  let placeholderIndex = 0;
  
  // Preserve markdown images
  cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
    const placeholder = `__MEDIA_PLACEHOLDER_${placeholderIndex++}__`;
    mediaPlaceholders[placeholder] = match;
    return placeholder;
  });
  
  // Preserve markdown links for videos
  cleaned = cleaned.replace(/\[Video[^]]*\]\([^)]+\)/g, (match) => {
    const placeholder = `__MEDIA_PLACEHOLDER_${placeholderIndex++}__`;
    mediaPlaceholders[placeholder] = match;
    return placeholder;
  });
  
  // Remove all HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  
  // Restore media placeholders
  Object.keys(mediaPlaceholders).forEach(placeholder => {
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
    .replace(/\n{3,}/g, '\n\n')  // Multiple line breaks to double
    .replace(/^\s+/, '')         // Leading whitespace
    .replace(/\s+$/, '');        // Trailing whitespace
  
  return cleaned;
}

async function generateSummary(title: string, content: string, anthropic: Anthropic): Promise<string> {

  const systemPrompt = `You are an expert Japanese language summarization specialist. You excel at creating concise, informative summaries in polite Japanese (ですます調).`;

  const userPrompt = `Please create a concise 3-line summary in Japanese (3行まとめ) that captures the most important points of the following article.

**Requirements:**
- Exactly 3 lines, each capturing a key point
- Use polite Japanese (ですます調)
- Be concise but informative
- Focus on the main ideas and conclusions
- No empty lines between the 3 lines

Article Title: ${title}

Article Content:
${content}

Please format your response as three consecutive lines:
1. [First key point in polite Japanese]
2. [Second key point in polite Japanese]  
3. [Third key point in polite Japanese]`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const rawSummary = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
    
  return cleanSummaryOutput(rawSummary);
}

function isJapanese(text: string): boolean {
  // Check if text contains Japanese characters (hiragana, katakana, kanji)
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  return japaneseRegex.test(text);
}

async function generateTitleTranslation(title: string, anthropic: Anthropic): Promise<string> {
  // If title is already in Japanese, return as-is
  if (isJapanese(title)) {
    return title;
  }
  
  const systemPrompt = `You are an expert Japanese translator. You can translate from any language into Japanese. Always respond in Japanese only.`;
  
  const userPrompt = `Translate the following article title into natural Japanese:

"${title}"

Requirements:
- Output only the translated title (no explanations needed)
- Make it natural and readable Japanese
- Preserve the original meaning and tone
- Always respond in Japanese
- Translate from any language to Japanese`;
  
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
    temperature: 0.2,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });
  
  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

async function generateTags(title: string, content: string, anthropic: Anthropic): Promise<string[]> {

  const systemPrompt = `You are an expert content analyst who creates relevant tags for articles. Generate appropriate tags following Japanese conventions.`;

  const userPrompt = `Analyze the following article and generate relevant tags.

**Tag Guidelines:**
- Use multiple tags (3-8 tags recommended)
- Use Japanese for common terms, keep proper nouns in original language
- Replace spaces with underscores
- Replace commas with underscores
- Focus on main topics, technologies, concepts, and themes
- Make tags specific and useful for categorization

Article Title: ${title}

Article Content:
${content}

Provide only the tags, separated by spaces, in the format: #tag1 #tag2 #tag3
Example: #人工知能 #機械学習 #Python #データサイエンス`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const tagsText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();

  // Extract tags from the response
  const tagMatches = tagsText.match(/#[^\s]+/g) || [];
  return tagMatches.map(tag => tag.substring(1)); // Remove # prefix
}

// LLM-based thumbnail extraction removed - now using HTML parsing approach

async function generateDetails(title: string, htmlContent: string, anthropic: Anthropic): Promise<string> {

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
${htmlContent}`

  // Use Sonnet as default for better speed
  const model = 'claude-3-5-sonnet-20241022';
  
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const rawDetails = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
  
  return cleanDetailsOutput(rawDetails);
}

export async function summarizeContent(title: string, content: string, htmlContent: string, baseUrl: string, isSilent = false): Promise<SummaryResult> {
  const apiKey = config.getApiKey();
  const anthropic = new Anthropic({ apiKey });

  try {
    if (!isSilent) {
      console.log('    🔄 要約を生成中...');
    }
    const summary = await generateSummary(title, content, anthropic);
    
    if (!isSilent) {
      console.log('    🔄 タイトルを翻訳中...');
    }
    const translatedTitle = await generateTitleTranslation(title, anthropic);
    
    // Fallback if translation fails or returns empty
    const finalTitle = translatedTitle.trim() || title;
    
    if (!isSilent) {
      console.log('    🔄 サムネイル画像を抽出中...');
    }
    const validImageUrl = extractThumbnailFromHtml(htmlContent, baseUrl);
    
    if (!isSilent) {
      console.log('    🔄 タグを生成中...');
    }
    const tags = await generateTags(title, content, anthropic);
    
    if (!isSilent) {
      console.log('    🔄 詳細を生成中...');
    }
    const details = await generateDetails(title, htmlContent, anthropic);

    return { summary, details, translatedTitle: finalTitle, tags, validImageUrl };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Claude API error: ${error.message}`);
    }
    throw error;
  }
}