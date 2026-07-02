const { handler } = require("./fulfillment");

function slot(value) {
  return value == null
    ? null
    : {
        value: {
          interpretedValue: value,
          originalValue: value
        }
      };
}

function buildEvent(intentName, slotValues = {}, sessionAttributes = {}, inputTranscript = "") {
  const slots = {};
  for (const [key, value] of Object.entries(slotValues)) {
    slots[key] = slot(value);
  }

  return {
    bot: { localeId: "ko_KR" },
    inputMode: "Text",
    inputTranscript,
    sessionState: {
      dialogAction: { type: "Close" },
      intent: {
        name: intentName,
        slots,
        state: "ReadyForFulfillment",
        confirmationState: "None"
      },
      sessionAttributes
    }
  };
}

async function main() {
  const booked = await handler(
    buildEvent(
      "BookConsultation",
      {
        Branch: "여의도지점",
        ProductType: "ETF",
        Date: "2026-07-15",
        Time: "14:00",
        CustomerName: "김도영",
        PhoneNumber: "010-1234-5678"
      },
      {},
      "여의도지점 ETF 상담 예약해줘"
    )
  );

  console.log("\n[BookConsultation]");
  console.log(JSON.stringify(booked, null, 2));

  const sessionAttributes = booked.sessionState?.sessionAttributes || {};

  const checked = await handler(
    buildEvent(
      "CheckConsultation",
      {},
      sessionAttributes,
      "방금 예약한 거 확인해줘"
    )
  );

  console.log("\n[CheckConsultation]");
  console.log(JSON.stringify(checked, null, 2));

  const productInfo = await handler(
    buildEvent(
      "ProductInfo",
      {},
      {},
      "ETF가 뭐야"
    )
  );

  console.log("\n[ProductInfo]");
  console.log(JSON.stringify(productInfo, null, 2));

  const help = await handler(
    buildEvent("Help", {}, {}, "도움말")
  );

  console.log("\n[Help]");
  console.log(JSON.stringify(help, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
