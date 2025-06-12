import { extract } from '@extractus/article-extractor';
import { JSDOM } from 'jsdom';

interface ExtractedContent {
  title: string;
  content: string;
}

export async function extractTextContent(html: string): Promise<ExtractedContent> {
  try {
    // Try using article-extractor first
    const article = await extract(html);
    
    if (article?.content && article.content.length > 100) {
      // Clean up the content by removing HTML tags
      const dom = new JSDOM(article.content);
      const textContent = dom.window.document.body.textContent || '';
      
      return {
        title: article.title || 'Untitled',
        content: textContent.trim()
      };
    }
  } catch {
    // Continue to fallback
  }

  // Fallback to basic extraction
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Extract title
  const title = document.querySelector('title')?.textContent ||
    document.querySelector('h1')?.textContent ||
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    'Untitled';
  
  // Remove script and style elements
  const scripts = document.querySelectorAll('script, style, noscript');
  scripts.forEach((el: Element) => el.remove());
  
  // Try to find main content areas
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.main-content',
    '.content',
    '#content',
    '.post-content',
    '.entry-content',
    '.article-body',
    '.story-body',
  ];
  
  let content = '';
  
  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element?.textContent) {
      content = element.textContent;
      break;
    }
  }
  
  // If no content found, try to get from body
  if (!content) {
    content = document.body?.textContent || '';
  }
  
  // Clean up whitespace
  content = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n\n');
  
  return {
    title: title.trim(),
    content: content.trim()
  };
}