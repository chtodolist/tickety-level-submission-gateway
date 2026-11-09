const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const TICKETY_TOKEN = process.env.TICKETY_TOKEN || "";
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "online",
    service: "Tickety Level Submission Gateway"
  });
});

function getPayload(req) {
  const body = req.body || {};
  return {
    eventType: String(body.type || ""),
    payload: body.payload && typeof body.payload === "object" ? body.payload : body
  };
}

function isAuthorized(req) {
  const supplied = String(req.get("authorization") || "").trim();
  const normalized = supplied.replace(/^Bearer\s+/i, "");
  return Boolean(TICKETY_TOKEN) && normalized === TICKETY_TOKEN;
}

async function sendToAppsScript(data) {
  if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL is not configured.");
  if (!GATEWAY_SECRET) throw new Error("GATEWAY_SECRET is not configured.");

  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, gatewayToken: GATEWAY_SECRET }),
    redirect: "follow"
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (_error) {
    throw new Error(`Apps Script returned non-JSON (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }

  if (!response.ok || result.status !== "ok") {
    throw new Error(`Apps Script rejected the event (HTTP ${response.status}): ${result.message || text}`);
  }

  return result;
}

app.post("/tickety-webhook", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ status: "error", message: "Unauthorized webhook request." });
  }

  const { eventType, payload } = getPayload(req);
  const applicationId = String(payload.applicationId || "").trim();

  if (!eventType) {
    return res.status(400).json({ status: "error", message: "Missing Tickety event type." });
  }

  try {
    if (eventType === "application.submit") {
      if (!applicationId || !Array.isArray(payload.questions)) {
        return res.status(400).json({ status: "error", message: "Submit event is missing applicationId or questions." });
      }

      const result = await sendToAppsScript({
        type: "tickety_pending",
        applicationId,
        submitDate: payload.submitDate || "",
        application: payload
      });

      console.log(`Stored Tickety application.submit: ${applicationId}`);
      return res.status(200).json({ status: "ok", message: result.message });
    }

    if (eventType === "application.accept") {
      if (!applicationId) {
        return res.status(400).json({ status: "error", message: "Accept event is missing applicationId." });
      }

      const result = await sendToAppsScript({
        type: "tickety_accept",
        applicationId
      });

      console.log(`Processed Tickety application.accept: ${applicationId}`);
      return res.status(200).json({ status: "ok", message: result.message });
    }

    if (eventType === "application.deny") {
      console.log(`Ignored Tickety application.deny: ${applicationId || "unknown application"}`);
      return res.status(200).json({ status: "ok", message: "Denied applications are ignored." });
    }

    console.log(`Ignored unsupported Tickety event: ${eventType}`);
    return res.status(200).json({ status: "ok", message: "Event ignored." });
  } catch (error) {
    console.error(`Tickety webhook processing failed (${eventType}, ${applicationId}):`, error.message);
    return res.status(500).json({ status: "error", message: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Tickety gateway listening on ${PORT}`);
});
