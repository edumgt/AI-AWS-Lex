<template>
  <div class="kf-page" ref="pageRef">

    <!-- ═══ NAV ═══ -->
    <header class="kf-nav" :class="{ scrolled }">
      <div class="nav-inner">
        <div class="nav-brand">
          <q-icon name="show_chart" size="22px" />
          <span>KF증권</span>
        </div>
        <nav class="nav-links">
          <a v-for="item in navItems" :key="item" href="#" class="nav-link">{{ item }}</a>
          <router-link to="/turing" class="nav-link">튜링 테스트</router-link>
        </nav>
        <div class="nav-right">
          <q-btn
            v-if="authEnabled && !isAuthenticated"
            flat dense
            :label="authBusy ? '인증 확인 중...' : '로그인'"
            text-color="white"
            class="q-mr-xs"
            :disable="authBusy"
            @click="login"
          />
          <q-btn
            v-else-if="authEnabled && isAuthenticated"
            flat dense
            :label="displayName || '로그아웃'"
            text-color="white"
            class="q-mr-xs"
            @click="logout"
          />
          <q-btn unelevated dense label="계좌개설" color="white" text-color="primary" class="open-btn" />
        </div>
      </div>
    </header>

    <!-- ═══ TICKER ═══ -->
    <div class="ticker-wrap">
      <div class="ticker-inner">
        <span v-for="(t, i) in [...tickers, ...tickers]" :key="i"
              class="ticker-item" :class="t.up ? 'up' : 'dn'">
          <span class="t-name">{{ t.name }}</span>
          <span class="t-val">{{ t.val }}</span>
          <span class="t-chg">{{ t.up ? '▲' : '▼' }}{{ t.chg }}</span>
        </span>
      </div>
    </div>

    <!-- ═══ HERO ═══ -->
    <section class="hero-section">
      <div class="hero-inner">
        <div class="hero-text">
          <div class="hero-badge">🏆 2024 한국투자자보호 우수증권사</div>
          <h1 class="hero-title">스마트한 투자의 시작<br><em>KF증권</em>과 함께하세요</h1>
          <p class="hero-sub">전문 투자상담부터 ISA·ETF·해외주식까지<br>AI 챗봇으로 언제든 편리하게 상담받으세요</p>
          <div class="hero-btns">
            <button class="btn-cta" @click="openChatOrLogin">💬 AI 투자상담 시작</button>
            <button class="btn-outline">상품 둘러보기</button>
          </div>
        </div>
        <div class="hero-panel">
          <div class="panel-title">오늘의 주요 지수</div>
          <div v-for="idx in heroIndices" :key="idx.name" class="panel-row">
            <span class="pi-name">{{ idx.name }}</span>
            <span class="pi-val">{{ idx.val }}</span>
            <span class="pi-chg" :class="idx.up ? 'up' : 'dn'">
              {{ idx.up ? '+' : '' }}{{ idx.chg }}%
            </span>
          </div>
          <div class="panel-footer">{{ todayStr }} 장마감 기준</div>
        </div>
      </div>
    </section>

    <!-- ═══ QUICK MENU ═══ -->
    <section class="quick-section">
      <div class="section-wrap">
        <div class="quick-grid">
          <button v-for="q in quickItems" :key="q.label" class="quick-btn">
            <div class="quick-icon" :style="{ background: q.bg }">
              <q-icon :name="q.icon" size="26px" :style="{ color: q.color }" />
            </div>
            <span class="quick-label">{{ q.label }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ PRODUCTS ═══ -->
    <section class="products-section">
      <div class="section-wrap">
        <div class="s-header">
          <h2>추천 금융상품</h2>
          <p>KF증권 대표 투자 솔루션을 만나보세요</p>
        </div>
        <div class="product-grid">
          <div v-for="p in products" :key="p.title" class="product-card" @click="openChatOrLogin">
            <div class="p-icon-wrap" :style="{ background: p.bg }">
              <q-icon :name="p.icon" size="28px" :style="{ color: p.color }" />
            </div>
            <div class="p-name">{{ p.title }}</div>
            <div class="p-desc">{{ p.desc }}</div>
            <div class="p-badge" :style="{ color: p.color, background: p.bg }">{{ p.badge }}</div>
            <div class="p-cta">AI 상담받기 →</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ MARKET ═══ -->
    <section class="market-section">
      <div class="section-wrap">
        <div class="s-header">
          <h2>시장 현황</h2>
          <span class="date-tag">{{ todayStr }} 장마감</span>
        </div>
        <div class="market-grid">
          <div v-for="m in marketData" :key="m.name" class="market-card">
            <div class="m-name">{{ m.name }}</div>
            <div class="m-val">{{ m.val }}</div>
            <div class="m-chg" :class="m.up ? 'up' : 'dn'">
              {{ m.up ? '▲' : '▼' }} {{ m.chg }}
              <span class="m-pct">({{ m.up ? '+' : '' }}{{ m.pct }}%)</span>
            </div>
            <div class="m-bar-bg">
              <div class="m-bar" :style="{ width: m.barW + '%', background: m.up ? '#0ecb81' : '#f6465d' }"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ NEWS + NOTICE ═══ -->
    <section class="news-section">
      <div class="section-wrap news-wrap">
        <div class="news-col">
          <div class="s-header"><h2>투자 뉴스</h2></div>
          <div class="news-list">
            <div v-for="n in newsItems" :key="n.title" class="news-item">
              <span class="n-tag" :style="{ background: n.tagBg, color: n.tagColor }">{{ n.tag }}</span>
              <span class="n-title">{{ n.title }}</span>
              <span class="n-time">{{ n.time }}</span>
            </div>
          </div>
        </div>
        <div class="notice-col">
          <div class="s-header"><h2>공지사항</h2></div>
          <div class="notice-list">
            <div v-for="n in noticeItems" :key="n" class="notice-item">
              <q-icon name="chevron_right" size="15px" color="primary" class="q-mr-xs" />{{ n }}
            </div>
          </div>
          <div class="event-box" @click="openChatOrLogin">
            <div class="event-icon">🎁</div>
            <div>
              <div class="event-title">신규 계좌개설 이벤트</div>
              <div class="event-desc">ETF 매수수수료 3개월 무료!</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ FOOTER ═══ -->
    <footer class="kf-footer">
      <div class="footer-wrap">
        <div class="footer-brand">
          <q-icon name="show_chart" size="18px" class="q-mr-xs" />KF증권(주)
        </div>
        <div class="footer-info">
          서울특별시 영등포구 여의대로 36 KF타워&nbsp;|&nbsp;대표이사: 홍길동&nbsp;|&nbsp;사업자번호: 123-45-67890<br>
          고객센터: 1588-0000 (평일 09:00~18:00)&nbsp;|&nbsp;금융투자업 제2018-서울-0001호
        </div>
        <div class="footer-legal">
          ※ 금융투자상품은 예금자보호법에 따른 예금보험 대상이 아닙니다. 투자 결과는 투자자 본인의 판단과 책임 하에 이루어집니다.
        </div>
      </div>
    </footer>

    <!-- ═══ CHATBOT ═══ -->
    <ChatbotButton @open-chat="openChatOrLogin" />
    <ChatbotDialog v-model="chatOpen" />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import ChatbotButton from '../components/ChatbotButton.vue';
import ChatbotDialog from '../components/ChatbotDialog.vue';
import { useAuthStore } from '../stores/authStore';
import { pinia } from '../stores/pinia';

const $q = useQuasar();
const authStore = useAuthStore(pinia);
const chatOpen = ref(false);
const scrolled = ref(false);
const pageRef = ref(null);

const onScroll = () => { scrolled.value = window.scrollY > 8; };
const authEnabled = computed(() => authStore.enabled);
const authBusy = computed(() => authStore.authenticating && !authStore.initialized);
const isAuthenticated = computed(() => !authEnabled.value || authStore.authenticated);
const displayName = computed(() => authStore.displayName);

const openChatOrLogin = async () => {
  if (!authEnabled.value) {
    chatOpen.value = true;
    return;
  }

  try {
    await authStore.initialize();
    if (authStore.authenticated) {
      chatOpen.value = true;
      return;
    }

    $q.notify({
      message: '투자상담 챗봇 이용을 위해 로그인해 주세요.',
      color: 'primary',
      position: 'top',
      timeout: 1400
    });
    await authStore.beginLogin();
  } catch (error) {
    $q.notify({
      message: error.message || '로그인을 시작하지 못했습니다.',
      color: 'negative',
      position: 'top'
    });
  }
};

const login = async () => {
  try {
    await authStore.initialize();
    await authStore.beginLogin();
  } catch (error) {
    $q.notify({
      message: error.message || '로그인을 시작하지 못했습니다.',
      color: 'negative',
      position: 'top'
    });
  }
};

const logout = async () => {
  try {
    await authStore.logout();
  } catch (error) {
    $q.notify({
      message: error.message || '로그아웃에 실패했습니다.',
      color: 'negative',
      position: 'top'
    });
  }
};

onMounted(async () => {
  window.addEventListener('scroll', onScroll, { passive: true });
  await authStore.initialize();
});
onUnmounted(() => window.removeEventListener('scroll', onScroll));

const todayStr = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
});

const navItems = ['주식', '펀드', 'ETF', '채권·RP', '해외투자', '퇴직연금', '고객센터'];

const tickers = [
  { name: 'KOSPI',    val: '2,847.52', chg: '12.43', up: true  },
  { name: 'KOSDAQ',   val: '854.21',   chg: '5.87',  up: true  },
  { name: 'S&P500',   val: '5,523.11', chg: '18.32', up: false },
  { name: 'DOW',      val: '43,861',   chg: '134.4', up: false },
  { name: 'NASDAQ',   val: '17,948',   chg: '89.5',  up: false },
  { name: '원/달러',  val: '1,382.50', chg: '4.20',  up: true  },
  { name: 'WTI',      val: '78.42',    chg: '0.83',  up: true  },
  { name: '금(oz)',   val: '2,318.60', chg: '11.20', up: false },
];

const heroIndices = [
  { name: 'KOSPI',  val: '2,847.52', chg: '+0.44', up: true  },
  { name: 'KOSDAQ', val: '854.21',   chg: '+0.69', up: true  },
  { name: 'S&P500', val: '5,523.11', chg: '-0.33', up: false },
  { name: '원/달러', val: '1,382.50', chg: '+0.30', up: true  },
];

const quickItems = [
  { icon: 'trending_up',      label: '주식',      bg: '#e8f4fd', color: '#1652f0' },
  { icon: 'pie_chart',        label: '펀드',      bg: '#fef3e2', color: '#f59e0b' },
  { icon: 'bar_chart',        label: 'ETF',       bg: '#edfaf4', color: '#0ecb81' },
  { icon: 'language',         label: '해외주식',  bg: '#f3e8ff', color: '#8b5cf6' },
  { icon: 'savings',          label: 'ISA',       bg: '#fce8e8', color: '#f6465d' },
  { icon: 'elderly',          label: '퇴직연금',  bg: '#e8f4fd', color: '#0284c7' },
  { icon: 'account_balance',  label: '채권',      bg: '#fef9e8', color: '#d97706' },
  { icon: 'school',           label: '투자교육',  bg: '#e8fdf6', color: '#059669' },
];

const products = [
  {
    icon: 'savings', title: 'ISA 계좌', color: '#f6465d', bg: '#fce8e8',
    desc: '비과세·세금우대 혜택으로 세금 절약하며 투자',
    badge: '연 200만원 비과세'
  },
  {
    icon: 'bar_chart', title: 'ETF 투자', color: '#0ecb81', bg: '#edfaf4',
    desc: '국내·해외 ETF를 한 번에, 낮은 수수료로 분산투자',
    badge: '수수료 0.015%~'
  },
  {
    icon: 'elderly', title: 'IRP·퇴직연금', color: '#1652f0', bg: '#e8f4fd',
    desc: '세액공제 최대 900만원, 노후를 위한 스마트 연금',
    badge: '세액공제 16.5%'
  },
  {
    icon: 'language', title: '해외주식', color: '#8b5cf6', bg: '#f3e8ff',
    desc: '미국·중국·일본 주요 종목에 실시간 직접 투자',
    badge: '실시간 환전'
  },
];

const marketData = [
  { name: 'KOSPI',    val: '2,847.52', chg: '12.43',  pct: '0.44', up: true,  barW: 62 },
  { name: 'KOSDAQ',   val: '854.21',   chg: '5.87',   pct: '0.69', up: true,  barW: 55 },
  { name: 'KOSPI200', val: '381.04',   chg: '1.92',   pct: '0.51', up: true,  barW: 48 },
  { name: 'KRX300',   val: '449.28',   chg: '3.41',   pct: '0.77', up: true,  barW: 70 },
  { name: 'S&P500',   val: '5,523.11', chg: '18.32',  pct: '0.33', up: false, barW: 40 },
  { name: 'NASDAQ',   val: '17,948',   chg: '89.54',  pct: '0.50', up: false, barW: 35 },
];

const newsItems = [
  { tag: '국내',   tagBg: '#e8f4fd', tagColor: '#1652f0', title: '한국은행, 기준금리 3.00% 동결…증시 반응은?',        time: '14:23' },
  { tag: '해외',   tagBg: '#f3e8ff', tagColor: '#8b5cf6', title: 'Fed 7월 회의록 공개, 금리 인하 신호 포착',          time: '13:47' },
  { tag: 'ETF',    tagBg: '#edfaf4', tagColor: '#059669', title: 'TIGER 미국나스닥100 ETF, 신규 투자자 급증',          time: '12:05' },
  { tag: '실적',   tagBg: '#fef3e2', tagColor: '#d97706', title: '삼성전자 2Q 실적 예상치 상회…반도체 회복 기대',      time: '10:38' },
  { tag: '공모주',  tagBg: '#fce8e8', tagColor: '#f6465d', title: '하반기 대형 IPO 일정 발표, 청약 경쟁률 주목',       time: '09:21' },
];

const noticeItems = [
  '[공지] 7월 금융투자교육 온라인 강좌 개설',
  '[안내] 해외주식 양도소득세 신고 기간 안내',
  '[이벤트] 여름 특별 ETF 수수료 무료 이벤트',
  '[시스템] 08.03(토) 야간 서비스 점검 안내',
];
</script>

<style scoped>
/* ═══════════════ PAGE ═══════════════ */
.kf-page {
  min-height: 100vh;
  background: #f5f6f8;
  font-family: 'Pretendard Variable', 'Pretendard', sans-serif;
}

/* ═══════════════ NAV ═══════════════ */
.kf-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #0a1628;
  transition: box-shadow 0.2s;
}
.kf-nav.scrolled { box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
.nav-inner {
  max-width: 1280px; margin: 0 auto;
  display: flex; align-items: center;
  padding: 0 24px; height: 60px; gap: 32px;
}
.nav-brand {
  display: flex; align-items: center; gap: 8px;
  color: white; font-size: 20px; font-weight: 700;
  letter-spacing: -0.5px; flex-shrink: 0;
}
.nav-links {
  display: flex; gap: 4px; flex: 1;
}
.nav-link {
  color: rgba(255,255,255,0.75); text-decoration: none;
  font-size: 14px; font-weight: 500; padding: 6px 12px;
  border-radius: 6px; transition: all 0.15s;
}
.nav-link:hover { color: white; background: rgba(255,255,255,0.1); }
.nav-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.open-btn { border-radius: 20px !important; font-size: 13px !important; }

/* ═══════════════ TICKER ═══════════════ */
.ticker-wrap {
  background: #0d1f3c;
  overflow: hidden;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ticker-inner {
  display: flex;
  width: max-content;
  animation: tickerScroll 40s linear infinite;
  padding: 8px 0;
}
.ticker-item {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 0 28px; font-size: 13px; white-space: nowrap;
  border-right: 1px solid rgba(255,255,255,0.1);
}
.t-name { color: rgba(255,255,255,0.5); font-size: 11px; }
.t-val  { color: rgba(255,255,255,0.9); font-weight: 600; }
.t-chg  { font-size: 11px; font-weight: 600; }
.ticker-item.up .t-chg { color: #0ecb81; }
.ticker-item.dn .t-chg { color: #f6465d; }
@keyframes tickerScroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

/* ═══════════════ HERO ═══════════════ */
.hero-section {
  background: linear-gradient(135deg, #0a1628 0%, #1652f0 60%, #7c3aed 100%);
  padding: 64px 24px 80px;
}
.hero-inner {
  max-width: 1280px; margin: 0 auto;
  display: flex; align-items: center; gap: 48px;
  flex-wrap: wrap;
}
.hero-text { flex: 1; min-width: 280px; }
.hero-badge {
  display: inline-block;
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.9);
  font-size: 12px; font-weight: 600;
  padding: 5px 14px; border-radius: 20px;
  margin-bottom: 20px; backdrop-filter: blur(4px);
}
.hero-title {
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 700; color: white;
  line-height: 1.3; letter-spacing: -1px; margin: 0 0 16px;
}
.hero-title em { color: #7dd3fc; font-style: normal; }
.hero-sub { color: rgba(255,255,255,0.75); font-size: 15px; line-height: 1.7; margin: 0 0 32px; }
.hero-btns { display: flex; gap: 12px; flex-wrap: wrap; }
.btn-cta {
  background: white; color: #1652f0;
  border: none; border-radius: 28px;
  padding: 13px 28px; font-size: 15px; font-weight: 700;
  cursor: pointer; transition: all 0.2s;
}
.btn-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
.btn-outline {
  background: transparent; color: white;
  border: 1.5px solid rgba(255,255,255,0.5); border-radius: 28px;
  padding: 12px 24px; font-size: 15px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.btn-outline:hover { border-color: white; background: rgba(255,255,255,0.1); }

/* Hero panel */
.hero-panel {
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 20px; padding: 24px 28px;
  min-width: 280px; flex-shrink: 0;
}
.panel-title { color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
.panel-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.pi-name { color: rgba(255,255,255,0.7); font-size: 13px; flex: 1; }
.pi-val  { color: white; font-weight: 700; font-size: 16px; }
.pi-chg  { font-size: 13px; font-weight: 600; min-width: 58px; text-align: right; }
.pi-chg.up { color: #0ecb81; }
.pi-chg.dn { color: #f6465d; }
.panel-footer { color: rgba(255,255,255,0.45); font-size: 11px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 12px; }

/* ═══════════════ SHARED ═══════════════ */
.section-wrap { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
.s-header { margin-bottom: 24px; }
.s-header h2 { font-size: 22px; font-weight: 700; color: #0a1628; margin: 0 0 4px; }
.s-header p  { font-size: 14px; color: #64748b; margin: 0; }
.up { color: #0ecb81; }
.dn { color: #f6465d; }
.date-tag { font-size: 12px; color: #94a3b8; }
.s-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px; }

/* ═══════════════ QUICK ═══════════════ */
.quick-section { background: white; padding: 32px 0; border-bottom: 1px solid #e8ecf0; }
.quick-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}
.quick-btn {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: none; border: none; cursor: pointer;
  padding: 16px 8px; border-radius: 16px; transition: background 0.15s;
}
.quick-btn:hover { background: #f5f6f8; }
.quick-icon {
  width: 52px; height: 52px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
}
.quick-label { font-size: 13px; font-weight: 500; color: #374151; }

/* ═══════════════ PRODUCTS ═══════════════ */
.products-section { background: #f5f6f8; padding: 48px 0; }
.product-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.product-card {
  background: white; border-radius: 20px;
  padding: 24px; cursor: pointer;
  transition: all 0.2s;
  border: 1.5px solid transparent;
  display: flex; flex-direction: column; gap: 10px;
}
.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0,0,0,0.08);
  border-color: #1652f0;
}
.p-icon-wrap {
  width: 52px; height: 52px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
}
.p-name { font-size: 17px; font-weight: 700; color: #0a1628; }
.p-desc { font-size: 13px; color: #64748b; line-height: 1.5; }
.p-badge {
  display: inline-block; font-size: 11px; font-weight: 700;
  padding: 3px 10px; border-radius: 12px;
  width: fit-content;
}
.p-cta { font-size: 13px; color: #1652f0; font-weight: 600; margin-top: 4px; }

/* ═══════════════ MARKET ═══════════════ */
.market-section { background: white; padding: 48px 0; border-top: 1px solid #e8ecf0; }
.market-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.market-card {
  background: #f8fafc; border-radius: 16px; padding: 20px;
  border: 1px solid #e8ecf0;
}
.m-name { font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px; }
.m-val  { font-size: 22px; font-weight: 700; color: #0a1628; margin-bottom: 4px; }
.m-chg  { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.m-pct  { opacity: 0.8; }
.m-bar-bg { height: 4px; background: #e8ecf0; border-radius: 2px; }
.m-bar    { height: 4px; border-radius: 2px; transition: width 0.6s ease; }

/* ═══════════════ NEWS ═══════════════ */
.news-section { background: #f5f6f8; padding: 48px 0; }
.news-wrap { display: grid; grid-template-columns: 3fr 2fr; gap: 32px; }
.news-list { display: flex; flex-direction: column; gap: 0; }
.news-item {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 0; border-bottom: 1px solid #e8ecf0;
}
.n-tag {
  flex-shrink: 0; font-size: 11px; font-weight: 700;
  padding: 3px 8px; border-radius: 6px;
}
.n-title { flex: 1; font-size: 14px; color: #1e293b; font-weight: 500; }
.n-time  { font-size: 12px; color: #94a3b8; flex-shrink: 0; }
.notice-col { display: flex; flex-direction: column; gap: 0; }
.notice-list { background: white; border-radius: 16px; padding: 8px 0; margin-bottom: 16px; }
.notice-item {
  display: flex; align-items: center;
  padding: 12px 16px; font-size: 13px; color: #374151;
  border-bottom: 1px solid #f5f6f8; cursor: pointer;
}
.notice-item:hover { background: #f5f6f8; }
.notice-item:last-child { border-bottom: none; }
.event-box {
  background: linear-gradient(135deg, #1652f0, #7c3aed);
  border-radius: 16px; padding: 20px;
  display: flex; align-items: center; gap: 16px;
  cursor: pointer; transition: opacity 0.15s;
}
.event-box:hover { opacity: 0.9; }
.event-icon  { font-size: 32px; }
.event-title { color: white; font-size: 15px; font-weight: 700; }
.event-desc  { color: rgba(255,255,255,0.8); font-size: 13px; margin-top: 2px; }

/* ═══════════════ FOOTER ═══════════════ */
.kf-footer { background: #0a1628; padding: 40px 0; }
.footer-wrap { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
.footer-brand {
  display: flex; align-items: center;
  color: rgba(255,255,255,0.9); font-size: 16px; font-weight: 700;
  margin-bottom: 12px;
}
.footer-info  { font-size: 12px; color: rgba(255,255,255,0.45); line-height: 1.8; margin-bottom: 12px; }
.footer-legal { font-size: 11px; color: rgba(255,255,255,0.3); line-height: 1.6; }

/* ═══════════════ RESPONSIVE ═══════════════ */
@media (max-width: 1024px) {
  .product-grid { grid-template-columns: repeat(2, 1fr); }
  .market-grid  { grid-template-columns: repeat(2, 1fr); }
  .news-wrap    { grid-template-columns: 1fr; }
  .quick-grid   { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 768px) {
  .nav-links { display: none; }
  .hero-section { padding: 40px 20px 60px; }
  .hero-panel   { min-width: 100%; }
  .product-grid { grid-template-columns: repeat(2, 1fr); }
  .market-grid  { grid-template-columns: 1fr 1fr; }
  .quick-grid   { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 480px) {
  .product-grid { grid-template-columns: 1fr; }
  .market-grid  { grid-template-columns: 1fr; }
  .quick-grid   { grid-template-columns: repeat(4, 1fr); }
}
</style>
