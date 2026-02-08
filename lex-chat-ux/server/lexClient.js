const { LexRuntimeV2Client, RecognizeTextCommand } = require("@aws-sdk/client-lex-runtime-v2");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 필요합니다.`);
  return v;
}

function getClient() {
  const region = requireEnv("AWS_REGION");
  return new LexRuntimeV2Client({ region });
}

async function recognizeText({ text, sessionId }) {
  const client = getClient();
  const cmd = new RecognizeTextCommand({
    botId: requireEnv("LEX_BOT_ID"),
    botAliasId: requireEnv("LEX_BOT_ALIAS_ID"),
    localeId: process.env.LEX_LOCALE_ID || "ko_KR",
    sessionId,
    text
  });

  return client.send(cmd);
}

module.exports = { recognizeText };
