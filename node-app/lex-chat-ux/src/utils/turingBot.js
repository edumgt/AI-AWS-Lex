// Lightweight, self-contained responders for the Turing Test demo.
// No backend calls — everything runs client-side so the game works offline.

const AI_TEMPLATES = [
  (kw) => `${kw}에 대해 말씀해주셔서 감사합니다. 조금 더 구체적으로 설명해 주시겠어요?`,
  (kw) => `흥미로운 주제네요. "${kw}"와 관련해서 어떤 부분이 궁금하신가요?`,
  (kw) => `말씀하신 내용을 정리하면 핵심은 "${kw}"인 것 같습니다. 제가 정확히 이해했을까요?`,
  (kw) => `"${kw}"에 대한 질문이시군요. 몇 가지 관점에서 답변드릴 수 있을 것 같습니다.`,
  (kw) => `네, "${kw}" 관련해서 도와드리겠습니다. 원하시는 답변의 방향을 알려주시겠어요?`
];

const AI_GENERIC = [
  '죄송하지만 그 부분은 제가 확실히 답변드리기 어렵습니다.',
  '네, 알겠습니다. 다른 질문이 있으신가요?',
  '좋은 질문입니다. 다양한 관점에서 생각해볼 수 있을 것 같아요.',
  '요청하신 내용을 처리했습니다. 추가로 필요하신 사항이 있으신가요?',
  '말씀하신 부분을 다시 한번 확인해 보겠습니다.'
];

const HUMAN_GREETINGS = [
  '어 안녕하세요! 반가워요 ㅎㅎ',
  'ㅎㅇㅎㅇ 뭐 물어보고 싶은거 있어요?',
  '안뇽~ 오늘 날씨 좋네요',
  '오 누구세요 ㅋㅋ 반가워요'
];

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
  '어허 그거 좋은 지적인데'
];

export const HUMAN_PERSONAS = HUMAN_GREETINGS.map((greeting, i) => ({
  id: `persona-${i}`,
  greeting
}));

function extractKeyword(text) {
  const tokens = text.replace(/[?!.,~]/g, ' ').split(/\s+/).filter(Boolean);
  if (!tokens.length) return '그것';
  return tokens.reduce((a, b) => (b.length > a.length ? b : a), tokens[0]);
}

export function getAiReply(userText) {
  if (Math.random() < 0.35) {
    return AI_GENERIC[Math.floor(Math.random() * AI_GENERIC.length)];
  }
  const keyword = extractKeyword(userText);
  const template = AI_TEMPLATES[Math.floor(Math.random() * AI_TEMPLATES.length)];
  return template(keyword);
}

export function getHumanReply() {
  return HUMAN_GENERIC[Math.floor(Math.random() * HUMAN_GENERIC.length)];
}

export function pickPersona() {
  return HUMAN_PERSONAS[Math.floor(Math.random() * HUMAN_PERSONAS.length)];
}
