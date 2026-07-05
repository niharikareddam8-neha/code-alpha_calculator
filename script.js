/* ══════════════════════════════════════════════════════
   Scientific Calculator — script.js
   Sections:
   1. State & DOM refs
   2. Audio (Web Audio API — no external files needed)
   3. Theme
   4. Display helpers
   5. Expression logic
   6. Calculation
   7. History
   8. Copy result
   9. Voice input
   10. Event listeners (buttons + keyboard)
══════════════════════════════════════════════════════ */

/* ── 1. State & DOM refs ─────────────────────────────── */
let expression     = '';
let justCalculated = false;
let soundEnabled   = true;
let isListening    = false;

const resultEl      = document.getElementById('result');
const expressionEl  = document.getElementById('expression');
const historyPanel  = document.getElementById('historyPanel');
const historyList   = document.getElementById('historyList');
const voiceBtn      = document.getElementById('voiceBtn');
const voiceStatus   = document.getElementById('voiceStatus');
const copyMsg       = document.getElementById('copyMsg');
const themeToggleBtn   = document.getElementById('themeToggle');
const soundToggleBtn   = document.getElementById('soundToggle');
const historyToggleBtn = document.getElementById('historyToggle');

/* ── 2. Audio (Web Audio API) ────────────────────────── */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

/**
 * Play a short beep.
 * @param {number} freq  - frequency in Hz
 * @param {number} dur   - duration in seconds
 * @param {string} type  - oscillator type
 */
function playBeep(freq = 440, dur = 0.07, type = 'sine') {
  if (!soundEnabled) return;
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch (_) { /* audio not supported */ }
}

const sounds = {
  num:   () => playBeep(520, 0.06, 'sine'),
  op:    () => playBeep(440, 0.07, 'triangle'),
  eq:    () => playBeep(660, 0.12, 'sine'),
  clear: () => playBeep(300, 0.09, 'sawtooth'),
  error: () => playBeep(200, 0.18, 'sawtooth'),
};

/* ── 3. Theme ────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('calcTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  themeToggleBtn.textContent = saved === 'dark' ? '🌙' : '☀️';
}
initTheme();

themeToggleBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  themeToggleBtn.textContent = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('calcTheme', next);
  sounds.num();
});

/* ── 4. Display helpers ──────────────────────────────── */

/** Update the display lines and auto-scale font. */
function updateDisplay(value, expr) {
  resultEl.textContent    = value;
  expressionEl.textContent = expr || '';
  const len = String(value).length;
  resultEl.classList.toggle('small',  len > 12);
  resultEl.classList.toggle('xsmall', len > 18);
}

/** Render expression with display-friendly symbols. */
function prettyExpr(expr) {
  return expr
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/Math\.PI/g, 'π')
    .replace(/Math\.E/g, 'e')
    .replace(/sqrt\(/g, '√(')
    .replace(/\^/g, '^');
}

/* ── 5. Expression logic ─────────────────────────────── */

/** Returns true if expr ends with an operator character. */
function endsWithOperator(str) {
  return /[+\-*/^]$/.test(str);
}

/** Append a value to the current expression. */
function appendValue(value) {
  const operators = ['+', '-', '*', '/', '^'];
  const isOp      = operators.includes(value);

  // After "=", number → fresh start; operator → chain from result
  if (justCalculated) {
    if (isOp) {
      expression = resultEl.textContent + value;
    } else {
      expression = value;
    }
    justCalculated = false;
    updateDisplay(expression, '');
    return;
  }

  // Replace trailing operator with new one
  if (isOp && endsWithOperator(expression)) {
    expression = expression.slice(0, -1) + value;
    updateDisplay(prettyExpr(expression), '');
    return;
  }

  // Prevent leading operator (minus allowed for negation)
  if (isOp && expression === '' && value !== '-') return;

  // Prevent double decimal in same number segment
  if (value === '.') {
    const parts    = expression.split(/[+\-*/^(]/);
    const lastPart = parts[parts.length - 1];
    if (lastPart.includes('.')) return;
    if (lastPart === '' || endsWithOperator(expression)) expression += '0';
  }

  expression += value;
  updateDisplay(prettyExpr(expression), '');
}

/** Delete last character. */
function deleteLast() {
  sounds.op();
  if (justCalculated) { clearDisplay(); return; }
  // Remove multi-char tokens like "sin(", "Math.PI", "Math.E"
  const tokens = ['Math.PI', 'Math.E', 'sqrt(', 'sin(', 'cos(', 'tan(', 'log(', 'ln('];
  for (const t of tokens) {
    if (expression.endsWith(t)) {
      expression = expression.slice(0, -t.length);
      updateDisplay(prettyExpr(expression) || '0', '');
      return;
    }
  }
  expression = expression.slice(0, -1);
  updateDisplay(prettyExpr(expression) || '0', '');
}

/** Clear everything. */
function clearDisplay() {
  sounds.clear();
  expression     = '';
  justCalculated = false;
  updateDisplay('0', '');
}

/* ── 6. Calculation ──────────────────────────────────── */

/** Evaluate the expression and show result. */
function calculate() {
  if (!expression || endsWithOperator(expression)) return;

  const displayedExpr = prettyExpr(expression);

  try {
    // Prepare expression for eval:
    // Replace ^ with ** for exponentiation
    let evalExpr = expression
      .replace(/\^/g, '**')
      .replace(/ln\(/g, 'Math.log(')
      .replace(/log\(/g, 'Math.log10(')
      .replace(/sin\(/g, 'Math.sin(')
      .replace(/cos\(/g, 'Math.cos(')
      .replace(/tan\(/g, 'Math.tan(')
      .replace(/sqrt\(/g, 'Math.sqrt(')
      .replace(/%/g, '/100');

    // Sanitize: only allow safe characters
    if (/[^0-9+\-*/.()eMathPIsincotaglqr\s]/.test(evalExpr)) {
      throw new Error('Invalid characters');
    }

    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + evalExpr + ')')();

    if (!isFinite(result)) {
      sounds.error();
      updateDisplay('Error', displayedExpr + ' =');
      expression = '';
      return;
    }

    const rounded = parseFloat(result.toFixed(10));
    sounds.eq();
    updateDisplay(rounded, displayedExpr + ' =');
    addHistory(displayedExpr, rounded);
    expression     = String(rounded);
    justCalculated = true;

  } catch (_) {
    sounds.error();
    updateDisplay('Error', displayedExpr);
    expression = '';
  }
}

/* ── 7. History ──────────────────────────────────────── */
let calcHistory = JSON.parse(localStorage.getItem('calcHistory') || '[]');

/** Save history to localStorage. */
function saveHistory() {
  localStorage.setItem('calcHistory', JSON.stringify(calcHistory.slice(0, 50)));
}

/** Add an entry to history. */
function addHistory(expr, result) {
  calcHistory.unshift({ expr, result });
  saveHistory();
  renderHistory();
}

/** Render history list in the panel. */
function renderHistory() {
  if (calcHistory.length === 0) {
    historyList.innerHTML = '<li class="history-empty">No history yet.</li>';
    return;
  }
  historyList.innerHTML = calcHistory.map((item, i) => `
    <li class="history-item" data-index="${i}">
      <div class="hist-expr">${item.expr}</div>
      <div class="hist-result">= ${item.result}</div>
    </li>
  `).join('');

  // Click to reuse
  historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx  = parseInt(el.dataset.index, 10);
      expression = String(calcHistory[idx].result);
      justCalculated = false;
      updateDisplay(expression, '');
      sounds.num();
    });
  });
}

// Render on load
renderHistory();

// Toggle history panel
historyToggleBtn.addEventListener('click', () => {
  historyPanel.classList.toggle('hidden');
  sounds.num();
});

// Clear history
document.getElementById('clearHistory').addEventListener('click', () => {
  calcHistory = [];
  saveHistory();
  renderHistory();
  sounds.clear();
});

/* ── 8. Copy result ──────────────────────────────────── */
document.getElementById('copyBtn').addEventListener('click', () => {
  const val = resultEl.textContent;
  if (!val || val === 'Error') return;
  navigator.clipboard.writeText(val).then(() => {
    copyMsg.classList.remove('hidden');
    sounds.num();
    setTimeout(() => copyMsg.classList.add('hidden'), 1500);
  });
});

/* ── 9. Voice input ──────────────────────────────────── */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * Convert spoken words to a math expression string.
 * Handles: "five plus ten", "square root of sixteen", etc.
 */
function speechToMath(text) {
  const words = {
    'zero':'0','one':'1','two':'2','three':'3','four':'4',
    'five':'5','six':'6','seven':'7','eight':'8','nine':'9','ten':'10',
    'eleven':'11','twelve':'12','thirteen':'13','fourteen':'14','fifteen':'15',
    'sixteen':'16','seventeen':'17','eighteen':'18','nineteen':'19','twenty':'20',
    'thirty':'30','forty':'40','fifty':'50','sixty':'60','seventy':'70',
    'eighty':'80','ninety':'90','hundred':'100',
    'plus':'+','add':'+','added':'+',
    'minus':'-','subtract':'-','subtracted':'-',
    'times':'*','multiplied':'*','multiply':'*','into':'*',
    'divided':'/','divide':'/','by':'/',
    'point':'.','dot':'.',
    'pi':'Math.PI',
    'percent':'%',
    'power':'^','raised':'^',
  };

  let t = text.toLowerCase().trim();

  // Handle "square root of X"
  t = t.replace(/square root of (\w+)/g, (_, n) => `sqrt(${words[n] || n})`);
  t = t.replace(/square root/g, 'sqrt(');

  // Handle "sin/cos/tan of X"
  ['sin','cos','tan','log'].forEach(fn => {
    t = t.replace(new RegExp(`${fn} of (\\w+)`, 'g'), (_, n) => `${fn}(${words[n] || n})`);
    t = t.replace(new RegExp(`${fn}\\s+(\\w+)`, 'g'), (_, n) => `${fn}(${words[n] || n})`);
  });

  // Replace word numbers and operators
  t = t.split(/\s+/).map(w => words[w] !== undefined ? words[w] : w).join('');

  return t;
}

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang        = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  voiceBtn.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
      return;
    }
    recognition.start();
  });

  recognition.addEventListener('start', () => {
    isListening = true;
    voiceBtn.classList.add('listening');
    voiceBtn.textContent = '🔴 Listening...';
    voiceStatus.classList.remove('hidden');
  });

  recognition.addEventListener('end', () => {
    isListening = false;
    voiceBtn.classList.remove('listening');
    voiceBtn.textContent = '🎤 Voice';
    voiceStatus.classList.add('hidden');
  });

  recognition.addEventListener('result', (e) => {
    const spoken = e.results[0][0].transcript;
    const math   = speechToMath(spoken);
    expression     = math;
    justCalculated = false;
    updateDisplay(prettyExpr(expression), `"${spoken}"`);
    sounds.num();
  });

  recognition.addEventListener('error', () => {
    sounds.error();
    voiceStatus.classList.add('hidden');
  });

} else {
  // Hide voice button if API not supported
  voiceBtn.style.display = 'none';
}

/* ── Sound toggle ────────────────────────────────────── */
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
});

/* ── 10. Event listeners ─────────────────────────────── */

// Number & scientific buttons via data-val
document.querySelectorAll('.btn[data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.val;
    // Choose sound type
    if (['+','-','*','/','%','^','(',')'].includes(val)) sounds.op();
    else sounds.num();
    appendValue(val);
  });
});

// Clear
document.getElementById('clearBtn').addEventListener('click', clearDisplay);

// Delete
document.getElementById('delBtn').addEventListener('click', deleteLast);

// Equals
document.getElementById('equalsBtn').addEventListener('click', calculate);

// Keyboard support
document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') { sounds.num(); appendValue(e.key); }
  else if (e.key === '+') { sounds.op(); appendValue('+'); }
  else if (e.key === '-') { sounds.op(); appendValue('-'); }
  else if (e.key === '*') { sounds.op(); appendValue('*'); }
  else if (e.key === '/') { e.preventDefault(); sounds.op(); appendValue('/'); }
  else if (e.key === '%') { sounds.op(); appendValue('%'); }
  else if (e.key === '^') { sounds.op(); appendValue('^'); }
  else if (e.key === '(') { sounds.op(); appendValue('('); }
  else if (e.key === ')') { sounds.op(); appendValue(')'); }
  else if (e.key === '.') { sounds.num(); appendValue('.'); }
  else if (e.key === 'Enter' || e.key === '=') calculate();
  else if (e.key === 'Backspace') deleteLast();
  else if (e.key === 'Escape') clearDisplay();
});