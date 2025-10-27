import { writeFile } from 'fs/promises';
import { join } from 'path';
import { shortenTitle } from './summarizer.js';

export async function saveToMarkdown(
  translatedTitle: string,
  url: string,
  summary: string,
  details: string,
  tags: string[],
  imageUrl?: string,
  datePrefix?: boolean,
  simplify?: boolean
): Promise<string> {
  // Format current date
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Helper function to calculate byte length in UTF-8
  const getByteLength = (str: string): number => {
    return Buffer.byteLength(str, 'utf8');
  };

  // Clean translated title for filename (replace invalid characters with underscore)
  let cleanTitle = translatedTitle
    .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid filename characters with underscore
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Create initial filename parts
  const prefix = datePrefix ? `📰 ${dateStr}_` : `📰 `;
  const suffix = '.md';

  // Maximum filename byte length (filesystem limit is typically 255 bytes)
  // We use 200 bytes as a safe limit to account for various filesystems
  const MAX_FILENAME_BYTES = 200;

  // Calculate available bytes for the title
  const fixedPartBytes = getByteLength(prefix) + getByteLength(suffix);
  const maxTitleBytes = MAX_FILENAME_BYTES - fixedPartBytes;

  // Check if we need to shorten the title
  if (getByteLength(cleanTitle) > maxTitleBytes) {
    console.log('    ⚠️  ファイル名が長すぎます。LLMで短縮中...');

    // Calculate rough character limit (assuming average 3 bytes per Japanese character)
    const estimatedMaxChars = Math.floor(maxTitleBytes / 3);

    // Use LLM to shorten the title intelligently
    cleanTitle = await shortenTitle(cleanTitle, estimatedMaxChars);

    // After LLM shortening, if still too long, truncate character by character
    while (getByteLength(cleanTitle) > maxTitleBytes && cleanTitle.length > 0) {
      cleanTitle = cleanTitle.slice(0, -1);
    }

    // Trim any trailing whitespace after truncation
    cleanTitle = cleanTitle.trim();

    console.log(`    ✅ タイトルを短縮しました: "${cleanTitle}"`);
  }

  // Create filename using translated title
  const filename = `${prefix}${cleanTitle}${suffix}`;
  const filepath = join(process.cwd(), filename);

  // Format tags
  const tagString = tags.length > 0 ? `#${tags.join(' #')}` : '';

  // Create markdown content with thumbnail before tags
  const imageSection = imageUrl
    ? `![thumbnail](${imageUrl})

`
    : '';

  // Build markdown content based on simplify mode
  const markdownContent = simplify
    ? `[${translatedTitle}](${url})
scrap at [[${dateStr}]]

${tagString}

## 3行まとめ
${summary}

${imageSection}#web_scrap
`
    : `[${translatedTitle}](${url})
scrap at [[${dateStr}]]

${tagString}

## 3行まとめ
${summary}

${imageSection}## 詳細
${details}

#web_scrap
`;

  // Write to file
  await writeFile(filepath, markdownContent, 'utf-8');

  return filename;
}
