const { LexModelsV2Client, ListSlotTypesCommand, DescribeSlotTypeCommand } = require("@aws-sdk/client-lex-models-v2");

function parseCsv(v) {
  if (!v) return [];
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

function uniq(arr) {
  return [...new Set(arr)];
}

const CACHE = new Map(); // key -> {ts, values}
const TTL_MS = 5 * 60 * 1000;

function getModelsClient(region) {
  return new LexModelsV2Client({ region });
}

async function fetchSlotTypeValuesFromModels({ region, botId, botVersion, localeId, slotTypeName }) {
  const client = getModelsClient(region);

  const list = await client.send(new ListSlotTypesCommand({
    botId,
    botVersion,
    localeId,
    maxResults: 100
  }));

  const found = (list.slotTypeSummaries || []).find(s => s.slotTypeName === slotTypeName);
  if (!found?.slotTypeId) return [];

  const desc = await client.send(new DescribeSlotTypeCommand({
    botId,
    botVersion,
    localeId,
    slotTypeId: found.slotTypeId
  }));

  const values = (desc.slotTypeValues || [])
    .map(v => v?.sampleValue?.value)
    .filter(Boolean);

  return uniq(values);
}

async function getSuggestions({ slot, env, region }) {
  // 1) .env 기반 우선
  if (slot === "Branch") {
    const fromEnv = parseCsv(env.BRANCH_VALUES);
    if (fromEnv.length) return fromEnv;
  }
  if (slot === "CourseName") {
    const fromEnv = parseCsv(env.COURSE_VALUES);
    if (fromEnv.length) return fromEnv;
  }

  // 2) Lex Models API에서 읽기 (권한 필요)
  const botId = env.LEX_BOT_ID;
  const localeId = env.LEX_LOCALE_ID || "ko_KR";
  const botVersion = env.LEX_MODEL_BOT_VERSION || "DRAFT";
  if (!botId) return [];

  const slotTypeName = slot === "Branch" ? "BranchType"
                    : slot === "CourseName" ? "CourseType"
                    : null;
  if (!slotTypeName) return [];

  const cacheKey = `${region}:${botId}:${botVersion}:${localeId}:${slotTypeName}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (cached && (now - cached.ts) < TTL_MS) return cached.values;

  try {
    const values = await fetchSlotTypeValuesFromModels({ region, botId, botVersion, localeId, slotTypeName });
    CACHE.set(cacheKey, { ts: now, values });
    return values;
  } catch (e) {
    // 권한 부족/미지원일 수 있음
    return [];
  }
}

module.exports = { getSuggestions };
