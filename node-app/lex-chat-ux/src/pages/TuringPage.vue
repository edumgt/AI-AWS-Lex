<template>
  <div class="turing-page">
    <header class="tp-nav">
      <router-link to="/" class="tp-back">
        <q-icon name="arrow_back" size="18px" /> KF증권 홈으로
      </router-link>
      <div class="tp-brand">
        <q-icon name="psychology" size="20px" /> 앨런 튜링 &amp; 튜링 테스트
      </div>
    </header>

    <section class="tp-hero">
      <div class="tp-hero-inner">
        <div class="tp-hero-badge">1912 – 1954</div>
        <h1>앨런 튜링<br><em>컴퓨터 과학과 인공지능의 아버지</em></h1>
        <p>암호를 풀어 제2차 세계대전을 승리로 이끌고,<br>
        "기계가 생각할 수 있는가?"라는 질문으로 인공지능의 문을 연 수학자</p>
      </div>
    </section>

    <section class="tp-section">
      <div class="tp-wrap">
        <div class="tp-s-header"><h2>튜링의 발자취</h2></div>
        <div class="tp-timeline">
          <div v-for="item in timeline" :key="item.year" class="tp-timeline-item">
            <div class="tp-year">{{ item.year }}</div>
            <div class="tp-timeline-body">
              <div class="tp-timeline-title">{{ item.title }}</div>
              <div class="tp-timeline-desc">{{ item.desc }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="tp-section tp-section-alt">
      <div class="tp-wrap">
        <div class="tp-s-header">
          <h2>튜링 테스트란?</h2>
          <p>1950년 논문 &laquo;Computing Machinery and Intelligence&raquo;에서 제안한 &quot;이미테이션 게임&quot;</p>
        </div>
        <div class="tp-explain-grid">
          <div class="tp-explain-card" v-for="e in explain" :key="e.title">
            <q-icon :name="e.icon" size="26px" color="primary" />
            <div class="tp-explain-title">{{ e.title }}</div>
            <div class="tp-explain-desc">{{ e.desc }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="tp-section">
      <div class="tp-wrap">
        <div class="tp-s-header">
          <h2>튜링 테스트 체험하기</h2>
          <p>채팅 상대와 몇 마디 나눠보고, 인간인지 AI인지 맞혀보세요</p>
        </div>
        <TuringGame />
      </div>
    </section>

    <footer class="tp-footer">
      <div class="tp-wrap">
        &quot;기계가 생각할 수 있는가?&quot;라는 질문 대신, 튜링은<br>
        &quot;기계가 대화를 통해 인간을 속일 수 있는가?&quot;를 물었습니다.
      </div>
    </footer>
  </div>
</template>

<script setup>
import TuringGame from '../components/TuringGame.vue';

const timeline = [
  {
    year: '1912',
    title: '출생',
    desc: '영국 런던에서 태어나 어릴 때부터 수학과 과학에 남다른 재능을 보였다.'
  },
  {
    year: '1936',
    title: '튜링 머신 고안',
    desc: '논문 "On Computable Numbers"에서 오늘날 모든 컴퓨터의 이론적 토대가 된 \'튜링 머신\' 개념을 제시했다.'
  },
  {
    year: '1939–1945',
    title: '블레츨리 파크, 에니그마 해독',
    desc: '제2차 세계대전 중 영국 암호 해독팀을 이끌며 독일군의 에니그마 암호를 해독, 전쟁을 수년 단축시켰다는 평가를 받는다.'
  },
  {
    year: '1950',
    title: '"Computing Machinery and Intelligence" 발표',
    desc: '"기계가 생각할 수 있는가?"라는 질문을 던지고, 이를 판별하는 방법으로 \'이미테이션 게임\'(오늘날의 튜링 테스트)을 제안했다.'
  },
  {
    year: '1952',
    title: '부당한 기소',
    desc: '당시 영국에서 불법이었던 동성애 혐의로 기소되어 화학적 거세를 선고받았다.'
  },
  {
    year: '1954',
    title: '사망',
    desc: '41세의 나이로 세상을 떠났다. 이후 2009년 영국 정부의 공식 사과, 2013년 엘리자베스 2세의 사후 특별 사면이 있었다.'
  },
  {
    year: '오늘날',
    title: '컴퓨터 과학 최고 권위상 "튜링상"',
    desc: '컴퓨터 과학 분야 최고 영예인 ACM 튜링상(A.M. Turing Award)은 그의 이름을 따 제정되었으며 \'컴퓨터 과학의 노벨상\'으로 불린다.'
  }
];

const explain = [
  {
    icon: 'forum',
    title: '대화로 판별한다',
    desc: '심사자는 상대를 보지 않고 텍스트로만 대화하며, 상대가 사람인지 기계인지 구별할 수 없다면 그 기계는 테스트를 통과한 것으로 본다.'
  },
  {
    icon: 'visibility_off',
    title: '눈에 보이지 않는 상대',
    desc: '원래 제안은 심사자, 인간 참가자, 기계가 각각 다른 방에서 문자로만 소통하는 \'이미테이션 게임\' 형태였다.'
  },
  {
    icon: 'psychology_alt',
    title: '지능이 아닌 \'모방\'을 측정',
    desc: '기계가 실제로 사고하는지가 아니라, 인간처럼 \'보이는가\'를 판단 기준으로 삼았다는 점이 이 테스트의 핵심 통찰이다.'
  },
  {
    icon: 'smart_toy',
    title: '오늘날의 AI와의 연결',
    desc: '현대의 대화형 AI(챗봇, LLM)를 평가하고 논의할 때에도 여전히 인용되는 인공지능 철학의 출발점이다.'
  }
];
</script>

<style scoped>
.turing-page {
  min-height: 100vh;
  background: #f5f6f8;
  font-family: 'Pretendard Variable', 'Pretendard', sans-serif;
}

.tp-nav {
  position: sticky; top: 0; z-index: 100;
  background: #0a1628;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; height: 56px;
}
.tp-back {
  display: flex; align-items: center; gap: 6px;
  color: rgba(255,255,255,0.8); text-decoration: none; font-size: 13px;
}
.tp-back:hover { color: white; }
.tp-brand {
  display: flex; align-items: center; gap: 8px;
  color: white; font-size: 15px; font-weight: 700;
}

.tp-hero {
  background: linear-gradient(135deg, #0a1628 0%, #1652f0 60%, #7c3aed 100%);
  padding: 56px 24px;
  text-align: center;
}
.tp-hero-inner { max-width: 720px; margin: 0 auto; }
.tp-hero-badge {
  display: inline-block; background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.9); font-size: 12px; font-weight: 600;
  padding: 5px 14px; border-radius: 20px; margin-bottom: 20px;
}
.tp-hero h1 {
  font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 700; color: white;
  line-height: 1.4; letter-spacing: -0.5px; margin: 0 0 16px;
}
.tp-hero h1 em { color: #7dd3fc; font-style: normal; }
.tp-hero p { color: rgba(255,255,255,0.75); font-size: 14px; line-height: 1.7; margin: 0; }

.tp-section { padding: 48px 0; }
.tp-section-alt { background: white; border-top: 1px solid #e8ecf0; border-bottom: 1px solid #e8ecf0; }
.tp-wrap { max-width: 900px; margin: 0 auto; padding: 0 24px; }
.tp-s-header { margin-bottom: 28px; text-align: center; }
.tp-s-header h2 { font-size: 22px; font-weight: 700; color: #0a1628; margin: 0 0 6px; }
.tp-s-header p { font-size: 13px; color: #64748b; margin: 0; }

.tp-timeline { display: flex; flex-direction: column; gap: 0; }
.tp-timeline-item {
  display: flex; gap: 20px; padding: 16px 0;
  border-bottom: 1px solid #e8ecf0;
}
.tp-timeline-item:last-child { border-bottom: none; }
.tp-year {
  flex-shrink: 0; width: 110px; font-weight: 700; color: #1652f0; font-size: 14px;
}
.tp-timeline-title { font-size: 15px; font-weight: 700; color: #0a1628; margin-bottom: 4px; }
.tp-timeline-desc { font-size: 13px; color: #64748b; line-height: 1.6; }

.tp-explain-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
}
.tp-explain-card {
  background: #f8fafc; border: 1px solid #e8ecf0; border-radius: 16px;
  padding: 20px; display: flex; flex-direction: column; gap: 8px;
}
.tp-explain-title { font-size: 14px; font-weight: 700; color: #0a1628; }
.tp-explain-desc { font-size: 12.5px; color: #64748b; line-height: 1.6; }

.tp-footer {
  background: #0a1628; padding: 32px 0;
  text-align: center; color: rgba(255,255,255,0.6);
  font-size: 13px; line-height: 1.8;
}

@media (max-width: 768px) {
  .tp-explain-grid { grid-template-columns: repeat(2, 1fr); }
  .tp-timeline-item { flex-direction: column; gap: 4px; }
  .tp-year { width: auto; }
}
@media (max-width: 480px) {
  .tp-explain-grid { grid-template-columns: 1fr; }
}
</style>
