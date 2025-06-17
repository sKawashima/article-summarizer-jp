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

interface ImageCandidate {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  className?: string;
  source: 'meta' | 'article' | 'general';
}

function convertRelativeToAbsolute(imageUrl: string, baseUrl: string): string {
  try {
    // If already absolute, return as is
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl;
    }
    
    // Handle protocol-relative URLs
    if (imageUrl.startsWith('//')) {
      const parsedBase = new URL(baseUrl);
      return `${parsedBase.protocol}${imageUrl}`;
    }
    
    // Convert relative to absolute
    return new URL(imageUrl, baseUrl).href;
  } catch {
    return imageUrl; // Return original if conversion fails
  }
}

function filterUnwantedImages(images: ImageCandidate[]): ImageCandidate[] {
  return images.filter(image => {
    const url = image.url.toLowerCase();
    const alt = (image.alt || '').toLowerCase();
    const className = (image.className || '').toLowerCase();
    
    // Filter out data URLs
    if (url.startsWith('data:')) return false;
    
    // Filter out very small images
    if ((image.width && image.width < 100) || (image.height && image.height < 100)) {
      return false;
    }
    
    // Filter out common unwanted patterns in URL
    const unwantedUrlPatterns = [
      '/favicon', '/icon', '/logo', '/avatar', '/ad/', '/ads/',
      'favicon.', 'logo.', 'icon.', 'avatar.', 'sprite.',
      'placeholder', 'default', 'thumb', 'mini'
    ];
    
    if (unwantedUrlPatterns.some(pattern => url.includes(pattern))) {
      return false;
    }
    
    // Filter out unwanted alt text
    const unwantedAltPatterns = [
      'icon', 'logo', 'avatar', 'ad', 'advertisement', 'sponsor',
      'favicon', 'button', 'arrow', 'bullet'
    ];
    
    if (unwantedAltPatterns.some(pattern => alt.includes(pattern))) {
      return false;
    }
    
    // Filter out unwanted class names
    const unwantedClassPatterns = [
      'icon', 'logo', 'avatar', 'ad', 'advertisement',
      'favicon', 'sprite', 'button'
    ];
    
    if (unwantedClassPatterns.some(pattern => className.includes(pattern))) {
      return false;
    }
    
    return true;
  });
}

function extractImagesFromHtml(html: string, baseUrl: string): ImageCandidate[] {
  const dom = suppressConsole(() => new JSDOM(html));
  const document = dom.window.document;
  const images: ImageCandidate[] = [];
  
  // Extract meta images (highest priority)
  const metaSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="og:image:url"]',
    'link[rel="image_src"]'
  ];
  
  metaSelectors.forEach(selector => {
    const element = document.querySelector(selector);
    if (element) {
      const url = element.getAttribute('content') || element.getAttribute('href');
      if (url) {
        images.push({
          url: convertRelativeToAbsolute(url, baseUrl),
          source: 'meta'
        });
      }
    }
  });
  
  // Extract images from article content areas
  const articleSelectors = [
    'article img',
    'main img',
    '.content img',
    '.article-body img',
    '.post-content img',
    '.entry-content img',
    '.story-body img'
  ];
  
  articleSelectors.forEach(selector => {
    const imgElements = document.querySelectorAll(selector);
    imgElements.forEach((img: Element) => {
      const imgElement = img as HTMLImageElement;
      const src = imgElement.getAttribute('src') || imgElement.getAttribute('data-src');
      if (src) {
        images.push({
          url: convertRelativeToAbsolute(src, baseUrl),
          width: imgElement.width || parseInt(imgElement.getAttribute('width') || '0'),
          height: imgElement.height || parseInt(imgElement.getAttribute('height') || '0'),
          alt: imgElement.alt,
          className: imgElement.className,
          source: 'article'
        });
      }
    });
  });
  
  // Extract all other images as fallback
  const allImages = document.querySelectorAll('img');
  allImages.forEach((img: Element) => {
    const imgElement = img as HTMLImageElement;
    const src = imgElement.getAttribute('src') || imgElement.getAttribute('data-src');
    if (src) {
      const absoluteUrl = convertRelativeToAbsolute(src, baseUrl);
      // Only add if not already added from article areas
      const alreadyExists = images.some(existing => existing.url === absoluteUrl);
      if (!alreadyExists) {
        images.push({
          url: absoluteUrl,
          width: imgElement.width || parseInt(imgElement.getAttribute('width') || '0'),
          height: imgElement.height || parseInt(imgElement.getAttribute('height') || '0'),
          alt: imgElement.alt,
          className: imgElement.className,
          source: 'general'
        });
      }
    }
  });
  
  return images;
}

function selectBestThumbnail(images: ImageCandidate[]): string | undefined {
  if (images.length === 0) return undefined;
  
  // Priority 1: Meta images
  const metaImages = images.filter(img => img.source === 'meta');
  if (metaImages.length > 0) {
    return metaImages[0].url;
  }
  
  // Priority 2: Article images
  const articleImages = images.filter(img => img.source === 'article');
  if (articleImages.length > 0) {
    // Prefer larger images
    const largeImages = articleImages.filter(img => 
      (img.width && img.width > 300) || (img.height && img.height > 300)
    );
    if (largeImages.length > 0) {
      return largeImages[0].url;
    }
    return articleImages[0].url;
  }
  
  // Priority 3: General images (prefer larger ones)
  const generalImages = images.filter(img => img.source === 'general');
  if (generalImages.length > 0) {
    const largeImages = generalImages.filter(img => 
      (img.width && img.width > 300) || (img.height && img.height > 300)
    );
    if (largeImages.length > 0) {
      return largeImages[0].url;
    }
    return generalImages[0].url;
  }
  
  return undefined;
}

export function extractThumbnailFromHtml(html: string, baseUrl: string): string | undefined {
  try {
    const allImages = extractImagesFromHtml(html, baseUrl);
    const filteredImages = filterUnwantedImages(allImages);
    return selectBestThumbnail(filteredImages);
  } catch (error) {
    console.error('Error extracting thumbnail:', error);
    return undefined;
  }
}