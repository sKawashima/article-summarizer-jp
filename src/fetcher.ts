import fetch from 'node-fetch';
import { launch } from 'puppeteer';
import { extractTextContent } from './extractor.js';

interface FetchResult {
  title: string;
  content: string;
  extractedUrl: string;
  htmlContent: string;
}

export async function fetchContent(url: string, isSilent = false): Promise<FetchResult> {
  // Validate and normalize URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL provided');
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