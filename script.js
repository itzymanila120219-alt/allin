"use strict";

const CARD_FACES = [
  { pair: "chaeryeong-1", member: "CHAERYEONG", src: "assets/chaeryeong-1.png", label: "Chaeryeong card one" },
  { pair: "chaeryeong-2", member: "CHAERYEONG", src: "assets/chaeryeong-2.png", label: "Chaeryeong card two" },
  { pair: "lia-1", member: "LIA", src: "assets/lia-1.png", label: "Lia card one" },
  { pair: "lia-2", member: "LIA", src: "assets/lia-2.png", label: "Lia card two" },
  { pair: "ryujin-1", member: "RYUJIN", src: "assets/ryujin-1.png", label: "Ryujin card one" },
  { pair: "ryujin-2", member: "RYUJIN", src: "assets/ryujin-2.png", label: "Ryujin card two" },
  { pair: "yeji-1", member: "YEJI", src: "assets/yeji-1.png", label: "Yeji card one" },
  { pair: "yeji-2", member: "YEJI", src: "assets/yeji-2.png", label: "Yeji card two" },
  { pair: "yuna-1", member: "YUNA", src: "assets/yuna-1.png", label: "Yuna card one" },
  { pair: "yuna-2", member: "YUNA", src: "assets/yuna-2.png", label: "Yuna card two" }
];

const BACKS = ["assets/back-1.png", "assets/back-2.png"];
const TOTAL_PAIRS = CARD_FACES.length;
const BEST_SCORE_KEY = "all-in-memory-best-v2";
const LEGACY_BEST_SCORE_KEY = "all-in-memory-best-v1";
const DEFAULT_INSTRUCTION = "Flip two cards. Match every identical portrait to clear the deck.";

const board = document.querySelector("#gameBoard");
const instruction = document.querySelector("#gameInstruction");
const movesValue = document.querySelector("#movesValue");
const pairsValue = document.querySelector("#pairsValue");
const timeValue = document.querySelector("#timeValue");
const bestValue = document.querySelector("#bestValue");
const restartButton = document.querySelector("#restartButton");
const winModal = document.querySelector("#winModal");
const winCard = document.querySelector("#winCard");
const modalKicker = document.querySelector("#modalKicker");
const winSummary = document.querySelector("#winSummary");
const finalTime = document.querySelector("#finalTime");
const finalMoves = document.querySelector("#finalMoves");
const finalAccuracy = document.querySelector("#finalAccuracy");
const playAgainButton = document.querySelector("#playAgainButton");
const confettiLayer = document.querySelector("#confettiLayer");
const matchSpotlight = document.querySelector("#matchSpotlight");
const spotlightImage = document.querySelector("#spotlightImage");
const spotlightName = document.querySelector("#spotlightName");
const spotlightStreak = document.querySelector("#spotlightStreak");

let firstCard = null;
let secondCard = null;
let boardLocked = true;
let moves = 0;
let matchedPairs = 0;
let matchStreak = 0;
let elapsedSeconds = 0;
let timerId = null;
let gameStarted = false;
let audioContext = null;
let mismatchTimeout = null;
let openingRevealTimeouts = [];
let openingRevealShown = false;
let spotlightHideTimer = null;
let spotlightEndTimer = null;
let spotlightResolve = null;
let gameVersion = 0;

function shuffle(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function makeDeck() {
  const duplicatedFaces = CARD_FACES.flatMap((card) => [
    { ...card, uid: `${card.pair}-a` },
    { ...card, uid: `${card.pair}-b` }
  ]);

  const balancedBacks = shuffle([
    ...Array(duplicatedFaces.length / 2).fill(BACKS[0]),
    ...Array(duplicatedFaces.length / 2).fill(BACKS[1])
  ]);

  return shuffle(duplicatedFaces).map((card, index) => ({
    ...card,
    back: balancedBacks[index]
  }));
}

function createCardElement(card, index) {
  const button = document.createElement("button");
  button.className = "memory-card";
  button.type = "button";
  button.dataset.pair = card.pair;
  button.dataset.uid = card.uid;
  button.dataset.member = card.member;
  button.dataset.src = card.src;
  button.setAttribute("aria-label", `Hidden card ${index + 1}`);
  button.setAttribute("aria-pressed", "false");

  button.innerHTML = `
    <span class="card-inner">
      <span class="card-face card-back">
        <img src="${card.back}" alt="" draggable="false" />
      </span>
      <span class="card-face card-front">
        <img src="${card.src}" alt="${card.label}" draggable="false" />
      </span>
    </span>
  `;

  button.addEventListener("click", handleCardClick);
  return button;
}

function renderDeck(showOpeningReveal = false) {
  board.replaceChildren();
  const fragment = document.createDocumentFragment();
  makeDeck().forEach((card, index) => fragment.append(createCardElement(card, index)));
  board.append(fragment);

  if (showOpeningReveal) {
    startOpeningReveal();
  } else {
    boardLocked = false;
    instruction.textContent = DEFAULT_INSTRUCTION;
  }
}

function clearOpeningReveal() {
  openingRevealTimeouts.forEach((timeout) => window.clearTimeout(timeout));
  openingRevealTimeouts = [];
  board.classList.remove("is-previewing");
}

function startOpeningReveal() {
  openingRevealShown = true;
  boardLocked = true;
  board.classList.add("is-previewing");
  instruction.textContent = "Memorise the deck...";
  const cards = [...board.children];

  openingRevealTimeouts.push(window.setTimeout(() => {
    cards.forEach((card) => card.classList.add("is-flipped", "is-preview"));
  }, 380));

  openingRevealTimeouts.push(window.setTimeout(() => {
    cards.forEach((card) => card.classList.remove("is-flipped", "is-preview"));
  }, 950));

  openingRevealTimeouts.push(window.setTimeout(() => {
    board.classList.remove("is-previewing");
    instruction.textContent = DEFAULT_INSTRUCTION;
    boardLocked = false;
    openingRevealTimeouts = [];
  }, 2250));
}

function handleCardClick(event) {
  const card = event.currentTarget;

  if (
    boardLocked ||
    card === firstCard ||
    card.classList.contains("is-flipped") ||
    card.classList.contains("is-matched")
  ) {
    return;
  }

  if (!gameStarted) startTimer();

  revealCard(card);
  playTone("flip");
  playHaptic("flip");

  if (!firstCard) {
    firstCard = card;
    return;
  }

  secondCard = card;
  moves += 1;
  movesValue.textContent = String(moves);
  boardLocked = true;

  const isMatch = firstCard.dataset.pair === secondCard.dataset.pair;
  if (isMatch) handleMatch();
  else handleMismatch();
}

function revealCard(card) {
  card.classList.add("is-flipped");
  card.setAttribute("aria-pressed", "true");
  card.setAttribute("aria-label", card.querySelector(".card-front img").alt);
}

function hideCard(card, position) {
  card.classList.remove("is-flipped", "is-wrong");
  card.setAttribute("aria-pressed", "false");
  card.setAttribute("aria-label", `Hidden card ${position + 1}`);
}

async function handleMatch() {
  const version = gameVersion;
  const matchedCards = [firstCard, secondCard];
  const featuredCard = firstCard;

  await delay(420);
  if (version !== gameVersion) return;

  matchedCards.forEach((card) => {
    card.classList.add("is-matched");
    card.disabled = true;
  });

  matchedPairs += 1;
  matchStreak += 1;
  pairsValue.textContent = String(matchedPairs);
  playTone(matchStreak >= 2 ? "streak" : "match");
  playHaptic(matchStreak >= 2 ? "streak" : "match");

 stopTimer();

await showMatchSpotlight(featuredCard, matchStreak);
if (version !== gameVersion) return;

if (matchedPairs !== TOTAL_PAIRS) {
  startTimer();
}

resetTurn();
  if (matchedPairs === TOTAL_PAIRS) finishGame();
}

function handleMismatch() {
  matchStreak = 0;
  firstCard.classList.add("is-wrong");
  secondCard.classList.add("is-wrong");

  const cards = [firstCard, secondCard];
  mismatchTimeout = window.setTimeout(() => {
    cards.forEach((card) => {
      const position = [...board.children].indexOf(card);
      hideCard(card, position);
    });
    playTone("miss");
    playHaptic("miss");
    resetTurn();
  }, 920);
}

function showMatchSpotlight(card, streak) {
  hideSpotlightImmediately();

  spotlightImage.src = card.dataset.src;
  spotlightImage.alt = `${card.dataset.member} matched card`;
  spotlightName.textContent = card.dataset.member;

  if (streak >= 2) {
    spotlightStreak.textContent = `${streak} MATCH STREAK`;
    spotlightStreak.hidden = false;
  } else {
    spotlightStreak.textContent = "";
    spotlightStreak.hidden = true;
  }

  matchSpotlight.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => matchSpotlight.classList.add("is-visible"));
  });

  return new Promise((resolve) => {
    spotlightResolve = resolve;

    spotlightHideTimer = window.setTimeout(() => {
      matchSpotlight.classList.remove("is-visible");
    }, 1000);

    spotlightEndTimer = window.setTimeout(() => {
      matchSpotlight.hidden = true;
      spotlightHideTimer = null;
      spotlightEndTimer = null;
      spotlightResolve = null;
      resolve();
    }, 1240);
  });
}

function hideSpotlightImmediately() {
  if (spotlightHideTimer) window.clearTimeout(spotlightHideTimer);
  if (spotlightEndTimer) window.clearTimeout(spotlightEndTimer);
  spotlightHideTimer = null;
  spotlightEndTimer = null;
  matchSpotlight.classList.remove("is-visible");
  matchSpotlight.hidden = true;

  if (spotlightResolve) {
    const resolve = spotlightResolve;
    spotlightResolve = null;
    resolve();
  }
}

function resetTurn() {
  firstCard = null;
  secondCard = null;
  boardLocked = false;
  mismatchTimeout = null;
}

function startTimer() {
  gameStarted = true;

  if (timerId) return;

  timerId = window.setInterval(() => {
    elapsedSeconds += 1;
    timeValue.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  if (timerId) window.clearInterval(timerId);
  timerId = null;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getBestScore() {
  try {
    const currentRaw = localStorage.getItem(BEST_SCORE_KEY);
    if (currentRaw) {
      const current = JSON.parse(currentRaw);
      if (Number.isFinite(current.bestTime) && Number.isFinite(current.bestMoves)) return current;
    }

    const legacyRaw = localStorage.getItem(LEGACY_BEST_SCORE_KEY);
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw);
    if (!Number.isFinite(legacy.time) || !Number.isFinite(legacy.moves)) return null;
    return { bestTime: legacy.time, bestMoves: legacy.moves };
  } catch {
    return null;
  }
}

function saveBestScore() {
  const previous = getBestScore();
  const isNewBestTime = !previous || elapsedSeconds < previous.bestTime;
  const isNewBestMoves = !previous || moves < previous.bestMoves;
  const updated = {
    bestTime: previous ? Math.min(previous.bestTime, elapsedSeconds) : elapsedSeconds,
    bestMoves: previous ? Math.min(previous.bestMoves, moves) : moves
  };

  try {
    localStorage.setItem(BEST_SCORE_KEY, JSON.stringify(updated));
  } catch {
    // The game still works if storage is blocked.
  }

  updateBestDisplay();
  return { isNewBestTime, isNewBestMoves };
}

function updateBestDisplay() {
  const best = getBestScore();
  bestValue.textContent = best ? formatTime(best.bestTime) : "--";
  bestValue.title = best ? `Fewest moves: ${best.bestMoves}` : "No completed games yet";
}

function getAccuracy() {
  if (moves === 0) return 100;
  return Math.round((TOTAL_PAIRS / moves) * 100);
}

function finishGame() {
  stopTimer();
  boardLocked = true;
  const bestResult = saveBestScore();
  const isNewBest = bestResult.isNewBestTime || bestResult.isNewBestMoves;

  window.setTimeout(() => {
    finalTime.textContent = formatTime(elapsedSeconds);
    finalMoves.textContent = String(moves);
    finalAccuracy.textContent = `${getAccuracy()}%`;

    winCard.classList.toggle("is-new-best", isNewBest);
    modalKicker.textContent = isNewBest ? "NEW BEST" : "DECK CLEARED";

    if (bestResult.isNewBestTime && bestResult.isNewBestMoves) {
      winSummary.textContent = "Fastest time and fewest moves. You cleared both records.";
    } else if (bestResult.isNewBestTime) {
      winSummary.textContent = "Your fastest clear yet. Every second counted.";
    } else if (bestResult.isNewBestMoves) {
      winSummary.textContent = "Your fewest moves yet. Sharp memory, clean sweep.";
    } else {
      winSummary.textContent = "All 10 pairs matched. The deck is yours.";
    }

    winModal.hidden = false;
    document.body.classList.add("modal-open");
    playTone(isNewBest ? "best" : "win");
    playHaptic(isNewBest ? "best" : "win");
    launchConfetti(isNewBest ? 110 : 75);
    playAgainButton.focus();
  }, 420);
}

function resetGame() {
  gameVersion += 1;
  stopTimer();
  clearOpeningReveal();
  hideSpotlightImmediately();
  if (mismatchTimeout) window.clearTimeout(mismatchTimeout);

  firstCard = null;
  secondCard = null;
  boardLocked = true;
  moves = 0;
  matchedPairs = 0;
  matchStreak = 0;
  elapsedSeconds = 0;
  gameStarted = false;
  mismatchTimeout = null;

  movesValue.textContent = "0";
  pairsValue.textContent = "0";
  timeValue.textContent = "00:00";
  winModal.hidden = true;
  winCard.classList.remove("is-new-best");
  document.body.classList.remove("modal-open");
  confettiLayer.replaceChildren();
  renderDeck(false);
}

function closeModal() {
  winModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioContext = new AudioContextClass();
  }
  if (audioContext?.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(type) {
  const context = ensureAudioContext();
  if (!context) return;

  const notes = {
    flip: [{ frequency: 320, duration: 0.045, volume: 0.022 }],
    match: [
      { frequency: 523.25, duration: 0.09, volume: 0.034 },
      { frequency: 659.25, duration: 0.12, volume: 0.03, delay: 0.07 }
    ],
    streak: [
      { frequency: 587.33, duration: 0.08, volume: 0.034 },
      { frequency: 739.99, duration: 0.1, volume: 0.033, delay: 0.06 },
      { frequency: 880, duration: 0.13, volume: 0.032, delay: 0.13 }
    ],
    miss: [{ frequency: 170, duration: 0.11, volume: 0.024 }],
    win: [
      { frequency: 523.25, duration: 0.13, volume: 0.035 },
      { frequency: 659.25, duration: 0.13, volume: 0.035, delay: 0.1 },
      { frequency: 783.99, duration: 0.2, volume: 0.04, delay: 0.2 }
    ],
    best: [
      { frequency: 523.25, duration: 0.12, volume: 0.038 },
      { frequency: 659.25, duration: 0.12, volume: 0.038, delay: 0.08 },
      { frequency: 783.99, duration: 0.14, volume: 0.04, delay: 0.16 },
      { frequency: 1046.5, duration: 0.28, volume: 0.043, delay: 0.27 }
    ]
  };

  (notes[type] || []).forEach(({ frequency, duration, volume, delay: noteDelay = 0 }) => {
    const start = context.currentTime + noteDelay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  });
}

function playHaptic(type) {
  if (typeof navigator.vibrate !== "function") return;

  const patterns = {
    flip: 12,
    match: [32, 38, 58],
    streak: [28, 28, 42, 28, 72],
    miss: [18, 32, 18],
    win: [55, 45, 70, 45, 110],
    best: [48, 35, 62, 35, 82, 35, 130]
  };

  navigator.vibrate(patterns[type] || 0);
}

function launchConfetti(pieceCount = 75) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const colors = ["#ff3d46", "#17242b", "#ffffff", "#f4b6b8"];
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < pieceCount; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty("--fall-duration", `${2.6 + Math.random() * 2.2}s`);
    piece.style.setProperty("--fall-delay", `${Math.random() * 0.8}s`);
    piece.style.setProperty("--drift", `${-110 + Math.random() * 220}px`);
    piece.style.setProperty("--spin", `${360 + Math.random() * 720}deg`);
    piece.style.transform = `rotate(${Math.random() * 180}deg)`;
    fragment.append(piece);
  }

  confettiLayer.append(fragment);
  window.setTimeout(() => confettiLayer.replaceChildren(), 6000);
}

restartButton.addEventListener("click", resetGame);
playAgainButton.addEventListener("click", resetGame);

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", closeModal);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !winModal.hidden) closeModal();
});

updateBestDisplay();
renderDeck(!openingRevealShown);
