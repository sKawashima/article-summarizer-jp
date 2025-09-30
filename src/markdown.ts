import { writeFile } from 'fs/promises';
import { join } from 'path';

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

  // Clean translated title for filename (replace invalid characters with underscore)
  const cleanTitle = translatedTitle
    .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid filename characters with underscore
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .slice(0, 100); // Limit length

  // Create filename using translated title
  const filename = datePrefix ? `📰 ${dateStr}_${cleanTitle}.md` : `📰 ${cleanTitle}.md`;
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
