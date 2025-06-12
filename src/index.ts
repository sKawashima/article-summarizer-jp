#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { config } from './config.js';
import { fetchContent } from './fetcher.js';
import { summarizeContent } from './summarizer.js';
import { saveToMarkdown } from './markdown.js';
import { getUrlFromUser } from './input.js';

async function main() {
  program
    .name('article-summarizer')
    .description('日本語記事要約CLIツール')
    .version('1.0.0')
    .argument('[url]', 'summarize the article from the provided URL')
    .option('--config', 'configure API key')
    .parse();

  const options = program.opts();
  const args = program.args;

  try {
    if (options.config) {
      await config.configure();
      console.log(chalk.green('✓ 設定が完了しました'));
      return;
    }

    // Get URL from argument or prompt user
    const url = args[0] || await getUrlFromUser();
    
    if (!config.hasApiKey()) {
      console.log(chalk.yellow('APIキーが設定されていません。最初に設定を行ってください。'));
      await config.configure();
    }

    console.log(chalk.blue('📄 コンテンツを取得中...'));
    const { title, content, extractedUrl } = await fetchContent(url);
    
    console.log(chalk.blue('🤖 記事を要約中...'));
    const { summary, translation } = await summarizeContent(title, content);
    
    console.log(chalk.blue('💾 マークダウンファイルに保存中...'));
    const filename = await saveToMarkdown(title, extractedUrl, summary, translation);
    
    console.log(chalk.green(`✨ 完了しました！ファイル: ${filename}`));
  } catch (error) {
    console.error(chalk.red('エラー:', error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}

main();