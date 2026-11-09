
const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

function safeCompare(a, b) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);

  return (
    first.length === second.length &&
    crypto.timingSafeEqual(first, second)
  );
}

app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "Tickety Level Submission Gateway"
  });
});

app.post("/tickety-webhook", (req, res) => {
  const token = process.env.TICKETY_TOKEN;

  if (!token) {
    console.error("TICKETY_TOKEN is not configured.");
    return res.status(503).send("Gateway not configured");
  }

  const authorization = req.get("authorization") || "";
  const receivedToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : authorization;

  if (!safeCompare(receivedToken, token)) {
    return res.status(401).send("Unauthorized");
  }

  const { type, payload } = req.body || {};

  if (typeof type !== "string" || !payload ||
      typeof payload !== "object") {
    return res.status(400).send("Invalid event");
  }

  console.log("Tickety event received:", type);
  console.log("Payload fields:", Object.keys(payload));

  if (Array.isArray(payload.questions)) {
    console.log(
      "Application question structure:",
      payload.questions.map(question => ({
        fields: Object.keys(question),
        question:
          question.question ||
          question.label ||
          question.title ||
          "Unknown question",
        answerType: typeof question.answer
      }))
    );
  }

  return res.status(200).send("Event received");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gateway listening on port ${PORT}`);
});
