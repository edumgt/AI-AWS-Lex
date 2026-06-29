<template>
  <div class="bmc">

    <!-- Header -->
    <div class="bmc-hdr">
      <q-icon name="place" size="15px" color="primary" />
      <span>KF증권 지점 안내</span>
      <span class="bmc-cnt">{{ branches.length }}개 지점</span>
    </div>

    <!-- Seoul SVG Map -->
    <div class="bmc-map">
      <svg viewBox="0 0 260 200" class="bmc-svg" xmlns="http://www.w3.org/2000/svg">

        <!-- Background -->
        <rect width="260" height="200" fill="#f0f7ff"/>

        <!-- Grid lines -->
        <line v-for="y in [50,100,150]" :key="'h'+y"
              x1="0" :y1="y" x2="260" :y2="y"
              stroke="#dde9f8" stroke-width="0.6"/>
        <line v-for="x in [65,130,195]" :key="'v'+x"
              :x1="x" y1="0" :x2="x" y2="200"
              stroke="#dde9f8" stroke-width="0.6"/>

        <!-- Han River (shadow) -->
        <path d="M 0 78 C 35 74 52 77 65 75 C 90 72 116 81 138 85 C 165 88 200 83 260 84"
              stroke="#bfdbfe" stroke-width="13" fill="none" stroke-linecap="round"/>
        <!-- Han River (body) -->
        <path d="M 0 78 C 35 74 52 77 65 75 C 90 72 116 81 138 85 C 165 88 200 83 260 84"
              stroke="#7dd3fc" stroke-width="8" fill="none" stroke-linecap="round"/>
        <!-- Han River (highlight) -->
        <path d="M 0 76 C 35 72 52 75 65 73 C 90 70 116 79 138 83 C 165 86 200 81 260 82"
              stroke="rgba(255,255,255,0.5)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <!-- Han River label -->
        <text x="12" y="91" fill="#60a5fa" font-size="8" font-weight="600"
              font-family="sans-serif">한강</text>

        <!-- Yeouido island (on river) -->
        <ellipse cx="65" cy="75" rx="8" ry="3.5" fill="#bbf7d0"
                 opacity="0.7" transform="rotate(-8,65,75)"/>

        <!-- District labels (light background reference) -->
        <text x="88" y="18" fill="#94a3b8" font-size="7" font-family="sans-serif">종로·도심</text>
        <text x="146" y="50" fill="#94a3b8" font-size="7" font-family="sans-serif">강남</text>
        <text x="38" y="56" fill="#94a3b8" font-size="7" font-family="sans-serif">영등포</text>
        <text x="210" y="196" fill="#94a3b8" font-size="6" font-family="sans-serif">경기·분당</text>

        <!-- Separation line (Seoul/Gyeonggi border hint) -->
        <line x1="185" y1="148" x2="260" y2="155"
              stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,3"/>

        <!-- Branch markers -->
        <g v-for="b in branchesWithPos" :key="b.id"
           @click.stop="toggleBranch(b)"
           style="cursor:pointer">

          <!-- Active glow ring -->
          <circle v-if="selected?.id === b.id"
                  :cx="b.sx" :cy="b.sy" r="13"
                  fill="#1652f0" opacity="0.18"/>

          <!-- Pin body -->
          <circle :cx="b.sx" :cy="b.sy" r="7.5"
                  :fill="selected?.id === b.id ? '#1652f0' : '#2563eb'"
                  stroke="white" stroke-width="2.5"/>
          <!-- Center dot -->
          <circle :cx="b.sx" :cy="b.sy" r="2.2" fill="white"/>

          <!-- Label pill background -->
          <rect :x="b.lx" :y="b.ly" :width="b.lw" height="15" rx="7.5"
                :fill="selected?.id === b.id ? '#1652f0' : '#1d4ed8'"
                opacity="0.93"/>

          <!-- Label text -->
          <text :x="b.lx + b.lw * 0.5" :y="b.ly + 10.5"
                text-anchor="middle" fill="white"
                font-size="7.5" font-weight="600"
                font-family="'Pretendard Variable', Pretendard, sans-serif">{{ b.sn }}</text>
        </g>

      </svg>
    </div>

    <!-- Selected branch detail -->
    <Transition name="bmc-slide">
      <div v-if="selected" class="bmc-detail">
        <div class="bmc-d-row">
          <div class="bmc-d-name">{{ selected.label }}</div>
          <q-icon name="apartment" size="15px" color="primary" />
        </div>
        <div class="bmc-d-desc">{{ selected.description }}</div>
        <div class="bmc-d-addr">
          <q-icon name="place" size="12px" color="grey-6" class="q-mr-xs" />{{ selected.address }}
        </div>
        <button class="bmc-book-btn" @click="$emit('book', selected.name)">
          <q-icon name="event_available" size="14px" class="q-mr-xs" />
          {{ selected.name }} 상담 예약하기
        </button>
      </div>
    </Transition>

    <!-- Branch chip list -->
    <div class="bmc-chips">
      <button v-for="b in branchesWithPos" :key="b.id"
              class="bmc-chip"
              :class="{ active: selected?.id === b.id }"
              @click="toggleBranch(b)">
        {{ b.sn }}
      </button>
    </div>

    <div v-if="!selected" class="bmc-hint">
      지도 핀이나 아래 버튼으로 지점을 선택하세요
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import campuses from '../../shared/campusLocations.json';

defineEmits(['book']);

const selected = ref(null);

// SVG coordinates (viewBox 0 0 260 200)
// bounds: lng 126.85–127.15 (Δ0.30), lat 37.38–37.62 (Δ0.24)
const SVG = {
  yeouido:   { sx: 65,  sy: 76,  lx: 72,  ly: 58,  lw: 42 },
  jongno:    { sx: 112, sy: 38,  lx: 76,  ly: 43,  lw: 30 },
  apgujeong: { sx: 155, sy: 71,  lx: 156, ly: 52,  lw: 52 },
  gangnam:   { sx: 154, sy: 96,  lx: 156, ly: 101, lw: 50 },
  pangyo:    { sx: 226, sy: 168, lx: 184, ly: 151, lw: 30 },
};

const branchesWithPos = computed(() =>
  campuses.map(b => ({
    ...b,
    ...(SVG[b.id] || { sx: 130, sy: 100, lx: 134, ly: 82, lw: 42 }),
    sn: b.name.replace('지점', '').replace('센터', '').trim(),
  }))
);

const branches = campuses;

const toggleBranch = (b) => {
  selected.value = selected.value?.id === b.id ? null : b;
};
</script>

<style scoped>
.bmc {
  background: white;
  border-radius: 14px 14px 2px 14px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.07);
  max-width: 300px;
  font-family: 'Pretendard Variable', Pretendard, sans-serif;
}

/* Header */
.bmc-hdr {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 12px 8px;
  font-size: 13px; font-weight: 700; color: #0a1628;
  border-bottom: 1px solid #f1f5f9;
  background: #fafbff;
}
.bmc-cnt {
  margin-left: auto; font-size: 11px;
  color: #64748b; font-weight: 500;
}

/* Map */
.bmc-map { padding: 6px 8px 0; }
.bmc-svg {
  width: 100%; display: block;
  border-radius: 8px; overflow: hidden;
}

/* Detail card */
.bmc-detail {
  margin: 8px 10px;
  background: #eef3ff;
  border-radius: 10px;
  padding: 10px 12px;
}
.bmc-d-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 4px;
}
.bmc-d-name { font-size: 13px; font-weight: 700; color: #0a1628; }
.bmc-d-desc { font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 5px; }
.bmc-d-addr {
  font-size: 11px; color: #64748b;
  display: flex; align-items: flex-start; gap: 2px;
  margin-bottom: 8px; line-height: 1.4;
}
.bmc-book-btn {
  width: 100%; display: flex; align-items: center; justify-content: center;
  background: #1652f0; color: white;
  border: none; border-radius: 8px;
  padding: 8px; font-size: 12px; font-weight: 700;
  cursor: pointer; transition: background 0.15s;
  font-family: inherit;
}
.bmc-book-btn:hover { background: #1244d1; }

/* Chips */
.bmc-chips {
  display: flex; flex-wrap: wrap; gap: 5px;
  padding: 8px 10px 8px;
}
.bmc-chip {
  font-size: 11px; font-weight: 600;
  background: #f8fafc; color: #475569;
  border: 1.5px solid #e2e8f0; border-radius: 14px;
  padding: 4px 10px; cursor: pointer;
  transition: all 0.15s; font-family: inherit;
}
.bmc-chip:hover { background: #eef3ff; border-color: #c7d7ff; color: #1652f0; }
.bmc-chip.active { background: #1652f0; color: white; border-color: #1652f0; }

/* Hint */
.bmc-hint {
  padding: 0 12px 10px;
  font-size: 11px; color: #94a3b8; text-align: center;
}

/* Transition */
.bmc-slide-enter-active, .bmc-slide-leave-active { transition: all 0.22s ease; }
.bmc-slide-enter-from, .bmc-slide-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
