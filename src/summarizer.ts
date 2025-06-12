import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

interface SummaryResult {
  summary: string;
  translation: string;
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

  const userPrompt = `Please provide a complete and faithful Japanese translation of the entire article below. 

**CRITICAL REQUIREMENTS:**
- Translate EVERY sentence and paragraph - do not omit any content
- Maintain the original structure and organization
- Preserve all details, examples, quotes, and technical information
- Use polite Japanese (ですます調) throughout
- Do not summarize - this must be a complete translation
- If the original is long, your translation should also be long
- Translate everything from beginning to end

Article Title: ${title}

Article Content:
${truncatedContent}

Provide the complete Japanese translation:`;

  // Try Claude 3 Opus for best translation quality, fallback to Sonnet
  let model = 'claude-3-opus-20240229';
  let maxTokens = 4096;
  
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();
  } catch (error) {
    // If Opus fails, try with Sonnet and higher token limit
    console.log('    📝 Opus利用不可、Sonnetで再試行中...');
    model = 'claude-3-5-sonnet-20241022';
    maxTokens = 8192;
    
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();
  }
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