<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-white text-dark">
      <q-toolbar class="max-w-7xl mx-auto">
        <q-toolbar-title class="text-academy-primary font-bold text-xl">
          <q-icon name="school" size="28px" class="q-mr-sm" />
          학원명
        </q-toolbar-title>

        <q-space />

        <q-btn flat label="과정안내" class="q-mx-sm text-gray-700" />
        <q-btn flat label="수강신청" class="q-mx-sm text-gray-700" />
        <q-btn flat label="학원소개" class="q-mx-sm text-gray-700" />
        <q-btn flat label="오시는길" class="q-mx-sm text-gray-700" />
        <q-btn unelevated rounded label="상담신청" color="primary" class="q-ml-md" />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <q-page class="bg-gradient-to-br from-blue-50 to-purple-50">
        <section class="hero-section py-20 px-4">
          <div class="max-w-7xl mx-auto text-center">
            <h1 class="text-5xl font-bold text-gray-800 mb-6 fade-in">
              당신의 미래를 위한<br />최고의 교육 파트너
            </h1>
            <p class="text-xl text-gray-600 mb-8 fade-in">
              토익, 토플, 영어회화부터 각종 자격증까지<br />전문 강사진과 함께하는 맞춤형 교육
            </p>
            <q-btn
              unelevated
              rounded
              size="lg"
              label="수강 상담하기"
              color="primary"
              class="text-lg px-8 py-3 fade-in"
              icon-right="arrow_forward"
              @click="openChatbot"
            />
          </div>
        </section>

        <section class="programs-section py-16 px-4 bg-white">
          <div class="max-w-7xl mx-auto">
            <h2 class="text-3xl font-bold text-center mb-12 text-gray-800">인기 과정</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <q-card v-for="program in programs" :key="program.id" class="hover:shadow-xl transition-shadow cursor-pointer">
                <q-card-section class="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                  <div class="text-h6 flex items-center">
                    <q-icon :name="program.icon" size="32px" class="q-mr-sm" />
                    {{ program.title }}
                  </div>
                </q-card-section>

                <q-card-section>
                  <p class="text-gray-700">{{ program.description }}</p>
                </q-card-section>

                <q-card-section>
                  <div class="text-sm text-gray-500 mb-2">
                    <q-icon name="schedule" size="18px" /> {{ program.duration }}
                  </div>
                  <div class="text-sm text-gray-500 mb-2">
                    <q-icon name="people" size="18px" /> {{ program.students }}
                  </div>
                  <div class="text-lg font-bold text-academy-primary mt-4">
                    {{ program.price }}
                  </div>
                </q-card-section>

                <q-card-actions>
                  <q-btn flat color="primary" label="자세히 보기" class="full-width" />
                </q-card-actions>
              </q-card>
            </div>
          </div>
        </section>

        <section class="features-section py-16 px-4">
          <div class="max-w-7xl mx-auto">
            <h2 class="text-3xl font-bold text-center mb-12 text-gray-800">우리 학원의 강점</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div v-for="feature in features" :key="feature.id" class="text-center p-6 bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow">
                <q-icon :name="feature.icon" size="48px" :color="feature.color" class="mb-4" />
                <h3 class="text-xl font-bold mb-2 text-gray-800">{{ feature.title }}</h3>
                <p class="text-gray-600">{{ feature.description }}</p>
              </div>
            </div>
          </div>
        </section>

        <section class="campus-section py-16 px-4 bg-slate-950 text-white">
          <div class="max-w-7xl mx-auto grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div class="space-y-4">
              <p class="text-sm uppercase tracking-[0.3em] text-cyan-300">Campus Navigator</p>
              <h2 class="text-4xl font-bold leading-tight">동대구역, 서대구역, 서문시장 캠퍼스를 지도에서 바로 고르세요</h2>
              <p class="text-slate-300 text-lg">
                다음 접속 때 오늘 예약이 있으면 바로 리마인더를 띄우고, 챗봇 안에서는 지리 좌표 기반 캠퍼스 선택으로 빠르게 예약을 이어갈 수 있습니다.
              </p>
              <div class="flex flex-wrap gap-3">
                <q-chip
                  v-for="campus in campuses"
                  :key="campus.id"
                  color="white"
                  text-color="primary"
                  icon="place"
                >
                  {{ campus.name }} · {{ campus.lat.toFixed(4) }}, {{ campus.lng.toFixed(4) }}
                </q-chip>
              </div>
              <q-btn
                unelevated
                rounded
                color="cyan-4"
                text-color="dark"
                label="챗봇으로 캠퍼스 선택하기"
                icon-right="map"
                @click="openChatbot"
              />
            </div>

            <div class="campus-preview-card">
              <CampusMapPicker @select="openChatbotWithBranch" />
            </div>
          </div>
        </section>

        <section class="cta-section py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div class="max-w-4xl mx-auto text-center">
            <h2 class="text-4xl font-bold mb-6">지금 바로 시작하세요</h2>
            <p class="text-xl mb-8">무료 상담을 통해 맞춤형 학습 계획을 세워드립니다</p>
            <q-btn
              unelevated
              rounded
              size="lg"
              label="무료 상담 신청"
              color="white"
              text-color="primary"
              class="text-lg px-8 py-3"
              icon-right="phone"
              @click="openChatbot"
            />
          </div>
        </section>

        <ChatbotButton @open-chat="openChatbot" />
        <ChatbotDialog v-model="chatbotOpen" />

        <q-dialog v-model="reservationReminderOpen">
          <q-card class="reservation-reminder">
            <q-card-section class="bg-emerald-600 text-white">
              <div class="text-overline">Today Reminder</div>
              <div class="text-h5 text-weight-bold">오늘 예약 일정이 있어요</div>
            </q-card-section>

            <q-card-section class="grid gap-4">
              <div class="text-body1 text-grey-9">
                {{ reminderMessage }}
              </div>

              <div class="reminder-summary">
                <div v-for="item in reminderSummary" :key="item.label" class="summary-row">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>

              <CampusMapPicker
                :selected-branch="todayReservation?.Branch || ''"
                @select="openChatbotWithBranch"
              />
            </q-card-section>

            <q-card-actions align="right" class="q-pa-md">
              <q-btn flat label="나중에 보기" color="grey-7" @click="dismissReminder" />
              <q-btn unelevated color="primary" label="챗봇으로 예약 확인" @click="openReminderChat" />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import ChatbotButton from '../components/ChatbotButton.vue';
import ChatbotDialog from '../components/ChatbotDialog.vue';
import CampusMapPicker from '../components/CampusMapPicker.vue';
import campuses from '../../shared/campusLocations.json';

const chatbotOpen = ref(false);
const reservationReminderOpen = ref(false);
const reminderDismissedKey = ref('');
const todayReservation = ref(null);

const openChatbot = () => {
  chatbotOpen.value = true;
};

const openChatbotWithBranch = (branch) => {
  chatbotOpen.value = true;
  if (!branch) return;
  localStorage.setItem('lex_chat_ux_branch_prefill', branch);
};

const reminderSummary = computed(() => {
  if (!todayReservation.value) return [];
  return [
    { label: '예약 지점', value: todayReservation.value.Branch || '-' },
    { label: '과정', value: todayReservation.value.CourseName || '-' },
    { label: '시간', value: `${todayReservation.value.Date || '-'} ${todayReservation.value.Time || ''}`.trim() },
    { label: '예약자', value: todayReservation.value.StudentName || '-' }
  ];
});

const reminderMessage = computed(() => {
  if (!todayReservation.value) return '';
  return `${todayReservation.value.StudentName || '예약자'}님, 오늘 ${todayReservation.value.Time || ''} ${todayReservation.value.Branch || ''} ${todayReservation.value.CourseName || ''} 예약이 예정되어 있습니다. 챗봇에서 위치와 예약 정보를 다시 확인할 수 있어요.`;
});

const dismissReminder = () => {
  reservationReminderOpen.value = false;
  if (reminderDismissedKey.value) {
    localStorage.setItem(reminderDismissedKey.value, '1');
  }
};

const openReminderChat = () => {
  reservationReminderOpen.value = false;
  openChatbot();
};

onMounted(() => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayKey = `${yyyy}-${mm}-${dd}`;
  reminderDismissedKey.value = `lex_chat_ux_today_notice_dismissed_${todayKey}`;

  try {
    const stored = localStorage.getItem('lex_chat_ux_v3_state');
    if (!stored) return;
    const parsed = JSON.parse(stored);
    const reservation = parsed?.lastReservation?.fields;
    if (!reservation?.Date || reservation.Date !== todayKey) return;
    if (localStorage.getItem(reminderDismissedKey.value) === '1') return;
    todayReservation.value = reservation;
    reservationReminderOpen.value = true;
  } catch (error) {
    console.error('Failed to load reservation reminder:', error);
  }
});

const programs = ref([
  {
    id: 1,
    icon: 'translate',
    title: '토익 집중반',
    description: '단기간 목표 점수 달성을 위한 집중 트레이닝',
    duration: '주 5회, 2개월',
    students: '소규모 8명',
    price: '월 350,000원'
  },
  {
    id: 2,
    icon: 'record_voice_over',
    title: '영어 회화',
    description: '원어민 강사와 함께하는 실전 회화 연습',
    duration: '주 3회, 3개월',
    students: '소규모 6명',
    price: '월 280,000원'
  },
  {
    id: 3,
    icon: 'workspace_premium',
    title: '토플 준비반',
    description: '해외 유학을 위한 토플 완벽 대비',
    duration: '주 4회, 3개월',
    students: '소규모 10명',
    price: '월 400,000원'
  }
]);

const features = ref([
  {
    id: 1,
    icon: 'verified',
    color: 'primary',
    title: '검증된 강사진',
    description: '10년 이상 경력의 전문 강사'
  },
  {
    id: 2,
    icon: 'groups',
    color: 'secondary',
    title: '소규모 수업',
    description: '밀착 관리로 높은 학습 효과'
  },
  {
    id: 3,
    icon: 'schedule',
    color: 'accent',
    title: '유연한 시간',
    description: '평일/주말 다양한 시간대'
  },
  {
    id: 4,
    icon: 'military_tech',
    color: 'orange',
    title: '합격 보장',
    description: '목표 미달성시 무료 재수강'
  }
]);
</script>

<style scoped>
.hero-section {
  min-height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.campus-preview-card {
  border-radius: 28px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.24);
  padding: 20px;
  backdrop-filter: blur(12px);
}

.reservation-reminder {
  width: min(760px, 92vw);
  max-width: 760px;
  border-radius: 24px;
  overflow: hidden;
}

.reminder-summary {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  background: #f8fafc;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: #334155;
}

@media (max-width: 768px) {
  .hero-section h1 {
    font-size: 2.5rem;
  }
  
  .hero-section p {
    font-size: 1rem;
  }
}
</style>
