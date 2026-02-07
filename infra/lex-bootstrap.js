/**
 * Amazon Lex V2 자동 생성 스크립트 (Node.js / AWS SDK v3)
 *
 * 기능:
 * - Bot / Locale / SlotTypes / Intents / Slots
 * - Build Locale → Create Version → Create Alias(옵션: Lambda CodeHook)
 *
 * 실행:
 *   cd infra
 *   cp config.example.env config.env
 *   node lex-bootstrap.js
 *
 * 의존성:
 *   npm i @aws-sdk/client-lex-models-v2 @aws-sdk/client-sts @aws-sdk/client-iam dotenv
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { IAMClient, GetRoleCommand, CreateRoleCommand, PutRolePolicyCommand } = require("@aws-sdk/client-iam");
const {
  LexModelsV2Client,
  CreateBotCommand,
  CreateBotLocaleCommand,
  CreateSlotTypeCommand,
  CreateIntentCommand,
  CreateSlotCommand,
  UpdateIntentCommand,
  BuildBotLocaleCommand,
  DescribeBotLocaleCommand,
  CreateBotVersionCommand,
  CreateBotAliasCommand
} = require("@aws-sdk/client-lex-models-v2");

function req(name, fallback = null) {
  const v = process.env[name] ?? fallback;
  if (v === null || v === undefined || v === "") throw new Error(`${name} is required`);
  return v;
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
        Action: ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
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

  console.log("[2/8] Create Bot");
  const bot = await lex.send(new CreateBotCommand({
    botName,
    description: botDesc,
    roleArn,
    dataPrivacy: { childDirected: false },
    idleSessionTTLInSeconds: idleTtl
  }));
  const botId = bot.botId;
  console.log(`  - botId=${botId}`);

  console.log("[3/8] Create Locale");
  await lex.send(new CreateBotLocaleCommand({
    botId,
    botVersion: "DRAFT",
    localeId,
    nluIntentConfidenceThreshold: nluConf
  }));

  console.log("[4/8] Create SlotTypes");
  const branchSlotType = await lex.send(new CreateSlotTypeCommand({
    botId, botVersion: "DRAFT", localeId,
    slotTypeName: "BranchType",
    description: "학원 지점",
    slotTypeValues: slotTypeValues(branchValues),
    valueSelectionSetting: { resolutionStrategy: "TOP_RESOLUTION" }
  }));
  const courseSlotType = await lex.send(new CreateSlotTypeCommand({
    botId, botVersion: "DRAFT", localeId,
    slotTypeName: "CourseType",
    description: "수강 과정",
    slotTypeValues: slotTypeValues(courseValues),
    valueSelectionSetting: { resolutionStrategy: "TOP_RESOLUTION" }
  }));

  console.log(`  - BranchType=${branchSlotType.slotTypeId}`);
  console.log(`  - CourseType=${courseSlotType.slotTypeId}`);

  console.log("[5/8] Create Intents & Slots");
  const makeUtter = [
    { utterance: "강남점 토익 예약하고 싶어요" },
    { utterance: "{Branch} {CourseName} 상담 예약할래요" },
    { utterance: "{Date} {Time}에 {Branch} {CourseName} 예약" }
  ];
  const makeIntent = await lex.send(new CreateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentName: "MakeReservation",
    description: "상담/수강 예약 생성",
    sampleUtterances: makeUtter
  }));

  async function createSlot(intentId, slotName, slotTypeId, required, prompt) {
    const constraint = required ? "Required" : "Optional";
    return lex.send(new CreateSlotCommand({
      botId, botVersion: "DRAFT", localeId,
      intentId,
      slotName,
      slotTypeId,
      slotConstraint: constraint,
      valueElicitationSetting: {
        slotConstraint: constraint,
        promptSpecification: {
          maxRetries: 2,
          messageGroups: [{ message: { plainTextMessage: { value: prompt } } }]
        }
      }
    }));
  }

  const sBranch = await createSlot(makeIntent.intentId, "Branch", branchSlotType.slotTypeId, true, "어느 지점으로 예약할까요? (예: 강남점)");
  const sCourse = await createSlot(makeIntent.intentId, "CourseName", courseSlotType.slotTypeId, true, "어떤 과정을 원하세요? (예: 토익)");
  const sDate   = await createSlot(makeIntent.intentId, "Date", "AMAZON.Date", true, "희망 날짜를 알려주세요. (예: 2월 10일)");
  const sTime   = await createSlot(makeIntent.intentId, "Time", "AMAZON.Time", true, "희망 시간을 알려주세요. (예: 19:30)");
  const sName   = await createSlot(makeIntent.intentId, "StudentName", "AMAZON.Person", true, "예약자 이름을 알려주세요.");
  const sPhone  = await createSlot(makeIntent.intentId, "PhoneNumber", "AMAZON.PhoneNumber", true, "연락처를 알려주세요. (예: 010-1234-5678)");

  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: makeIntent.intentId,
    intentName: "MakeReservation",
    sampleUtterances: makeUtter,
    slotPriorities: [
      { priority: 1, slotId: sBranch.slotId },
      { priority: 2, slotId: sCourse.slotId },
      { priority: 3, slotId: sDate.slotId },
      { priority: 4, slotId: sTime.slotId },
      { priority: 5, slotId: sName.slotId },
      { priority: 6, slotId: sPhone.slotId }
    ],
    fulfillmentCodeHook: { enabled: true }
  }));

  async function simpleIntent(name, desc, utterances, hasReservationIdSlot) {
    const intent = await lex.send(new CreateIntentCommand({
      botId, botVersion: "DRAFT", localeId,
      intentName: name,
      description: desc,
      sampleUtterances: utterances.map(u => ({ utterance: u }))
    }));

    let slotPriorities = undefined;
    if (hasReservationIdSlot) {
      const slot = await createSlot(intent.intentId, "ReservationId", "AMAZON.AlphaNumeric", false,
        "예약번호를 알려주세요. (모르면 '마지막 예약'이라고 해주세요.)"
      );
      slotPriorities = [{ priority: 1, slotId: slot.slotId }];
    }

    await lex.send(new UpdateIntentCommand({
      botId, botVersion: "DRAFT", localeId,
      intentId: intent.intentId,
      intentName: name,
      sampleUtterances: utterances.map(u => ({ utterance: u })),
      slotPriorities,
      fulfillmentCodeHook: { enabled: true }
    }));

    return intent.intentId;
  }

  await simpleIntent("CheckReservation", "예약 조회", ["예약 조회해줘","예약번호 {ReservationId} 조회","내 예약 확인"], true);
  await simpleIntent("CancelReservation", "예약 취소", ["예약 취소해줘","예약번호 {ReservationId} 취소","내 예약 취소"], true);

  const courseInfo = await lex.send(new CreateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentName: "CourseInfo",
    description: "과정/수업 정보 문의",
    sampleUtterances: [{ utterance: "{CourseName} 과정 안내해줘" },{ utterance: "토익 수업 정보 알려줘" },{ utterance: "과정 안내" }]
  }));
  const ci = await createSlot(courseInfo.intentId, "CourseName", courseSlotType.slotTypeId, false, "어떤 과정을 안내해드릴까요? (예: 토익)");
  await lex.send(new UpdateIntentCommand({
    botId, botVersion: "DRAFT", localeId,
    intentId: courseInfo.intentId,
    intentName: "CourseInfo",
    sampleUtterances: [{ utterance: "{CourseName} 과정 안내해줘" },{ utterance: "토익 수업 정보 알려줘" },{ utterance: "과정 안내" }],
    slotPriorities: [{ priority: 1, slotId: ci.slotId }],
    fulfillmentCodeHook: { enabled: true }
  }));

  await simpleIntent("Help", "기능 안내/도움말", ["도움말","할 수 있는 거 알려줘","사용 방법"], false);

  console.log("[6/8] Build Locale");
  await lex.send(new BuildBotLocaleCommand({ botId, botVersion: "DRAFT", localeId }));
  await waitLocaleBuilt(lex, { botId, localeId });

  console.log("[7/8] Create Version");
  const ver = await lex.send(new CreateBotVersionCommand({
    botId,
    botVersionLocaleSpecification: { [localeId]: { sourceBotVersion: "DRAFT" } }
  }));
  const botVersion = ver.botVersion;
  console.log(`  - botVersion=${botVersion}`);

  console.log("[8/8] Create Alias");
  const aliasLocaleSettings = lambdaArn
    ? { [localeId]: { enabled: true, codeHookSpecification: { lambdaCodeHook: { lambdaARN: lambdaArn, codeHookInterfaceVersion: "1.0" } } } }
    : { [localeId]: { enabled: true } };

  const alias = await lex.send(new CreateBotAliasCommand({
    botId,
    botAliasName: aliasName,
    botVersion,
    botAliasLocaleSettings: aliasLocaleSettings
  }));
  console.log(`  - botAliasId=${alias.botAliasId}`);

  console.log("\n✅ DONE");
  console.log(`export AWS_REGION=${region}`);
  console.log(`export LEX_BOT_ID=${botId}`);
  console.log(`export LEX_BOT_ALIAS_ID=${alias.botAliasId}`);
  console.log(`export LEX_LOCALE_ID=${localeId}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
