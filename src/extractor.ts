import { extract } from '@extractus/article-extractor';
import { JSDOM } from 'jsdom';

function suppressConsole<T>(fn: () => T): T {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  // Suppress console output during JSDOM operations
  console.error = () => {};
  console.warn = () => {};
  console.log = () => {};
  
  try {
    return fn();
  } finally {
    // Restore original console methods
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
  }
}

interface ExtractedContent {
  title: string;
  content: string;
  htmlContent: string;
}

function extractArticleHtml(html: string): string {
  const dom = suppressConsole(() => new JSDOM(html));
  const document = dom.window.document;
  
  // Remove script, style, and other non-content elements
  const elementsToRemove = document.querySelectorAll(
    'script, style, noscript, nav, header, footer, aside, .navigation, .nav, .menu, .sidebar, .ads, .advertisement'
  );
  elementsToRemove.forEach((el: Element) => el.remove());
  
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
  
  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element?.innerHTML && element.innerHTML.length > 100) {
      return element.innerHTML;
    }
  }
  
  // Fallback to body content
  return document.body?.innerHTML || html;
}

function cleanExtractedContent(content: string): string {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const cleanedLines: string[] = [];
  
  // Common patterns to exclude
  const excludePatterns = [
    /^(advertisement|ad|sponsored|関連記事|広告|PR|プロモーション)/i,
    /^(share|シェア|tweet|ツイート|facebook|line)/i,
    /^(cookie|クッキー|privacy|プライバシー|利用規約|terms)/i,
    /^(subscribe|登録|newsletter|メルマガ)/i,
    /^(follow|フォロー|social|sns)/i,
    /^(more\s+(news|articles)|その他のニュース|関連記事)/i,
    /^(navigation|ナビゲーション|menu|メニュー)/i,
    /^(category|カテゴリ|tag|タグ)/i,
    /^(date|日時|time|published|投稿日)/i,
    /^(author|著者|writer|筆者)/i,
    /^(source|出典|via|引用元)/i,
    /^(read\s+more|続きを読む|もっと見る)/i,
    /^(back\s+to|戻る|トップに戻る)/i,
    /^\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}/,  // Date patterns
    /^[\d\s\-\/年月日時分秒:]+$/,  // Time/date only lines
    /^[　\s]*$/,  // Empty or whitespace-only lines
  ];
  
  // Content length filters
  const minLineLength = 10;
  const maxRepeatedChars = 5;
  
  for (const line of lines) {
    // Skip lines that are too short
    if (line.length < minLineLength) continue;
    
    // Skip lines with too many repeated characters
    if (hasRepeatedChars(line, maxRepeatedChars)) continue;
    
    // Skip lines matching exclude patterns
    if (excludePatterns.some(pattern => pattern.test(line))) continue;
    
    // Skip lines that are likely navigation or UI elements
    if (isLikelyUIElement(line)) continue;
    
    cleanedLines.push(line);
  }
  
  return cleanedLines.join('\n\n');
}

function hasRepeatedChars(text: string, maxRepeated: number): boolean {
  for (let i = 0; i < text.length - maxRepeated; i++) {
    let count = 1;
    for (let j = i + 1; j < text.length && text[j] === text[i]; j++) {
      count++;
    }
    if (count > maxRepeated) return true;
  }
  return false;
}

function isLikelyUIElement(line: string): boolean {
  // Check for UI-like patterns
  const uiPatterns = [
    /^[<>«»‹›\[\](){}]+$/,  // Bracket-only content
    /^[\d\s\-\+\*\.]+$/,    // Number/symbol-only content
    /^[　\s]*[▼▲►◄△▽]+[　\s]*$/,  // Arrow symbols
    /^[　\s]*[■□●○◆◇★☆]+[　\s]*$/,  // Symbol bullets
    /^(click|クリック|tap|タップ|press|プレス)/i,
    /^(here|こちら|ここ|above|below|上記|下記)/i,
  ];
  
  return uiPatterns.some(pattern => pattern.test(line));
}

export async function extractTextContent(html: string): Promise<ExtractedContent> {
  // Extract article HTML for LLM processing
  const htmlContent = extractArticleHtml(html);
  
  try {
    // Try using article-extractor first
    const article = await extract(html);
    
    if (article?.content && article.content.length > 100) {
      // Clean up the content by removing HTML tags
      const dom = suppressConsole(() => new JSDOM(article.content));
      const textContent = dom.window.document.body.textContent || '';
      
      // Apply content cleaning
      const cleanedContent = cleanExtractedContent(textContent);
      
      if (cleanedContent.length > 100) {
        return {
          title: article.title || 'Untitled',
          content: cleanedContent.trim(),
          htmlContent
        };
      }
    }
  } catch {
    // Continue to fallback
  }

  // Fallback to basic extraction
  const dom = suppressConsole(() => new JSDOM(html));
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
  
  // Clean up whitespace and apply content cleaning
  const cleanedContent = cleanExtractedContent(content);
  
  return {
    title: title.trim(),
    content: cleanedContent.trim(),
    htmlContent
  };
}