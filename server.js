'use strict';

const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const TICKETY_TOKEN = String(process.env.TICKETY_TOKEN || '').trim();
const GATEWAY_SECRET = String(process.env.GATEWAY_SECRET || '').trim();
const APPS_SCRIPT_URL = String(process.env.APPS_SCRIPT_URL || '').trim();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function authorizedTickety(req) {
  const header = String(req.get('authorization') || '').trim();
  const supplied = header.replace(/^Bearer\s+/i, '').trim();
  return Boolean(TICKETY_TOKEN && supplied && safeEqual(supplied, TICKETY_TOKEN));
}

async function sendToAppsScript(body) {
  if (!APPS_SCRIPT_URL || !GATEWAY_SECRET) {
    throw new Error('Gateway is missing APPS_SCRIPT_URL or GATEWAY_SECRET environment variables.');
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, gatewaySecret: GATEWAY_SECRET })
  });

  const responseText = await response.text();
  let result;
  try {
    result = JSON.parse(responseText);
  } catch (_) {
    throw new Error(`Apps Script returned non-JSON (HTTP ${response.status}).`);
  }

  if (!response.ok || !result || result.status !== 'ok') {
    const message = result && (result.message || result.error);
    throw new Error(message || `Apps Script request failed (HTTP ${response.status}).`);
  }
  return result;
}

app.get('/', (_req, res) => {
  res.json({ status: 'online', service: 'Tickety Level Submission Gateway' });
});

app.post('/tickety-webhook', async (req, res) => {
  if (!authorizedTickety(req)) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized webhook request.' });
  }

  const event = req.body || {};
  const type = String(event.type || '').trim();
  const payload = event.payload || {};
  const applicationId = String(payload.applicationId || '').trim();

  if (!applicationId) {
    return res.status(400).json({ status: 'error', message: 'Missing applicationId.' });
  }

  try {
    if (type === 'application.submit') {
      // Save the full submitted application. Accept events only contain metadata.
      const result = await sendToAppsScript({
        type: 'tickety_store',
        applicationId,
        payload
      });
      return res.status(200).json({ status: 'ok', action: 'stored', result: result.message });
    }

    if (type === 'application.accept') {
      const result = await sendToAppsScript({
        type: 'tickety_accept',
        applicationId
      });
      return res.status(200).json({ status: 'ok', action: 'forwarded', result: result.message });
    }

    if (type === 'application.deny') {
      const result = await sendToAppsScript({
        type: 'tickety_deny',
        applicationId
      });
      return res.status(200).json({ status: 'ok', action: 'discarded', result: result.message });
    }

    // Ignore other event types so they cannot create queue entries.
    return res.status(200).json({ status: 'ok', action: 'ignored', event: type || 'unknown' });
  } catch (error) {
    console.error('Tickety webhook processing failed:', error.message);
    return res.status(502).json({ status: 'error', message: error.message });
  }
});

app.use((error, _req, res, _next) => {
  console.error('Request error:', error.message);
  res.status(400).json({ status: 'error', message: 'Invalid request body.' });
});

app.listen(PORT, () => {
  console.log(`Tickety Level Submission Gateway listening on port ${PORT}`);
});
