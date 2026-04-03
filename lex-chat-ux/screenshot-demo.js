const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  
  const page = await context.newPage();
  
  console.log('Loading demo page...');
  await page.goto('http://localhost:8888/academy-demo.html', { 
    waitUntil: 'networkidle',
    timeout: 10000 
  });
  
  await page.waitForTimeout(1000);
  
  console.log('Capturing full page screenshot...');
  await page.screenshot({ 
    path: '/home/AI-AWS-Lex/lex-chat-ux/screenshots/homepage.png',
    fullPage: true 
  });
  
  console.log('Capturing viewport screenshot...');
  await page.screenshot({ 
    path: '/home/AI-AWS-Lex/lex-chat-ux/screenshots/homepage-with-chatbot.png',
    fullPage: false
  });
  
  console.log('Screenshots captured successfully!');
  
  await browser.close();
})();
