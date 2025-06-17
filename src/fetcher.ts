import fetch from 'node-fetch';
import { launch } from 'puppeteer';
import { extractTextContent } from './extractor.js';
import PDFParser from 'pdf2json';
import { escape } from 'html-escaper';

interface FetchResult {
  title: string;
  content: string;
  extractedUrl: string;
  htmlContent: string;
}

function isPdfUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Check file extension in pathname
    if (parsedUrl.pathname.toLowerCase().endsWith('.pdf')) {
      return true;
    }
    // Check for common PDF service patterns
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === 'arxiv.org' && parsedUrl.pathname.includes('/pdf/')) {
      return true;
    }
    return false;
  } catch {
    // More specific fallback: check for .pdf followed by query/fragment/end
    return url.toLowerCase().match(/\.pdf(\?|#|$)/) !== null;
  }
}

async function fetchPdfContent(url: string): Promise<FetchResult> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ArticleSummarizer/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  
  return new Promise((resolve, reject) => {
    // Use environment variable to suppress PDF2JSON warnings safely
    const originalEnvValue = process.env.PDF2JSON_DISABLE_LOGS;
    process.env.PDF2JSON_DISABLE_LOGS = '1';
    
    const pdfParser = new PDFParser();
    
    const cleanup = () => {
      // Restore original environment variable
      if (originalEnvValue === undefined) {
        delete process.env.PDF2JSON_DISABLE_LOGS;
      } else {
        process.env.PDF2JSON_DISABLE_LOGS = originalEnvValue;
      }
    };
    
    pdfParser.on('pdfParser_dataError', (errData: any) => {
      cleanup();
      reject(new Error(`PDF parsing error: ${errData.parserError}`));
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      cleanup();
      try {
        // Extract text from PDF data
        let content = '';
        
        if (pdfData.Pages) {
          for (const page of pdfData.Pages) {
            if (page.Texts) {
              for (const textItem of page.Texts) {
                if (textItem.R) {
                  for (const run of textItem.R) {
                    if (run.T) {
                      // Decode URI component and replace encoded spaces
                      const decodedText = decodeURIComponent(run.T);
                      content += decodedText + ' ';
                    }
                  }
                }
              }
              content += '\n';
            }
          }
        }
        
        const title = extractTitleFromPdfText(content) || 'PDF Document';
        
        // Create a simple HTML structure for consistency with proper escaping
        const htmlContent = `<html><head><title>${escape(title)}</title></head><body><pre>${escape(content)}</pre></body></html>`;
        
        resolve({
          title,
          content: content.trim(),
          extractedUrl: url,
          htmlContent
        });
      } catch (error) {
        reject(new Error(`PDF text extraction error: ${error}`));
      }
    });
    
    // Parse the PDF buffer
    pdfParser.parseBuffer(buffer);
  });
}

const TITLE_SEARCH_LINES = 10;
const MIN_TITLE_LENGTH = 10;
const MAX_TITLE_LENGTH = 200;

function extractTitleFromPdfText(text: string): string | null {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Try to find the first substantial line as title
  for (const line of lines.slice(0, TITLE_SEARCH_LINES)) {
    const trimmed = line.trim();
    if (trimmed.length > MIN_TITLE_LENGTH && trimmed.length < MAX_TITLE_LENGTH) {
      // Avoid lines that look like headers, footers, or page numbers
      if (!/^\d+$/.test(trimmed) && !trimmed.includes('Page ') && !trimmed.includes('©')) {
        return trimmed;
      }
    }
  }
  
  return null;
}

export async function fetchContent(url: string, isSilent = false): Promise<FetchResult> {
  // Validate and normalize URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL provided');
  }

  // Check if it's a PDF URL and handle it specially
  if (isPdfUrl(parsedUrl.toString())) {
    if (!isSilent) {
      console.log('  📄 PDFファイルを検出しました。PDF解析を開始します...');
    }
    return await fetchPdfContent(parsedUrl.toString());
  }

  // Try regular fetch first
  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArticleSummarizer/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const { title, content, htmlContent } = await extractTextContent(html);

    if (content.length > 100) {
      return { title, content, extractedUrl: parsedUrl.toString(), htmlContent };
    }
  } catch (error) {
    if (!isSilent) {
      console.log('Regular fetch failed, trying headless browser...');
    }
  }

  // Fallback to headless browser
  const browser = await launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-logging',
      '--log-level=3',
      '--silent',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-sync',
      '--disable-default-apps',
      '--disable-extensions'
    ],
    pipe: true, // Use pipes instead of shared memory
    dumpio: false // Disable dumping of stdout/stderr
  });

  try {
    const page = await browser.newPage();
    
    // Completely suppress all console output from the browser page
    page.on('console', () => {});
    page.on('pageerror', () => {});
    page.on('requestfailed', () => {});
    page.on('response', () => {});
    page.on('requestfinished', () => {});
    page.on('load', () => {});
    page.on('domcontentloaded', () => {});
    
    // Disable JavaScript console output by overriding console methods
    await page.evaluateOnNewDocument(() => {
      const noop = () => {};
      window.console = {
        log: noop,
        error: noop,
        warn: noop,
        info: noop,
        debug: noop,
        trace: noop,
        dir: noop,
        dirxml: noop,
        group: noop,
        groupCollapsed: noop,
        groupEnd: noop,
        time: noop,
        timeEnd: noop,
        timeStamp: noop,
        table: noop,
        clear: noop,
        count: noop,
        assert: noop,
        profile: noop,
        profileEnd: noop
      } as any;
    });
    
    // Set user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Navigate to the URL with increased timeout
    await page.goto(parsedUrl.toString(), {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for common content selectors
    await page.waitForSelector('article, main, .content, #content, body', {
      timeout: 5000,
    }).catch(() => {
      // Continue even if selector not found
    });

    // Get page content
    const html = await page.content();
    const { title, content, htmlContent } = await extractTextContent(html);

    if (content.length < 100) {
      throw new Error('Could not extract meaningful content from the page');
    }

    return { title, content, extractedUrl: parsedUrl.toString(), htmlContent };
  } finally {
    await browser.close();
  }
}