<template>
  <div class="tg-card">
    <div v-if="state === 'greeting'" class="tg-intro">
      <p>대화 상대는 <strong>AI</strong>이거나 <strong>사람</strong>입니다.<br>
      최대 {{ MAX_TURNS }}번 대화를 나눈 뒤 누구인지 맞혀보세요.</p>
      <button class="tg-start-btn" @click="startRound">테스트 시작하기</button>
    </div>

    <div v-else class="tg-chat">
      <div class="tg-messages" ref="scrollAreaRef">
        <div v-for="(m, i) in messages" :key="i" class="tg-msg" :class="m.from">
          <div class="tg-bubble">{{ m.text }}</div>
        </div>
        <div v-if="thinking" class="tg-msg other">
          <div class="tg-bubble tg-typing">···</div>
        </div>
      </div>

      <div v-if="state === 'chatting'" class="tg-input-row">
        <input
          v-model="draft"
          class="tg-input"
          placeholder="메시지를 입력하세요..."
          @keyup.enter="send"
        />
        <button class="tg-send-btn" @click="send" :disabled="!draft.trim()">전송</button>
        <button class="tg-judge-btn" @click="state = 'judging'" :disabled="!turnCount">판정하기</button>
      </div>

      <div v-else-if="state === 'judging'" class="tg-judge">
        <p>상대는 <strong>AI</strong>였을까요, <strong>사람</strong>이었을까요?</p>
        <div class="tg-judge-btns">
          <button class="tg-choice-btn" @click="submitGuess('ai')">🤖 AI</button>
          <button class="tg-choice-btn" @click="submitGuess('human')">🙋 사람</button>
        </div>
      </div>

      <div v-else class="tg-reveal">
        <div class="tg-reveal-result" :class="revealCorrect ? 'correct' : 'wrong'">
          {{ revealCorrect ? '정답입니다! 🎉' : '틀렸습니다 😅' }}
        </div>
        <div class="tg-reveal-detail">
          실제 상대는 <strong>{{ respondentType === 'ai' ? 'AI였습니다' : '사람이었습니다' }}</strong>
        </div>
        <div class="tg-score">누적 {{ score.rounds }}회 중 {{ score.correct }}회 정답 ({{ accuracyPct }}%)</div>
        <button class="tg-start-btn" @click="startRound">다시 도전하기</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import { getAiReply, getHumanReply, pickPersona } from '../utils/turingBot';

const MAX_TURNS = 6;

const state = ref('greeting'); // greeting | chatting | judging | revealed
const respondentType = ref(''); // ai | human
const messages = ref([]);
const draft = ref('');
const turnCount = ref(0);
const score = ref({ rounds: 0, correct: 0 });
const revealCorrect = ref(false);
const thinking = ref(false);
const scrollAreaRef = ref(null);

const accuracyPct = computed(() => {
  if (!score.value.rounds) return 0;
  return Math.round((score.value.correct / score.value.rounds) * 100);
});

function scrollToBottom() {
  nextTick(() => {
    if (scrollAreaRef.value) {
      scrollAreaRef.value.scrollTop = scrollAreaRef.value.scrollHeight;
    }
  });
}

function addMessage(from, text) {
  messages.value.push({ from, text });
  scrollToBottom();
}

function startRound() {
  respondentType.value = Math.random() < 0.5 ? 'ai' : 'human';
  messages.value = [];
  turnCount.value = 0;
  state.value = 'chatting';

  const greeting = respondentType.value === 'human'
    ? pickPersona().greeting
    : '안녕하세요, 무엇을 도와드릴까요?';
  addMessage('other', greeting);
}

async function send() {
  const text = draft.value.trim();
  if (!text || state.value !== 'chatting') return;

  addMessage('user', text);
  draft.value = '';
  turnCount.value += 1;

  thinking.value = true;
  const delay = 500 + Math.random() * 900;
  await new Promise((resolve) => setTimeout(resolve, delay));
  thinking.value = false;

  const reply = respondentType.value === 'ai' ? getAiReply(text) : getHumanReply();
  addMessage('other', reply);

  if (turnCount.value >= MAX_TURNS) {
    state.value = 'judging';
  }
}

function submitGuess(choice) {
  revealCorrect.value = choice === respondentType.value;
  score.value.rounds += 1;
  if (revealCorrect.value) score.value.correct += 1;
  state.value = 'revealed';
}
</script>

<style scoped>
.tg-card {
  background: white;
  border-radius: 20px;
  border: 1px solid #e8ecf0;
  padding: 24px;
  max-width: 560px;
  margin: 0 auto;
}

.tg-intro { text-align: center; padding: 20px 0; }
.tg-intro p { color: #374151; font-size: 14px; line-height: 1.7; margin: 0 0 20px; }

.tg-start-btn {
  background: linear-gradient(135deg, #1652f0, #7c3aed);
  color: white; border: none; border-radius: 24px;
  padding: 12px 28px; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s;
}
.tg-start-btn:hover { opacity: 0.9; }

.tg-messages {
  height: 320px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 10px;
  padding: 4px 4px 12px;
}
.tg-msg { display: flex; }
.tg-msg.user { justify-content: flex-end; }
.tg-msg.other { justify-content: flex-start; }
.tg-bubble {
  max-width: 78%; padding: 10px 14px; border-radius: 16px;
  font-size: 14px; line-height: 1.5; word-break: break-word;
}
.tg-msg.user .tg-bubble { background: #1652f0; color: white; border-bottom-right-radius: 4px; }
.tg-msg.other .tg-bubble { background: #f1f4f9; color: #1e293b; border-bottom-left-radius: 4px; }
.tg-typing { color: #94a3b8; letter-spacing: 2px; }

.tg-input-row { display: flex; gap: 8px; margin-top: 8px; }
.tg-input {
  flex: 1; border: 1.5px solid #e2e8f0; border-radius: 20px;
  padding: 10px 16px; font-size: 14px; outline: none;
}
.tg-input:focus { border-color: #1652f0; }
.tg-send-btn, .tg-judge-btn {
  border: none; border-radius: 20px; padding: 10px 16px;
  font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.tg-send-btn { background: #1652f0; color: white; }
.tg-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tg-judge-btn { background: #fef3e2; color: #d97706; }
.tg-judge-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.tg-judge { text-align: center; padding: 16px 0; }
.tg-judge p { font-size: 14px; color: #374151; margin: 0 0 16px; }
.tg-judge-btns { display: flex; gap: 12px; justify-content: center; }
.tg-choice-btn {
  border: 1.5px solid #e2e8f0; background: white; border-radius: 16px;
  padding: 14px 24px; font-size: 15px; font-weight: 600; cursor: pointer;
  transition: all 0.15s;
}
.tg-choice-btn:hover { border-color: #1652f0; background: #f5f8ff; }

.tg-reveal { text-align: center; padding: 12px 0; }
.tg-reveal-result { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.tg-reveal-result.correct { color: #0ecb81; }
.tg-reveal-result.wrong { color: #f6465d; }
.tg-reveal-detail { font-size: 14px; color: #374151; margin-bottom: 4px; }
.tg-score { font-size: 12px; color: #94a3b8; margin-bottom: 20px; }
</style>
