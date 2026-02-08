/**
 * Amazon Lex V2 자동 생성 스크립트 (Node.js / AWS SDK v3) - Idempotent FIX v2
 *
 * Fixes / Improvements
 * 1) Bot name이 이미 존재하면 CreateBot 대신 기존 Bot 재사용 (BOT_ID / REUSE_EXISTING_BOT)
 * 2) Intent 생성 시 slot 참조 utterance를 "slot 생성 전"에 넣지 않도록 2-step (BASE -> FULL) 적용
 * 3) valueSelectionSetting.resolutionStrategy SDK enum 값 정정: "TopResolution"
 * 4) Locale / SlotType / Intent / Slot / Alias 모두 upsert 방식 (재실행 가능)
 * 5) Bot/Alias 상태가 Creating일 때 작업하면 실패하므로 wait(Available) 추가
 * 6) built-in slot type은 locale에 따라 다를 수 있어 list-built-in-slot-types 기반으로 선택 (fallback 포함)
 *
 * 실행:
 *   cd infra
 *   cp config.example.env config.env
 *   node lex-bootstrap.fixed.v2.js
 *
 * 옵션(env):
 *   BOT_ID=...                       # 특정 Bot 재사용
 *   REUSE_EXISTING_BOT=true|false    # 동일 이름 Bot 재사용 (default true)
 *   CREATE_NEW_VERSION=true|false    # 새 버전 매번 생성 (default true)
 *   FORCE_REFRESH_BUILTIN=true|false # built-in slot type 캐시 강제 재생성 (default false)
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

  const branchValues = parseCsv(process.env.BRANCH_VALUES || "강남점,홍대점,잠실점,분당점,인천점");
  const courseValues = parseCsv(process.env.COURSE_VALUES || "토익,오픽,영어회화,일본어,자격증");

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
    botId, localeId, slotTypeName: "BranchType", description: "학원 지점", values: branchValues
  });
  const courseSlotTypeId = await upsertSlotType(lex, {
    botId, localeId, slotTypeName: "CourseType", description: "수강 과정", values: courseValues
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

  // MakeReservation: BASE -> slots -> FULL update
  const makeBaseUtter = ["상담 예약할래요", "예약하고 싶어요", "수강 상담 예약"];
  const makeFullUtter = [
    "강남점 토익 예약하고 싶어요",
    "{Branch} {CourseName} 상담 예약할래요",
    "{Date} {Time}에 {Branch} {CourseName} 예약"
  ];

  const makeIntentId = await upsertIntentBase(lex, {
    botId, localeId, intentName: "MakeReservation", description: "상담/수강 예약 생성", baseUtterances: makeBaseUtter
  });
  assertId("MAKE_INTENT_ID", makeIntentId);

  const sBranch = await upsertSlot(lex, { botId, localeId, intentId: makeIntentId, slotName: "Branch", slotTypeId: branchSlotTypeId, required: true, prompt: "어느 지점으로 예약할까요? (예: 강남점)" });
  const sCourse = await upsertSlot(lex, { botId, localeId, intentId: makeIntentId, slotName: "CourseName", slotTypeId: courseSlotTypeId, required: true, prompt: "어떤 과정을 원하세요? (예: 토익)" });
  const sDate   = await upsertSlot(lex, { botId, localeId, intentId: makeIntentId, slotName: "Date", slotTypeId: dateType, required: true, prompt: "희망 날짜를 알려주세요. (예: 2026-02-10 또는 2월 10일)" });
  const sTime   = await upsertSlot(lex, { botId, localeId, intentId: makeIntentId, slotName: "Time", slotTypeId: timeType, required: true, prompt: "희망 시간을 알려주세요. (예: 19:30)" });
  const sName   = await upsertSlot(lex, { botId, localeId, intentId: makeIntentId, slotName: "StudentName", slotTypeId: nameType, required: true, prompt: "예약자 이름을 알려주세요." });
  const sPhone  = await upsertSlot(lex, { botId, localeId, intentId: makeIntentId, slotName: "PhoneNumber", slotTypeId: phoneType, required: true, prompt: "연락처를 알려주세요. (예: 010-1234-5678)" });

  // FULL update with slot priorities + codehook enabled
  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: makeIntentId,
    intentName: "MakeReservation",
    description: "상담/수강 예약 생성",
    sampleUtterances: makeFullUtter.map(u => ({ utterance: u })),
    slotPriorities: [
      { priority: 1, slotId: sBranch },
      { priority: 2, slotId: sCourse },
      { priority: 3, slotId: sDate },
      { priority: 4, slotId: sTime },
      { priority: 5, slotId: sName },
      { priority: 6, slotId: sPhone }
    ],
    fulfillmentCodeHook: { enabled: true }
  }));
  console.log("  - MakeReservation updated(FULL) OK");

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
