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
    .version('1.1.0')
    .argument('[urls...]', 'summarize articles from the provided URLs (supports multiple URLs)')
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

    console.log(chalk.blue(`📄 ${urls.length}件の記事を処理開始します...\n`));
    
    const results: { success: boolean; filename?: string; url: string; error?: string }[] = [];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const current = i + 1;
      const total = urls.length;
      
      try {
        console.log(chalk.blue(`[${current}/${total}] ${url}`));
        console.log(chalk.gray('  📄 コンテンツを取得中...'));
        const { title, content, extractedUrl } = await fetchContent(url);
        
        console.log(chalk.gray('  🤖 記事を要約・翻訳中...'));
        const { summary, translation, translatedTitle, tags } = await summarizeContent(title, content);
        
        console.log(chalk.gray('  💾 マークダウンファイルに保存中...'));
        const filename = await saveToMarkdown(translatedTitle, extractedUrl, summary, translation, tags);
        
        console.log(chalk.green(`  ✅ 完了: ${filename}\n`));
        results.push({ success: true, filename, url });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(chalk.red(`  ❌ エラー: ${errorMessage}\n`));
        results.push({ success: false, url, error: errorMessage });
      }
    }
    
    // Show summary
    console.log(chalk.bold('\n📊 処理結果:'));
    console.log(chalk.gray('='.repeat(50)));
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(chalk.green(`✅ 成功: ${successful.length}件`));
    if (successful.length > 0) {
      successful.forEach(result => {
        console.log(chalk.gray(`   📄 ${result.filename}`));
      });
    }
    
    if (failed.length > 0) {
      console.log(chalk.red(`\n❌ 失敗: ${failed.length}件`));
      failed.forEach(result => {
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