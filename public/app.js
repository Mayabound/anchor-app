const chatPanel = document.getElementById('chatPanel');
const introCard = document.getElementById('introCard');
const composer = document.getElementById('composer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const moodChips = document.getElementById('moodChips');
const resourcesBtn = document.getElementById('resourcesBtn');
const resourcesModal = document.getElementById('resourcesModal');
const closeResources = document.getElementById('closeResources');

let history = []; // { role: 'user' | 'assistant', content: string }

function scrollToBottom() {
  chatPanel.scrollTop = chatPanel.scrollHeight;
}

function addUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg user';
  el.textContent = text;
  chatPanel.appendChild(el);
  scrollToBottom();
}

function addAssistantMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg assistant';
  el.textContent = text;
  chatPanel.appendChild(el);
  scrollToBottom();
  return el;
}

function addThinkingIndicator() {
  const el = document.createElement('div');
  el.className = 'thinking-rings';
  el.innerHTML = `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="6" class="ring ring-1"></circle>
      <circle cx="24" cy="24" r="14" class="ring ring-2"></circle>
      <circle cx="24" cy="24" r="22" class="ring ring-3"></circle>
    </svg>`;
  chatPanel.appendChild(el);
  scrollToBottom();
  return el;
}

function addCrisisCard() {
  const el = document.createElement('div');
  el.className = 'crisis-card';
  el.innerHTML = `
    <strong>It sounds like things are really hard right now.</strong>
    Real support is available any time, not just from Anchor.
    <br>
    <button type="button">See crisis resources</button>`;
  el.querySelector('button').addEventListener('click', () => openModal());
  chatPanel.appendChild(el);
  scrollToBottom();
}

function setComposerDisabled(disabled) {
  messageInput.disabled = disabled;
  sendBtn.disabled = disabled;
}

async function sendMessage(text) {
  if (!text.trim()) return;

  introCard.hidden = true;
  addUserMessage(text);
  const historyForRequest = history.slice();
  history.push({ role: 'user', content: text });
  setComposerDisabled(true);

  const thinking = addThinkingIndicator();
  let assistantEl = null;
  let fullText = '';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: historyForRequest }),
    });

    if (!res.ok || !res.body) {
      throw new Error('Request failed');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop(); // keep incomplete frame for next read

      for (const frame of frames) {
        if (!frame.trim()) continue;
        let eventType = 'message';
        let dataLine = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          if (line.startsWith('data: ')) dataLine = line.slice(6);
        }
        if (!dataLine) continue;

        let payload;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          continue;
        }

        if (eventType === 'message' && payload.text) {
          if (!assistantEl) {
            thinking.remove();
            assistantEl = addAssistantMessage('');
          }
          fullText += payload.text;
          assistantEl.textContent = fullText;
          scrollToBottom();
        } else if (eventType === 'crisis') {
          addCrisisCard();
        } else if (eventType === 'error') {
          thinking.remove();
          if (!assistantEl) {
            addAssistantMessage(payload.error || "Something went wrong. Let's try that again.");
          }
        }
      }
    }

    if (fullText) {
      history.push({ role: 'assistant', content: fullText });
    }
  } catch (err) {
    thinking.remove();
    if (!assistantEl) {
      addAssistantMessage("Something went wrong connecting to the server. Please try again.");
    }
  } finally {
    setComposerDisabled(false);
    messageInput.focus();
  }
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendMessage(text);
});

messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

moodChips.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  const mood = btn.dataset.mood;
  sendMessage(`I'm feeling ${mood.toLowerCase()} today.`);
});

function openModal() {
  resourcesModal.hidden = false;
}
function closeModal() {
  resourcesModal.hidden = true;
}

resourcesBtn.addEventListener('click', openModal);
closeResources.addEventListener('click', closeModal);
resourcesModal.addEventListener('click', (e) => {
  if (e.target === resourcesModal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !resourcesModal.hidden) closeModal();
});
