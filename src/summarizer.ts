import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

interface SummaryResult {
  summary: string;
  translation: string;
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

async function generateTranslation(title: string, content: string, anthropic: Anthropic): Promise<string> {
  // Use larger limit for translation and higher-tier model
  const maxContentLength = 150000;
  const truncatedContent = content.length > maxContentLength 
    ? content.substring(0, maxContentLength) + '...\n[Content truncated due to length]'
    : content;

  const systemPrompt = `You are an expert Japanese translator with deep understanding of both English and Japanese languages. Your specialty is producing complete, faithful translations that preserve every detail of the original content. You MUST translate the entire content without any omissions or summarization. Always write in polite Japanese (ですます調).`;

  const userPrompt = `Translate the following article completely into Japanese.

**REQUIREMENTS:**
- Translate EVERY sentence and paragraph - do not omit any content
- Maintain the original structure and organization  
- Preserve all details, examples, quotes, and technical information
- Use polite Japanese (ですます調) throughout
- Do not summarize - this must be a complete translation
- Do not include any explanations, introductions, or meta-commentary
- Output ONLY the translated text, nothing else
- Start directly with the translated content

Article Title: ${title}

Article Content:
${truncatedContent}`;

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

export async function summarizeContent(title: string, content: string): Promise<SummaryResult> {
  const apiKey = config.getApiKey();
  const anthropic = new Anthropic({ apiKey });

  try {
    console.log('    🔄 要約を生成中...');
    const summary = await generateSummary(title, content, anthropic);
    
    console.log('    🔄 全文翻訳を生成中...');
    const translation = await generateTranslation(title, content, anthropic);

    return { summary, translation };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Claude API error: ${error.message}`);
    }
    throw error;
  }
}