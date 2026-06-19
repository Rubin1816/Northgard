// ── Symbols & Weights ────────────────────────────────
const SYMBOLS = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣'];

// Higher weight = more common; weights sum to 60
const WEIGHTS = [18, 16, 12, 8, 4, 2];

// Win multipliers for 3-of-a-kind
const PAYOUTS = {
  '7️⃣': 50,
  '💎': 25,
  '🔔': 15,
  '🍇': 10,
  '🍋': 8,
  '🍒': 5
};

// ── State ────────────────────────────────────────────
let balance   = 100;
let bet       = 10;
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
const payline    = document.getElementById('payline');

const strips  = [
  document.getElementById('strip-0'),
  document.getElementById('strip-1'),
  document.getElementById('strip-2'),
];
const reels = [
  document.getElementById('reel-0'),
  document.getElementById('reel-1'),
  document.getElementById('reel-2'),
];

// ── Weighted random symbol ────────────────────────────
function pickSymbol() {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < SYMBOLS.length; i++) {
    rand -= WEIGHTS[i];
    if (rand <= 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

// ── Build a reel strip with many symbols ─────────────
function buildStrip(finalSymbol) {
  // Create a long list of random symbols ending with the final result
  const count = 24; // fake symbols to scroll through
  const list  = [];
  for (let i = 0; i < count; i++) list.push(pickSymbol());
  list.push(finalSymbol); // guaranteed last
  return list;
}

// ── Spin one reel with animation ─────────────────────
function spinReel(reelIndex, finalSymbol, spinDuration) {
  return new Promise(resolve => {
    const strip      = strips[reelIndex];
    const reelEl     = reels[reelIndex];
    const symbolH    = strip.parentElement.clientHeight; // 72px
    const symbols    = buildStrip(finalSymbol);

    // Populate strip with all symbols
    strip.innerHTML = symbols.map(s => `<div class="symbol">${s}</div>`).join('');

    // Set initial position to the top
    strip.style.transition = 'none';
    strip.style.transform  = 'translateY(0)';

    reelEl.classList.add('spinning');

    // Calculate total scroll distance (stop at last symbol)
    const totalDist = (symbols.length - 1) * symbolH;

    // Small delay so the initial state renders
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        strip.style.transition = `transform ${spinDuration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
        strip.style.transform  = `translateY(-${totalDist}px)`;

        setTimeout(() => {
          reelEl.classList.remove('spinning');
          resolve(finalSymbol);
        }, spinDuration);
      });
    });
  });
}

// ── Calculate win ─────────────────────────────────────
function calcWin(results) {
  const [a, b, c] = results;

  // Jackpot: three 7s
  if (a === '7️⃣' && b === '7️⃣' && c === '7️⃣') {
    return { mult: PAYOUTS['7️⃣'], type: 'jackpot' };
  }

  // Three of a kind
  if (a === b && b === c) {
    return { mult: PAYOUTS[a] || 5, type: 'three' };
  }

  // Two cherries (any position)
  const cherryCount = results.filter(s => s === '🍒').length;
  if (cherryCount >= 2) {
    return { mult: 2, type: 'two-cherry' };
  }

  return { mult: 0, type: 'loss' };
}

// ── Coin rain ─────────────────────────────────────────
function coinRain(count = 20) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const coin  = document.createElement('div');
      coin.classList.add('coin');
      coin.textContent = ['🪙', '💰', '⭐', '✨'][Math.floor(Math.random() * 4)];
      coin.style.left  = `${Math.random() * 95}vw`;
      coin.style.top   = '-30px';
      document.body.appendChild(coin);
      coin.addEventListener('animationend', () => coin.remove());
    }, i * 60);
  }
}

// ── Set message ───────────────────────────────────────
function setMessage(text, type = '') {
  msgBoard.className = 'message-board';
  if (type) msgBoard.classList.add(type);
  msgText.textContent = text;
}

// ── Update UI ─────────────────────────────────────────
function updateUI() {
  balanceEl.textContent  = balance;
  betEl.textContent      = bet;

  // Low balance warning
  balanceEl.classList.toggle('low', balance <= 20 && balance > 0);

  // Disable buttons
  spinBtn.disabled    = isSpinning || balance < bet;
  betUpBtn.disabled   = isSpinning || bet >= 50;
  betDownBtn.disabled = isSpinning || bet <= 5;
  resetBtn.disabled   = isSpinning;
}

// ── Main Spin ─────────────────────────────────────────
async function spin() {
  if (isSpinning || balance < bet) return;

  isSpinning = true;
  payline.classList.remove('active');

  // Deduct bet
  balance -= bet;
  winningsEl.textContent = 0;
  updateUI();
  setMessage('Walzen drehen sich…');

  // Pick final results
  const results = [pickSymbol(), pickSymbol(), pickSymbol()];

  // Staggered spin durations (left → right)
  const durations = [900, 1300, 1700];

  // Launch all three reels concurrently
  await Promise.all(
    results.map((sym, i) => spinReel(i, sym, durations[i]))
  );

  // Evaluate
  const { mult, type } = calcWin(results);
  const winAmount = Math.round(bet * mult);

  if (mult > 0) {
    balance += winAmount;
    winningsEl.textContent = winAmount;

    // Highlight winning reels
    if (type === 'three' || type === 'jackpot') {
      reels.forEach(r => r.classList.add('winner'));
    } else if (type === 'two-cherry') {
      results.forEach((s, i) => {
        if (s === '🍒') reels[i].classList.add('winner');
      });
    }

    payline.classList.add('active');

    if (type === 'jackpot') {
      setMessage(`🎰 JACKPOT! Du gewinnst ${winAmount}€! 🎰`, 'jackpot');
      coinRain(35);
    } else if (type === 'three') {
      setMessage(`⭐ Drei gleiche! +${winAmount}€ gewonnen! ⭐`, 'win');
      coinRain(12);
    } else {
      setMessage(`🍒 Zwei Kirschen! +${winAmount}€ gewonnen!`, 'win');
    }

    // Remove winner class after animation
    setTimeout(() => {
      reels.forEach(r => r.classList.remove('winner'));
      payline.classList.remove('active');
    }, 3000);

  } else {
    setMessage(`Kein Glück… Versuch es nochmal!`, 'loss');
    // Quick reel shake
    reels.forEach((r, i) => {
      setTimeout(() => {
        r.style.animation = 'none';
        r.style.transform = 'translateX(-4px)';
        setTimeout(() => {
          r.style.transform = 'translateX(4px)';
          setTimeout(() => { r.style.transform = ''; }, 80);
        }, 80);
      }, i * 80);
    });
  }

  // Game over?
  if (balance <= 0) {
    setMessage('💸 Kein Guthaben mehr! Drück RESET.', 'loss');
    spinBtn.disabled = true;
  }

  isSpinning = false;
  updateUI();
}

// ── Bet controls ──────────────────────────────────────
betUpBtn.addEventListener('click', () => {
  if (bet < 50) {
    bet = Math.min(50, bet + 5);
    updateUI();
  }
});

betDownBtn.addEventListener('click', () => {
  if (bet > 5) {
    bet = Math.max(5, bet - 5);
    updateUI();
  }
});

// ── Spin button ───────────────────────────────────────
spinBtn.addEventListener('click', spin);

// ── Keyboard: SPACE or ENTER to spin ─────────────────
document.addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.code === 'Enter') && !isSpinning) {
    e.preventDefault();
    spin();
  }
});

// ── Reset ─────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  if (isSpinning) return;
  balance = 100;
  bet     = 10;
  winningsEl.textContent = 0;
  reels.forEach(r => r.classList.remove('winner'));
  payline.classList.remove('active');
  setMessage('Neues Spiel — viel Glück!');
  updateUI();
});

// ── Init ──────────────────────────────────────────────
updateUI();
