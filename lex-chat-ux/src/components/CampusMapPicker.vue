<template>
  <div class="campus-picker" :class="{ compact }">
    <div class="picker-copy">
      <div class="text-subtitle2 text-weight-bold text-grey-9">지도로 캠퍼스를 선택하세요</div>
      <div class="text-caption text-grey-7">핀을 누르거나 아래 카드에서 바로 선택할 수 있어요.</div>
    </div>

    <div class="campus-map">
      <div class="map-backdrop"></div>
      <div
        v-for="campus in campuses"
        :key="campus.id"
        class="map-pin"
        :class="{ active: campus.name === selectedBranch }"
        :style="{ left: `${campus.x}%`, top: `${campus.y}%` }"
      >
        <button class="pin-button" type="button" @click="$emit('select', campus.name)">
          <span class="pin-dot"></span>
          <span class="pin-label">{{ campus.name }}</span>
        </button>
      </div>
    </div>

    <div class="campus-cards">
      <button
        v-for="campus in campuses"
        :key="campus.id"
        type="button"
        class="campus-card"
        :class="{ active: campus.name === selectedBranch }"
        @click="$emit('select', campus.name)"
      >
        <div class="card-top">
          <strong>{{ campus.label }}</strong>
          <span>{{ campus.lat.toFixed(5) }}, {{ campus.lng.toFixed(5) }}</span>
        </div>
        <div class="card-body">{{ campus.description }}</div>
        <div class="card-foot">{{ campus.address }}</div>
      </button>
    </div>
  </div>
</template>

<script setup>
import campuses from '../../shared/campusLocations.json';

defineProps({
  selectedBranch: {
    type: String,
    default: ''
  },
  compact: {
    type: Boolean,
    default: false
  }
});

defineEmits(['select']);
</script>

<style scoped>
.campus-picker {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.picker-copy {
  display: grid;
  gap: 4px;
}

.campus-map {
  position: relative;
  min-height: 210px;
  width: 100%;
  border-radius: 20px;
  overflow: hidden;
  background:
    radial-gradient(circle at 25% 20%, rgba(59, 130, 246, 0.22), transparent 28%),
    radial-gradient(circle at 70% 35%, rgba(14, 165, 233, 0.16), transparent 26%),
    linear-gradient(160deg, #f7fbff 0%, #d7eefc 50%, #eff8ff 100%);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.map-backdrop {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(37, 99, 235, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37, 99, 235, 0.08) 1px, transparent 1px);
  background-size: 34px 34px;
}

.map-pin {
  position: absolute;
  transform: translate(-50%, -50%);
  max-width: calc(100% - 16px);
}

.pin-button {
  border: 0;
  background: transparent;
  cursor: pointer;
  display: grid;
  justify-items: center;
  gap: 6px;
  max-width: 100%;
}

.pin-dot {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #0f766e;
  border: 4px solid #ffffff;
  box-shadow: 0 10px 18px rgba(15, 118, 110, 0.26);
}

.pin-label {
  background: rgba(15, 23, 42, 0.78);
  color: #fff;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-pin.active .pin-dot {
  background: #2563eb;
  box-shadow: 0 12px 22px rgba(37, 99, 235, 0.3);
}

.campus-cards {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.campus-card {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 16px;
  padding: 12px;
  background: #fff;
  display: grid;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.campus-card:hover,
.campus-card.active {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 12px 30px rgba(37, 99, 235, 0.12);
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #475569;
}

.card-top span {
  text-align: right;
  word-break: break-all;
}

.card-body {
  font-size: 13px;
  color: #0f172a;
}

.card-foot {
  font-size: 12px;
  color: #64748b;
}

.campus-picker.compact .campus-map {
  min-height: 170px;
}

.campus-picker.compact .campus-cards {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.campus-picker.compact .campus-card {
  padding: 10px;
}

.campus-picker.compact .card-top {
  display: grid;
}

.campus-picker.compact .card-top span {
  text-align: left;
}

@media (max-width: 640px) {
  .campus-picker.compact .campus-cards {
    grid-template-columns: 1fr;
  }
}
</style>
