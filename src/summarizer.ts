import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

interface SummaryResult {
  summary: string;
  translation: string;
}

export async function summarizeContent(title: string, content: string): Promise<SummaryResult> {
  const apiKey = config.getApiKey();
  const anthropic = new Anthropic({ apiKey });

  // Truncate content if too long (Claude has token limits)
  const maxContentLength = 50000; // Conservative limit
  const truncatedContent = content.length > maxContentLength 
    ? content.substring(0, maxContentLength) + '...\n[Content truncated due to length]'
    : content;

  const systemPrompt = `You are an expert Japanese language summarization and translation specialist with deep understanding of both English and Japanese languages. You excel at creating concise, informative summaries and producing complete, faithful translations. Always write in polite Japanese (ですます調) for both summaries and translations. For translations, maintain fidelity to the original content without omitting any information.`;

  const userPrompt = `Please analyze the following article and provide:

1. A concise 3-line summary in Japanese (3行まとめ) that captures the most important points
2. A complete and faithful Japanese translation of the full article content

**Important requirements:**
- For the summary (3行まとめ): Summarize the key points concisely
- For the translation (全文和訳): Provide a complete, faithful translation without summarizing or omitting content
- Use polite Japanese (ですます調) throughout both sections
- Maintain natural, readable Japanese expression
- Keep the formal tone appropriate for written Japanese
- Preserve the original structure and all details in the translation

Article Title: ${title}

Article Content:
${truncatedContent}

Please format your response as follows:
## 3行まとめ
1. [First key point in polite Japanese]
2. [Second key point in polite Japanese] 
3. [Third key point in polite Japanese]

## 全文和訳
[Complete and faithful Japanese translation of the entire article in polite form (ですます調) - do not summarize, translate everything]`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const fullResponse = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n');

    // Parse the response to extract summary and translation
    const summaryMatch = fullResponse.match(/## 3行まとめ\n([\s\S]*?)(?=## 全文和訳|$)/);
    const translationMatch = fullResponse.match(/## 全文和訳\n([\s\S]*?)$/);

    const summary = summaryMatch ? summaryMatch[1].trim() : '要約の生成に失敗しました';
    const translation = translationMatch ? translationMatch[1].trim() : '翻訳の生成に失敗しました';

    return { summary, translation };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Claude API error: ${error.message}`);
    }
    throw error;
  }
}