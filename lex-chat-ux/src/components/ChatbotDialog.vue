<template>
  <q-dialog
    v-model="dialogOpen"
    position="right"
    :maximized="$q.screen.lt.md"
    seamless
  >
    <q-card 
      :style="cardStyle" 
      class="chatbot-card bg-white flex flex-col"
    >
      <!-- Header -->
      <q-card-section class="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <q-avatar size="40px" color="white" text-color="primary" icon="smart_toy" />
            <div class="ml-3">
              <div class="font-bold text-lg">학원 상담 챗봇</div>
              <div class="text-xs opacity-90">무엇을 도와드릴까요?</div>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <!-- Engine Selector -->
            <q-btn
              flat
              dense
              round
              icon="settings"
              size="sm"
              @click="showSettings = !showSettings"
            >
              <q-menu v-model="showSettings">
                <q-list style="min-width: 200px">
                  <q-item-label header>엔진 선택</q-item-label>
                  <q-item 
                    v-for="engine in availableEngines" 
                    :key="engine.id"
                    clickable 
                    v-close-popup
                    @click="selectEngine(engine.id)"
                  >
                    <q-item-section>
                      <q-item-label>{{ engine.name }}</q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-icon 
                        v-if="selectedEngine === engine.id" 
                        name="check" 
                        color="primary" 
                      />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>

            <!-- New Session Button -->
            <q-btn
              flat
              dense
              round
              icon="refresh"
              size="sm"
              @click="startNewSession"
            >
              <q-tooltip>새 대화 시작</q-tooltip>
            </q-btn>

            <!-- Close Button -->
            <q-btn
              flat
              dense
              round
              icon="close"
              size="sm"
              v-close-popup
            />
          </div>
        </div>
      </q-card-section>

      <!-- Summary Section -->
      <q-card-section 
        v-if="summaryItems.length > 0" 
        class="bg-blue-50 py-3 border-b"
      >
        <div class="text-sm font-semibold text-gray-700 mb-2">예약 정보</div>
        <div class="flex flex-wrap gap-2">
          <q-chip
            v-for="item in summaryItems"
            :key="item.label"
            :color="item.value ? 'primary' : 'grey-4'"
            :text-color="item.value ? 'white' : 'grey-7'"
            size="sm"
            dense
          >
            <strong class="mr-1">{{ item.label }}:</strong>
            {{ item.value || '—' }}
          </q-chip>
        </div>
      </q-card-section>

      <!-- Chat Messages -->
      <q-card-section class="flex-1 overflow-auto bg-gray-50" ref="chatContainer">
        <div class="space-y-4">
          <div
            v-for="(message, index) in messages"
            :key="index"
            :class="['flex', message.role === 'user' ? 'justify-end' : 'justify-start']"
          >
            <div
              :class="[
                'max-w-[80%] rounded-2xl px-4 py-3 shadow-sm',
                message.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-sm' 
                  : 'bg-white text-gray-800 rounded-bl-sm border border-gray-200'
              ]"
              class="fade-in"
            >
              <div class="whitespace-pre-wrap break-words font-pretendard">
                {{ message.text }}
              </div>
              <div 
                v-if="message.meta" 
                class="text-xs mt-2 opacity-70"
              >
                {{ message.meta }}
              </div>
            </div>
          </div>

          <!-- Typing Indicator -->
          <div v-if="isTyping" class="flex justify-start">
            <div class="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-200">
              <div class="flex items-center gap-1">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <span class="ml-2 text-sm text-gray-500">응답 중...</span>
              </div>
            </div>
          </div>
        </div>
      </q-card-section>

      <!-- Quick Replies / Chips -->
      <q-card-section v-if="quickReplies.length > 0" class="py-2 bg-white border-t">
        <div class="flex flex-wrap gap-2">
          <q-btn
            v-for="(reply, index) in quickReplies"
            :key="index"
            outline
            rounded
            size="sm"
            :label="reply"
            color="primary"
            @click="sendQuickReply(reply)"
          />
        </div>
      </q-card-section>

      <!-- Input Area -->
      <q-card-section class="py-3 bg-white border-t">
        <div class="flex gap-2">
          <q-input
            v-model="userInput"
            :placeholder="inputPlaceholder"
            :type="inputType"
            outlined
            dense
            rounded
            class="flex-1"
            @keyup.enter="sendMessage"
            autofocus
          >
            <template v-slot:append>
              <q-icon 
                v-if="userInput" 
                name="close" 
                class="cursor-pointer" 
                @click="userInput = ''"
              />
            </template>
          </q-input>
          
          <q-btn
            round
            color="primary"
            icon="send"
            :disable="!userInput.trim()"
            @click="sendMessage"
          />
        </div>
        
        <div v-if="sessionId" class="text-xs text-gray-400 mt-2">
          세션: {{ sessionId }}
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import { useChatStore } from '../stores/chatStore';

const $q = useQuasar();
const chatStore = useChatStore();

const props = defineProps({
  modelValue: Boolean
});

const emit = defineEmits(['update:modelValue']);

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const chatContainer = ref(null);
const userInput = ref('');
const showSettings = ref(false);
const isTyping = ref(false);

const messages = computed(() => chatStore.messages);
const sessionId = computed(() => chatStore.sessionId);
const summaryItems = computed(() => chatStore.summaryItems);
const quickReplies = computed(() => chatStore.quickReplies);
const selectedEngine = computed(() => chatStore.selectedEngine);
const availableEngines = computed(() => chatStore.availableEngines);
const inputPlaceholder = computed(() => chatStore.inputPlaceholder);
const inputType = computed(() => chatStore.inputType);

const cardStyle = computed(() => {
  if ($q.screen.lt.md) {
    return { width: '100%', height: '100%' };
  }
  return { 
    width: '450px', 
    height: '700px',
    maxHeight: '90vh'
  };
});

watch(dialogOpen, (newVal) => {
  if (newVal) {
    chatStore.loadEngines();
    if (messages.value.length === 0) {
      addBotMessage('안녕하세요! 무엇을 도와드릴까요?\n예) "강남점 토익 예약하고 싶어요"');
    }
  }
});

watch(messages, () => {
  nextTick(() => {
    scrollToBottom();
  });
}, { deep: true });

const scrollToBottom = () => {
  if (chatContainer.value) {
    const container = chatContainer.value.$el || chatContainer.value;
    container.scrollTop = container.scrollHeight;
  }
};

const addBotMessage = (text, meta = '') => {
  chatStore.addMessage({
    role: 'bot',
    text,
    meta,
    ts: Date.now()
  });
};

const sendMessage = async () => {
  const text = userInput.value.trim();
  if (!text) return;

  chatStore.addMessage({
    role: 'user',
    text,
    ts: Date.now()
  });

  userInput.value = '';
  isTyping.value = true;

  try {
    const response = await chatStore.sendMessage(text);
    isTyping.value = false;

    if (response.error) {
      addBotMessage(`에러: ${response.error}`, response.hint || '');
      return;
    }

    const msgs = response.messages?.length 
      ? response.messages 
      : [response.ui?.prompt].filter(Boolean);
    
    const meta = [response.engine, response.intent, response.state]
      .filter(Boolean)
      .join(' · ');

    msgs.forEach(m => addBotMessage(m, meta));

  } catch (error) {
    isTyping.value = false;
    addBotMessage(`에러: ${error.message || error}`);
  }
};

const sendQuickReply = (reply) => {
  userInput.value = reply;
  sendMessage();
};

const selectEngine = (engineId) => {
  chatStore.setEngine(engineId);
  $q.notify({
    message: `엔진 변경: ${engineId}`,
    color: 'primary',
    position: 'top',
    timeout: 1500
  });
};

const startNewSession = async () => {
  $q.dialog({
    title: '새 대화 시작',
    message: '현재 대화 내용이 초기화됩니다. 계속하시겠습니까?',
    cancel: true,
    persistent: false
  }).onOk(() => {
    chatStore.resetSession();
    addBotMessage('새 세션을 시작했어요. 예) "강남점 토익 예약하고 싶어요"');
  });
};
</script>

<style scoped>
.chatbot-card {
  border-radius: 16px;
  overflow: hidden;
}

.typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #94a3b8;
  animation: typing 1.4s infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.7;
  }
  30% {
    transform: translateY(-10px);
    opacity: 1;
  }
}

:deep(.q-field__control) {
  font-family: 'Pretendard Variable', 'Pretendard', sans-serif;
}

@media (max-width: 768px) {
  .chatbot-card {
    border-radius: 0;
  }
}
</style>
