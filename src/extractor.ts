import { extract } from '@extractus/article-extractor';
import { JSDOM } from 'jsdom';

interface ExtractedContent {
  title: string;
  content: string;
  imageUrl?: string;
}

function extractThumbnailImage(html: string): string | undefined {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Priority order for image extraction
  const imageSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="og:image:url"]',
    'meta[name="thumbnail"]',
    'link[rel="image_src"]',
    'article img',
    'main img',
    '.content img',
    '.article-body img',
    '.post-content img',
    '.entry-content img',
    'img'
  ];
  
  for (const selector of imageSelectors) {
    const element = document.querySelector(selector);
    let imageUrl: string | null = null;
    
    if (element) {
      if (element.tagName === 'META') {
        imageUrl = element.getAttribute('content');
      } else if (element.tagName === 'LINK') {
        imageUrl = element.getAttribute('href');
      } else if (element.tagName === 'IMG') {
        imageUrl = element.getAttribute('src') || element.getAttribute('data-src');
      }
      
      if (imageUrl && isValidImageUrl(imageUrl)) {
        // Convert relative URLs to absolute
        if (imageUrl.startsWith('/')) {
          const baseUrl = document.querySelector('base')?.getAttribute('href') || 
                         window.location?.origin || '';
          imageUrl = new URL(imageUrl, baseUrl).href;
        }
        return imageUrl;
      }
    }
  }
  
  return undefined;
}

function isValidImageUrl(url: string): boolean {
  if (!url || url.length < 10) return false;
  
  // Check for common image extensions
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
  if (imageExtensions.test(url)) return true;
  
  // Check for image URLs without extensions (common in CDNs)
  const commonImageDomains = [
    'cloudinary.com',
    'imgur.com',
    'amazonaws.com',
    'googleusercontent.com',
    'unsplash.com',
    'pixabay.com',
    'pexels.com'
  ];
  
  if (commonImageDomains.some(domain => url.includes(domain))) return true;
  
  // Avoid placeholder or icon images
  const excludePatterns = [
    /\b(logo|icon|avatar|placeholder|default)\b/i,
    /\b(favicon|sprite|button)\b/i,
    /\b(1x1|pixel|transparent)\b/i,
    /\.(ico|svg)$/i
  ];
  
  if (excludePatterns.some(pattern => pattern.test(url))) return false;
  
  return url.startsWith('http');
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
  // Extract thumbnail image first
  const imageUrl = extractThumbnailImage(html);
  
  try {
    // Try using article-extractor first
    const article = await extract(html);
    
    if (article?.content && article.content.length > 100) {
      // Clean up the content by removing HTML tags
      const dom = new JSDOM(article.content);
      const textContent = dom.window.document.body.textContent || '';
      
      // Apply content cleaning
      const cleanedContent = cleanExtractedContent(textContent);
      
      if (cleanedContent.length > 100) {
        return {
          title: article.title || 'Untitled',
          content: cleanedContent.trim(),
          imageUrl
        };
      }
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
  
  // Clean up whitespace and apply content cleaning
  const cleanedContent = cleanExtractedContent(content);
  
  return {
    title: title.trim(),
    content: cleanedContent.trim(),
    imageUrl
  };
}