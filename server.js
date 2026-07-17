require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Persona system prompt.
// This is the single most important piece of "prompt engineering" in the app -
// keep it here, keep it documented, and quote it in your project report.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Anchor, a warm daily check-in companion. Your only job is to
help someone reflect for a couple of minutes on how they're doing. You are
not a therapist, you do not diagnose, and you are not a substitute for
professional care - you are a supportive, low-stakes conversation partner.

How to respond:
- Keep replies short and conversational: 2-4 sentences, not essays.
- Reflect back what the person shared in your own words first, then ask at
  most one gentle, open-ended follow-up question.
- Never tell someone what they "have" (no diagnostic labels like anxiety,
  depression, etc.), and never assume a cause for how they feel unless they
  name it themselves.
- If it feels useful, you may offer one simple grounding technique (for
  example a slow breathing pattern) - offer it as an option, don't prescribe
  it.
- Stay warm, specific, and non-judgmental. Do not minimize what someone
  shares, and do not respond with generic positivity ("stay strong!",
  "everything happens for a reason").
- If someone's message suggests real distress, gently and naturally
  encourage them to talk to a person they trust or a professional - do not
  be alarmist or clinical about it.
- If a message suggests thoughts of suicide, self-harm, or crisis: respond
  with care and take it seriously, but do not try to counsel them through it
  yourself. Say clearly that you want them to have real support right now,
  and point them to the resources shown in the app. The app will also
  surface a resource card automatically - you do not need to list phone
  numbers yourself.`;

// ---------------------------------------------------------------------------
// Lightweight, deliberately conservative crisis-language check.
// This is a heuristic safety net, NOT a diagnostic tool - it exists purely to
// decide whether to surface the crisis-resources card automatically. The
// resources are also always reachable from the footer regardless of this
// check, because keyword matching alone is never something to fully rely on.
// ---------------------------------------------------------------------------
const CRISIS_PATTERNS = [
  /\bkill myself\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend my life\b/i,
  /\bwant to die\b/i,
  /\bdon'?t want to (be alive|live)\b/i,
  /\bhurt(ing)? myself\b/i,
  /\bself[\s-]?harm\b/i,
  /\bno reason to (live|go on)\b/i,
];

function mentionsCrisisLanguage(text) {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Health check - point AWS App Runner's health check config at this path.
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Streaming chat endpoint.
// Body: { message: string, history: Array<{role: 'user'|'assistant', content: string}> }
// Streams plain text chunks to the client as they arrive from Claude, using a
// simple SSE-style protocol over a normal fetch() POST (EventSource only
// supports GET, so we roll our own minimal framing instead).
// ---------------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
  }

  const safeHistory = Array.isArray(history) ? history.slice(-20) : [];
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...safeHistory,
    { role: 'user', content: message },
  ];
  const flagged = mentionsCrisisLanguage(message);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      res.write(`event: error\ndata: ${JSON.stringify({ error: errText || 'Upstream error' })}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep any incomplete line for next chunk

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;

        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        const text = event.choices?.[0]?.delta?.content;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
    }

    if (flagged) {
      res.write(`event: crisis\ndata: ${JSON.stringify({ resources: true })}\n\n`);
    }
    res.write('event: done\ndata: {}\n\n');
    res.end();
  } catch (err) {
    console.error('Chat stream error:', err);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Something went wrong.' })}\n\n`);
      res.end();
    } catch {
      // response likely already closed
    }
  }
});

app.listen(PORT, () => {
  console.log(`Anchor server listening on port ${PORT}`);
});
