// ── Symbole & Auszahlungen ───────────────────────────
const SYMBOLS  = ['🍒','🍋','🍇','🔔','💎','7️⃣'];
const WEIGHTS  = [18, 16, 12, 8, 4, 2];   // Summe = 60

const PAYOUTS = {
  '7️⃣': 50,
  '💎': 25,
  '🔔': 15,
  '🍇': 10,
  '🍋': 8,
  '🍒': 5
};

// ── State ────────────────────────────────────────────
let balance    = 100;
let bet        = 10;
let isSpinning = false;

// ── DOM ──────────────────────────────────────────────
const balanceEl  = document.getElementById('balance');
const betEl      = document.getElementById('bet');
const winningsEl = document.getElementById('winnings');
const msgBoard   = document.getElementById('message-board');
const msgText    = document.getElementById('message-text');
const spinBtn    = document.getElementById('spin-btn');
const betUpBtn   = document.getElementById('bet-up');
const betDownBtn = document.getElementById('bet-down');
const resetBtn   = document.getElementById('reset-btn');
const paylineEl  = document.getElementById('payline');

// Die einzelnen Symbol-Anzeige-Elemente (je 1 pro Walze)
const symbolEls = [
  document.getElementById('sym-0'),
  document.getElementById('sym-1'),
  document.getElementById('sym-2'),
];

// ── Gewichteter Zufalls-Symbol-Pick ──────────────────
function pickSymbol() {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= WEIGHTS[i];
    if (r <= 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

// ── Walze animieren: schnelles Durchblättern, dann stoppen ──
function spinReel(index, finalSymbol, stopAfterMs) {
  return new Promise(resolve => {
    const el = symbolEls[index];
    el.classList.add('spinning');

    // Während des Drehens: alle 80ms neues zufälliges Symbol zeigen
    const interval = setInterval(() => {
      el.textContent = pickSymbol();
    }, 80);

    // Nach stopAfterMs: Endwert setzen und Animation beenden
    setTimeout(() => {
      clearInterval(interval);
      el.textContent = finalSymbol;
      el.classList.remove('spinning');
      // Kurzes "Einrasten"-Feedback
      el.classList.add('land');
      setTimeout(() => el.classList.remove('land'), 300);
      resolve(finalSymbol);
    }, stopAfterMs);
  });
}

// ── Gewinn berechnen ──────────────────────────────────
function calcWin(results) {
  const [a, b, c] = results;

  if (a === '7️⃣' && b === '7️⃣' && c === '7️⃣')
    return { mult: PAYOUTS['7️⃣'], type: 'jackpot' };

  if (a === b && b === c)
    return { mult: PAYOUTS[a] || 5, type: 'three' };

  const cherries = results.filter(s => s === '🍒').length;
  if (cherries >= 2)
    return { mult: 2, type: 'two-cherry' };

  return { mult: 0, type: 'loss' };
}

// ── Münzregen ─────────────────────────────────────────
function coinRain(count = 20) {
  const coins = ['🪙','💰','⭐','✨'];
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const el   = document.createElement('div');
      el.classList.add('coin');
      el.textContent = coins[Math.floor(Math.random() * coins.length)];
      el.style.left  = Math.random() * 92 + 'vw';
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }, i * 70);
  }
}

// ── Nachricht setzen ──────────────────────────────────
function setMessage(text, type) {
  msgBoard.className = 'message-board' + (type ? ' ' + type : '');
  msgText.textContent = text;
}

// ── UI aktualisieren ──────────────────────────────────
function updateUI() {
  balanceEl.textContent  = balance;
  betEl.textContent      = bet;

  balanceEl.classList.toggle('low', balance > 0 && balance <= 20);

  spinBtn.disabled    = isSpinning || balance < bet;
  betUpBtn.disabled   = isSpinning || bet >= 50;
  betDownBtn.disabled = isSpinning || bet <= 5;
  resetBtn.disabled   = isSpinning;
}

// ── Spin ──────────────────────────────────────────────
async function spin() {
  if (isSpinning || balance < bet) return;

  isSpinning = true;
  paylineEl.classList.remove('active');
  symbolEls.forEach(el => el.classList.remove('winner'));

  // Einsatz abziehen
  balance -= bet;
  winningsEl.textContent = 0;
  updateUI();
  setMessage('Walzen drehen sich…');

  // Ergebnis vorher auswürfeln
  const results = [pickSymbol(), pickSymbol(), pickSymbol()];

  // Walzen gestaffelt stoppen (links zuerst)
  await Promise.all([
    spinReel(0, results[0], 900),
    spinReel(1, results[1], 1400),
    spinReel(2, results[2], 1900),
  ]);

  // Kurze Pause, damit man die Symbole sieht
  await new Promise(r => setTimeout(r, 200));

  // Gewinn auswerten
  const { mult, type } = calcWin(results);
  const win = Math.round(bet * mult);

  if (mult > 0) {
    balance += win;
    winningsEl.textContent = win;
    paylineEl.classList.add('active');

    if (type === 'jackpot') {
      symbolEls.forEach(el => el.classList.add('winner'));
      setMessage(`🎰 JACKPOT! +${win}€ 🎰`, 'jackpot');
      coinRain(40);
    } else if (type === 'three') {
      symbolEls.forEach(el => el.classList.add('winner'));
      setMessage(`⭐ Drei gleiche! +${win}€ gewonnen!`, 'win');
      coinRain(15);
    } else {
      results.forEach((s, i) => { if (s === '🍒') symbolEls[i].classList.add('winner'); });
      setMessage(`🍒 Zwei Kirschen! +${win}€ gewonnen!`, 'win');
    }

    setTimeout(() => {
      symbolEls.forEach(el => el.classList.remove('winner'));
      paylineEl.classList.remove('active');
    }, 3000);

  } else {
    setMessage('Kein Glück diesmal… Nochmal versuchen!', 'loss');
  }

  if (balance <= 0) {
    setMessage('💸 Kein Guthaben! Drück RESET.', 'loss');
  }

  isSpinning = false;
  updateUI();
}

// ── Events ────────────────────────────────────────────
spinBtn.addEventListener('click', spin);

betUpBtn.addEventListener('click', () => {
  if (bet < 50) { bet = Math.min(50, bet + 5); updateUI(); }
});

betDownBtn.addEventListener('click', () => {
  if (bet > 5)  { bet = Math.max(5,  bet - 5); updateUI(); }
});

resetBtn.addEventListener('click', () => {
  if (isSpinning) return;
  balance = 100; bet = 10;
  winningsEl.textContent = 0;
  symbolEls.forEach(el => el.classList.remove('winner'));
  paylineEl.classList.remove('active');
  setMessage('Neues Spiel — viel Glück!');
  updateUI();
});

document.addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.code === 'Enter') && !isSpinning) {
    e.preventDefault();
    spin();
  }
});

// ── Init ──────────────────────────────────────────────
updateUI();
