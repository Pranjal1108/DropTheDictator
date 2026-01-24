// Production build notes

// RGS Configuration

// Monetary precision setup
const MONETARY_PRECISION = 1000000;

function toRGSAmount(displayAmount) {
    return Math.round(displayAmount * MONETARY_PRECISION);
}

function fromRGSAmount(rgsAmount) {
    return rgsAmount / MONETARY_PRECISION;
}

// State Management

const GameState = {
    INITIALIZING: 'initializing',
    AUTHENTICATING: 'authenticating',
    READY: 'ready',
    PLACING_BET: 'placing_bet',
    ANIMATING: 'animating',
    ENDING_ROUND: 'ending_round',
    RECOVERING: 'recovering',
    ERROR: 'error'
};

const gameSession = {
    state: GameState.INITIALIZING,
    sessionToken: null,
    playerId: null,
    
    // From RGS only
    balance: 0,
    minBet: 0,
    maxBet: 0,
    stepBet: 0,
    
    currentRound: null,
    isAuthenticated: false,
    hasUnfinishedRound: false,
    
    lastError: null,
    retryCount: 0,
    maxRetries: 3
};

// Dual earnings system

let visualEarnings = 0;  // For display/animation only
let realEarnings = 0;    // For payout calculation only

// Sync earnings safely
function syncEarnings() {
    const target = getTargetPayout();
    realEarnings = Math.min(visualEarnings, target);
}

// Get safe payout earnings
function getPayoutEarnings() {
    syncEarnings();
    return realEarnings;
}

// RGS API Client

const RGS_API = {
    baseUrl: 'https://your-game.stake.games/api',  // Set during deployment
    
    async authenticate() {
        const response = await fetch(`${this.baseUrl}/wallet/authenticate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getInitialToken()}`
            },
            body: JSON.stringify({
                gameId: 'your-game-id',
                timestamp: Date.now()
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new RGSError('AUTH_FAILED', error.message || 'Authentication failed', response.status);
        }
        
        const data = await response.json();
        
        return {
            sessionToken: data.session_token,
            playerId: data.player_id,
            balance: data.balance,
            currency: data.currency,
            minBet: data.min_bet,
            maxBet: data.max_bet,
            stepBet: data.step_bet,
            unfinishedRound: data.unfinished_round
        };
    },
    
    async play(bet, mode = 'normal') {
        if (!gameSession.sessionToken) {
            throw new RGSError('NO_SESSION', 'Not authenticated', 0);
        }
        
        const response = await fetch(`${this.baseUrl}/play`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${gameSession.sessionToken}`
            },
            body: JSON.stringify({
                sessionID: gameSession.sessionToken,
                bet: bet,
                mode: mode
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            
            if (response.status === 401) {
                throw new RGSError('SESSION_EXPIRED', 'Session expired', 401);
            }
            if (response.status === 400) {
                if (error.code === 'INSUFFICIENT_BALANCE') {
                    throw new RGSError('INSUFFICIENT_BALANCE', 'Insufficient balance', 400);
                }
                if (error.code === 'INVALID_BET') {
                    throw new RGSError('INVALID_BET', 'Invalid bet amount', 400);
                }
            }
            
            throw new RGSError('PLAY_FAILED', error.message || 'Failed to place bet', response.status);
        }
        
        const data = await response.json();
        
        return {
            roundId: data.round_id,
            simulationId: data.simulation_id,
            bet: data.bet,
            payout_multiplier: data.payout_multiplier,
            bonus_allowed: data.bonus_allowed,
            max_multiplier: data.max_multiplier,
            balance: data.balance
        };
    },
    
    async endRound(roundId, simulationId) {
        if (!gameSession.sessionToken) {
            throw new RGSError('NO_SESSION', 'Not authenticated', 0);
        }
        
        const response = await fetch(`${this.baseUrl}/endround`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${gameSession.sessionToken}`
            },
            body: JSON.stringify({
                sessionID: gameSession.sessionToken,
                round_id: roundId,
                simulation_id: simulationId
            })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            
            if (response.status === 401) {
                throw new RGSError('SESSION_EXPIRED', 'Session expired', 401);
            }
            if (response.status === 404) {
                throw new RGSError('ROUND_NOT_FOUND', 'Round not found', 404);
            }
            
            throw new RGSError('ENDROUND_FAILED', error.message || 'Failed to end round', response.status);
        }
        
        const data = await response.json();
        
        return {
            roundId: data.round_id,
            payout: data.payout,
            balance: data.balance,
            status: data.status
        };
    },
    
    getInitialToken() {
        return window.STAKE_INIT_TOKEN || '';
    }
};

// Error Handling

class RGSError extends Error {
    constructor(code, message, httpStatus) {
        super(message);
        this.name = 'RGSError';
        this.code = code;
        this.httpStatus = httpStatus;
    }
}

async function handleRGSError(error) {
    gameSession.lastError = error;
    
    switch (error.code) {
        case 'SESSION_EXPIRED':
        case 'AUTH_FAILED':
            gameSession.isAuthenticated = false;
            gameSession.sessionToken = null;
            showError('Session expired. Please refresh the page.');
            await attemptReauthentication();
            break;
            
        case 'NETWORK_ERROR':
            if (gameSession.retryCount < gameSession.maxRetries) {
                gameSession.retryCount++;
                showError(`Connection lost. Retrying... (${gameSession.retryCount}/${gameSession.maxRetries})`);
                await delay(1000 * gameSession.retryCount);
                return true;
            } else {
                showError('Connection failed. Please check your internet and refresh.');
            }
            break;
            
        case 'INSUFFICIENT_BALANCE':
            showError('Insufficient balance for this bet.');
            break;
            
        case 'INVALID_BET':
            showError('Invalid bet amount.');
            break;
            
        case 'ROUND_NOT_FOUND':
            gameSession.currentRound = null;
            await refreshBalance();
            break;
            
        default:
            showError('An error occurred. Please try again.');
    }
    
    gameSession.state = GameState.ERROR;
    unlockBetUI();
    return false;
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage') || createErrorElement();
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => errorEl.style.display = 'none', 5000);
}

function createErrorElement() {
    const el = document.createElement('div');
    el.id = 'errorMessage';
    el.style.cssText = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(200, 50, 50, 0.95); color: white; padding: 15px 30px; border-radius: 8px; font-size: 16px; z-index: 999999;`;
    document.body.appendChild(el);
    return el;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Round Data

// Calculate target payout
function createRoundData(response) {
    // Convert bet to display units FIRST, then multiply by payout
    // This avoids integer * float precision issues
    const betDisplay = fromRGSAmount(response.bet);
    const payoutMultiplier = response.payout_multiplier;
    const maxMultiplier = response.max_multiplier;
    const bonusAllowed = response.bonus_allowed;

    const targetPayout = betDisplay * payoutMultiplier;

    return {
        roundId: response.roundId,
        simulationId: response.simulationId,
        bet: response.bet,
        payoutMultiplier: payoutMultiplier,
        bonusAllowed: bonusAllowed,
        maxMultiplier: maxMultiplier,
        // 🔧 FIX #3: Store in display units to avoid precision mismatch
        targetPayout: targetPayout,
        status: 'active'
    };
}

// Progress-based steering

// Get target payout
function getTargetPayout() {
    if (!gameSession.currentRound) return 0;
    // targetPayout is already stored in display units
    return gameSession.currentRound.targetPayout;
}

function getMaxMultiplier() {
    if (!gameSession.currentRound) return 1;
    return gameSession.currentRound.maxMultiplier;
}

function isBonusAllowed() {
    if (!gameSession.currentRound) return false;
    return gameSession.currentRound.bonusAllowed;
}

// Calculate progress ratio
function getProgress() {
    const target = getTargetPayout();
    if (target <= 0) return 1;  // Loss = instant 100%
    return Math.min(visualEarnings / target, 1);
}

// Rate suppression system

// Penalty state management
let penaltyActive = false;
let penaltyEndTime = 0;
let penaltySuppressionFactor = 1.0;

function activatePenalty(duration, suppressionFactor) {
    penaltyActive = true;
    penaltyEndTime = performance.now() + duration;
    penaltySuppressionFactor = suppressionFactor;
}

function updatePenaltyState() {
    if (penaltyActive && performance.now() >= penaltyEndTime) {
        penaltyActive = false;
        penaltySuppressionFactor = 1.0;
    }
}

function getCurrentSuppressionFactor() {
    updatePenaltyState();
    return penaltyActive ? penaltySuppressionFactor : 1.0;
}

// Steering functions

// Collectible value multiplier
function getCollectibleValueMultiplier() {
    const progress = getProgress();
    
    // Deterministic thresholds - no randomness
    if (progress < 0.2) return 1.8;
    if (progress < 0.4) return 1.4;
    if (progress < 0.6) return 1.0;
    if (progress < 0.8) return 0.6;
    if (progress < 0.95) return 0.3;
    return 0.1;  // Almost at target
}

// Fall earnings rate
function getFallEarningsRate() {
    const progress = getProgress();
    const bet = gameSession.currentRound ? fromRGSAmount(gameSession.currentRound.bet) : 10;
    const baseRate = Math.sqrt(bet) * 0.00015;
    
    // Apply suppression from penalties
    const suppression = getCurrentSuppressionFactor();
    
    // Deterministic rate scaling based on progress thresholds
    let progressMultiplier;
    if (progress < 0.2) progressMultiplier = 2.0;
    else if (progress < 0.4) progressMultiplier = 1.5;
    else if (progress < 0.6) progressMultiplier = 1.0;
    else if (progress < 0.8) progressMultiplier = 0.5;
    else if (progress < 0.95) progressMultiplier = 0.2;
    else progressMultiplier = 0.05;
    
    return baseRate * progressMultiplier * suppression;
}

// Bonus zone check
function isBonusZoneActive() {
    const progress = getProgress();
    // Bonus zones only active when behind target AND backend allows
    return isBonusAllowed() && progress < 0.7;
}

// Force landing check
function shouldForceLanding() {
    const progress = getProgress();
    // Pure progress check - no physics dependency
    return progress >= 0.97 && fallStarted && !betResolved;
}

// Force bonus exit
function shouldForceBonusExit() {
    const progress = getProgress();
    // Exit bonus zone when we've reached target
    return progress >= 0.99;
}

// Safe multiplier application
function applySafeMultiplier(rawMult) {
    const maxMult = getMaxMultiplier();
    const cappedMult = Math.min(rawMult, maxMult);
    const target = getTargetPayout();
    
    const multiplied = visualEarnings * cappedMult;
    const safeValue = Math.min(multiplied, target);
    const actualMult = visualEarnings > 0 ? safeValue / visualEarnings : 1;
    
    visualEarnings = safeValue;
    syncEarnings();
    
    return actualMult;
}

// Get steering params
function getSteeringParams() {
    const progress = getProgress();
    
    return {
        frictionMult: progress > 0.9 ? 1.4 : 1.0,
        gravityMult: progress > 0.95 ? 1.2 : 1.0,
        bonusActive: isBonusZoneActive()
    };
}

// Game Initialization

async function initializeGame() {
    gameSession.state = GameState.AUTHENTICATING;
    showLoadingScreen('Connecting to server...');
    
    try {
        const authResult = await RGS_API.authenticate();
        
        gameSession.sessionToken = authResult.sessionToken;
        gameSession.playerId = authResult.playerId;
        gameSession.balance = authResult.balance;
        gameSession.minBet = authResult.minBet;
        gameSession.maxBet = authResult.maxBet;
        gameSession.stepBet = authResult.stepBet;
        gameSession.isAuthenticated = true;
        
        if (authResult.unfinishedRound) {
            gameSession.hasUnfinishedRound = true;
            await handleUnfinishedRound(authResult.unfinishedRound);
        } else {
            gameSession.state = GameState.READY;
        }
        
        updateBalanceUI();
        applyBetConstraints();
        hideLoadingScreen();
        unlockBetUI();
    } catch (error) {
        const shouldRetry = await handleRGSError(error);
        if (shouldRetry) {
            await initializeGame();
        } else {
            hideLoadingScreen();
            showFatalError('Failed to connect. Please refresh the page.');
        }
    }
}

async function handleUnfinishedRound(roundData) {
    gameSession.state = GameState.RECOVERING;
    showLoadingScreen('Recovering previous round...');
    
    gameSession.currentRound = createRoundData({
        roundId: roundData.round_id,
        simulationId: roundData.simulation_id,
        bet: roundData.bet,
        payoutMultiplier: roundData.payout_multiplier,
        bonusAllowed: roundData.bonus_allowed || false,
        maxMultiplier: roundData.max_multiplier || 1
    });
    
    try {
        const result = await RGS_API.endRound(
            gameSession.currentRound.roundId,
            gameSession.currentRound.simulationId
        );
        
        gameSession.balance = result.balance;
        gameSession.currentRound = null;
        gameSession.state = GameState.READY;
        
        showMessage(`Previous round recovered! Payout: ₹${fromRGSAmount(result.payout).toFixed(2)}`);
    } catch (error) {
        await handleRGSError(error);
    }
}

async function attemptReauthentication() {
    if (gameSession.retryCount >= gameSession.maxRetries) {
        showFatalError('Session cannot be restored. Please refresh.');
        return;
    }
    
    gameSession.retryCount++;
    await delay(1000);
    await initializeGame();
}

async function refreshBalance() {
    try {
        const authResult = await RGS_API.authenticate();
        gameSession.balance = authResult.balance;
        updateBalanceUI();
    } catch (error) {
        // Silent fail for balance refresh
    }
}

// Bet Placement

async function placeBet() {
    if (gameSession.state !== GameState.READY) return;
    
    const effectiveBet = bonusMode ? betAmount * 10 : betAmount;
    const betInRGS = toRGSAmount(effectiveBet);
    
    if (betInRGS < gameSession.minBet) {
        showError(`Minimum bet is ₹${fromRGSAmount(gameSession.minBet).toFixed(2)}`);
        return;
    }
    if (betInRGS > gameSession.maxBet) {
        showError(`Maximum bet is ₹${fromRGSAmount(gameSession.maxBet).toFixed(2)}`);
        return;
    }
    if (betInRGS > gameSession.balance) {
        showError('Insufficient balance');
        return;
    }
    
    gameSession.state = GameState.PLACING_BET;
    lockBetUI();
    betBtn.textContent = "Placing bet...";
    
    try {
        const response = await RGS_API.play(betInRGS, bonusMode ? 'bonus' : 'normal');
        
        gameSession.currentRound = createRoundData(response);
        gameSession.balance = response.balance;
        updateBalanceUI();
        gameSession.retryCount = 0;
        
        gameSession.state = GameState.ANIMATING;
        startGame();
    } catch (error) {
        const shouldRetry = await handleRGSError(error);
        if (shouldRetry && gameSession.state === GameState.PLACING_BET) {
            await placeBet();
        } else {
            betBtn.textContent = "Place Bet";
        }
    }
}

// Round Completion

async function completeRound() {
    // 🔧 FIX #4: Explicit round-finalization guard - protects against race conditions
    if (!gameSession.currentRound) return;
    if (gameSession.currentRound.status === 'completed') return;
    if (gameSession.state === GameState.ENDING_ROUND) return;
    
    // 🔧 FIX #4: Mark as completed immediately to prevent double-calls
    gameSession.currentRound.status = 'completed';
    gameSession.state = GameState.ENDING_ROUND;
    
    // Final sync to ensure realEarnings is correct
    syncEarnings();
    
    try {
        const result = await RGS_API.endRound(
            gameSession.currentRound.roundId,
            gameSession.currentRound.simulationId
        );
        
        // Balance comes from RGS only
        gameSession.balance = result.balance;
        const payoutDisplay = fromRGSAmount(result.payout);
        
        runOverEl.innerHTML = `RUN OVER<br>Total Winnings: ₹${payoutDisplay.toFixed(2)}`;
        runOverEl.style.display = "block";
        
        gameSession.currentRound = null;
        gameSession.state = GameState.READY;
        gameSession.retryCount = 0;
        
        updateBalanceUI();
        
        setTimeout(() => {
            runOverEl.style.display = "none";
            resetGameWorld();
            unlockBetUI();
        }, 3000);
    } catch (error) {
        // 🔧 FIX #4: Reset status on error so retry can work
        if (gameSession.currentRound) {
            gameSession.currentRound.status = 'active';
        }
        const shouldRetry = await handleRGSError(error);
        if (shouldRetry) {
            await completeRound();
        }
    }
}

// UI Helpers

function showLoadingScreen(message) {
    let el = document.getElementById('loadingScreen');
    if (!el) {
        el = document.createElement('div');
        el.id = 'loadingScreen';
        el.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); display: flex; justify-content: center; align-items: center; z-index: 999999; color: white; font-size: 24px;`;
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = 'flex';
}

function hideLoadingScreen() {
    const el = document.getElementById('loadingScreen');
    if (el) el.style.display = 'none';
}

function showFatalError(message) {
    const el = document.createElement('div');
    el.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(150, 30, 30, 0.98); color: white; padding: 40px; border-radius: 12px; text-align: center; z-index: 999999;`;
    el.innerHTML = `<h2>Error</h2><p>${message}</p>
        <button onclick="location.reload()" style="padding: 10px 30px; margin-top: 20px; cursor: pointer;">
            Refresh Page
        </button>`;
    document.body.appendChild(el);
}

function showMessage(message) {
    const el = document.createElement('div');
    el.style.cssText = `position: fixed; top: 100px; left: 50%; transform: translateX(-50%); background: rgba(50, 150, 50, 0.95); color: white; padding: 15px 30px; border-radius: 8px; z-index: 999999;`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function applyBetConstraints() {
    const minBet = fromRGSAmount(gameSession.minBet);
    const maxBet = fromRGSAmount(gameSession.maxBet);
    const stepBet = fromRGSAmount(gameSession.stepBet);
    
    betInput.min = minBet;
    betInput.max = maxBet;
    betInput.step = stepBet;
    
    if (betAmount < minBet) betAmount = minBet;
    if (betAmount > maxBet) betAmount = maxBet;
    
    updateBalanceUI();
}

// Intro Sequence

let introFinished = false;
const introVideo = document.getElementById("introVideo");
const pressAnyKey = document.getElementById("pressAnyKey");

function startIntro() {
    introVideo.style.display = "block";
    introVideo.play();
}

function onVideoEnd() {
    introVideo.style.display = "none";
    pressAnyKey.style.display = "block";
    document.addEventListener("keydown", onKeyPress);
}

async function onKeyPress() {
    pressAnyKey.style.display = "none";
    document.removeEventListener("keydown", onKeyPress);
    introFinished = true;
    
    await initializeGame();
    update();
}

introVideo.addEventListener("ended", onVideoEnd);
startIntro();

// Game Constants

const REUSE_DISTANCE = 1500;

const gameScale = document.getElementById("game-scale");
function scaleGame() {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1200);
    gameScale.style.setProperty('--game-scale', scale);
}
window.addEventListener("resize", scaleGame);
scaleGame();

const world = document.getElementById("world");
const player = document.getElementById("player");
const scoreEl = document.getElementById("score");
world.style.pointerEvents = "none";

const betInput = document.getElementById("betAmount");
const betBtn = document.getElementById("placeBet");
const plusBtn = document.getElementById("plus");
const minusBtn = document.getElementById("minus");
const balanceEl = document.getElementById("balance");
const ground = document.getElementById("ground");

let betAmount = 10;
let bonusMode = false;

const SCREEN_W = 1920;
const SCREEN_H = 1200;
const WORLDH = 20000;
world.style.height = WORLDH + "px";

const GROUND_HEIGHT = 700;
const GROUND_Y = WORLDH - GROUND_HEIGHT;
const DEADZONE = 1500;

ground.style.height = (GROUND_HEIGHT * 1.3) + "px";
ground.style.top = 18800 + "px";
ground.style.width = "16400px";
ground.style.backgroundSize = "8200px 130%";

const cloudquantity = 500;
const darkcloudquantity = 40;
const PRESET_SPAWN_COUNT = 600;

const BH_RADIUS = 100;
const BH_SIZE = 300;
const PLAYER_W = 160;
const PLAYER_H = 240;
const PLAYER_X = SCREEN_W / 2;
const PLAYER_Y = SCREEN_H / 2;

let camX = 0, camY = 0;
let velX = 0, velY = 0;
let angle = 0, angVel = 0;
let angleAccumulator = 0;

let fallStarted = false;
let betPlaced = false;
let betResolved = false;

const GRAVITY = 0.55;
const MAX_FALL = 30;
const AIR_FRICTION = 0.95;
const GROUND_FRICTION = 0.2;

const TANK_COUNT = 8;
const CAMP_COUNT = 5;
const VISIBILITY_BUFFER = 2200;

const tanks = [];
const camps = [];
let activeTankIndex = 0;
let activeCampIndex = 0;

let inBlackHole = false;
let bhReturnX = 0, bhReturnY = 0;
let bhTargetMultiplier = 0;
let bhCurrentMultiplier = 1;
let bhStartTime = 0;
let originalSpriteBg = '';
let exitingAnimation = false;
let exitAnimStart = 0;

let bhAnimating = false;
let bhAnimEl = null;
let bhAnimStartTime = 0;
let bhAnimDuration = 1000;
let bhAnimStartSize = 150;
let bhAnimEndSize = 400;
let bhAnimType = 'enter';
let bhMovingBgEl = null;
let bhShowcaseStart = 0;

const voidSprites = [];
const VOID_BG_WIDTH = 2220;
const VOID_BG_HEIGHT = 6920;
const VOID_ZONE_X = 0;
const VOID_ZONE_Y = -VOID_BG_HEIGHT - 1000;
const VOID_START_Y = VOID_ZONE_Y + VOID_BG_HEIGHT - 1200;
const BH_RISE_SPEED = 7;

let fallScorePaused = false;
let lastCamY = 0;
let landedTime = 0;
let originalEarnings = 0;
let finalEarnings = 0;
let showcaseScore = 0;

const multiplierEl = document.getElementById("multiplier");
const flipTextEl = document.getElementById("flipText");
const runOverEl = document.getElementById("runOver");

// UI Functions

function showScore() {
    scoreEl.style.display = "block";
    // Display visual earnings (for animation)
    scoreEl.textContent = `₹${visualEarnings.toFixed(2)}`;
}

function showMultiplier(m) {
    multiplierEl.textContent = `×${m.toFixed(2)}`;
    multiplierEl.style.display = "block";
}

function hideMultiplier() {
    multiplierEl.style.display = "none";
}

function showFlipText(text) {
    flipTextEl.textContent = text;
    flipTextEl.style.display = "block";
    setTimeout(() => flipTextEl.style.display = "none", 500);
}

function lockBetUI() {
    plusBtn.disabled = true;
    minusBtn.disabled = true;
    betInput.disabled = true;
    betBtn.disabled = true;
    document.querySelectorAll(".chip").forEach(c => c.disabled = true);
}

function unlockBetUI() {
    if (gameSession.state !== GameState.READY) return;
    
    plusBtn.disabled = false;
    minusBtn.disabled = false;
    betInput.disabled = false;
    betBtn.disabled = false;
    document.querySelectorAll(".chip").forEach(c => c.disabled = false);
    betBtn.textContent = "Place Bet";
}

function updateBalanceUI() {
    const displayBalance = fromRGSAmount(gameSession.balance);
    balanceEl.textContent = `Balance ₹${displayBalance.toFixed(2)}`;
    
    const effectiveBet = bonusMode ? betAmount * 10 : betAmount;
    betInput.value = effectiveBet.toFixed(2);
    
    const canBet = gameSession.state === GameState.READY && 
                   toRGSAmount(effectiveBet) <= gameSession.balance &&
                   toRGSAmount(effectiveBet) >= gameSession.minBet;
    betBtn.disabled = !canBet;
}

plusBtn.onclick = () => {
    if (gameSession.state !== GameState.READY) return;
    const step = fromRGSAmount(gameSession.stepBet);
    const max = fromRGSAmount(gameSession.maxBet);
    if (betAmount + step <= max) betAmount += step;
    updateBalanceUI();
};

minusBtn.onclick = () => {
    if (gameSession.state !== GameState.READY) return;
    const step = fromRGSAmount(gameSession.stepBet);
    const min = fromRGSAmount(gameSession.minBet);
    betAmount = Math.max(min, betAmount - step);
    updateBalanceUI();
};

betInput.oninput = () => {
    if (gameSession.state !== GameState.READY) {
        betInput.value = betAmount.toFixed(2);
        return;
    }
    const min = fromRGSAmount(gameSession.minBet);
    const max = fromRGSAmount(gameSession.maxBet);
    const step = fromRGSAmount(gameSession.stepBet);
    
    let value = Number(betInput.value) || min;
    value = Math.round(value / step) * step;
    value = Math.max(min, Math.min(max, value));
    betAmount = value;
    updateBalanceUI();
};

document.querySelectorAll(".chip").forEach(c => {
    c.onclick = () => {
        if (gameSession.state !== GameState.READY) return;
        const v = c.dataset.v;
        const max = fromRGSAmount(gameSession.maxBet);
        const balance = fromRGSAmount(gameSession.balance);
        
        if (v === "max") betAmount = Math.min(max, balance);
        else betAmount = Math.min(max, betAmount + Number(v));
        updateBalanceUI();
    };
});

betBtn.onclick = placeBet;

const bonusToggle = document.getElementById("bonusToggle");
bonusToggle.onclick = () => {
    if (gameSession.state !== GameState.READY) return;
    bonusMode = !bonusMode;
    bonusToggle.classList.toggle("active");
    
    if (bonusMode) {
        clouds.forEach(c => c.el.remove());
        clouds.length = 0;
    } else {
        for (let i = 0; i < cloudquantity; i++) spawnCloud(randX(), spawnY());
    }
    updateBalanceUI();
};

// Game World

const collectibles = [];
const chains = [];
const notes = [];
const blackHoles = [];
const blackholequantity = 100;
let tank = null;
let camp = null;
const pushables = [];
const pushablequantity = 400;

const silverjetWrap = document.createElement("div");
silverjetWrap.style.position = "absolute";
silverjetWrap.style.pointerEvents = "none";
silverjetWrap.style.zIndex = "100000";

const silverjet = document.createElement("div");
silverjet.className = "silverjet";
silverjetWrap.appendChild(silverjet);
world.appendChild(silverjetWrap);

function startGame() {
    camX = camY = velX = velY = angle = angVel = 0;
    visualEarnings = 0;
    realEarnings = 0;
    lastCamY = 0;
    fallStarted = true;
    betPlaced = true;
    betResolved = false;
    
    // Reset penalty state
    penaltyActive = false;
    penaltySuppressionFactor = 1.0;
    
    betBtn.textContent = "In Progress...";
}

function resetGameWorld() {
    clearWorld();
    camX = camY = velX = velY = angle = angVel = 0;
    visualEarnings = 0;
    realEarnings = 0;
    lastCamY = 0;
    fallStarted = false;
    betPlaced = false;
    betResolved = false;
    penaltyActive = false;
    penaltySuppressionFactor = 1.0;
    
    spawnWorld();
    spawnCollectibles(PRESET_SPAWN_COUNT);
    silverjetWrap.style.display = "block";
}

function clearWorld() {
    [...collectibles, ...chains, ...notes].forEach(c => c.el.remove());
    collectibles.length = chains.length = notes.length = 0;
    clouds.forEach(c => c.el.remove());
    clouds.length = 0;
    darkClouds.forEach(c => c.el.remove());
    darkClouds.length = 0;
    blackHoles.forEach(bh => bh.el.remove());
    blackHoles.length = 0;
    pushables.forEach(p => p.el.remove());
    pushables.length = 0;
}

// Visual spawning

function spawnCollectibles(count = PRESET_SPAWN_COUNT) {
    [...collectibles, ...chains, ...notes].forEach(c => c.el.remove());
    collectibles.length = chains.length = notes.length = 0;
    
    const TOP_SAFE = DEADZONE;
    const BOTTOM_SAFE = GROUND_Y - DEADZONE;
    const actualCount = bonusMode ? count * 2 : count;
    
    for (let i = 0; i < actualCount; i++) {
        // Visual randomness only - determines POSITION, not VALUE
        const type = Math.random();
        const el = document.createElement("div");
        let baseValue = 0, arr;
        
        if (type < 0.4) {
            el.className = "collectible chain";
            baseValue = 3;
            arr = chains;
        } else {
            el.className = "collectible music";
            baseValue = 5;
            arr = notes;
        }
        
        // Position is visual-only randomness
        const x = (Math.random() * SCREEN_W * 10) - (SCREEN_W * 5);
        let y;
        do { y = Math.random() * WORLDH; } while (y < TOP_SAFE || y > BOTTOM_SAFE);
        
        el.style.left = (x - 85) + "px";
        el.style.top = (y - 85) + "px";
        
        world.appendChild(el);
        const obj = { x, y, baseValue, el };
        arr.push(obj);
        collectibles.push(obj);
    }
}

function spawnBlackHoles(count = blackholequantity) {
    blackHoles.forEach(bh => bh.el.remove());
    blackHoles.length = 0;
    
    const TOP_SAFE = DEADZONE;
    const BOTTOM_SAFE = GROUND_Y - DEADZONE - BH_SIZE;
    
    for (let i = 0; i < count; i++) {
        const el = document.createElement("div");
        el.className = "black-hole";
        el.style.width = BH_SIZE + "px";
        el.style.height = BH_SIZE + "px";
        el.style.background = `url('items/black_hole_1.png') no-repeat center/contain`;
        
        // Visual position only
        const x = randX();
        const y = TOP_SAFE + Math.random() * (BOTTOM_SAFE - TOP_SAFE);
        
        el.style.left = x + "px";
        el.style.top = y + "px";
        
        world.appendChild(el);
        blackHoles.push({ x, y, el, rotation: 0 });
    }
}

function spawnTanks(count = TANK_COUNT) {
    tanks.forEach(t => t.el.remove());
    tanks.length = 0;
    
    const groundY = parseInt(ground.style.top);
    
    for (let i = 0; i < count; i++) {
        const el = document.createElement("div");
        el.className = "tank";
        el.style.width = "500px";
        el.style.height = "375px";
        el.style.background = "url('items/tank.png') no-repeat center/contain";
        el.style.display = "none";
        
        const x = randX();
        el.style.left = x + "px";
        el.style.top = groundY + "px";
        
        world.appendChild(el);
        tanks.push({ x, y: groundY, el, active: false });
    }
}

function spawnCamps(count = CAMP_COUNT) {
    camps.forEach(c => c.el.remove());
    camps.length = 0;
    
    const groundY = parseInt(ground.style.top);
    
    for (let i = 0; i < count; i++) {
        const el = document.createElement("div");
        el.className = "military-camp";
        el.style.width = "800px";
        el.style.height = "600px";
        el.style.background = "url('items/camp.png') no-repeat center/contain";
        el.style.display = "none";
        
        const x = randX();
        el.style.left = x + "px";
        el.style.top = groundY + "px";
        
        world.appendChild(el);
        camps.push({ x, y: groundY, el, active: false });
    }
}

function spawnPushables(count = pushablequantity) {
    pushables.forEach(p => p.el.remove());
    pushables.length = 0;
    
    const TOP_SAFE = DEADZONE;
    const BOTTOM_SAFE = GROUND_Y - DEADZONE - 80;
    
    for (let i = 0; i < count; i++) {
        const el = document.createElement("div");
        el.className = "pushable";
        el.style.width = "550px";
        el.style.height = "550px";
        el.style.background = "url('items/pushable.png') no-repeat center/contain";
        
        const x = randX();
        const y = TOP_SAFE + Math.random() * (BOTTOM_SAFE - TOP_SAFE);
        
        el.style.left = x + "px";
        el.style.top = y + "px";
        
        world.appendChild(el);
        pushables.push({ x, y, el, velX: 0, velY: 0 });
    }
}

function updateGroundEntitiesVisibility() {
    const camBottom = camY + SCREEN_H;
    
    tanks.forEach(t => t.el.style.display = "none");
    let t = tanks[activeTankIndex];
    if (t) {
        if (Math.abs(t.y - camBottom) < VISIBILITY_BUFFER) {
            t.el.style.display = "block";
        } else {
            activeTankIndex = (activeTankIndex + 1) % tanks.length;
        }
    }
    
    camps.forEach(c => c.el.style.display = "none");
    let c = camps[activeCampIndex];
    if (c) {
        if (Math.abs(c.y - camBottom) < VISIBILITY_BUFFER) {
            c.el.style.display = "block";
        } else {
            activeCampIndex = (activeCampIndex + 1) % camps.length;
        }
    }
}

// Starfield setup
const starfield = document.getElementById("starfield");
const STAR_COUNT = 180;
for (let i = 0; i < STAR_COUNT; i++) {
    const star = document.createElement("div");
    star.className = "star";
    star.style.left = Math.random() * 100 + "vw";
    star.style.top = Math.random() * 100 + "vh";
    star.style.animationDuration = (Math.random() * 2 + 1) + "s";
    star.style.animationDelay = Math.random() * 2 + "s";
    starfield.appendChild(star);
}

// Animated clouds setup
const animated_clouds = [];
let animated_clouds_lastTime = performance.now();

function createAnimatedCloud(layer, count, speedMin, speedMax, yMin, yMax, sizeScale) {
    const container = document.querySelector(layer);
    if (!container) return;
    
    for (let i = 0; i < count; i++) {
        const cloud = document.createElement("div");
        const scale = (0.7 + Math.random() * 0.6) * sizeScale;
        const y = Math.random() * (yMax - yMin) + yMin;
        const x = Math.random() * window.innerWidth + 600;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        
        cloud.style.position = "absolute";
        cloud.style.top = y + "px";
        cloud.style.transform = `translate3d(${x}px, 0, 0) scale(${scale})`;
        
        container.appendChild(cloud);
        animated_clouds.push({ el: cloud, x, y, speed, yMin, yMax, scale });
    }
}

createAnimatedCloud(".back", 12, 200, 450, 0, 850, 0.8);
createAnimatedCloud(".mid", 8, 450, 600, 0, 1050, 0.9);
createAnimatedCloud(".front", 6, 700, 1000, 0, 1200, 1.3);

function animateAnimatedClouds(now) {
    const dt = (now - animated_clouds_lastTime) / 1000;
    animated_clouds_lastTime = now;
    
    animated_clouds.forEach(c => {
        c.x += c.speed * dt;
        if (c.x > window.innerWidth + 300) {
            c.x = -300;
            c.y = Math.random() * (c.yMax - c.yMin) + c.yMin;
            c.el.style.top = c.y + "px";
        }
        c.el.style.transform = `translate3d(${c.x}px, 0, 0) scale(${c.scale})`;
    });
    
    requestAnimationFrame(animateAnimatedClouds);
}
requestAnimationFrame(animateAnimatedClouds);

// Cloud management
const clouds = [];
const CLOUD1_W = 320 * 1.7, CLOUD1_H = 160 * 1.7;
const CLOUD2_W = 325 * 1.5, CLOUD2_H = 217 * 1.5;

const CLOUD1 = [
    { x: 0.1329, y: 0.6750, r: 0.0922 },
    { x: 0.2251, y: 0.5125, r: 0.1094 },
    { x: 0.2689, y: 0.6750, r: 0.0594 },
    { x: 0.3986, y: 0.3781, r: 0.1266 },
    { x: 0.3830, y: 0.7219, r: 0.0797 },
    { x: 0.5189, y: 0.7219, r: 0.0750 },
    { x: 0.6237, y: 0.5312, r: 0.1141 },
    { x: 0.7331, y: 0.7031, r: 0.0891 },
    { x: 0.7862, y: 0.5844, r: 0.0610 },
    { x: 0.8581, y: 0.6531, r: 0.0703 }
];

const CLOUD2 = [
    { x: 0.1508, y: 0.7857, r: 0.0892 },
    { x: 0.2169, y: 0.6912, r: 0.0692 },
    { x: 0.3646, y: 0.5622, r: 0.1308 },
    { x: 0.2338, y: 0.7926, r: 0.0862 },
    { x: 0.3862, y: 0.8641, r: 0.0877 },
    { x: 0.5277, y: 0.6336, r: 0.0477 },
    { x: 0.5138, y: 0.8433, r: 0.0738 },
    { x: 0.6385, y: 0.6935, r: 0.1092 },
    { x: 0.6062, y: 0.8525, r: 0.0462 },
    { x: 0.7108, y: 0.8088, r: 0.1015 }
];

function randX() {
    return (Math.random() * SCREEN_W * 10) - (SCREEN_W * 5);
}

function spawnY() {
    const MAX_CLOUD_H = Math.max(CLOUD1_H, CLOUD2_H);
    const TOP_SAFE = DEADZONE;
    const BOTTOM_SAFE = GROUND_Y - DEADZONE - MAX_CLOUD_H;
    return TOP_SAFE + Math.random() * (BOTTOM_SAFE - TOP_SAFE);
}

function spawnCloud(x, y) {
    const pick = Math.random() < 0.5 ? 1 : 2;
    const el = document.createElement("div");
    el.className = "cloud";
    
    let circles, W, H, base;
    
    if (pick === 1) {
        W = CLOUD1_W; H = CLOUD1_H; base = CLOUD1;
        el.style.width = W + "px";
        el.style.height = H + "px";
        el.style.background = `url('clouds/cloud4.png') no-repeat center/contain`;
        circles = base.map(c => ({ x: x + c.x * W, y: y + c.y * H, r: c.r * W }));
    } else {
        W = CLOUD2_W; H = CLOUD2_H; base = CLOUD2;
        el.style.width = W + "px";
        el.style.height = H + "px";
        el.style.background = `url('clouds/cloud2.png') no-repeat center/contain`;
        circles = base.map(c => ({ x: x + c.x * W, y: y + c.y * H, r: c.r * W }));
    }
    
    el.style.left = x + "px";
    el.style.top = y + "px";
    
    world.appendChild(el);
    clouds.push({ x, y, el, circles });
}

// Dark cloud management
const darkClouds = [];
const DARK_W = 280 * 1.5;
const DARK_H = 187 * 1.5;

const DARK_RECTS = [
    { w: 0.1892857, h: 0.0855615, x: 0.4178571, y: 0.1925134 },
    { w: 0.4321429, h: 0.1176471, x: 0.2964286, y: 0.2780749 },
    { w: 0.5857143, h: 0.0802139, x: 0.2071429, y: 0.3957219 },
    { w: 0.7714286, h: 0.2139037, x: 0.1250000, y: 0.4759358 }
];

let grabbedByDarkCloud = false;
let releaseTime = 0;
let grabbedCloud = null;
let freezeX = 0, freezeY = 0;

const skeleton = document.getElementById("skeleton");
const sprite = document.getElementById("sprite");
sprite.style.backgroundImage = "url('items/game sprite green.png')";
let skeletonFlashInterval = null;

function spawnDarkCloud(x, y) {
    if (y > GROUND_Y - 500) return;
    const el = document.createElement("div");
    el.className = "dark-cloud";
    el.style.width = DARK_W + "px";
    el.style.height = DARK_H + "px";
    el.style.left = x + "px";
    el.style.top = y + "px";
    
    world.appendChild(el);
    
    const rects = DARK_RECTS.map(r => ({
        x: x + r.x * DARK_W,
        y: y + r.y * DARK_H,
        w: r.w * DARK_W,
        h: r.h * DARK_H
    }));
    
    darkClouds.push({ x, y, el, rects });
}

function spawnWorld() {
    if (!bonusMode) {
        for (let i = 0; i < cloudquantity; i++) spawnCloud(randX(), spawnY());
    }
    for (let i = 0; i < darkcloudquantity; i++) spawnDarkCloud(randX(), spawnY());
    spawnBlackHoles(blackholequantity);
    spawnTanks(TANK_COUNT);
    spawnCamps(CAMP_COUNT);
    spawnPushables(bonusMode ? 2000 : 20);
}

spawnWorld();
spawnCollectibles(PRESET_SPAWN_COUNT);

// Player Colliders & Physics

const ELLIPSES = [{ x: 0.2357, y: 0.0190, w: 0.4357, h: 0.4048 }];
const RECTS = [
    { x: 0.1071, y: 0.3905, w: 0.6857, h: 0.3476 },
    { x: 0.2214, y: 0.7333, w: 0.4571, h: 0.2381 }
];

function getPlayerColliders() {
    const list = [];
    const centerX = camX + PLAYER_X;
    const centerY = camY + PLAYER_Y;
    
    function rotatePoint(x, y) {
        const dx = x - centerX, dy = y - centerY;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return { x: centerX + dx * cos - dy * sin, y: centerY + dx * sin + dy * cos };
    }
    
    for (const e of ELLIPSES) {
        const w = e.w * PLAYER_W, h = e.h * PLAYER_H;
        const r = Math.min(w, h) / 2;
        const ex = ((e.x + e.w / 2) - 0.5) * PLAYER_W;
        const ey = ((e.y + e.h / 2) - 0.5) * PLAYER_H;
        const rot = rotatePoint(centerX + ex, centerY + ey);
        list.push({ x: rot.x, y: rot.y, r });
    }
    
    for (const rct of RECTS) {
        const w = rct.w * PLAYER_W, h = rct.h * PLAYER_H;
        const r = Math.min(w, h) / 2;
        const rx = ((rct.x + rct.w / 2) - 0.5) * PLAYER_W;
        const ry = ((rct.y + rct.h / 2) - 0.5) * PLAYER_H;
        const rot = rotatePoint(centerX + rx, centerY + ry);
        list.push({ x: rot.x, y: rot.y, r });
    }
    
    return list;
}

const MASS = 2.0;

function restitutionFromSpeed(v) {
    const s = Math.min(Math.abs(v), 40);
    if (s < 1) return 0;
    if (s < 8) return 0.1;
    if (s < 14) return 0.3;
    if (s < 22) return 0.5;
    if (s < 30) return 0.6;
    return 0.5;
}

function recycleClouds() {
    const MAX_H = Math.max(CLOUD1_H, CLOUD2_H);
    const TOP = DEADZONE, BOTTOM = GROUND_Y - DEADZONE - MAX_H;
    
    for (let c of clouds) {
        if (c.y < TOP - REUSE_DISTANCE || c.y > BOTTOM + REUSE_DISTANCE) {
            c.y = c.y < TOP ? BOTTOM - Math.random() * 1200 : TOP + Math.random() * 1200;
            c.x = randX();
        }
        c.el.style.left = c.x + "px";
        c.el.style.top = c.y + "px";
        
        const pick1 = c.el.style.background.includes("cloud4");
        const base = pick1 ? CLOUD1 : CLOUD2;
        const W = pick1 ? CLOUD1_W : CLOUD2_W;
        const H = pick1 ? CLOUD1_H : CLOUD2_H;
        c.circles = base.map(p => ({ x: c.x + p.x * W, y: c.y + p.y * H, r: p.r * W }));
    }
}

function recycleDarkClouds() {
    const TOP = DEADZONE, BOTTOM = GROUND_Y - DEADZONE - DARK_H;
    
    for (let c of darkClouds) {
        if (c.y < TOP - REUSE_DISTANCE || c.y > BOTTOM + REUSE_DISTANCE) {
            c.y = c.y < TOP ? BOTTOM - Math.random() * 1200 : TOP + Math.random() * 1200;
            c.x = randX();
        }
        c.el.style.left = c.x + "px";
        c.el.style.top = c.y + "px";
        c.rects = DARK_RECTS.map(r => ({
            x: c.x + r.x * DARK_W, y: c.y + r.y * DARK_H,
            w: r.w * DARK_W, h: r.h * DARK_H
        }));
    }
}

function recycleBlackHoles() {
    const TOP = DEADZONE, BOTTOM = GROUND_Y - DEADZONE - BH_SIZE;
    
    for (let bh of blackHoles) {
        if (bh.y < TOP - REUSE_DISTANCE || bh.y > BOTTOM + REUSE_DISTANCE) {
            bh.y = TOP + Math.random() * (BOTTOM - TOP);
            bh.x = randX();
            bh.rotation = 0;
            bh.el.style.transform = '';
        }
        bh.el.style.left = bh.x + "px";
        bh.el.style.top = bh.y + "px";
    }
}

function recyclePushables() {
    const TOP = DEADZONE, BOTTOM = GROUND_Y - DEADZONE - 550;
    
    for (let p of pushables) {
        if (p.y < TOP - REUSE_DISTANCE || p.y > BOTTOM + REUSE_DISTANCE) {
            p.y = TOP + Math.random() * (BOTTOM - TOP);
            p.x = randX();
            p.velX = p.velY = 0;
        }
        p.el.style.left = p.x + "px";
        p.el.style.top = p.y + "px";
    }
}

// Collision Resolution

function resolveCollisions() {
    let onGround = false;
    const muKinetic = 0.08;
    const r = PLAYER_W * 0.45;
    const I = 2.5 * r * r;
    
    const PLAYER_COLLIDERS = getPlayerColliders();
    const bodyCX = camX + PLAYER_X;
    const bodyCY = camY + PLAYER_Y;
    
    const contacts = [];
    
    // Cloud physics
    for (const cloud of clouds) {
        if (Math.abs(cloud.y - (camY + PLAYER_Y)) > 900) continue;
        
        for (const c of cloud.circles) {
            for (const p of PLAYER_COLLIDERS) {
                const dx = p.x - c.x, dy = p.y - c.y;
                const distSq = dx * dx + dy * dy;
                const minDist = p.r + c.r;
                if (distSq >= minDist * minDist) continue;
                
                const dist = Math.sqrt(distSq) || 0.00001;
                contacts.push({
                    nx: dx / dist, ny: dy / dist,
                    penetration: minDist - dist,
                    px: p.x, py: p.y
                });
            }
        }
    }
    
    if (contacts.length > 0) {
        let nx = 0, ny = 0, depth = 0;
        for (const c of contacts) { nx += c.nx; ny += c.ny; depth += c.penetration; }
        nx /= contacts.length; ny /= contacts.length; depth /= contacts.length;
        
        const len = Math.hypot(nx, ny) || 0.00001;
        nx /= len; ny /= len;
        
        const ref = contacts[0];
        const rx = ref.px - bodyCX, ry = ref.py - bodyCY;
        
        const relVX = velX - (-angVel * ry);
        const relVY = velY + (angVel * rx);
        const relNormal = relVX * nx + relVY * ny;
        
        if (relNormal < 0) {
            const speed = Math.hypot(relVX, relVY);
            const e = restitutionFromSpeed(speed);
            const rCrossN = rx * ny - ry * nx;
            const denom = (1 / MASS) + (rCrossN * rCrossN) / I;
            const j = -(1 + e) * relNormal / denom;
            
            velX += (j * nx) / MASS;
            velY += (j * ny) / MASS;
            angVel += (rCrossN * j) / I;
            
            const vtX = relVX - relNormal * nx;
            const vtY = relVY - relNormal * ny;
            const vt = Math.hypot(vtX, vtY);
            
            if (vt > 0.0001) {
                const tx = vtX / vt, ty = vtY / vt;
                let jt = -vt / denom;
                const maxFriction = muKinetic * Math.abs(j);
                jt = Math.max(-maxFriction, Math.min(maxFriction, jt));
                velX += (jt * tx) / MASS;
                velY += (jt * ty) / MASS;
                angVel += (rCrossN * jt) / I;
            }
        }
        
        angVel = Math.max(-0.05, Math.min(0.05, angVel));
        const corr = Math.min(Math.max(depth - 1.5, 0) * 0.45, 8);
        camX += nx * corr;
        camY += ny * corr;
    }
    
    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║ DARK CLOUD PENALTY - USES RATE SUPPRESSION, NOT MULTIPLICATIVE         ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    for (const cloud of darkClouds) {
        for (const rect of cloud.rects) {
            for (const p of PLAYER_COLLIDERS) {
                const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
                const nearestY = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
                const dx = p.x - nearestX, dy = p.y - nearestY;
                
                if (dx * dx + dy * dy < p.r * p.r && !grabbedByDarkCloud) {
                    grabbedByDarkCloud = true;
                    releaseTime = performance.now() + 1500;
                    grabbedCloud = cloud;
                    freezeX = camX;
                    freezeY = camY;
                    velX = velY = angVel = 0;
                    
                    // ✅ RATE SUPPRESSION instead of multiplicative penalty
                    const progress = getProgress();
                    const suppressionFactor = progress > 0.8 ? 0.5 : (progress < 0.3 ? 0.2 : 0.3);
                    activatePenalty(3000, suppressionFactor);
                    
                    skeleton.style.display = "block";
                    sprite.style.display = "block";
                    let show = false;
                    skeletonFlashInterval = setInterval(() => {
                        show = !show;
                        skeleton.style.display = show ? "block" : "none";
                        sprite.style.display = show ? "none" : "block";
                    }, 90);
                    
                    return false;
                }
            }
        }
    }
    
    // Black hole - only if bonus allowed (progress-threshold based)
    const steering = getSteeringParams();
    for (const bh of blackHoles) {
        const bx = bh.x + BH_SIZE / 2;
        const by = bh.y + BH_SIZE / 2;
        
        for (const p of PLAYER_COLLIDERS) {
            const dx = p.x - bx, dy = p.y - by;
            
            if (dx * dx + dy * dy < (BH_RADIUS + p.r) ** 2) {
                // Progress-threshold decision, NOT random
                if (steering.bonusActive) {
                    enterBlackHole(bh);
                } else {
                    velY = -Math.abs(velY) * 0.5;
                    velX *= 0.8;
                }
                return false;
            }
        }
    }
    
    // Tank - safe multiplier
    if (tank) {
        const rect = { x: tank.x, y: tank.y, w: 400, h: 300 };
        for (const p of PLAYER_COLLIDERS) {
            const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
            const nearestY = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
            const dx = p.x - nearestX, dy = p.y - nearestY;
            
            if (dx * dx + dy * dy < p.r * p.r) {
                const actualMult = applySafeMultiplier(5);
                showMultiplier(actualMult);
                tank.el.remove();
                tank = null;
                setTimeout(hideMultiplier, 1200);
                break;
            }
        }
    }
    
    // Camp - safe multiplier
    if (camp) {
        const rect = { x: camp.x, y: camp.y, w: 800, h: 600 };
        for (const p of PLAYER_COLLIDERS) {
            const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.w));
            const nearestY = Math.max(rect.y, Math.min(p.y, rect.y + rect.h));
            const dx = p.x - nearestX, dy = p.y - nearestY;
            
            if (dx * dx + dy * dy < p.r * p.r) {
                const actualMult = applySafeMultiplier(50);
                showMultiplier(actualMult);
                camp.el.remove();
                camp = null;
                setTimeout(hideMultiplier, 1200);
                break;
            }
        }
    }
    
    // Ground
    let lowest = -Infinity;
    for (const p of PLAYER_COLLIDERS) {
        const bottom = p.y + p.r;
        if (bottom > lowest) lowest = bottom;
    }
    
    if (lowest >= GROUND_Y && !inBlackHole) {
        camY -= (lowest - GROUND_Y);
        const speed = Math.hypot(velX, velY);
        const e = restitutionFromSpeed(speed);
        
        if (speed > 0.4) {
            velY = -Math.abs(velY) * e * 0.65;
            if (Math.abs(velY) > 14) velY = -14;
            angVel *= 0.85;
        } else {
            velX *= 0.85;
            velY = 0;
            angVel *= 0.6;
            onGround = true;
        }
    }
    
    // Pushables - 🔧 FIX #2: velocities are visual only, don't affect payout timing
    for (const p of pushables) {
        const px = p.x + 275, py = p.y + 275, pr = 150;
        const playerX = camX + PLAYER_X, playerY = camY + PLAYER_Y;
        if ((px - playerX) ** 2 + (py - playerY) ** 2 > 1000000) continue;
        
        for (const pc of PLAYER_COLLIDERS) {
            const dx = pc.x - px, dy = pc.y - py;
            const distSq = dx * dx + dy * dy;
            const minDist = pc.r + pr;
            if (distSq >= minDist * minDist) continue;
            
            const dist = Math.sqrt(distSq) || 0.00001;
            const nx = dx / dist, ny = dy / dist;
            const depth = minDist - dist;
            
            // Visual impulses only - don't affect payout progression
            p.velX += -nx * 1;
            p.velY += -ny * 1;
            velX += nx * 1.6;
            velY += ny * 1.6;
            
            const corr = Math.min(Math.max(depth - 1.5, 0) * 0.45, 8);
            camX += nx * corr;
            camY += ny * corr;
            p.x -= nx * corr;
            p.y -= ny * corr;
        }
    }
    
    return onGround;
}

let stuckLastY = 0;
let stuckStartTime = null;

function checkStuck() {
    if (inBlackHole || bhAnimating || gameSession.state !== GameState.ANIMATING) return;
    
    const movement = Math.abs(camY - stuckLastY);
    stuckLastY = camY;
    
    if (movement < 5) {
        if (!stuckStartTime) stuckStartTime = performance.now();
        else if (performance.now() - stuckStartTime > 3000) {
            forceEndRound();
        }
    } else {
        stuckStartTime = null;
    }
}

async function forceEndRound() {
    fallStarted = false;
    betPlaced = false;
    betResolved = true;
    syncEarnings();
    await completeRound();
}

// Black Hole Logic

function startBlackHoleAnimation(type, x, y, bh = null) {
    bhAnimating = true;
    bhAnimType = type;
    bhAnimStartTime = performance.now();
    bhAnimStartSize = type === 'enter' ? 150 : 800;
    bhAnimEndSize = type === 'enter' ? 800 : 150;
    
    bhAnimEl = document.createElement("div");
    bhAnimEl.className = "black-hole";
    bhAnimEl.style.width = bhAnimStartSize + "px";
    bhAnimEl.style.height = bhAnimStartSize + "px";
    bhAnimEl.style.left = (x - bhAnimStartSize / 2) + "px";
    bhAnimEl.style.top = (y - bhAnimStartSize / 2) + "px";
    bhAnimEl.style.background = `url('items/black_hole_1.png') no-repeat center/contain`;
    bhAnimEl.dataset.x = x;
    bhAnimEl.dataset.y = y;
    world.appendChild(bhAnimEl);
    
    if (type === 'enter' && bh) {
        bh.el.remove();
        blackHoles.splice(blackHoles.indexOf(bh), 1);
    }
}

function enterBlackHole(bh) {
    startBlackHoleAnimation('enter', bh.x + 50, bh.y + 50, bh);
}

function enterBlackHoleLogic() {
    inBlackHole = true;
    bhStartTime = performance.now();
    bhReturnX = camX;
    bhReturnY = camY;
    
    // Calculate multiplier needed to reach target (deterministic)
    const target = getTargetPayout();
    const remaining = target - visualEarnings;
    const needed = visualEarnings > 0 ? remaining / visualEarnings + 1 : getMaxMultiplier();
    bhTargetMultiplier = Math.min(Math.max(1, needed), getMaxMultiplier());
    
    bhCurrentMultiplier = 1;
    fallScorePaused = true;
    originalEarnings = visualEarnings;
    
    camX = VOID_ZONE_X;
    camY = VOID_START_Y;
    velX = velY = angVel = 0;
    
    bhMovingBgEl = document.createElement("div");
    bhMovingBgEl.style.cssText = `position: absolute; width: ${VOID_BG_WIDTH}px; height: ${VOID_BG_HEIGHT}px; left: ${(SCREEN_W - VOID_BG_WIDTH) / 2}px; top: ${VOID_ZONE_Y}px; background: url('items/Bonus_bg.png') no-repeat; background-size: ${VOID_BG_WIDTH}px ${VOID_BG_HEIGHT}px; z-index: 11;`;
    world.appendChild(bhMovingBgEl);
    
    originalSpriteBg = sprite.style.backgroundImage;
    sprite.style.backgroundImage = "url('items/jetpack.png')";
    showMultiplier(bhCurrentMultiplier);
}

function exitBlackHole() {
    inBlackHole = false;
    fallScorePaused = false;
    syncEarnings();
    
    camX = bhReturnX;
    camY = bhReturnY;
    velX = velY = angVel = 0;
    
    voidSprites.forEach(s => s.el.remove());
    voidSprites.length = 0;
    
    sprite.style.backgroundImage = originalSpriteBg;
    startBlackHoleAnimation('exit', camX + PLAYER_X, camY + PLAYER_Y);
    
    exitingAnimation = true;
    exitAnimStart = performance.now();
    
    hideMultiplier();
    showScore();
}

// Main Update Loop

function update() {
    if (!introFinished) return;
    
    // Black hole animation
    if (bhAnimating) {
        const elapsed = performance.now() - bhAnimStartTime;
        const progress = Math.min(elapsed / bhAnimDuration, 1);
        const size = bhAnimStartSize + (bhAnimEndSize - bhAnimStartSize) * progress;
        
        bhAnimEl.style.width = size + "px";
        bhAnimEl.style.height = size + "px";
        bhAnimEl.style.left = (parseFloat(bhAnimEl.dataset.x) - size / 2) + "px";
        bhAnimEl.style.top = (parseFloat(bhAnimEl.dataset.y) - size / 2) + "px";
        
        if (progress >= 1) {
            bhAnimating = false;
            if (bhAnimType === 'enter') enterBlackHoleLogic();
            bhAnimEl.remove();
            bhAnimEl = null;
        }
        
        render();
        requestAnimationFrame(update);
        return;
    }
    
    // Exit animation
    if (exitingAnimation) {
        const elapsed = performance.now() - exitAnimStart;
        const progress = Math.min(elapsed / 1000, 1);
        const scale = 1 + Math.sin(progress * Math.PI) * 0.2;
        sprite.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${angle}rad)`;
        
        if (progress >= 1) {
            exitingAnimation = false;
            sprite.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
        }
        
        render();
        requestAnimationFrame(update);
        return;
    }
    
    // Inside black hole
    if (inBlackHole) {
        // 🔧 FIX #2: Bonus exit is progress-gated, not physics-dependent
        if (bhShowcaseStart === 0) {
            camY -= BH_RISE_SPEED;
            const riseHeight = VOID_START_Y - camY;
            // Deterministic multiplier progression
            bhCurrentMultiplier = Math.min(bhTargetMultiplier, 1 + (riseHeight / 120));
            showMultiplier(bhCurrentMultiplier);
            
            // 🔧 FIX #2: Check progress-based exit condition
            if (bhCurrentMultiplier >= bhTargetMultiplier || shouldForceBonusExit()) {
                finalEarnings = Math.min(originalEarnings * bhCurrentMultiplier, getTargetPayout());
                bhShowcaseStart = performance.now();
            }
        } else {
            const elapsed = performance.now() - bhShowcaseStart;
            const progress = Math.min(elapsed / 1000, 1);
            showcaseScore = originalEarnings + (finalEarnings - originalEarnings) * progress;
            
            if (elapsed >= 1000) {
                visualEarnings = finalEarnings;
                syncEarnings();
                exitBlackHole();
                bhShowcaseStart = 0;
            }
        }
        
        showScore();
        render();
        requestAnimationFrame(update);
        return;
    }
    
    // Dark cloud grabbed
    if (grabbedByDarkCloud) {
        camX = freezeX;
        camY = freezeY;
        
        if (performance.now() >= releaseTime) {
            grabbedByDarkCloud = false;
            if (grabbedCloud) {
                grabbedCloud.el.remove();
                darkClouds.splice(darkClouds.indexOf(grabbedCloud), 1);
                grabbedCloud = null;
            }
            if (skeletonFlashInterval) clearInterval(skeletonFlashInterval);
            skeleton.style.display = "none";
            sprite.style.display = "block";
            
            // 🔧 FIX #2: Release velocity is visual only - doesn't affect payout timing
            // The progress-based steering ensures we reach target regardless of velocity
            velX = Math.sin((Math.random() - 0.5) * Math.PI / 2) * 28;
            velY = -Math.cos((Math.random() - 0.5) * Math.PI / 2) * 28;
            angVel = (Math.random() - 0.5) * 0.08;
        }
        
        render();
        requestAnimationFrame(update);
        return;
    }
    
    // Normal game loop
    recycleClouds();
    recycleDarkClouds();
    recycleBlackHoles();
    recyclePushables();
    
    // Update penalty state
    updatePenaltyState();
    
    // Animate black holes (visual only)
    for (let bh of blackHoles) {
        const dx = Math.abs(bh.x + BH_SIZE / 2 - (camX + PLAYER_X));
        const dy = Math.abs(bh.y + BH_SIZE / 2 - (camY + PLAYER_Y));
        if (dx <= 1000 && dy <= 1000) {
            bh.rotation += 0.05;
            bh.el.style.transform = `rotate(${bh.rotation}rad)`;
        }
    }
    
    const onGround = resolveCollisions();
    const steering = getSteeringParams();
    
    // Physics
    if (fallStarted && !onGround) {
        velY += GRAVITY * steering.gravityMult;
    }
    velY = Math.min(velY, MAX_FALL);
    
    camX += velX;
    camY += velY;
    
    for (const p of pushables) {
        p.x += p.velX;
        p.y += p.velY;
        p.velX *= 0.95;
        p.velY *= 0.95;
    }
    
    velX *= onGround ? GROUND_FRICTION * steering.frictionMult : AIR_FRICTION;
    angVel *= onGround ? 0.35 : 0.989;
    angle += angVel;
    
    // Flip detection
    angleAccumulator += angVel;
    if (Math.abs(angleAccumulator) >= 2 * Math.PI) {
        showFlipText(angleAccumulator > 0 ? "backflip" : "frontflip");
        angleAccumulator = 0;
    }
    
    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║ FALL EARNINGS - Uses progress-threshold rate, with suppression          ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    if (betPlaced && fallStarted && velY > 0 && !fallScorePaused) {
        const fallDistance = camY - lastCamY;
        if (fallDistance > 2) {
            // Rate is deterministic based on progress thresholds
            const rate = getFallEarningsRate();
            visualEarnings += fallDistance * rate;
            
            // Clamp to target
            const target = getTargetPayout();
            if (target > 0) {
                visualEarnings = Math.min(visualEarnings, target);
            }
            syncEarnings();
        }
    }
    
    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║ COLLECTIBLE PICKUP - Values based on progress thresholds                ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    function checkPickup(arr) {
        const playerColliders = getPlayerColliders();
        // Value multiplier is deterministic based on progress thresholds
        const valueMult = getCollectibleValueMultiplier();
        
        for (let i = arr.length - 1; i >= 0; i--) {
            const c = arr[i];
            for (const pc of playerColliders) {
                if ((pc.x - c.x) ** 2 + (pc.y - c.y) ** 2 < (pc.r + 85) ** 2) {
                    // Apply suppression to collectible value too
                    const suppression = getCurrentSuppressionFactor();
                    visualEarnings += c.baseValue * valueMult * suppression;
                    
                    // Clamp
                    const target = getTargetPayout();
                    if (target > 0) {
                        visualEarnings = Math.min(visualEarnings, target);
                    }
                    syncEarnings();
                    
                    c.el.remove();
                    arr.splice(i, 1);
                    break;
                }
            }
        }
    }
    
    checkPickup(chains);
    checkPickup(notes);
    
    // 🔧 FIX #2: Force landing strictly based on progress threshold
    if (shouldForceLanding()) {
        velY = Math.min(velY + 1, MAX_FALL);
        velX *= 0.9;
    }
    
    // 🔧 FIX #2: Ground landing - complete round (progress-gated, not physics-dependent)
    if (onGround && fallStarted && !betResolved) {
        if (landedTime === 0) {
            landedTime = performance.now();
        } else if (performance.now() - landedTime > 1000) {
            betResolved = true;
            fallStarted = false;
            betPlaced = false;
            syncEarnings();
            completeRound();
        }
    } else {
        landedTime = 0;
    }
    
    lastCamY = camY;
    render();
    checkStuck();
    requestAnimationFrame(update);
    updateGroundEntitiesVisibility();
}

function render() {
    if (inBlackHole && bhShowcaseStart === 0) {
        scoreEl.style.display = "none";
    } else {
        scoreEl.style.display = "block";
        // Always display visualEarnings (for smooth animation)
        const display = (inBlackHole && bhShowcaseStart > 0) ? showcaseScore : visualEarnings;
        scoreEl.textContent = `₹${display.toFixed(2)}`;
    }
    
    world.style.transform = `translate(${-camX}px, ${-camY}px)`;
    silverjetWrap.style.left = PLAYER_X + "px";
    silverjetWrap.style.top = PLAYER_Y + "px";
    player.style.left = (camX + PLAYER_X) + 'px';
    player.style.top = (camY + PLAYER_Y) + 'px';
    player.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    sprite.style.left = (camX + PLAYER_X) + 'px';
    sprite.style.top = (camY + PLAYER_Y) + 'px';
    sprite.style.transform = `translate(-50%, -50%) rotate(${inBlackHole ? 0 : angle}rad)`;
    skeleton.style.left = (camX + PLAYER_X) + 'px';
    skeleton.style.top = (camY + PLAYER_Y) + 'px';
    skeleton.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    
    pushables.forEach(p => {
        p.el.style.left = p.x + "px";
        p.el.style.top = p.y + "px";
    });
}