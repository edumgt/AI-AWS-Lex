<template>
  <q-btn
    round
    color="primary"
    size="lg"
    icon="chat"
    class="chatbot-fab"
    @click="handleClick"
  >
    <q-tooltip
      anchor="center left"
      self="center right"
      :offset="[10, 10]"
      class="bg-gray-800 text-white"
    >
      상담 챗봇
    </q-tooltip>

    <!-- Notification Badge -->
    <q-badge 
      v-if="hasUnread"
      color="red" 
      floating
      rounded
    >
      {{ unreadCount }}
    </q-badge>

    <!-- Pulse Animation -->
    <div class="pulse-ring"></div>
  </q-btn>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['open-chat']);

const hasUnread = ref(false);
const unreadCount = ref(0);

const handleClick = () => {
  hasUnread.value = false;
  unreadCount.value = 0;
  emit('open-chat');
};
</script>

<style scoped>
.chatbot-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
}

.chatbot-fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
}

.pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border: 3px solid rgba(59, 130, 246, 0.8);
  border-radius: 50%;
  animation: pulse 2s infinite;
  pointer-events: none;
}

@keyframes pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.3);
    opacity: 0.5;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
}

@media (max-width: 768px) {
  .chatbot-fab {
    bottom: 16px;
    right: 16px;
  }
}
</style>
