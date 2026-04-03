const { chromium } = require('playwright');
const path = require('path');

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

(async () => {
  const today = getTodayKey();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 1
  });

  await context.addInitScript(({ todayKey }) => {
    const demoState = {
      messages: [],
      sessionId: 'reminder-demo-session',
      summaryItems: [],
      selectedEngine: 'aws-lex',
      lastReservation: {
        createdAt: `${todayKey}T09:00:00.000Z`,
        message: '예약이 완료됐어요. 예약번호는 R-DEMO20260403 입니다.',
        fields: {
          Branch: '동대구역',
          CourseName: '토익',
          Date: todayKey,
          Time: '19:30',
          StudentName: '홍길동',
          PhoneNumber: '010-1234-5678'
        }
      },
      updatedAt: Date.now()
    };

    localStorage.setItem('lex_chat_ux_v3_state', JSON.stringify(demoState));
    localStorage.removeItem(`lex_chat_ux_today_notice_dismissed_${todayKey}`);
  }, { todayKey: today });

  const page = await context.newPage();

  await page.goto('http://localhost:9000/', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  await page.waitForTimeout(1500);
  await page.locator('.reservation-reminder').waitFor({ timeout: 10000 });

  await page.screenshot({
    path: path.join(__dirname, 'screenshots', 'today-reservation-modal.png'),
    fullPage: false
  });

  await browser.close();
  console.log('Saved screenshot: screenshots/today-reservation-modal.png');
})();
