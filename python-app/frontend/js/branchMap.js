// 지점 안내 SVG 카드 + 컴팩트 지점 선택 카드 렌더링
// (Node 버전 BranchMapCard.vue / CampusMapPicker.vue 포팅)

let CAMPUS_LOCATIONS = [];

async function loadCampusLocations() {
  if (CAMPUS_LOCATIONS.length) return CAMPUS_LOCATIONS;
  const res = await fetch('/data/campus_locations.json');
  CAMPUS_LOCATIONS = await res.json();
  return CAMPUS_LOCATIONS;
}

const SVG_POS = {
  yeouido: { sx: 65, sy: 76, lx: 72, ly: 58, lw: 42 },
  jongno: { sx: 112, sy: 38, lx: 76, ly: 43, lw: 30 },
  apgujeong: { sx: 155, sy: 71, lx: 156, ly: 52, lw: 52 },
  gangnam: { sx: 154, sy: 96, lx: 156, ly: 101, lw: 50 },
  pangyo: { sx: 226, sy: 168, lx: 184, ly: 151, lw: 30 },
};

function shortName(name) {
  return name.replace('지점', '').replace('센터', '').trim();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 채팅 메시지 안에 삽입되는 지도 카드. onBook(branchName) 콜백을 호출한다.
async function renderBranchMapCard(container, onBook) {
  const campuses = await loadCampusLocations();
  const withPos = campuses.map((b) => ({ ...b, ...(SVG_POS[b.id] || { sx: 130, sy: 100, lx: 134, ly: 82, lw: 42 }), sn: shortName(b.name) }));

  let selectedId = null;

  const wrap = document.createElement('div');
  wrap.className = 'bmc';
  wrap.innerHTML = `
    <div class="bmc-hdr"><span class="material-icons">place</span><span>KF증권 지점 안내</span><span class="bmc-cnt">${campuses.length}개 지점</span></div>
    <div class="bmc-map">
      <svg viewBox="0 0 260 200" class="bmc-svg" xmlns="http://www.w3.org/2000/svg">
        <rect width="260" height="200" fill="#f0f7ff"/>
        <line x1="0" y1="50" x2="260" y2="50" stroke="#dde9f8" stroke-width="0.6"/>
        <line x1="0" y1="100" x2="260" y2="100" stroke="#dde9f8" stroke-width="0.6"/>
        <line x1="0" y1="150" x2="260" y2="150" stroke="#dde9f8" stroke-width="0.6"/>
        <line x1="65" y1="0" x2="65" y2="200" stroke="#dde9f8" stroke-width="0.6"/>
        <line x1="130" y1="0" x2="130" y2="200" stroke="#dde9f8" stroke-width="0.6"/>
        <line x1="195" y1="0" x2="195" y2="200" stroke="#dde9f8" stroke-width="0.6"/>
        <path d="M 0 78 C 35 74 52 77 65 75 C 90 72 116 81 138 85 C 165 88 200 83 260 84" stroke="#bfdbfe" stroke-width="13" fill="none" stroke-linecap="round"/>
        <path d="M 0 78 C 35 74 52 77 65 75 C 90 72 116 81 138 85 C 165 88 200 83 260 84" stroke="#7dd3fc" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M 0 76 C 35 72 52 75 65 73 C 90 70 116 79 138 83 C 165 86 200 81 260 82" stroke="rgba(255,255,255,0.5)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <text x="12" y="91" fill="#60a5fa" font-size="8" font-weight="600">한강</text>
        <ellipse cx="65" cy="75" rx="8" ry="3.5" fill="#bbf7d0" opacity="0.7" transform="rotate(-8,65,75)"/>
        <text x="88" y="18" fill="#94a3b8" font-size="7">종로·도심</text>
        <text x="146" y="50" fill="#94a3b8" font-size="7">강남</text>
        <text x="38" y="56" fill="#94a3b8" font-size="7">영등포</text>
        <text x="210" y="196" fill="#94a3b8" font-size="6">경기·분당</text>
        <line x1="185" y1="148" x2="260" y2="155" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,3"/>
        <g class="bmc-pins">
          ${withPos
            .map(
              (b) => `
            <g data-id="${b.id}" style="cursor:pointer">
              <circle class="bmc-ring" cx="${b.sx}" cy="${b.sy}" r="13" fill="#1652f0" opacity="0" />
              <circle class="bmc-pin" cx="${b.sx}" cy="${b.sy}" r="7.5" fill="#2563eb" stroke="white" stroke-width="2.5"/>
              <circle cx="${b.sx}" cy="${b.sy}" r="2.2" fill="white"/>
              <rect class="bmc-label-bg" x="${b.lx}" y="${b.ly}" width="${b.lw}" height="15" rx="7.5" fill="#1d4ed8" opacity="0.93"/>
              <text x="${b.lx + b.lw * 0.5}" y="${b.ly + 10.5}" text-anchor="middle" fill="white" font-size="7.5" font-weight="600">${escapeHtml(b.sn)}</text>
            </g>`
            )
            .join('')}
        </g>
      </svg>
    </div>
    <div class="bmc-detail" style="display:none"></div>
    <div class="bmc-chips">
      ${withPos.map((b) => `<button class="bmc-chip" data-id="${b.id}">${escapeHtml(b.sn)}</button>`).join('')}
    </div>
    <div class="bmc-hint">지도 핀이나 아래 버튼으로 지점을 선택하세요</div>
  `;

  const detailEl = wrap.querySelector('.bmc-detail');
  const hintEl = wrap.querySelector('.bmc-hint');

  function select(id) {
    selectedId = selectedId === id ? null : id;
    const branch = withPos.find((b) => b.id === selectedId);

    wrap.querySelectorAll('.bmc-chip').forEach((el) => el.classList.toggle('active', el.dataset.id === selectedId));
    wrap.querySelectorAll('g[data-id]').forEach((g) => {
      const isActive = g.dataset.id === selectedId;
      g.querySelector('.bmc-ring').setAttribute('opacity', isActive ? '0.18' : '0');
      g.querySelector('.bmc-pin').setAttribute('fill', isActive ? '#1652f0' : '#2563eb');
      g.querySelector('.bmc-label-bg').setAttribute('fill', isActive ? '#1652f0' : '#1d4ed8');
    });

    if (branch) {
      hintEl.style.display = 'none';
      detailEl.style.display = 'block';
      detailEl.innerHTML = `
        <div class="bmc-d-row"><div class="bmc-d-name">${escapeHtml(branch.label)}</div><span class="material-icons" style="font-size:15px;color:#1652f0">apartment</span></div>
        <div class="bmc-d-desc">${escapeHtml(branch.description)}</div>
        <div class="bmc-d-addr"><span class="material-icons" style="font-size:12px">place</span>${escapeHtml(branch.address)}</div>
        <button class="bmc-book-btn"><span class="material-icons" style="font-size:14px">event_available</span>${escapeHtml(branch.name)} 상담 예약하기</button>
      `;
      detailEl.querySelector('.bmc-book-btn').addEventListener('click', () => onBook(branch.name));
    } else {
      hintEl.style.display = 'block';
      detailEl.style.display = 'none';
      detailEl.innerHTML = '';
    }
  }

  wrap.querySelectorAll('g[data-id]').forEach((g) => g.addEventListener('click', () => select(g.dataset.id)));
  wrap.querySelectorAll('.bmc-chip').forEach((el) => el.addEventListener('click', () => select(el.dataset.id)));

  container.appendChild(wrap);
}

// 슬롯 채우기(Branch) 중 채팅창 하단에 표시되는 컴팩트 선택 카드
async function renderCampusPicker(container, onSelect) {
  const campuses = await loadCampusLocations();
  const wrap = document.createElement('div');
  wrap.className = 'campus-picker compact';
  wrap.innerHTML = `<div class="campus-cards">
    ${campuses
      .map(
        (c) => `
      <button type="button" class="campus-card" data-name="${escapeHtml(c.name)}">
        <strong>${escapeHtml(c.label)}</strong>
        <span class="card-foot">${escapeHtml(c.address)}</span>
      </button>`
      )
      .join('')}
  </div>`;
  wrap.querySelectorAll('.campus-card').forEach((btn) => btn.addEventListener('click', () => onSelect(btn.dataset.name)));
  container.appendChild(wrap);
}

window.BranchMap = { renderBranchMapCard, renderCampusPicker, loadCampusLocations };
