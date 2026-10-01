import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function generate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Badge Logo (Icon on Terracotta Rounded Square)
  const svgContent = fs.readFileSync(path.join(process.cwd(), 'public/favicon.svg'), 'utf8');
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin:0; padding:0; background:transparent; display:flex; align-items:center; justify-content:center; width:512px; height:512px;">
        <div style="width:512px; height:512px;">
          ${svgContent.replace('width="256" height="256"', 'width="512" height="512"')}
        </div>
      </body>
    </html>
  `);
  
  const badgeEl = await page.$('body');
  await badgeEl?.screenshot({
    path: path.join(process.cwd(), 'public/logo-badge.png'),
    omitBackground: true,
  });
  console.log('Generated public/logo-badge.png');

  // 2. Full Horizontal Lockup (Badge + Wordmark)
  await page.setViewportSize({ width: 400, height: 80 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
      </head>
      <body style="margin:0; padding:12px; background:transparent; display:inline-flex; align-items:center; font-family:'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;">
        <div style="width:44px; height:44px; display:inline-block; vertical-align:middle;">
          ${svgContent.replace('width="256" height="256"', 'width="44" height="44"')}
        </div>
        <div style="margin-left:12px; display:inline-block; vertical-align:middle; font-size:28px; font-weight:800; letter-spacing:-0.5px; line-height:1;">
          <span style="color:#232323;">Pantry</span><span style="color:#D46238;">Pool</span>
        </div>
      </body>
    </html>
  `);
  
  await page.waitForTimeout(1000);
  const lockupEl = await page.$('body');
  await lockupEl?.screenshot({
    path: path.join(process.cwd(), 'public/logo.png'),
    omitBackground: true,
  });
  console.log('Generated public/logo.png');

  await browser.close();
}

generate().catch(console.error);
