import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function saveToMarkdown(
  title: string,
  url: string,
  summary: string,
  translation: string
): Promise<string> {
  // Format current date
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Clean title for filename (remove special characters)
  const cleanTitle = title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .trim()
    .slice(0, 100);               // Limit length
  
  // Create filename
  const filename = `📰 ${cleanTitle}.md`;
  const filepath = join(process.cwd(), filename);
  
  // Create markdown content
  const markdownContent = `# [${title}](${url})
scrap at [[${dateStr}]]

## 3行まとめ
${summary}

## 全文和訳
${translation}
`;
  
  // Write to file
  await writeFile(filepath, markdownContent, 'utf-8');
  
  return filename;
}