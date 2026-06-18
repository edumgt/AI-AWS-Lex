const helpEvent = {
  inputTranscript: "도움말",
  sessionState: {
    dialogAction: { type: "Close" },
    intent: {
      name: "Help",
      slots: {},
      state: "ReadyForFulfillment",
      confirmationState: "None"
    },
    sessionAttributes: {}
  }
};

const productInfoEvent = {
  inputTranscript: "ETF가 뭐야",
  sessionState: {
    dialogAction: { type: "Close" },
    intent: {
      name: "ProductInfo",
      slots: {},
      state: "ReadyForFulfillment",
      confirmationState: "None"
    },
    sessionAttributes: {}
  }
};

module.exports = {
  helpEvent,
  productInfoEvent
};
