/**
 * Amazon Lex V2 자동 생성 스크립트 (Node.js / AWS SDK v3) - 금융투자/증권사 챗봇
 *
 * 도메인: 금융투자사/증권회사 투자상담 챗봇
 * 인텐트: BookConsultation / CheckConsultation / CancelConsultation / ProductInfo / Help
 *
 * 실행:
 *   cd infra
 *   cp config.example.env config.env
 *   node lex-bootstrap.js
 *
 * 옵션(env):
 *   BOT_ID=...                       # 특정 Bot 재사용
 *   REUSE_EXISTING_BOT=true|false    # 동일 이름 Bot 재사용 (default true)
 *   CREATE_NEW_VERSION=true|false    # 새 버전 매번 생성 (default true)
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  PutRolePolicyCommand
} = require("@aws-sdk/client-iam");

const {
  LexModelsV2Client,

  // Bot / Locale
  CreateBotCommand,
  DescribeBotCommand,
  ListBotsCommand,

  CreateBotLocaleCommand,
  DescribeBotLocaleCommand,

  // Slot types / intents / slots
  ListSlotTypesCommand,
  CreateSlotTypeCommand,
  UpdateSlotTypeCommand,

  ListIntentsCommand,
  CreateIntentCommand,
  UpdateIntentCommand,

  ListSlotsCommand,
  CreateSlotCommand,
  UpdateSlotCommand,

  // Build / version / alias
  BuildBotLocaleCommand,
  CreateBotVersionCommand,
  ListBotVersionsCommand,

  ListBotAliasesCommand,
  CreateBotAliasCommand,
  UpdateBotAliasCommand,
  DescribeBotAliasCommand,

  // built-ins
  ListBuiltInSlotTypesCommand
} = require("@aws-sdk/client-lex-models-v2");

function req(name, fallback = null) {
  const v = process.env[name] ?? fallback;
  if (v === null || v === undefined || v === "") throw new Error(`${name} is required`);
  return v;
}
function optBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === null || v === "") return fallback;
  return String(v).toLowerCase() === "true";
}
function parseCsv(csv) {
  return (csv || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}
function slotTypeValues(values) {
  return values.map(v => ({ sampleValue: { value: v } }));
}
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isNotFound(e) {
  const n = e?.name || "";
  const code = e?.$metadata?.httpStatusCode;
  return n === "ResourceNotFoundException" || code === 404;
}
function isConflictOrPrecondition(e) {
  const n = e?.name || "";
  const code = e?.$metadata?.httpStatusCode;
  return n === "PreconditionFailedException" || n === "ConflictException" || code === 409 || code === 412;
}
function assertId(label, v) {
  if (!v || !/^[0-9A-Za-z]{1,10}$/.test(v)) {
    throw new Error(`ERROR: ${label} 값이 비정상입니다: '${v}'`);
  }
}

async function waitBotAvailable(client, botId) {
  console.log(`  - wait bot Available: botId=${botId}`);
  while (true) {
    const res = await client.send(new DescribeBotCommand({ botId }));
    const status = res.botStatus;
    console.log(`    * botStatus=${status}`);
    if (status === "Available") return;
    if (status === "Failed") throw new Error("Bot status Failed");
    await sleep(5000);
  }
}

async function waitAliasAvailable(client, botId, botAliasId) {
  console.log(`  - wait alias Available: botAliasId=${botAliasId}`);
  while (true) {
    const res = await client.send(new DescribeBotAliasCommand({ botId, botAliasId }));
    const status = res.botAliasStatus;
    console.log(`    * botAliasStatus=${status}`);
    if (status === "Available") return;
    if (status === "Failed") throw new Error("Alias status Failed");
    await sleep(5000);
  }
}

async function waitLocaleBuilt(client, { botId, localeId }) {
  while (true) {
    const res = await client.send(new DescribeBotLocaleCommand({ botId, botVersion: "DRAFT", localeId }));
    const status = res.botLocaleStatus;
    console.log(`  - locale status: ${status}`);
    if (status === "Built") return;
    if (status === "Failed") {
      console.error(res);
      throw new Error("Locale build failed (see above).");
    }
    await sleep(10000);
  }
}

async function ensureLexRole(iam, { roleName, lambdaArn }) {
  try {
    const got = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    return got.Role.Arn;
  } catch (e) {
    // create
  }

  const trust = {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Service: "lexv2.amazonaws.com" },
      Action: "sts:AssumeRole"
    }]
  };

  const create = await iam.send(new CreateRoleCommand({
    RoleName: roleName,
    AssumeRolePolicyDocument: JSON.stringify(trust)
  }));

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "InvokeLambdaForFulfillment",
        Effect: "Allow",
        Action: ["lambda:InvokeFunction"],
        Resource: [lambdaArn || "*"]
      },
      {
        Sid: "CloudWatchLogsBasic",
        Effect: "Allow",
        Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: "*"
      }
    ]
  };

  await iam.send(new PutRolePolicyCommand({
    RoleName: roleName,
    PolicyName: "LexLabInlinePolicy",
    PolicyDocument: JSON.stringify(policy)
  }));

  return create.Role.Arn;
}

async function listAll(client, CommandCtor, baseInput, itemsPath, tokenKey = "nextToken", maxKey = "maxResults") {
  // Generic pagination helper for SDK v3
  let token = undefined;
  const all = [];
  while (true) {
    const input = { ...baseInput, [maxKey]: 50 };
    if (token) input[tokenKey] = token;
    const res = await client.send(new CommandCtor(input));
    const items = res[itemsPath] || [];
    all.push(...items);
    token = res[tokenKey];
    if (!token) break;
  }
  return all;
}

async function findLatestBotIdByName(lex, botName) {
  // list-bots is paginated
  const all = await listAll(lex, ListBotsCommand, {}, "botSummaries");
  const filtered = all.filter(b => b.botName === botName);
  if (!filtered.length) return null;
  filtered.sort((a, b) => new Date(a.lastUpdatedDateTime) - new Date(b.lastUpdatedDateTime));
  return filtered[filtered.length - 1].botId || null;
}

async function ensureBot(lex, { botName, botDesc, roleArn, idleTtl, reuseExistingBot, botIdEnv }) {
  if (botIdEnv) {
    console.log(`  - BOT_ID env 재사용: ${botIdEnv}`);
    await waitBotAvailable(lex, botIdEnv);
    return botIdEnv;
  }

  if (reuseExistingBot) {
    const existing = await findLatestBotIdByName(lex, botName);
    if (existing) {
      console.log(`  - 기존 Bot 재사용: ${existing}`);
      await waitBotAvailable(lex, existing);
      return existing;
    }
  }

  try {
    const bot = await lex.send(new CreateBotCommand({
      botName,
      description: botDesc,
      roleArn,
      dataPrivacy: { childDirected: false },
      idleSessionTTLInSeconds: idleTtl
    }));
    const botId = bot.botId;
    console.log(`  - botId=${botId}`);
    await waitBotAvailable(lex, botId);
    return botId;
  } catch (e) {
    // If created elsewhere between list and create
    if (isConflictOrPrecondition(e) && reuseExistingBot) {
      const existing = await findLatestBotIdByName(lex, botName);
      if (existing) {
        console.log(`  - CreateBot 충돌 → 기존 Bot 재사용: ${existing}`);
        await waitBotAvailable(lex, existing);
        return existing;
      }
    }
    throw e;
  }
}

async function ensureLocale(lex, { botId, localeId, nluConf }) {
  try {
    await lex.send(new DescribeBotLocaleCommand({ botId, botVersion: "DRAFT", localeId }));
    console.log("  - locale 이미 존재");
    return;
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  await lex.send(new CreateBotLocaleCommand({
    botId,
    botVersion: "DRAFT",
    localeId,
    nluIntentConfidenceThreshold: nluConf
  }));
  console.log("  - locale 생성 요청");
  // Creating 상태를 피하려고 간단히 poll
  while (true) {
    const res = await lex.send(new DescribeBotLocaleCommand({ botId, botVersion: "DRAFT", localeId }));
    const st = res.botLocaleStatus;
    console.log(`  - locale status: ${st}`);
    if (st !== "Creating") break;
    if (st === "Failed") throw new Error("Locale create failed");
    await sleep(5000);
  }
}

async function findSlotTypeIdByName(lex, { botId, localeId, slotTypeName }) {
  const all = await listAll(lex, ListSlotTypesCommand, { botId, botVersion: "DRAFT", localeId }, "slotTypeSummaries", "nextToken", "maxResults");
  const hit = all.find(s => s.slotTypeName === slotTypeName);
  return hit ? hit.slotTypeId : null;
}

async function upsertSlotType(lex, { botId, localeId, slotTypeName, description, values }) {
  const existingId = await findSlotTypeIdByName(lex, { botId, localeId, slotTypeName });
  if (!existingId) {
    const created = await lex.send(new CreateSlotTypeCommand({
      botId, botVersion: "DRAFT", localeId,
      slotTypeName,
      description,
      slotTypeValues: slotTypeValues(values),
      valueSelectionSetting: { resolutionStrategy: "TopResolution" } // ✅ SDK enum
    }));
    console.log(`  - ${slotTypeName} created: ${created.slotTypeId}`);
    return created.slotTypeId;
  }

  await lex.send(new UpdateSlotTypeCommand({
    botId, botVersion: "DRAFT", localeId,
    slotTypeId: existingId,
    slotTypeName,
    description,
    slotTypeValues: slotTypeValues(values),
    valueSelectionSetting: { resolutionStrategy: "TopResolution" }
  }));
  console.log(`  - ${slotTypeName} updated: ${existingId}`);
  return existingId;
}

async function findIntentIdByName(lex, { botId, localeId, intentName }) {
  const all = await listAll(lex, ListIntentsCommand, { botId, botVersion: "DRAFT", localeId }, "intentSummaries", "nextToken", "maxResults");
  const hit = all.find(i => i.intentName === intentName);
  return hit ? hit.intentId : null;
}

async function upsertIntentBase(lex, { botId, localeId, intentName, description, baseUtterances }) {
  const existingId = await findIntentIdByName(lex, { botId, localeId, intentName });
  if (!existingId) {
    const created = await lex.send(new CreateIntentCommand({
      botId, botVersion: "DRAFT", localeId,
      intentName,
      description,
      sampleUtterances: baseUtterances.map(u => ({ utterance: u }))
    }));
    console.log(`  - intent created(BASE): ${intentName} (${created.intentId})`);
    return created.intentId;
  }
  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: existingId,
    intentName,
    description,
    sampleUtterances: baseUtterances.map(u => ({ utterance: u }))
  }));
  console.log(`  - intent updated(BASE): ${intentName} (${existingId})`);
  return existingId;
}

async function findSlotIdByName(lex, { botId, localeId, intentId, slotName }) {
  const all = await listAll(lex, ListSlotsCommand, { botId, botVersion: "DRAFT", localeId, intentId }, "slotSummaries", "nextToken", "maxResults");
  const hit = all.find(s => s.slotName === slotName);
  return hit ? hit.slotId : null;
}

async function upsertSlot(lex, { botId, localeId, intentId, slotName, slotTypeId, required, prompt }) {
  const constraint = required ? "Required" : "Optional";

  const valueElicitationSetting = {
    slotConstraint: constraint,
    promptSpecification: {
      maxRetries: 2,
      messageGroups: [{ message: { plainTextMessage: { value: prompt } } }]
    }
  };

  const existingId = await findSlotIdByName(lex, { botId, localeId, intentId, slotName });
  if (!existingId) {
    const created = await lex.send(new CreateSlotCommand({
      botId, botVersion: "DRAFT", localeId,
      intentId,
      slotName,
      slotTypeId,
      slotConstraint: constraint,
      valueElicitationSetting
    }));
    console.log(`    • slot created: ${slotName} (${created.slotId})`);
    return created.slotId;
  }

  await lex.send(new UpdateSlotCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId,
    slotId: existingId,
    slotName,
    slotTypeId,
    slotConstraint: constraint,
    valueElicitationSetting
  }));
  console.log(`    • slot updated: ${slotName} (${existingId})`);
  return existingId;
}

async function listBuiltInSlotSignatures(lex, localeId) {
  // list-built-in-slot-types maxResults <= 20, paginate
  const sig = new Set();
  let nextToken = undefined;
  while (true) {
    const res = await lex.send(new ListBuiltInSlotTypesCommand({
      localeId,
      maxResults: 20,
      ...(nextToken ? { nextToken } : {})
    }));
    (res.builtInSlotTypeSummaries || []).forEach(x => sig.add(x.slotTypeSignature));
    nextToken = res.nextToken;
    if (!nextToken) break;
  }
  return sig;
}

function pickSupported(sigSet, candidates, fallback = []) {
  for (const c of candidates) if (sigSet.has(c)) return c;
  for (const f of fallback) if (sigSet.has(f)) return f;
  return null;
}

async function ensureAlias(lex, { botId, aliasName, botVersion, localeId, lambdaArn }) {
  // list by name
  const all = await listAll(lex, ListBotAliasesCommand, { botId }, "botAliasSummaries", "nextToken", "maxResults");
  const hit = all.find(a => a.botAliasName === aliasName);
  const aliasLocaleSettings = lambdaArn
    ? {
      [localeId]: {
        enabled: true,
        codeHookSpecification: {
          lambdaCodeHook: { lambdaARN: lambdaArn, codeHookInterfaceVersion: "1.0" }
        }
      }
    }
    : { [localeId]: { enabled: true } };

  await waitBotAvailable(lex, botId); // ✅ Creating 회피

  if (!hit) {
    const created = await lex.send(new CreateBotAliasCommand({
      botId,
      botAliasName: aliasName,
      botVersion,
      botAliasLocaleSettings: aliasLocaleSettings
    }));
    console.log(`  - alias created: ${created.botAliasId}`);
    await waitAliasAvailable(lex, botId, created.botAliasId);
    return created.botAliasId;
  }

  await lex.send(new UpdateBotAliasCommand({
    botId,
    botAliasId: hit.botAliasId,
    botAliasName: aliasName,
    botVersion,
    botAliasLocaleSettings: aliasLocaleSettings
  }));
  console.log(`  - alias updated: ${hit.botAliasId}`);
  await waitAliasAvailable(lex, botId, hit.botAliasId);
  return hit.botAliasId;
}

async function createOrReuseVersion(lex, { botId, localeId, createNew }) {
  if (createNew) {
    const ver = await lex.send(new CreateBotVersionCommand({
      botId,
      botVersionLocaleSpecification: { [localeId]: { sourceBotVersion: "DRAFT" } }
    }));
    console.log(`  - botVersion(created)=${ver.botVersion}`);
    return ver.botVersion;
  }

  const all = await listAll(lex, ListBotVersionsCommand, { botId }, "botVersionSummaries", "nextToken", "maxResults");
  const nonDraft = all.filter(v => v.botVersion && v.botVersion !== "DRAFT");
  if (!nonDraft.length) throw new Error("재사용할 버전이 없습니다. CREATE_NEW_VERSION=true로 실행하세요.");
  nonDraft.sort((a, b) => new Date(a.creationDateTime) - new Date(b.creationDateTime));
  const latest = nonDraft[nonDraft.length - 1].botVersion;
  console.log(`  - botVersion(reuse)=${latest}`);
  return latest;
}

async function main() {
  const cfgPath = path.join(__dirname, "config.env");
  if (fs.existsSync(cfgPath)) dotenv.config({ path: cfgPath });
  else dotenv.config({ path: path.join(__dirname, "config.example.env") });

  const region = req("AWS_REGION");
  const botName = req("BOT_NAME");
  const botDesc = process.env.BOT_DESCRIPTION || "Lex Lab Bot";
  const localeId = process.env.LOCALE_ID || "ko_KR";
  const roleName = process.env.LEX_ROLE_NAME || "LexLabServiceRole";
  const lambdaArn = process.env.LAMBDA_ARN || "";
  const aliasName = process.env.BOT_ALIAS_NAME || "DEV";
  const idleTtl = Number(process.env.IDLE_SESSION_TTL || "300");
  const nluConf = Number(process.env.NLU_CONFIDENCE || "0.40");
  const reuseExistingBot = optBool("REUSE_EXISTING_BOT", true);
  const createNewVersion = optBool("CREATE_NEW_VERSION", true);

  const botIdEnv = process.env.BOT_ID || "";

  const branchValues = parseCsv(process.env.BRANCH_VALUES || "강남WM센터,여의도지점,압구정PB센터,종로지점,판교지점");
  const productValues = parseCsv(process.env.PRODUCT_VALUES || "국내주식,해외주식,ETF,ELS,채권,펀드,ISA,연금저축");

  const sts = new STSClient({ region });
  const iam = new IAMClient({ region });
  const lex = new LexModelsV2Client({ region });

  const ident = await sts.send(new GetCallerIdentityCommand({}));
  console.log(`Account: ${ident.Account}`);

  console.log("[1/8] Ensure IAM Role for Lex");
  const roleArn = await ensureLexRole(iam, { roleName, lambdaArn: lambdaArn || null });
  console.log(`  - roleArn=${roleArn}`);

  console.log("[2/8] Ensure Bot (create or reuse)");
  const botId = await ensureBot(lex, {
    botName,
    botDesc,
    roleArn,
    idleTtl,
    reuseExistingBot,
    botIdEnv
  });

  console.log("[3/8] Ensure Locale");
  await ensureLocale(lex, { botId, localeId, nluConf });

  console.log("[4/8] Upsert SlotTypes");
  const branchSlotTypeId = await upsertSlotType(lex, {
    botId, localeId, slotTypeName: "BranchType", description: "증권사 지점/WM센터", values: branchValues
  });
  const productSlotTypeId = await upsertSlotType(lex, {
    botId, localeId, slotTypeName: "ProductType", description: "금융투자 상품 유형", values: productValues
  });

  console.log("[5/8] Upsert Intents & Slots");

  // Built-in slot type selection based on locale
  console.log("  - load built-in slot types for locale");
  const builtins = await listBuiltInSlotSignatures(lex, localeId);

  const nameType = pickSupported(builtins, ["AMAZON.Person", "AMAZON.FirstName", "AMAZON.LastName"], ["AMAZON.Text", "AMAZON.AlphaNumeric"]);
  const dateType = pickSupported(builtins, ["AMAZON.Date", "AMAZON.DateTime"], ["AMAZON.AlphaNumeric", "AMAZON.Text"]);
  const timeType = pickSupported(builtins, ["AMAZON.Time", "AMAZON.DateTime"], ["AMAZON.AlphaNumeric", "AMAZON.Text"]);
  const phoneType = pickSupported(builtins, ["AMAZON.PhoneNumber"], ["AMAZON.AlphaNumeric", "AMAZON.Text"]);

  if (!nameType || !dateType || !timeType || !phoneType) {
    throw new Error(`ko_KR built-in slot type 선택 실패: name=${nameType}, date=${dateType}, time=${timeType}, phone=${phoneType}`);
  }

  console.log(`  - chosen built-ins: name=${nameType}, date=${dateType}, time=${timeType}, phone=${phoneType}`);

  // ─── BookConsultation: BASE -> slots -> FULL update ───────────────────────
  const bookBaseUtter = [
    "투자상담 예약하고 싶어요",
    "상담 예약할게요",
    "투자 상담 받고 싶어요",
    "PB 상담 신청할게요"
  ];
  const bookFullUtter = [
    "여의도지점 ETF 상담 예약하고 싶어요",
    "{Branch} {ProductType} 투자상담 예약할래요",
    "{Date} {Time}에 {Branch} {ProductType} 상담 예약해줘",
    "강남WM센터 국내주식 상담 예약"
  ];

  const bookIntentId = await upsertIntentBase(lex, {
    botId, localeId, intentName: "BookConsultation", description: "투자상담 예약 생성", baseUtterances: bookBaseUtter
  });
  assertId("BOOK_INTENT_ID", bookIntentId);

  const sBranch  = await upsertSlot(lex, { botId, localeId, intentId: bookIntentId, slotName: "Branch",      slotTypeId: branchSlotTypeId,  required: true,  prompt: "어느 지점/WM센터로 예약할까요? (예: 여의도지점, 강남WM센터)" });
  const sProduct = await upsertSlot(lex, { botId, localeId, intentId: bookIntentId, slotName: "ProductType", slotTypeId: productSlotTypeId, required: true,  prompt: "어떤 상품의 상담을 원하세요? (예: 국내주식, ETF, 펀드, ISA)" });
  const sDate    = await upsertSlot(lex, { botId, localeId, intentId: bookIntentId, slotName: "Date",        slotTypeId: dateType,          required: true,  prompt: "희망 상담 날짜를 알려주세요. (예: 2026-07-15 또는 7월 15일)" });
  const sTime    = await upsertSlot(lex, { botId, localeId, intentId: bookIntentId, slotName: "Time",        slotTypeId: timeType,          required: true,  prompt: "희망 상담 시간을 알려주세요. (예: 14:00)" });
  const sName    = await upsertSlot(lex, { botId, localeId, intentId: bookIntentId, slotName: "CustomerName",slotTypeId: nameType,          required: true,  prompt: "예약자 성함을 알려주세요." });
  const sPhone   = await upsertSlot(lex, { botId, localeId, intentId: bookIntentId, slotName: "PhoneNumber", slotTypeId: phoneType,         required: true,  prompt: "연락처를 알려주세요. (예: 010-1234-5678)" });

  // FULL update with slot priorities + codehook
  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: bookIntentId,
    intentName: "BookConsultation",
    description: "투자상담 예약 생성",
    sampleUtterances: bookFullUtter.map(u => ({ utterance: u })),
    slotPriorities: [
      { priority: 1, slotId: sBranch },
      { priority: 2, slotId: sProduct },
      { priority: 3, slotId: sDate },
      { priority: 4, slotId: sTime },
      { priority: 5, slotId: sName },
      { priority: 6, slotId: sPhone }
    ],
    fulfillmentCodeHook: { enabled: true }
  }));
  console.log("  - BookConsultation updated(FULL) OK");

  // ─── CheckConsultation ─────────────────────────────────────────────────────
  const checkBaseUtter = [
    "상담 예약 조회해줘",
    "예약 확인하고 싶어요",
    "내 상담 예약 있어?",
    "예약번호로 조회할게"
  ];
  const checkIntentId = await upsertIntentBase(lex, {
    botId, localeId, intentName: "CheckConsultation", description: "투자상담 예약 조회", baseUtterances: checkBaseUtter
  });
  assertId("CHECK_INTENT_ID", checkIntentId);

  const alphaNum = pickSupported(builtins, ["AMAZON.AlphaNumeric", "AMAZON.Number"], ["AMAZON.Text"]);
  if (!alphaNum) throw new Error("AMAZON.AlphaNumeric/Number built-in not found");

  await upsertSlot(lex, { botId, localeId, intentId: checkIntentId, slotName: "ConsultationId", slotTypeId: alphaNum, required: false, prompt: "예약번호를 알려주세요. (예: C-ABCD12)" });
  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: checkIntentId,
    intentName: "CheckConsultation",
    description: "투자상담 예약 조회",
    sampleUtterances: [
      ...checkBaseUtter,
      "C-ABCD12 예약 조회",
      "예약번호 C-TEST01 확인",
      "방금 예약한 거 확인해줘",
      "내 마지막 상담 예약 내용 뭐야?",
      "상담 예약 내역 확인",
      "예약 상태 알려줘"
    ].map(u => ({ utterance: u })),
    fulfillmentCodeHook: { enabled: true }
  }));
  console.log("  - CheckConsultation updated OK");

  // ─── CancelConsultation ────────────────────────────────────────────────────
  const cancelBaseUtter = [
    "상담 예약 취소하고 싶어요",
    "예약 취소해줘",
    "상담 취소할래요"
  ];
  const cancelIntentId = await upsertIntentBase(lex, {
    botId, localeId, intentName: "CancelConsultation", description: "투자상담 예약 취소", baseUtterances: cancelBaseUtter
  });
  assertId("CANCEL_INTENT_ID", cancelIntentId);

  await upsertSlot(lex, { botId, localeId, intentId: cancelIntentId, slotName: "ConsultationId", slotTypeId: alphaNum, required: false, prompt: "취소할 예약번호를 알려주세요. (예: C-ABCD12)" });
  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: cancelIntentId,
    intentName: "CancelConsultation",
    description: "투자상담 예약 취소",
    sampleUtterances: [
      ...cancelBaseUtter,
      "C-ABCD12 취소해줘",
      "예약번호 C-TEST01 취소",
      "마지막 예약 취소해줘",
      "방금 잡은 상담 취소할게",
      "여의도지점 상담 예약 취소",
      "상담 예약 삭제해줘"
    ].map(u => ({ utterance: u })),
    fulfillmentCodeHook: { enabled: true }
  }));
  console.log("  - CancelConsultation updated OK");

  // ─── ProductInfo ───────────────────────────────────────────────────────────
  const productInfoBaseUtter = [
    "금융상품 안내해줘",
    "투자 상품 정보 알려줘",
    "ETF가 뭐야",
    "펀드 투자 어떻게 해"
  ];
  const productInfoIntentId = await upsertIntentBase(lex, {
    botId, localeId, intentName: "ProductInfo", description: "금융투자 상품 안내", baseUtterances: productInfoBaseUtter
  });
  assertId("PRODUCT_INFO_INTENT_ID", productInfoIntentId);

  await upsertSlot(lex, { botId, localeId, intentId: productInfoIntentId, slotName: "ProductType", slotTypeId: productSlotTypeId, required: false, prompt: "어떤 상품이 궁금하세요? (예: ETF, 국내주식, 펀드, ELS, ISA)" });
  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: productInfoIntentId,
    intentName: "ProductInfo",
    description: "금융투자 상품 안내",
    sampleUtterances: [
      ...productInfoBaseUtter,
      "국내주식 투자 방법 알려줘",
      "해외주식 수수료 얼마야",
      "ELS 위험도 어때?",
      "채권 투자 안내해줘",
      "ISA 계좌 혜택이 뭐야",
      "연금저축 상품 설명해줘",
      "ETF 종류가 어떻게 돼?",
      "펀드 수익률 어떻게 봐?",
      "해외주식 환율 위험 있나요"
    ].map(u => ({ utterance: u })),
    fulfillmentCodeHook: { enabled: true }
  }));
  console.log("  - ProductInfo updated OK");

  // ─── Help ──────────────────────────────────────────────────────────────────
  const helpBaseUtter = [
    "할 수 있는 거 알려줘",
    "도움말",
    "무슨 기능이 있어?",
    "상담 예약은 어떻게 해?",
    "메뉴 알려줘"
  ];
  const helpIntentId = await upsertIntentBase(lex, {
    botId, localeId, intentName: "Help", description: "기능 안내/도움말", baseUtterances: helpBaseUtter
  });
  assertId("HELP_INTENT_ID", helpIntentId);
  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: helpIntentId,
    intentName: "Help",
    description: "기능 안내/도움말",
    sampleUtterances: [
      ...helpBaseUtter,
      "사용 방법",
      "뭐라고 말하면 돼?",
      "예시 문장 알려줘",
      "사용법 설명해줘",
      "가능한 요청 목록",
      "기능 설명",
      "어떤 질문 할 수 있어?",
      "상담 예약 도와줘",
      "예약 확인 도와줘",
      "취소 도와줘",
      "투자 상품 안내 받을 수 있어?"
    ].map(u => ({ utterance: u })),
    fulfillmentCodeHook: { enabled: true }
  }));
  console.log("  - Help updated OK");

  console.log("[6/8] Build Locale");
  await lex.send(new BuildBotLocaleCommand({ botId, botVersion: "DRAFT", localeId }));
  await waitLocaleBuilt(lex, { botId, localeId });

  console.log("[7/8] Create or Reuse Version");
  const botVersion = await createOrReuseVersion(lex, { botId, localeId, createNew: createNewVersion });

  // 버전 생성 직후 Bot Creating 상태로 잠깐 전환될 수 있음
  await waitBotAvailable(lex, botId);

  console.log("[8/8] Create or Update Alias");
  const botAliasId = await ensureAlias(lex, { botId, aliasName, botVersion, localeId, lambdaArn: lambdaArn || "" });

  console.log("\n✅ DONE");
  console.log(`export AWS_REGION=${region}`);
  console.log(`export LEX_BOT_ID=${botId}`);
  console.log(`export LEX_BOT_ALIAS_ID=${botAliasId}`);
  console.log(`export LEX_LOCALE_ID=${localeId}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
