import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

interface SummaryResult {
  summary: string;
  translation: string;
  translatedTitle: string;
  tags: string[];
  validImageUrl?: string;
}

function cleanTranslationOutput(rawTranslation: string): string {
  // Remove common AI explanation patterns
  const cleaningPatterns = [
    // Remove explanatory introductions
    /^(はい、)?以下に?記事の?(全文|内容)を?(忠実に?|完全に?)?日本語に?翻?訳(いたします|します).*?\n\n?/i,
    /^記事タイトル[：:]\s*[\s\S]*?\n記事本文[：:]\s*/i,
    /^Article Title[：:]?\s*[\s\S]*?\n\n?/i,
    /^原文の?(構成|内容|詳細).*?(維持|保持).*?\n\n?/i,
    /^(内容を省略することなく|すべて維持し).*?\n\n?/i,
    /^(丁寧語|ですます調).*?訳出.*?\n\n?/i,
    /^(原文と同じ長さの|完全な翻訳).*?\n\n?/i,
    
    // Remove meta-commentary
    /\n\n?注[：:].*$/i,
    /\n\n?(以上が|これで).*?翻訳.*?(です|となります)\.?$/i,
    /\n\n?翻訳は以上.*?$/i,
    
    // Remove repeated title patterns
    /^記事タイトル[：:]\s*/i,
    /^Article Title[：:]?\s*/i,
  ];
  
  let cleaned = rawTranslation;
  
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
  const maxContentLength = 80000; // Larger limit for summary
  const truncatedContent = content.length > maxContentLength 
    ? content.substring(0, maxContentLength) + '...\n[Content truncated due to length]'
    : content;

  const systemPrompt = `You are an expert Japanese language summarization specialist. You excel at creating concise, informative summaries in polite Japanese (ですます調).`;

  const userPrompt = `Please create a concise 3-line summary in Japanese (3行まとめ) that captures the most important points of the following article.

**Requirements:**
- Exactly 3 lines, each capturing a key point
- Use polite Japanese (ですます調)
- Be concise but informative
- Focus on the main ideas and conclusions

Article Title: ${title}

Article Content:
${truncatedContent}

Please format your response as:
1. [First key point in polite Japanese]
2. [Second key point in polite Japanese]
3. [Third key point in polite Japanese]`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

async function generateTitleTranslation(title: string, anthropic: Anthropic): Promise<string> {
  const systemPrompt = `You are an expert Japanese translator. You must always translate English text into Japanese. Never respond in English.`;
  
  const userPrompt = `以下の英語記事タイトルを自然な日本語に翻訳してください：

"${title}"

要件：
- 翻訳されたタイトルのみを出力してください（説明は不要）
- 自然で読みやすい日本語にしてください
- 元の意味とトーンを保持してください
- 必ず日本語で回答してください`;
  
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 512,
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
  const maxContentLength = 50000;
  const truncatedContent = content.length > maxContentLength 
    ? content.substring(0, maxContentLength) + '...\n[Content truncated for tag generation]'
    : content;

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
${truncatedContent}

Provide only the tags, separated by spaces, in the format: #tag1 #tag2 #tag3
Example: #人工知能 #機械学習 #Python #データサイエンス`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 512,
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

async function extractThumbnailFromHtml(htmlContent: string, title: string, anthropic: Anthropic): Promise<string | undefined> {
  const systemPrompt = `You are an expert at analyzing HTML content to find suitable thumbnail images for articles. You should identify the best image that represents the article content.`;
  
  const maxHtmlLength = 20000;
  const truncatedHtml = htmlContent.length > maxHtmlLength 
    ? htmlContent.substring(0, maxHtmlLength) + '...'
    : htmlContent;
  
  const userPrompt = `Analyze this HTML content and find the best thumbnail image for the article.

Article Title: "${title}"

HTML Content:
${truncatedHtml}

Instructions:
1. Look for images in the HTML (img tags, meta og:image, twitter:image, etc.)
2. Choose the most suitable image as a thumbnail:
   - Prefer content-related images over logos/icons
   - Choose the first significant image in the article if no meta image
   - Avoid small icons, avatars, logos, advertisements
   - Prefer larger, high-quality images
3. Return ONLY the image URL, nothing else
4. If no suitable image is found, return "NONE"

Extract the best thumbnail image URL:`;
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });
    
    const result = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim();
    
    if (result === 'NONE' || !result.startsWith('http')) {
      return undefined;
    }
    
    return result;
  } catch {
    return undefined;
  }
}

async function generateTranslation(title: string, htmlContent: string, anthropic: Anthropic): Promise<string> {

  const systemPrompt = `You are an expert Japanese translator with deep understanding of both English and Japanese languages. Your specialty is producing complete, faithful translations that preserve every detail of the original content while maintaining proper formatting. You MUST translate the entire content without any omissions or summarization. Always write in polite Japanese (ですます調).`;

  const maxHtmlLength = 50000;
  const truncatedHtml = htmlContent.length > maxHtmlLength 
    ? htmlContent.substring(0, maxHtmlLength) + '...'
    : htmlContent;
  
  const userPrompt = `Translate the following article HTML into Japanese with proper markdown formatting.

**REQUIREMENTS:**
- Translate EVERY sentence and paragraph - do not omit any content
- Convert HTML to markdown while preserving structure
- Use polite Japanese (ですます調) throughout
- **HTML TO MARKDOWN CONVERSION:**
  - Convert <pre><code> or <code> blocks to \`\`\` markdown code blocks
  - Convert <strong> or <b> to **bold** markdown
  - Convert <em> or <i> to *italic* markdown
  - Convert <h1>, <h2>, etc. to # markdown headers
  - **LIST CONVERSION - VERY IMPORTANT:**
    - Convert <ul><li>item</li><li>item</li></ul> to:
      - item
      - item
    - Convert <ol><li>item</li><li>item</li></ol> to:
      1. item
      2. item
    - Each list item should be on its own line with proper markdown bullet/number
    - Maintain list hierarchy for nested lists
  - Preserve line breaks and paragraph structure
  - Remove HTML tags but keep the formatting as markdown
- **SPECIAL ATTENTION TO LISTS:** Look for any list structures in the HTML and ensure they are properly converted to markdown format
- Do not include any explanations, introductions, or meta-commentary
- Output ONLY the translated markdown text, nothing else
- Start directly with the translated content

Article Title: ${title}

HTML Content:
${truncatedHtml}`

  // Use Sonnet as default for better speed
  const model = 'claude-3-5-sonnet-20241022';
  const maxTokens = 8192;
  
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const rawTranslation = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
  
  return cleanTranslationOutput(rawTranslation);
}

export async function summarizeContent(title: string, content: string, htmlContent: string): Promise<SummaryResult> {
  const apiKey = config.getApiKey();
  const anthropic = new Anthropic({ apiKey });

  try {
    console.log('    🔄 要約を生成中...');
    const summary = await generateSummary(title, content, anthropic);
    
    console.log('    🔄 タイトルを翻訳中...');
    const translatedTitle = await generateTitleTranslation(title, anthropic);
    
    // Fallback if translation fails or returns empty
    const finalTitle = translatedTitle.trim() || title;
    
    console.log('    🔄 サムネイル画像を抽出中...');
    const validImageUrl = await extractThumbnailFromHtml(htmlContent, title, anthropic);
    
    console.log('    🔄 タグを生成中...');
    const tags = await generateTags(title, content, anthropic);
    
    console.log('    🔄 全文翻訳を生成中...');
    const translation = await generateTranslation(title, htmlContent, anthropic);

    return { summary, translation, translatedTitle: finalTitle, tags, validImageUrl };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Claude API error: ${error.message}`);
    }
    throw error;
  }
}