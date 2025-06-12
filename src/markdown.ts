import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function saveToMarkdown(
  translatedTitle: string,
  url: string,
  summary: string,
  translation: string,
  tags: string[]
): Promise<string> {
  // Format current date
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Clean translated title for filename (remove special characters)
  const cleanTitle = translatedTitle
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .trim()
    .slice(0, 100);               // Limit length
  
  // Create filename using translated title
  const filename = `📰 ${cleanTitle}.md`;
  const filepath = join(process.cwd(), filename);
  
  // Format tags
  const tagString = tags.length > 0 ? `#${tags.join(' #')}` : '';
  
  // Create markdown content
  const markdownContent = `[${translatedTitle}](${url})
scrap at [[${dateStr}]]

${tagString}

## 3行まとめ
${summary}

## 全文和訳
${translation}
`;
  
  // Write to file
  await writeFile(filepath, markdownContent, 'utf-8');
  
  return filename;
}