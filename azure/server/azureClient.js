/**
 * Azure Conversational Language Understanding (CLU) 클라이언트
 *
 * Azure Language Studio에서 CLU 프로젝트를 만들고, 학습(Train) → 배포(Deploy)한 뒤
 * 아래 환경변수를 설정하면 AWS Lex V2의 RecognizeText와 동일한 역할을 합니다.
 *
 * 필수 환경변수:
 *   AZURE_LANGUAGE_ENDPOINT  - Language 리소스 엔드포인트
 *                              예) https://<your-resource>.cognitiveservices.azure.com
 *   AZURE_LANGUAGE_KEY       - Language 리소스 키 (Key1 또는 Key2)
 *   AZURE_CLU_PROJECT        - CLU 프로젝트 이름 (Language Studio에서 생성)
 *   AZURE_CLU_DEPLOYMENT     - 배포 이름 (예: production)
 */

const { ConversationAnalysisClient } = require("@azure/ai-language-conversations");
const { AzureKeyCredential } = require("@azure/core-auth");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 필요합니다.`);
  return v;
}

let _client = null;

function getClient() {
  if (!_client) {
    _client = new ConversationAnalysisClient(
      requireEnv("AZURE_LANGUAGE_ENDPOINT"),
      new AzureKeyCredential(requireEnv("AZURE_LANGUAGE_KEY"))
    );
  }
  return _client;
}

/**
 * CLU로 텍스트를 분석하고 intent/entities를 반환합니다.
 * @param {string} text - 사용자 입력 텍스트
 * @param {string} sessionId - 세션 ID (참고용, CLU는 자체 세션 없음)
 * @returns {{ intent: string, score: number, entities: Array, raw: object }}
 */
async function analyzeText({ text, sessionId }) {
  const client = getClient();

  const projectName = requireEnv("AZURE_CLU_PROJECT");
  const deploymentName = requireEnv("AZURE_CLU_DEPLOYMENT");

  const result = await client.analyzeConversation({
    kind: "Conversation",
    analysisInput: {
      conversationItem: {
        id: sessionId || "user-1",
        participantId: sessionId || "user-1",
        text
      }
    },
    parameters: {
      projectName,
      deploymentName,
      verbose: true
    }
  });

  const prediction = result.result?.prediction;
  const topIntent = prediction?.topIntent || "None";
  const topScore = prediction?.intents?.find(i => i.category === topIntent)?.confidenceScore || 0;

  // entities → slot 형태로 정규화
  const entities = (prediction?.entities || []).map(e => ({
    name: e.category,
    value: e.text,
    score: e.confidenceScore
  }));

  return {
    intent: topIntent,
    score: topScore,
    entities,
    raw: result
  };
}

module.exports = { analyzeText };
