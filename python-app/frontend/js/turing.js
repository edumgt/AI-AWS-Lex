// 튜링 테스트 게임 (Node 버전 TuringGame.vue + utils/turingBot.js 포팅)
// 백엔드 호출 없이 전부 클라이언트에서 시뮬레이션한다.

const AI_TEMPLATES = [
  (kw) => `${kw}에 대해 말씀해주셔서 감사합니다. 조금 더 구체적으로 설명해 주시겠어요?`,
  (kw) => `흥미로운 주제네요. "${kw}"와 관련해서 어떤 부분이 궁금하신가요?`,
  (kw) => `말씀하신 내용을 정리하면 핵심은 "${kw}"인 것 같습니다. 제가 정확히 이해했을까요?`,
  (kw) => `"${kw}"에 대한 질문이시군요. 몇 가지 관점에서 답변드릴 수 있을 것 같습니다.`,
  (kw) => `네, "${kw}" 관련해서 도와드리겠습니다. 원하시는 답변의 방향을 알려주시겠어요?`,
];

const AI_GENERIC = [
  '죄송하지만 그 부분은 제가 확실히 답변드리기 어렵습니다.',
  '네, 알겠습니다. 다른 질문이 있으신가요?',
  '좋은 질문입니다. 다양한 관점에서 생각해볼 수 있을 것 같아요.',
  '요청하신 내용을 처리했습니다. 추가로 필요하신 사항이 있으신가요?',
  '말씀하신 부분을 다시 한번 확인해 보겠습니다.',
];

const HUMAN_GREETINGS = ['어 안녕하세요! 반가워요 ㅎㅎ', 'ㅎㅇㅎㅇ 뭐 물어보고 싶은거 있어요?', '안뇽~ 오늘 날씨 좋네요', '오 누구세요 ㅋㅋ 반가워요'];

const HUMAN_GENERIC = [
  '음... 그건 잘 모르겠는데 ㅋㅋ',
  '어 진짜? 신기하네',
  '아 그거 나도 궁금했었어',
  '음 잠깐만, 생각 좀 해볼게',
  '그건 좀 애매한 거 같은데?',
  '오 좋은 질문이넹 ㅎㅎ 근데 나 지금 딴생각하고 있었음',
  '어제 잠을 못자서 그런가 머리가 잘 안 돌아가네',
  '그냥 대충 살아... 너는?',
  'ㅋㅋㅋㅋ 왜 그런걸 물어봐',
  '몰라 그냥 느낌적인 느낌?',
  '아 배고프다... 밥 먹었어요?',
  '음 딱히 할 말이 없네 ㅎㅎ;;',
  '어허 그거 좋은 지적인데',
];

function extractKeyword(text) {
  const tokens = text.replace(/[?!.,~]/g, ' ').split(/\s+/).filter(Boolean);
  if (!tokens.length) return '그것';
  return tokens.reduce((a, b) => (b.length > a.length ? b : a), tokens[0]);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getAiReply(userText) {
  if (Math.random() < 0.35) return pick(AI_GENERIC);
  return pick(AI_TEMPLATES)(extractKeyword(userText));
}

function getHumanReply() {
  return pick(HUMAN_GENERIC);
}

function pickPersona() {
  return pick(HUMAN_GREETINGS);
}

const MAX_TURNS = 6;

const game = {
  state: 'greeting', // greeting | chatting | judging | revealed
  respondentType: '',
  messages: [],
  turnCount: 0,
  score: { rounds: 0, correct: 0 },
  revealCorrect: false,
};

let els = {};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render() {
  const root = els.root;
  if (game.state === 'greeting') {
    root.innerHTML = `
      <div class="tg-intro">
        <p>대화 상대는 <strong>AI</strong>이거나 <strong>사람</strong>입니다.<br>최대 ${MAX_TURNS}번 대화를 나눈 뒤 누구인지 맞혀보세요.</p>
        <button class="tg-start-btn" id="tgStart">테스트 시작하기</button>
      </div>`;
    root.querySelector('#tgStart').addEventListener('click', startRound);
    return;
  }

  const messagesHtml = game.messages
    .map((m) => `<div class="tg-msg ${m.from}"><div class="tg-bubble">${escapeHtml(m.text)}</div></div>`)
    .join('');
  const thinkingHtml = game.thinking ? `<div class="tg-msg other"><div class="tg-bubble tg-typing">···</div></div>` : '';

  let bottomHtml = '';
  if (game.state === 'chatting') {
    bottomHtml = `
      <div class="tg-input-row">
        <input class="tg-input" id="tgDraft" placeholder="메시지를 입력하세요..." />
        <button class="tg-send-btn" id="tgSend">전송</button>
        <button class="tg-judge-btn" id="tgJudgeNow" ${game.turnCount ? '' : 'disabled'}>판정하기</button>
      </div>`;
  } else if (game.state === 'judging') {
    bottomHtml = `
      <div class="tg-judge">
        <p>상대는 <strong>AI</strong>였을까요, <strong>사람</strong>이었을까요?</p>
        <div class="tg-judge-btns">
          <button class="tg-choice-btn" id="tgGuessAi">🤖 AI</button>
          <button class="tg-choice-btn" id="tgGuessHuman">🙋 사람</button>
        </div>
      </div>`;
  } else if (game.state === 'revealed') {
    const pct = game.score.rounds ? Math.round((game.score.correct / game.score.rounds) * 100) : 0;
    bottomHtml = `
      <div class="tg-reveal">
        <div class="tg-reveal-result ${game.revealCorrect ? 'correct' : 'wrong'}">${game.revealCorrect ? '정답입니다! 🎉' : '틀렸습니다 😅'}</div>
        <div class="tg-reveal-detail">실제 상대는 <strong>${game.respondentType === 'ai' ? 'AI였습니다' : '사람이었습니다'}</strong></div>
        <div class="tg-score">누적 ${game.score.rounds}회 중 ${game.score.correct}회 정답 (${pct}%)</div>
        <button class="tg-start-btn" id="tgRestart">다시 도전하기</button>
      </div>`;
  }

  root.innerHTML = `<div class="tg-messages" id="tgMessages">${messagesHtml}${thinkingHtml}</div>${bottomHtml}`;

  const msgArea = root.querySelector('#tgMessages');
  msgArea.scrollTop = msgArea.scrollHeight;

  if (game.state === 'chatting') {
    const draft = root.querySelector('#tgDraft');
    root.querySelector('#tgSend').addEventListener('click', () => send(draft.value));
    draft.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') send(draft.value);
    });
    draft.focus();
    root.querySelector('#tgJudgeNow').addEventListener('click', () => {
      game.state = 'judging';
      render();
    });
  } else if (game.state === 'judging') {
    root.querySelector('#tgGuessAi').addEventListener('click', () => submitGuess('ai'));
    root.querySelector('#tgGuessHuman').addEventListener('click', () => submitGuess('human'));
  } else if (game.state === 'revealed') {
    root.querySelector('#tgRestart').addEventListener('click', startRound);
  }
}

function addMessage(from, text) {
  game.messages.push({ from, text });
}

function startRound() {
  game.respondentType = Math.random() < 0.5 ? 'ai' : 'human';
  game.messages = [];
  game.turnCount = 0;
  game.state = 'chatting';
  game.thinking = false;

  const greeting = game.respondentType === 'human' ? pickPersona() : '안녕하세요, 무엇을 도와드릴까요?';
  addMessage('other', greeting);
  render();
}

async function send(rawText) {
  const text = (rawText || '').trim();
  if (!text || game.state !== 'chatting') return;

  addMessage('user', text);
  game.turnCount += 1;
  game.thinking = true;
  render();

  const delay = 500 + Math.random() * 900;
  await new Promise((resolve) => setTimeout(resolve, delay));

  game.thinking = false;
  const reply = game.respondentType === 'ai' ? getAiReply(text) : getHumanReply();
  addMessage('other', reply);

  if (game.turnCount >= MAX_TURNS) game.state = 'judging';
  render();
}

function submitGuess(choice) {
  game.revealCorrect = choice === game.respondentType;
  game.score.rounds += 1;
  if (game.revealCorrect) game.score.correct += 1;
  game.state = 'revealed';
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  els.root = document.getElementById('turingGame');
  if (els.root) render();
});
