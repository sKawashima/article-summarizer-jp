#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config.js';
import { fetchContent } from './fetcher.js';
import { summarizeContent } from './summarizer.js';
import { saveToMarkdown } from './markdown.js';
import { getUrlFromUser } from './input.js';
import { startWatchMode } from './watch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

async function main() {
  program
    .name('article-summarizer')
    .description('日本語記事要約CLIツール')
    .version(packageJson.version)
    .argument('[urls...]', 'summarize articles from the provided URLs (supports multiple URLs)')
    .option('--config', 'configure API key')
    .option('-w, --watch', 'start in watch mode for continuous URL input')
    .option('-d, --date-prefix', 'add date prefix to filename (YYYY-MM-DD_title.md format)')
    .option('-s, --simplify', 'output only 3-line summary without details')
    .parse();

  const options = program.opts();
  const args = program.args;

  try {
    if (options.config) {
      await config.configure();
      console.log(chalk.green('✓ 設定が完了しました'));
      return;
    }

    if (options.watch) {
      await startWatchMode(options.datePrefix, options.simplify);
      return;
    }

    // Get URLs from arguments or prompt user
    let urls: string[] = [];
    if (args.length > 0) {
      urls = args;
    } else {
      const url = await getUrlFromUser();
      urls = [url];
    }

    if (!config.hasApiKey()) {
      console.log(chalk.yellow('APIキーが設定されていません。最初に設定を行ってください。'));
      await config.configure();
    }

    console.log(chalk.blue(`📄 ${urls.length}件の記事を処理開始します（最大5件並行処理）...\n`));

    const results: { success: boolean; filename?: string; url: string; error?: string }[] = [];
    const maxConcurrent = 5;

    // Process URLs in batches with concurrent execution
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(async (url, index) => {
        const globalIndex = i + index + 1;
        const total = urls.length;

        try {
          console.log(chalk.blue(`[${globalIndex}/${total}] ${url}`));
          console.log(chalk.gray('  📄 コンテンツを取得中...'));
          const { title, extractedUrl, htmlContent } = await fetchContent(url);

          console.log(chalk.gray('  🤖 記事を要約・翻訳中...'));
          const { summary, details, translatedTitle, tags, validImageUrl } = await summarizeContent(
            title,
            htmlContent,
            extractedUrl,
            false,
            options.simplify
          );

          console.log(chalk.gray('  💾 マークダウンファイルに保存中...'));
          const filename = await saveToMarkdown(
            translatedTitle,
            extractedUrl,
            summary,
            details,
            tags,
            validImageUrl,
            options.datePrefix,
            options.simplify
          );

          console.log(chalk.green(`  ✅ 完了: ${filename}\n`));
          return { success: true, filename, url };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(chalk.red(`  ❌ エラー: ${errorMessage}\n`));
          return { success: false, url, error: errorMessage };
        }
      });

      // Wait for all promises in the current batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Show summary
    console.log(chalk.bold('\n📊 処理結果:'));
    console.log(chalk.gray('='.repeat(50)));

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(chalk.green(`✅ 成功: ${successful.length}件`));
    if (successful.length > 0) {
      successful.forEach((result) => {
        console.log(chalk.gray(`   📄 ${result.filename}`));
      });
    }

    if (failed.length > 0) {
      console.log(chalk.red(`\n❌ 失敗: ${failed.length}件`));
      failed.forEach((result) => {
        console.log(chalk.gray(`   🔗 ${result.url}`));
        console.log(chalk.gray(`   💥 ${result.error}`));
      });
    }

    console.log(chalk.gray('='.repeat(50)));
    console.log(chalk.bold(`🎯 合計: ${results.length}件中 ${successful.length}件成功\n`));
  } catch (error) {
    console.error(chalk.red('エラー:', error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}

main();
