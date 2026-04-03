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
  
  console.log('Loading homepage...');
  await page.goto('http://localhost:9000', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  // Wait for content to load
  await page.waitForTimeout(2000);
  
  // Screenshot 1: Homepage
  console.log('Capturing homepage screenshot...');
  await page.screenshot({ 
    path: path.join(__dirname, 'screenshots', 'homepage.png'),
    fullPage: true 
  });
  
  // Screenshot 2: Homepage with chatbot button visible
  console.log('Capturing homepage with chatbot button...');
  await page.screenshot({ 
    path: path.join(__dirname, 'screenshots', 'homepage-with-chatbot.png'),
    fullPage: false
  });
  
  // Click chatbot button
  console.log('Opening chatbot...');
  try {
    // Try different selectors
    const chatbotButton = await page.locator('.chatbot-fab, button[class*="chatbot"], .q-btn[class*="chatbot"]').first();
    await chatbotButton.waitFor({ timeout: 5000 });
    await chatbotButton.click();
    await page.waitForTimeout(1000);
    
    // Screenshot 3: Chatbot opened
    console.log('Capturing chatbot dialog...');
    await page.screenshot({ 
      path: path.join(__dirname, 'screenshots', 'chatbot-dialog.png'),
      fullPage: false
    });
    
    // Type a message in chatbot
    console.log('Typing message in chatbot...');
    const input = await page.locator('input[placeholder*="메시지"]').first();
    await input.fill('강남점 토익 예약하고 싶어요');
    await page.waitForTimeout(500);
    
    // Screenshot 4: Chatbot with input
    console.log('Capturing chatbot with input...');
    await page.screenshot({ 
      path: path.join(__dirname, 'screenshots', 'chatbot-with-input.png'),
      fullPage: false
    });
  } catch (err) {
    console.log('Could not interact with chatbot button:', err.message);
    console.log('Chatbot screenshots skipped');
  }
  
  console.log('All screenshots captured successfully!');
  
  await browser.close();
})();
