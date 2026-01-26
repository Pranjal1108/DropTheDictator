// ═══════════════════════════════════════════════════════════════════════════
// STAKE ENGINE COMPLIANT GAME - v2.1 (FINAL FIXES)
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: COMPLIANCE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
const COMPLIANCE_CONFIG = {
    RTP: "96.50%",
    MAX_WIN: "5000x",
    VERSION: "2.1.0"
};
// Social mode detection (stake.us compliance)
const isSocial = new URLSearchParams(window.location.search).get("social") === "true";
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FIX #3: CENTRALIZED TERMINOLOGY - ALL VISIBLE STRINGS                      ║
// ║ Every user-visible string MUST come from this object                       ║
// ╚════════════════════════════════════════════════════════════════════════════╝
const TERMS = {
    // Core gambling terms
    bet: isSocial ? "Play" : "Bet",
    bets: isSocial ? "Plays" : "Bets",
    winnings: isSocial ? "Coins Collected" : "Winnings",
    payout: isSocial ? "Prize" : "Payout",
    bonus: isSocial ? "Feature Zone" : "Bonus Zone",
    multiplier: isSocial ? "Boost" : "Multiplier",
    jackpot: isSocial ? "Grand Prize" : "Jackpot",
    // UI Labels
    placeBet: isSocial ? "Play Now" : "Place Bet",
    balance: isSocial ? "Coins" : "Balance",
    currency: isSocial ? "" : "₹",
    inProgress: isSocial ? "Playing..." : "In Progress...",
    starting: isSocial ? "Starting..." : "Placing bet...",
    // Round end messages
    roundOver: isSocial ? "ROUND COMPLETE" : "RUN OVER",
    totalWinnings: isSocial ? "Coins Collected" : "Total Winnings",
    recovered: isSocial ? "Previous round recovered! Prize" : "Previous round recovered! Payout",
    // Error messages
    sessionExpired: "Session expired. Please refresh the page.",
    connectionLost: "Connection lost. Retrying...",
    connectionFailed: "Connection failed. Please check your internet and refresh.",
    insufficientBalance: isSocial ? "Not enough coins for this play." : "Insufficient balance for this bet.",
    invalidBet: isSocial ? "Invalid play amount." : "Invalid bet amount.",
    genericError: "An error occurred. Please try again.",
    fatalError: "Failed to connect. Please refresh the page.",
    sessionRestore: "Session cannot be restored. Please refresh.",
    // Bet constraints
    minBet: isSocial ? "Minimum play is" : "Minimum bet is",
    maxBet: isSocial ? "Maximum play is" : "Maximum bet is",
    // Rules modal
    rulesTitle: "Game Rules",
    howToPlay: "How to Play",
    howToPlayText: isSocial
        ? "Watch your character fall through the sky! The outcome is determined by the game server when you start your play. The animation shows your result in an entertaining way."
        : "Watch your character fall through the sky! The outcome is determined by the game server when you place your bet. The animation shows your result in an entertaining way.",
    featureZone: isSocial ? "Feature Zone" : "Bonus Zone",
    featureZoneText: isSocial
        ? "Black holes may activate a feature zone where your boost increases. The feature outcome is pre-determined by the server."
        : "Black holes may activate a bonus zone where your multiplier increases. The bonus outcome is pre-determined by the server.",
    gameInfo: "Game Information",
    rtpLabel: "RTP",
    maxWinLabel: isSocial ? "Max Prize" : "Max Win",
    disclaimer: isSocial
        ? "Malfunction voids all plays. The game display is for illustrative purposes only. Prizes are settled according to the amount received from the Game Server."
        : "Malfunction voids all wins and plays. The game display is for illustrative purposes only. Winnings are settled according to the Remote Game Server.",
    understand: "I Understand",
    // Loading/Status
    connecting: "Connecting to server...",
    recovering: "Recovering previous round...",
    waiting: "Waiting for server...",
    // Flip text
    backflip: "backflip",
    frontflip: "frontflip",
    // Buttons
    refresh: "Refresh Page",
    fastOn: "⚡ Fast ON",
    fastOff: "⚡ Fast",
    // Misc
    errorTitle: "Error"
};
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
const MONETARY_PRECISION = 1000000;
function toRGSAmount(displayAmount) {
    return Math.round(displayAmount * MONETARY_PRECISION);
}
function fromRGSAmount(rgsAmount) {
    return rgsAmount / MONETARY_PRECISION;
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FIX #2: LERP FUNCTION FOR TIME-BASED ANIMATION                             ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function lerp(start, end, t) {
    return start + (end - start) * t;
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
const GameState = {
    INITIALIZING: 'initializing',
    AUTHENTICATING: 'authenticating',
    READY: 'ready',
    PLACING_BET: 'placing_bet',
    ANIMATING: 'animating',
    WAITING_FOR_END: 'waiting_for_end',  // NEW: Waiting for RGS round_end
    ENDING_ROUND: 'ending_round',
    RECOVERING: 'recovering',
    ERROR: 'error'
};
const gameSession = {
    state: GameState.INITIALIZING,
    sessionToken: null,
    playerId: null,
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
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ STAKE-COMPLIANT CURRENCY SYSTEM - FOUR SEPARATE VARIABLES                  ║
// ║ 1. backendFinalPayoutDisplay - Authoritative payout from RGS (display units)║
// ║ 2. backendBetRGS - Locked bet snapshot (never changes mid-round)            ║
// ║ 3. visualScore - Cosmetic animation score (allowed to lie/animate)          ║
// ║ 4. visualEarnings - Legacy alias for visualScore (backwards compat)         ║
// ╚════════════════════════════════════════════════════════════════════════════╝
let backendFinalPayoutDisplay = 0;  // AUTHORITATIVE: From backend, never calculated
let backendBetRGS = 0;              // LOCKED: Bet amount snapshot in RGS units
let visualScore = 0;                // COSMETIC: Animated display, can lie for effect
let visualEarnings = 0;             // LEGACY: Alias for visualScore (backward compat)
// Event timeline from RGS - controls what we display and when
let eventTimeline = [];
let currentEventIndex = 0;
let roundStartTime = 0;
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ BACKEND-CONTROLLED SPAWN DATA                                              ║
// ║ All spawn positions come from backend - no Math.random() for game logic    ║
// ╚════════════════════════════════════════════════════════════════════════════╝
let spawnData = null;  // Will be populated from backend
let backendFinalPayout = 0;  // Authoritative payout from backend (RGS units)
let backendBlackHoleTriggered = false;
let backendBlackHoleMultiplier = 1;
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FIX #1: ROUND END STATE - Frontend never ends round, only RGS              ║
// ╚════════════════════════════════════════════════════════════════════════════╝
let awaitingRoundEnd = false;
let roundEndTimeout = null;
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ PROGRESSIVE PAYOUT SYSTEM                                                   ║
// ║ Score increases as character falls, reaching final payout at ground         ║
// ╚════════════════════════════════════════════════════════════════════════════╝
let progressivePayoutEnabled = false;
let fallStartY = 0;
let payoutProgressTarget = 0;
let isZeroPayoutRound = false;
let hasTriggeredBlackHole = false; // Prevent duplicate triggers
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: RGS API CLIENT (LOCAL BACKEND FOR DEVELOPMENT)
// ═══════════════════════════════════════════════════════════════════════════
const RGS_API = {
    // Use local backend for development - always point to Flask on port 3000
    baseUrl: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'  // Flask backend on port 3000
        : 'https://your-game.stake.games/api',
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
            balance: data.balance,
            visualTimeline: data.visual_timeline || []
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
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: ERROR HANDLING (USING TERMS)
// ═══════════════════════════════════════════════════════════════════════════
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
            showError(TERMS.sessionExpired);
            await attemptReauthentication();
            break;
        case 'NETWORK_ERROR':
            if (gameSession.retryCount < gameSession.maxRetries) {
                gameSession.retryCount++;
                showError(`${TERMS.connectionLost} (${gameSession.retryCount}/${gameSession.maxRetries})`);
                await delay(1000 * gameSession.retryCount);
                return true;
            } else {
                showError(TERMS.connectionFailed);
            }
            break;
        case 'INSUFFICIENT_BALANCE':
            showError(TERMS.insufficientBalance);
            break;
        case 'INVALID_BET':
            showError(TERMS.invalidBet);
            break;
        case 'ROUND_NOT_FOUND':
            gameSession.currentRound = null;
            await refreshBalance();
            break;
        default:
            showError(TERMS.genericError);
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
    el.style.cssText = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); 
        background: rgba(200, 50, 50, 0.95); color: white; padding: 15px 30px; 
        border-radius: 8px; font-size: 16px; z-index: 999999;`;
    document.body.appendChild(el);
    return el;
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: ROUND DATA
// ═══════════════════════════════════════════════════════════════════════════
function createRoundData(response) {
    return {
        roundId: response.roundId,
        simulationId: response.simulationId,
        bet: response.bet,
        visualTimeline: response.visualTimeline || [],
        status: 'active'
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: EVENT-DRIVEN TIMELINE PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════
function processEventTimeline() {
    if (!gameSession.currentRound || !eventTimeline.length) return;
    const elapsed = performance.now() - roundStartTime;
    // Apply fastplay speed multiplier
    const speedMultiplier = fastplayEnabled ? 3 : 1;
    const adjustedElapsed = elapsed * speedMultiplier;
    while (currentEventIndex < eventTimeline.length) {
        const event = eventTimeline[currentEventIndex];
        if (event.timestamp > adjustedElapsed) break;
        handleRGSEvent(event);
        currentEventIndex++;
    }
}
function handleRGSEvent(event) {
    switch (event.type) {
        // ╔════════════════════════════════════════════════════════════════╗
        // ║ INVERTED DEPENDENCY: Motion determines payout, not vice versa  ║
        // ║ 1. World constructed with blocking geometry at terminal_depth  ║
        // ║ 2. Physics runs purely (no payout checks)                      ║
        // ║ 3. Score = f(max_depth_reached) - emerges from motion          ║
        // ╚════════════════════════════════════════════════════════════════╝
        // ╔════════════════════════════════════════════════════════════════╗
        // ║ FIX: SUPPORT NEW WORLD PLAN ARCHITECTURE                       ║
        // ╚════════════════════════════════════════════════════════════════╝
        case 'round_start':
            // ╔════════════════════════════════════════════════════════════════╗
            // ║ STAKE-COMPLIANT: Check if character should fall at all         ║
            // ║ If fall: false (zero payout), freeze player immediately        ║
            // ╚════════════════════════════════════════════════════════════════╝
            if (event.world_plan && event.world_plan.fall === false) {
                console.log('[WORLD] Zero payout - player does not fall');
                isZeroPayoutRound = true;
                backendFinalPayoutDisplay = 0;
                maxPayoutAtGround = 0;
                visualScore = 0;
                visualEarnings = 0;
                clearWorld();
                freezePlayerAtStart();
                triggerImmediateLoss();
                break;
            }

            // Map backend world_plan to frontend spawnData structure
            if (event.world_plan) {
                const wp = event.world_plan;
                spawnData = {
                    clouds: [
                        ...(wp.guide_clouds || []),
                        ...(wp.wall_clouds || []),
                        ...(wp.terminal_closure && wp.terminal_closure.clouds ? wp.terminal_closure.clouds : [])
                    ],
                    black_holes: wp.black_hole ? [wp.black_hole] : [],
                    collectibles: wp.collectibles || [],
                    pushables: wp.pushables || [],
                    dark_clouds: wp.dark_clouds || [],
                    tanks: wp.tanks || [],
                    camps: wp.camps || [],
                    config: wp.corridor // Store corridor config if needed
                };

                // Override terminal depth if provided in closure
                if (wp.terminal_closure && wp.terminal_closure.depth) {
                    terminalDepthY = wp.terminal_closure.depth;
                } else {
                    terminalDepthY = event.terminal_depth_y || 18000;
                }
            } else {
                // Legacy fallback - empty world
                spawnData = null;
                terminalDepthY = event.terminal_depth_y || 18000;
            }

            // STAKE-COMPLIANT: Store backend payout as authoritative source
            // Backend sends payout in RGS micro-units, convert to display units
            backendFinalPayoutDisplay = fromRGSAmount(event.max_payout_at_ground || 0);
            maxPayoutAtGround = backendFinalPayoutDisplay;  // For legacy compatibility
            backendBlackHoleTriggered = event.black_hole_triggered || false;
            backendBlackHoleMultiplier = event.black_hole_multiplier || 1;
            // Initialize depth-based tracking
            fallStartY = camY;
            maxDepthReached = camY; // Track maximum Y position reached
            hasTriggeredBlackHole = false;
            naturalEndTriggered = false;
            roundEnded = false;
            gameFrozen = false; // Unfreeze game for new round
            stuckFrameCount = 0; // For detecting when character is stuck
            lastY = camY;
            // Reset all score variables
            visualScore = 0;
            visualEarnings = 0;
            isZeroPayoutRound = false;

            // Spawn world using ONLY backend data
            clearWorld();
            if (spawnData) {
                spawnWorld();
            }
            // Spawn blocking geometry at terminal_depth_y
            spawnBlockingFormation(terminalDepthY);

            // ═══════════════════════════════════════════════════════════════
            // NEW: Spawn event funnels for forced interactions
            // ═══════════════════════════════════════════════════════════════
            if (event.world_plan && event.world_plan.event_funnels) {
                spawnEventFunnels(event.world_plan.event_funnels);
            }

            console.log('[WORLD] Terminal depth:', terminalDepthY,
                'Max payout at ground:', maxPayoutAtGround,
                'Funnels:', event.world_plan?.event_funnels?.length || 0);
            break;
        case 'win':
            animateEarningsTo(event.value);
            break;
        case 'bonus_enter':
            triggerBonusEnter(event.multiplier);
            break;
        case 'bonus_exit':
            triggerBonusExit(event.value);
            break;
        case 'collectible':
            showCollectibleAnimation(event.position, event.value);
            break;
        case 'land':
            triggerLanding();
            break;
        // ╔════════════════════════════════════════════════════════════════╗
        // ║ FIX #1: round_end is the ONLY way to complete a round          ║
        // ║ Frontend NEVER calls completeRound() on its own                ║
        // ╚════════════════════════════════════════════════════════════════╝
        case 'round_end':
            handleRoundEndEvent(event.value);
            break;
    }
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ PROGRESSIVE PAYOUT: Score increases smoothly as character falls            ║
// ║ STAKE-COMPLIANT: Physics controls WHEN score animates, backend controls    ║
// ║ HOW MUCH the final value is. visualScore NEVER exceeds backendFinalPayout  ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function updateProgressivePayout() {
    if (!progressivePayoutEnabled || isZeroPayoutRound || inBlackHole) return;
    // Calculate fall progress (0 = start, 1 = near ground)
    const totalFallDistance = GROUND_Y - fallStartY - 500; // Buffer before ground
    const currentFallDistance = camY - fallStartY;
    const progress = Math.min(Math.max(currentFallDistance / totalFallDistance, 0), 1);
    // Smooth easing for natural feel
    const eased = 1 - Math.pow(1 - progress, 2);
    // STAKE-COMPLIANT: Animate towards backend payout, NEVER exceed it
    visualScore = Math.min(backendFinalPayoutDisplay * eased, backendFinalPayoutDisplay);
    visualEarnings = visualScore;  // Keep legacy alias in sync
    updateScoreDisplay();
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ BLACK HOLE SYNC: Only trigger when player visually collides with marked BH ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function checkBlackHoleCollision() {
    if (!backendBlackHoleTriggered || hasTriggeredBlackHole || inBlackHole) return false;
    const playerX = camX + PLAYER_X;
    const playerY = camY + PLAYER_Y;
    for (const bh of blackHoles) {
        if (bh.willTrigger) {
            const bx = bh.x + BH_SIZE / 2;
            const by = bh.y + BH_SIZE / 2;
            const dist = Math.sqrt((playerX - bx) ** 2 + (playerY - by) ** 2);
            // Within collision range - trigger the bonus
            if (dist < BH_SIZE * 0.8) {
                hasTriggeredBlackHole = true;
                triggerBonusEnter(backendBlackHoleMultiplier);
                return true;
            }
        }
    }
    return false;
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ INVERTED CONTROL: World Geometry & Physics                                  ║
// ║ 1. Blocking Formation: Spawns at terminalDepthY sent by backend            ║
// ║ 2. Physics: Character naturally stops when hitting these clouds            ║
// ║ 3. Score: Calculated from maxDepthReached (emerges from physics)           ║
// ╚════════════════════════════════════════════════════════════════════════════╝
// Global variables for inverted control
let terminalDepthY = 18000; // Default, will be updated from backend or GROUND_Y
let maxDepthReached = 0;
let maxPayoutAtGround = 0;
let stuckFrameCount = 0;
let lastY = 0;
let stoppingClouds = []; // Reused for blocking clouds
let roundEnded = false;
let naturalEndTriggered = false; // Missing variable added
function spawnBlockingFormation(targetY) {
    // Remove any existing blocking clouds
    stoppingClouds.forEach(c => { if (c.el) c.el.remove(); });
    stoppingClouds = [];
    // For zero payout/early stop
    if (targetY < fallStartY + 2000) {
        return; // Early stop handled by naturalEndTriggered
    }
    console.log('[WORLD] Spawning blocking formation at Y:', targetY);
    // Terminal Closure Templates
    // Designed to guarantee 100% blockage of the corridor
    const centerX = 8000;
    // Deterministic selection based on targetY to appear inevitable
    const templateIdx = Math.floor(targetY) % 3;
    let offsets = [];
    let templateName = "";
    switch (templateIdx) {
        case 0: // Template A: Flat Seal (Solid Wall)
            templateName = "FLAT SEAL";
            // 4 clouds tight overlapping
            offsets = [
                { x: -450, y: 0 }, { x: -150, y: 0 }, { x: 150, y: 0 }, { x: 450, y: 0 }
            ];
            break;
        case 1: // Template B: Offset Seal (Staggered rows)
            templateName = "OFFSET SEAL";
            // Interlocking bricks
            offsets = [
                { x: -300, y: 0 }, { x: 300, y: 0 },
                { x: 0, y: -200 }, // Plug the gap from above
                { x: -600, y: -200 }, { x: 600, y: -200 } // Wings
            ];
            break;
        case 2: // Template C: Funnel Collapse (V-shape)
            templateName = "FUNNEL COLLAPSE";
            offsets = [
                { x: 0, y: 0 }, // Bottom plug
                { x: -350, y: -250 }, { x: 350, y: -250 }, // Sides
                { x: -700, y: -500 }, { x: 700, y: -500 }  // Upper funnel
            ];
            break;
    }
    console.log(`[WORLD] Using Template: ${templateName}`);
    offsets.forEach(offset => {
        const x = centerX + offset.x;
        const y = targetY + offset.y; // Relative to terminal depth
        const el = document.createElement("div");
        el.className = "blocking-cloud";
        el.style.cssText = `
            position: absolute;
            width: ${CLOUD1_W * 1.6}px;
            height: ${CLOUD1_H * 1.6}px;
            background: url('items/movcloud1.png') no-repeat center/contain;
            left: ${x}px;
            top: ${y}px;
            z-index: 5;
            filter: brightness(0.85) sepia(0.2); // Visual distinction for terminal clouds
        `;
        world.appendChild(el);
        const cloudCircles = CLOUD1.map(p => ({
            x: x + p.x * CLOUD1_W * 1.6,
            y: y + p.y * CLOUD1_H * 1.6,
            r: p.r * CLOUD1_W * 1.6
        }));
        stoppingClouds.push({
            x, y,
            el,
            circles: cloudCircles,
            isBlockingCloud: true
        });
    });
}

// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FUNNEL FORMATION - V-SHAPED GEOMETRY FOR FORCED INTERACTIONS               ║
// ║ Funnels guarantee the player passes through collectibles/black holes       ║
// ╚════════════════════════════════════════════════════════════════════════════╝
let funnelClouds = []; // Track funnel clouds for collision

function spawnEventFunnels(eventFunnels) {
    if (!eventFunnels || eventFunnels.length === 0) return;

    console.log(`[FUNNEL] Spawning ${eventFunnels.length} event funnels`);

    // Clear any existing funnel clouds
    funnelClouds.forEach(c => { if (c.el) c.el.remove(); });
    funnelClouds = [];

    for (const funnel of eventFunnels) {
        spawnFunnelFormation(funnel);
    }
}

function spawnFunnelFormation(funnel) {
    if (!funnel || !funnel.clouds) return;

    const eventType = funnel.event?.type || 'unknown';
    const throatY = funnel.throat_y || funnel.event?.y_position || 0;

    console.log(`[FUNNEL] Spawning ${eventType} funnel at Y:${throatY}`);

    // Spawn each cloud in the funnel formation
    for (const cloud of funnel.clouds) {
        const el = document.createElement("div");
        el.className = `funnel-cloud ${cloud.type}`;

        // Apply rotation for angled clouds
        const rotation = cloud.angle ? `rotate(${cloud.angle}deg)` : '';

        el.style.cssText = `
            position: absolute;
            width: ${CLOUD1_W}px;
            height: ${CLOUD1_H}px;
            background: url('items/movcloud${cloud.cloud_type || 1}.png') no-repeat center/contain;
            left: ${cloud.x}px;
            top: ${cloud.y}px;
            z-index: 4;
            transform: ${rotation};
            filter: brightness(1.1) saturate(0.8);
        `;
        world.appendChild(el);

        // Create collision circles for this cloud
        const cloudCircles = CLOUD1.map(p => ({
            x: cloud.x + p.x * CLOUD1_W,
            y: cloud.y + p.y * CLOUD1_H,
            r: p.r * CLOUD1_W
        }));

        funnelClouds.push({
            x: cloud.x,
            y: cloud.y,
            el,
            circles: cloudCircles,
            type: cloud.type,
            isFunnelCloud: true
        });
    }

    // The collectible/black hole at the funnel throat is spawned separately
    // by the existing collectible spawning logic (they're already in spawnData)
}
function checkBlockingFormationCollision() {
    if (roundEnded || stoppingClouds.length === 0 || inBlackHole) return false;
    const playerColliders = getPlayerColliders();
    let collisionOccurred = false;
    for (const cloud of stoppingClouds) {
        for (const circle of cloud.circles) {
            for (const p of playerColliders) {
                const dx = p.x - circle.x;
                const dy = p.y - circle.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < circle.r + p.r) {
                    // Collision with blocking cloud!
                    // Collision with blocking cloud!
                    // Stop movement IMMEDIATELY to freeze in spot
                    velX = 0;
                    velY = 0;
                    // Do NOT push character out - we want them to stick specifically where they hit
                    // This prevents the "float up" effect
                    collisionOccurred = true;
                }
            }
        }
    }
    return collisionOccurred;
}
function updateInvertedScore() {
    if (roundEnded || inBlackHole || isZeroPayoutRound) return;
    // Track max depth
    if (camY > maxDepthReached) {
        maxDepthReached = camY;
    }
    // Calculate score based on depth relative to ground
    const totalDescent = GROUND_Y - fallStartY - 1000;
    const currentDescent = Math.max(0, maxDepthReached - fallStartY);
    // Progress 0.0 to 1.0 based on depth
    let progress = Math.min(currentDescent / totalDescent, 1.0);
    // Smooth easing
    const eased = 1 - Math.pow(1 - progress, 2);
    // STAKE-COMPLIANT: Animate towards backend payout, NEVER exceed it
    visualScore = Math.min(backendFinalPayoutDisplay * eased, backendFinalPayoutDisplay);
    visualEarnings = visualScore;  // Keep legacy alias in sync
    updateScoreDisplay();
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ NATURAL GAME END: Character physically stopped (stuck) or reached ground   ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function checkNaturalGameEnd() {
    if (naturalEndTriggered || inBlackHole || roundEnded) return;
    // 1. Run collision check against blocking clouds
    const isColliding = checkBlockingFormationCollision();
    // 2. ZERO PAYOUT: End when crossing threshold with explosion
    if (isZeroPayoutRound && camY > fallStartY + 2000) {
        naturalEndTriggered = true;
        visualScore = 0;
        visualEarnings = 0;
        triggerExplosion();
        setTimeout(() => {
            cleanupExplosion();
            processRoundEnd();
        }, 2500);
        return;
    }
    // 3. STUCK DETECTION: If colliding and velocity is very low, count frames
    if (isColliding && Math.abs(velY) < 3 && Math.abs(velX) < 3) {
        stuckFrameCount++;
    } else {
        stuckFrameCount = 0;
    }
    // 4. If stuck for > 15 frames (approx 0.25s), round is over
    // This is the "Natural Loss" - physics has prevented further movement
    if (stuckFrameCount > 15) {
        console.log('[PHYSICS] Character stuck - Natural End detected');
        roundEnded = true;
        naturalEndTriggered = true;
        // Ensure final score matches exactly what we calculated based on depth
        // (Visual earnings are already updated by updateInvertedScore)
        // Small delay before showing end screen for natural feel
        setTimeout(() => processRoundEnd(), 500);
        return;
    }
    // 5. GROUND: Final fallback - end when reaching ground
    if (camY >= GROUND_Y - PLAYER_H - 100) {
        console.log('[PHYSICS] Ground reached');
        naturalEndTriggered = true;
        roundEnded = true;
        // STAKE-COMPLIANT: Snap to backend payout, not physics value
        visualScore = backendFinalPayoutDisplay;
        visualEarnings = visualScore;
        updateScoreDisplay();
        processRoundEnd();
    }
    lastY = camY;
}
function processRoundEnd() {
    // Clean up blocking clouds
    stoppingClouds.forEach(c => { if (c.el) c.el.remove(); });
    stoppingClouds = [];
    // Find and trigger the round_end event from timeline
    for (let i = currentEventIndex; i < eventTimeline.length; i++) {
        if (eventTimeline[i].type === 'round_end') {
            handleRoundEndEvent(eventTimeline[i].value);
            return;
        }
    }
    // Fallback if no round_end event found - use backend payout
    handleRoundEndEvent(backendFinalPayoutDisplay);
}
function animateEarningsTo(targetValue) {
    const startValue = visualEarnings;
    const startTime = performance.now();
    const duration = fastplayEnabled ? 100 : 300;
    function animate() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        visualEarnings = startValue + (targetValue - startValue) * eased;
        updateScoreDisplay();
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    animate();
}
function triggerBonusEnter(multiplier) {
    inBlackHole = true;
    bhTargetMultiplier = multiplier;
    bhCurrentMultiplier = 1;
    bhAnimationStartTime = performance.now(); // FIX #2: Track start time
    fallScorePaused = true;
    originalEarnings = visualEarnings;
    camX = VOID_ZONE_X;
    camY = VOID_START_Y;
    velX = velY = angVel = 0;
    bhMovingBgEl = document.createElement("div");
    bhMovingBgEl.style.cssText = `position: absolute; width: ${VOID_BG_WIDTH}px; 
        height: ${VOID_BG_HEIGHT}px; left: ${(SCREEN_W - VOID_BG_WIDTH) / 2}px; 
        top: ${VOID_ZONE_Y}px; background: url('items/Bonus_bg.png') no-repeat; 
        background-size: ${VOID_BG_WIDTH}px ${VOID_BG_HEIGHT}px; z-index: 11;`;
    world.appendChild(bhMovingBgEl);
    originalSpriteBg = sprite.style.backgroundImage;
    sprite.style.backgroundImage = "url('items/jetpack.png')";
    showMultiplier(bhCurrentMultiplier);
}
function triggerBonusExit(finalValue) {
    finalEarnings = finalValue;
    bhShowcaseStart = performance.now();
}
function showCollectibleAnimation(position, value) {
    if (!position) return;
    const floater = document.createElement("div");
    floater.className = "collectible-floater";
    floater.textContent = `+${TERMS.currency}${value.toFixed(2)}`;
    floater.style.cssText = `position: absolute; left: ${position.x}px; top: ${position.y}px; 
        color: gold; font-size: 24px; font-weight: bold; z-index: 1000; 
        animation: floatUp 1s ease-out forwards; pointer-events: none;`;
    world.appendChild(floater);
    setTimeout(() => floater.remove(), 1000);
}
function triggerLanding() {
    forceLandingActive = true;
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ LOSS ANIMATION: Character explodes into body parts when payout is 0        ║
// ╚════════════════════════════════════════════════════════════════════════════╝
const BODY_PARTS = [
    { name: 'head', image: 'items/Head.png', offsetX: 0, offsetY: -100, size: 80 },
    { name: 'torso', image: 'items/torso.png', offsetX: 0, offsetY: 0, size: 120 },
    { name: 'left_arm', image: 'items/left_arm.png', offsetX: -60, offsetY: -20, size: 60 },
    { name: 'right_arm', image: 'items/right_arm.png', offsetX: 60, offsetY: -20, size: 60 },
    { name: 'left_leg', image: 'items/left_leg.png', offsetX: -30, offsetY: 80, size: 80 },
    { name: 'right_leg', image: 'items/right_leg.png', offsetX: 30, offsetY: 80, size: 80 }
];
let explosionParts = [];
let explosionActive = false;
function triggerExplosion() {
    explosionActive = true;
    explosionParts = [];
    // Hide the main sprite
    const sprite = document.getElementById("sprite");
    const skeleton = document.getElementById("skeleton");
    if (sprite) sprite.style.display = "none";
    if (skeleton) skeleton.style.display = "none";
    const playerX = camX + PLAYER_X;
    const playerY = camY + PLAYER_Y;
    // Create body parts with random velocities
    for (const part of BODY_PARTS) {
        const el = document.createElement("div");
        el.className = "explosion-part";
        el.style.cssText = `
            position: absolute;
            width: ${part.size}px;
            height: ${part.size}px;
            background: url('${part.image}') no-repeat center/contain;
            pointer-events: none;
            z-index: 10000;
        `;
        const x = playerX + part.offsetX;
        const y = playerY + part.offsetY;
        el.style.left = x + "px";
        el.style.top = y + "px";
        world.appendChild(el);
        // Random explosion velocity outward from center
        const angle = Math.atan2(part.offsetY, part.offsetX) + (Math.random() - 0.5) * 0.5;
        const speed = 15 + Math.random() * 20;
        explosionParts.push({
            el,
            x,
            y,
            velX: Math.cos(angle) * speed + (Math.random() - 0.5) * 10,
            velY: Math.sin(angle) * speed - 10 - Math.random() * 15, // Initial upward burst
            rotation: 0,
            rotSpeed: (Math.random() - 0.5) * 0.3
        });
    }
    // Show "YOU LOST!" message
    const lostMsg = document.createElement("div");
    lostMsg.id = "lostMessage";
    lostMsg.innerHTML = `<span style="font-size: 72px;">💥</span><br>YOU LOST!`;
    lostMsg.style.cssText = `
        position: fixed;
        top: 30%;
        left: 50%;
        transform: translateX(-50%);
        color: #ff4444;
        font-size: 48px;
        font-weight: bold;
        text-shadow: 0 0 20px rgba(255,0,0,0.8), 2px 2px 4px black;
        z-index: 100001;
        text-align: center;
        animation: shake 0.5s ease-in-out;
    `;
    document.body.appendChild(lostMsg);
    // Add shake animation style if not exists
    if (!document.getElementById("explosionStyles")) {
        const style = document.createElement("style");
        style.id = "explosionStyles";
        style.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(-50%) rotate(0deg); }
                25% { transform: translateX(-50%) rotate(-5deg); }
                50% { transform: translateX(-50%) rotate(5deg); }
                75% { transform: translateX(-50%) rotate(-3deg); }
            }
        `;
        document.head.appendChild(style);
    }
    // Animate explosion
    animateExplosion();
}
function animateExplosion() {
    if (!explosionActive) return;
    let allOffscreen = true;
    for (const part of explosionParts) {
        // Apply gravity
        part.velY += 0.8;
        // Apply velocity
        part.x += part.velX;
        part.y += part.velY;
        part.rotation += part.rotSpeed;
        // Update position
        part.el.style.left = part.x + "px";
        part.el.style.top = part.y + "px";
        part.el.style.transform = `rotate(${part.rotation}rad)`;
        // Check if still on screen (roughly)
        if (part.y < WORLDH + 500) {
            allOffscreen = false;
        }
    }
    if (!allOffscreen) {
        requestAnimationFrame(animateExplosion);
    } else {
        cleanupExplosion();
    }
}
function cleanupExplosion() {
    explosionActive = false;
    // Remove body parts
    for (const part of explosionParts) {
        if (part.el && part.el.parentNode) {
            part.el.remove();
        }
    }
    explosionParts = [];
    // Remove lost message
    const lostMsg = document.getElementById("lostMessage");
    if (lostMsg) lostMsg.remove();
    // Restore sprite
    const sprite = document.getElementById("sprite");
    if (sprite) sprite.style.display = "block";
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FIX #1: handleRoundEndEvent - Triggers explosion on loss (payout = 0)      ║
// ╚════════════════════════════════════════════════════════════════════════════╝
let gameFrozen = false; // Flag to freeze all game movement on round end

async function handleRoundEndEvent(finalPayout) {
    // FREEZE the game - stop all movement
    gameFrozen = true;
    // Clear any timeout
    if (roundEndTimeout) {
        clearTimeout(roundEndTimeout);
        roundEndTimeout = null;
    }
    awaitingRoundEnd = false;
    fallStarted = false;
    betPlaced = false;
    betResolved = true;
    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║ STAKE-COMPLIANT: Hard-lock backend payout as ONLY source of truth      ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    backendFinalPayoutDisplay = finalPayout;
    visualScore = finalPayout;  // Snap to final value
    visualEarnings = visualScore;  // Keep legacy alias in sync
    updateScoreDisplay();
    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║ LOSS SCENARIO: If payout is 0, trigger explosion animation             ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    if (finalPayout === 0 || finalPayout < 0.01) {
        triggerExplosion();
        // Wait for explosion to finish before completing round
        setTimeout(async () => {
            cleanupExplosion();
            await completeRound();
        }, 2500);
    } else {
        await completeRound();
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: GAME INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════
async function initializeGame() {
    gameSession.state = GameState.AUTHENTICATING;
    showLoadingScreen(TERMS.connecting);
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
        // Rules modal now only shown when rules button is clicked
    } catch (error) {
        const shouldRetry = await handleRGSError(error);
        if (shouldRetry) {
            await initializeGame();
        } else {
            hideLoadingScreen();
            showFatalError(TERMS.fatalError);
        }
    }
}
async function handleUnfinishedRound(roundData) {
    gameSession.state = GameState.RECOVERING;
    showLoadingScreen(TERMS.recovering);
    gameSession.currentRound = {
        roundId: roundData.round_id,
        simulationId: roundData.simulation_id,
        bet: roundData.bet,
        visualTimeline: [],
        status: 'active'
    };
    try {
        const result = await RGS_API.endRound(
            gameSession.currentRound.roundId,
            gameSession.currentRound.simulationId
        );
        gameSession.balance = result.balance;
        gameSession.currentRound = null;
        gameSession.state = GameState.READY;
        showMessage(`${TERMS.recovered}: ${TERMS.currency}${fromRGSAmount(result.payout).toFixed(2)}`);
    } catch (error) {
        await handleRGSError(error);
    }
}
async function attemptReauthentication() {
    if (gameSession.retryCount >= gameSession.maxRetries) {
        showFatalError(TERMS.sessionRestore);
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
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: BET PLACEMENT
// ═══════════════════════════════════════════════════════════════════════════
async function placeBet() {
    if (gameSession.state !== GameState.READY) return;
    const effectiveBet = bonusMode ? betAmount * 10 : betAmount;
    const betInRGS = toRGSAmount(effectiveBet);
    if (betInRGS < gameSession.minBet) {
        showError(`${TERMS.minBet} ${TERMS.currency}${fromRGSAmount(gameSession.minBet).toFixed(2)}`);
        return;
    }
    if (betInRGS > gameSession.maxBet) {
        showError(`${TERMS.maxBet} ${TERMS.currency}${fromRGSAmount(gameSession.maxBet).toFixed(2)}`);
        return;
    }
    if (betInRGS > gameSession.balance) {
        showError(TERMS.insufficientBalance);
        return;
    }
    gameSession.state = GameState.PLACING_BET;
    lockBetUI();
    betBtn.textContent = TERMS.starting;
    try {
        const response = await RGS_API.play(betInRGS, bonusMode ? 'bonus' : 'normal');
        gameSession.currentRound = createRoundData(response);
        gameSession.balance = response.balance;
        updateBalanceUI();
        gameSession.retryCount = 0;
        eventTimeline = response.visualTimeline || [];
        currentEventIndex = 0;
        roundStartTime = performance.now();
        awaitingRoundEnd = false;
        gameSession.state = GameState.ANIMATING;
        startGame();
    } catch (error) {
        const shouldRetry = await handleRGSError(error);
        if (shouldRetry && gameSession.state === GameState.PLACING_BET) {
            await placeBet();
        } else {
            betBtn.textContent = TERMS.placeBet;
        }
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: ROUND COMPLETION (ONLY CALLED BY RGS EVENT)
// ═══════════════════════════════════════════════════════════════════════════
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FIX #1: completeRound is now PRIVATE - only called by handleRoundEndEvent  ║
// ╚════════════════════════════════════════════════════════════════════════════╝
async function completeRound() {
    if (!gameSession.currentRound) return;
    if (gameSession.currentRound.status === 'completed') return;
    if (gameSession.state === GameState.ENDING_ROUND) return;
    gameSession.currentRound.status = 'completed';
    gameSession.state = GameState.ENDING_ROUND;
    try {
        const result = await RGS_API.endRound(
            gameSession.currentRound.roundId,
            gameSession.currentRound.simulationId
        );
        gameSession.balance = result.balance;
        // STAKE-COMPLIANT: Settlement MUST use authoritative backend payout
        const payoutDisplay = backendFinalPayoutDisplay;
        // Show end screen (auto-dismiss)
        runOverEl.innerHTML = `${TERMS.roundOver}<br>${TERMS.totalWinnings}: ${TERMS.currency}${payoutDisplay.toFixed(2)}`;
        runOverEl.style.display = "block";
        // Auto-dismiss after 3.5 seconds
        setTimeout(() => {
            runOverEl.style.display = "none";
            resetGameWorld();
            unlockBetUI();
        }, 3500);
        gameSession.currentRound = null;
        gameSession.state = GameState.READY;
        gameSession.retryCount = 0;
        updateBalanceUI();
        // Note: Now user-triggered dismiss replaces timeout
    } catch (error) {
        if (gameSession.currentRound) {
            gameSession.currentRound.status = 'active';
        }
        const shouldRetry = await handleRGSError(error);
        if (shouldRetry) {
            await completeRound();
        }
    }
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FIX #1: enterWaitingState - When animation ends, show loader and wait      ║
// ║ Frontend does NOT end the round - it waits for RGS round_end event         ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function enterWaitingState() {
    if (awaitingRoundEnd) return;
    awaitingRoundEnd = true;
    gameSession.state = GameState.WAITING_FOR_END;
    // Show waiting indicator
    showWaitingIndicator();
    // Safety timeout - if RGS doesn't respond in 30s, show error
    // But we still DON'T complete the round - user must refresh
    roundEndTimeout = setTimeout(() => {
        if (awaitingRoundEnd) {
            hideWaitingIndicator();
            showError(TERMS.connectionFailed);
            // Note: We do NOT call completeRound() here
            // The round can only be completed by RGS
        }
    }, 30000);
}
function showWaitingIndicator() {
    let indicator = document.getElementById('waitingIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'waitingIndicator';
        indicator.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8); color: white; padding: 20px 40px;
    border-radius: 10px; font-size: 18px; z-index: 999998;
    display: flex; align-items: center; gap: 15px;
`;
        indicator.innerHTML = `
    <div class="spinner" style="width: 24px; height: 24px; border: 3px solid #fff;
        border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;">
    </div>
    <span>${TERMS.waiting}</span>
`;
        document.body.appendChild(indicator);
        // Add spinner animation if not exists
        if (!document.getElementById('spinnerStyle')) {
            const style = document.createElement('style');
            style.id = 'spinnerStyle';
            style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }
    }
    indicator.style.display = 'flex';
}
function hideWaitingIndicator() {
    const indicator = document.getElementById('waitingIndicator');
    if (indicator) indicator.style.display = 'none';
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: RULES MODAL & DISCLAIMER (USING TERMS)
// ═══════════════════════════════════════════════════════════════════════════
function createRulesModal() {
    const modal = document.createElement('div');
    modal.id = 'rulesModal';
    modal.style.cssText = `
display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
background: rgba(0,0,0,0.85); z-index: 1000000; justify-content: center; 
align-items: center; font-family: Arial, sans-serif;
`;
    modal.innerHTML = `
<div style="background: #1a1a2e; color: white; padding: 40px; border-radius: 16px; 
    max-width: 600px; max-height: 80vh; overflow-y: auto; margin: 20px;">
    <h2 style="margin-top: 0; color: #00d4ff;">${TERMS.rulesTitle}</h2>
    
    <h3>${TERMS.howToPlay}</h3>
    <p>${TERMS.howToPlayText}</p>
    
    <h3>${TERMS.featureZone}</h3>
    <p>${TERMS.featureZoneText}</p>
    
    <h3>${TERMS.gameInfo}</h3>
    <ul style="list-style: none; padding: 0;">
        <li><strong>${TERMS.rtpLabel}:</strong> ${COMPLIANCE_CONFIG.RTP}</li>
        <li><strong>${TERMS.maxWinLabel}:</strong> ${COMPLIANCE_CONFIG.MAX_WIN}</li>
    </ul>
    
    <div style="background: #2d2d44; padding: 15px; border-radius: 8px; margin: 20px 0; 
        font-size: 12px; color: #aaa;">
        <strong>Disclaimer:</strong><br>
        ${TERMS.disclaimer}
    </div>
    
    <button id="closeRulesBtn" style="width: 100%; padding: 15px; background: #00d4ff; 
        color: #000; border: none; border-radius: 8px; font-size: 18px; cursor: pointer; 
        font-weight: bold;">
        ${TERMS.understand}
    </button>
</div>
`;
    document.body.appendChild(modal);
    document.getElementById('closeRulesBtn').onclick = () => {
        modal.style.display = 'none';
    };
    return modal;
}
function showRulesModal() {
    let modal = document.getElementById('rulesModal');
    if (!modal) {
        modal = createRulesModal();
    }
    modal.style.display = 'flex';
}
function createRulesButton() {
    const btn = document.createElement('button');
    btn.id = 'rulesBtn';
    btn.innerHTML = '?';
    btn.style.cssText = `
position: fixed; top: 20px; right: 20px; width: 40px; height: 40px;
border-radius: 50%; background: rgba(0, 212, 255, 0.8); color: #000;
border: none; font-size: 24px; font-weight: bold; cursor: pointer;
z-index: 999998;
`;
    btn.onclick = showRulesModal;
    document.body.appendChild(btn);
}
function createDisclaimer() {
    const disclaimer = document.createElement('div');
    disclaimer.id = 'gameDisclaimer';
    disclaimer.style.cssText = `
position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
background: rgba(0, 0, 0, 0.7); color: #888; padding: 8px 16px;
border-radius: 4px; font-size: 10px; z-index: 999997; max-width: 80%;
text-align: center;
`;
    disclaimer.textContent = TERMS.disclaimer;
    document.body.appendChild(disclaimer);
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 12: UI HELPERS (USING TERMS)
// ═══════════════════════════════════════════════════════════════════════════
function showLoadingScreen(message) {
    let el = document.getElementById('loadingScreen');
    if (!el) {
        el = document.createElement('div');
        el.id = 'loadingScreen';
        el.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
    background: rgba(0,0,0,0.9); display: flex; justify-content: center; 
    align-items: center; z-index: 999999; color: white; font-size: 24px;`;
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
    el.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
background: rgba(150, 30, 30, 0.98); color: white; padding: 40px; border-radius: 12px; 
text-align: center; z-index: 999999;`;
    el.innerHTML = `<h2>${TERMS.errorTitle}</h2><p>${message}</p>
<button onclick="location.reload()" style="padding: 10px 30px; margin-top: 20px; cursor: pointer;">
    ${TERMS.refresh}
</button>`;
    document.body.appendChild(el);
}
function showMessage(message) {
    const el = document.createElement('div');
    el.style.cssText = `position: fixed; top: 100px; left: 50%; transform: translateX(-50%); 
background: rgba(50, 150, 50, 0.95); color: white; padding: 15px 30px; 
border-radius: 8px; z-index: 999999;`;
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
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 13: SCORE & UI DISPLAY (USING TERMS)
// ═══════════════════════════════════════════════════════════════════════════
function showScore() {
    scoreEl.style.display = "block";
    updateScoreDisplay();
}
function updateScoreDisplay() {
    // STAKE-COMPLIANT: Cap visual score to never exceed backend payout
    const cappedScore = backendFinalPayoutDisplay > 0
        ? Math.min(visualScore, backendFinalPayoutDisplay)
        : visualScore;
    scoreEl.textContent = `${TERMS.currency}${cappedScore.toFixed(2)}`;
}
function showMultiplier(m) {
    multiplierEl.textContent = `×${m.toFixed(2)}`;
    multiplierEl.style.display = "block";
}
function hideMultiplier() {
    multiplierEl.style.display = "none";
}
function showFlipText(text) {
    // Use TERMS for flip text
    const displayText = text === 'backflip' ? TERMS.backflip : TERMS.frontflip;
    flipTextEl.textContent = displayText;
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
    betBtn.textContent = TERMS.placeBet;
}
function updateBalanceUI() {
    const displayBalance = fromRGSAmount(gameSession.balance);
    balanceEl.textContent = `${TERMS.balance} ${TERMS.currency}${displayBalance.toFixed(2)}`;
    const effectiveBet = bonusMode ? betAmount * 10 : betAmount;
    betInput.value = effectiveBet.toFixed(2);
    const canBet = gameSession.state === GameState.READY &&
        toRGSAmount(effectiveBet) <= gameSession.balance &&
        toRGSAmount(effectiveBet) >= gameSession.minBet;
    betBtn.disabled = !canBet;
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 14: BET CONTROLS (initialized after DOM elements are defined)
// ═══════════════════════════════════════════════════════════════════════════
function initBetControls() {
    const plusBtn = document.getElementById("plus");
    const minusBtn = document.getElementById("minus");
    const betInput = document.getElementById("betAmount");
    const betBtn = document.getElementById("placeBet");
    const bonusToggle = document.getElementById("bonusToggle");
    if (plusBtn) {
        plusBtn.onclick = () => {
            if (gameSession.state !== GameState.READY) return;
            const step = fromRGSAmount(gameSession.stepBet);
            const max = fromRGSAmount(gameSession.maxBet);
            if (betAmount + step <= max) betAmount += step;
            updateBalanceUI();
        };
    }
    if (minusBtn) {
        minusBtn.onclick = () => {
            if (gameSession.state !== GameState.READY) return;
            const step = fromRGSAmount(gameSession.stepBet);
            const min = fromRGSAmount(gameSession.minBet);
            betAmount = Math.max(min, betAmount - step);
            updateBalanceUI();
        };
    }
    if (betInput) {
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
    }
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
    if (betBtn) {
        betBtn.onclick = placeBet;
    }
    if (bonusToggle) {
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
    }
}
// Will be called after DOM is ready
document.addEventListener('DOMContentLoaded', initBetControls);
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 15: GAME CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const REUSE_DISTANCE = 1500;
const gameScale = document.getElementById("game-scale");
function scaleGame() {
    const scaleX = window.innerWidth / 1920;
    const scaleY = window.innerHeight / 1200;
    const scale = Math.min(scaleX, scaleY);
    gameScale.style.setProperty('--game-scale', scale);
    if (scale < 0.5) {
        document.body.classList.add('mini-player');
    } else {
        document.body.classList.remove('mini-player');
    }
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
let forceLandingActive = false;
const GRAVITY = 0.55;
const MAX_FALL = 30;
const AIR_FRICTION = 0.95;
const GROUND_FRICTION = 0.2;
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 16: GAME ENTITIES
// ═══════════════════════════════════════════════════════════════════════════
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
let bhAnimationStartTime = 0;  // FIX #2: For time-based animation
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
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 17: GAME LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════
function startGame() {
    camX = camY = velX = velY = angle = angVel = 0;
    visualEarnings = 0;
    lastCamY = 0;
    fallStarted = true;
    betPlaced = true;
    betResolved = false;
    forceLandingActive = false;
    awaitingRoundEnd = false;
    betBtn.textContent = TERMS.inProgress;
}
function resetGameWorld() {
    clearWorld();
    camX = camY = velX = velY = angle = angVel = 0;
    visualEarnings = 0;
    lastCamY = 0;
    fallStarted = false;
    betPlaced = false;
    betResolved = false;
    forceLandingActive = false;
    awaitingRoundEnd = false;
    eventTimeline = [];
    currentEventIndex = 0;
    gameFrozen = false; // Unfreeze game for next round
    hideWaitingIndicator();
    spawnWorld();
    spawnCollectibles(PRESET_SPAWN_COUNT);
    silverjetWrap.style.display = "block";
}
function clearWorld() {
    [...collectibles, ...chains, ...notes].forEach(c => c.el.remove());
    collectibles.length = chains.length = notes.length = 0;

    pushables.forEach(p => p.el.remove());
    pushables.length = 0;

    // FIX: Clear clouds and other entities to prevent accumulation
    clouds.forEach(c => c.el.remove());
    clouds.length = 0;

    darkClouds.forEach(c => c.el.remove());
    darkClouds.length = 0;

    blackHoles.forEach(bh => bh.el.remove());
    blackHoles.length = 0;
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 18: VISUAL SPAWNING (COSMETIC ONLY)
// [Keep all spawn functions from previous version - unchanged]
// ═══════════════════════════════════════════════════════════════════════════
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ BACKEND-CONTROLLED SPAWN: Collectibles                                      ║
// ║ Uses backend spawn_data instead of Math.random() for Stake compliance       ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function spawnCollectibles(count = PRESET_SPAWN_COUNT) {
    [...collectibles, ...chains, ...notes].forEach(c => c.el.remove());
    collectibles.length = chains.length = notes.length = 0;
    // Use backend spawn data if available
    if (spawnData && spawnData.collectibles && spawnData.collectibles.length > 0) {
        for (const item of spawnData.collectibles) {
            const el = document.createElement("div");
            let arr;
            if (item.type === 'chain') {
                el.className = "collectible chain";
                arr = chains;
            } else {
                el.className = "collectible music";
                arr = notes;
            }
            el.style.left = (item.x - 85) + "px";
            el.style.top = (item.y - 85) + "px";
            world.appendChild(el);
            const obj = { x: item.x, y: item.y, el };
            arr.push(obj);
            collectibles.push(obj);
        }
        return;
    }
    // Fallback for initial page load (before first round)
    const TOP_SAFE = DEADZONE;
    const BOTTOM_SAFE = GROUND_Y - DEADZONE;
    const actualCount = bonusMode ? count * 2 : count;
    for (let i = 0; i < actualCount; i++) {
        const type = Math.random();
        const el = document.createElement("div");
        let arr;
        if (type < 0.4) {
            el.className = "collectible chain";
            arr = chains;
        } else {
            el.className = "collectible music";
            arr = notes;
        }
        const x = (Math.random() * SCREEN_W * 10) - (SCREEN_W * 5);
        let y;
        do { y = Math.random() * WORLDH; } while (y < TOP_SAFE || y > BOTTOM_SAFE);
        el.style.left = (x - 85) + "px";
        el.style.top = (y - 85) + "px";
        world.appendChild(el);
        const obj = { x, y, el };
        arr.push(obj);
        collectibles.push(obj);
    }
}
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ BACKEND-CONTROLLED SPAWN: Black Holes                                       ║
// ║ Uses backend spawn_data - will_trigger flag indicates which one triggers    ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function spawnBlackHoles(count = blackholequantity) {
    blackHoles.forEach(bh => bh.el.remove());
    blackHoles.length = 0;
    // Use backend spawn data if available
    if (spawnData && spawnData.black_holes && spawnData.black_holes.length > 0) {
        for (const item of spawnData.black_holes) {
            const el = document.createElement("div");
            el.className = "black-hole";
            el.style.width = BH_SIZE + "px";
            el.style.height = BH_SIZE + "px";
            el.style.background = `url('items/black_hole_1.png') no-repeat center/contain`;
            el.style.left = item.x + "px";
            el.style.top = item.y + "px";
            world.appendChild(el);
            blackHoles.push({
                x: item.x,
                y: item.y,
                el,
                rotation: 0,
                willTrigger: item.will_trigger || false  // Backend determines which triggers bonus
            });
        }
        return;
    }
    // Fallback for initial page load
    const TOP_SAFE = DEADZONE;
    const BOTTOM_SAFE = GROUND_Y - DEADZONE - BH_SIZE;
    for (let i = 0; i < count; i++) {
        const el = document.createElement("div");
        el.className = "black-hole";
        el.style.width = BH_SIZE + "px";
        el.style.height = BH_SIZE + "px";
        el.style.background = `url('items/black_hole_1.png') no-repeat center/contain`;
        const x = randX();
        const y = TOP_SAFE + Math.random() * (BOTTOM_SAFE - TOP_SAFE);
        el.style.left = x + "px";
        el.style.top = y + "px";
        world.appendChild(el);
        blackHoles.push({ x, y, el, rotation: 0, willTrigger: false });
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
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ BACKEND-CONTROLLED SPAWN: Pushables                                         ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function spawnPushables(count = pushablequantity) {
    pushables.forEach(p => p.el.remove());
    pushables.length = 0;
    // Use backend spawn data if available
    if (spawnData && spawnData.pushables && spawnData.pushables.length > 0) {
        for (const item of spawnData.pushables) {
            const el = document.createElement("div");
            el.className = "pushable";
            el.style.width = "550px";
            el.style.height = "550px";
            el.style.background = "url('items/pushable.png') no-repeat center/contain";
            el.style.left = item.x + "px";
            el.style.top = item.y + "px";
            world.appendChild(el);
            pushables.push({ x: item.x, y: item.y, el, velX: 0, velY: 0 });
        }
        return;
    }
    // Fallback for initial page load
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
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ BACKEND-CONTROLLED SPAWN: World spawning                                    ║
// ║ Uses backend spawn_data for clouds and dark clouds when available           ║
// ╚════════════════════════════════════════════════════════════════════════════╝
function spawnWorld() {
    // Spawn clouds using backend data if available
    if (!bonusMode) {
        if (spawnData && spawnData.clouds && spawnData.clouds.length > 0) {
            for (const item of spawnData.clouds) {
                spawnCloud(item.x, item.y);
            }
        } else {
            // Fallback for initial page load
            for (let i = 0; i < cloudquantity; i++) spawnCloud(randX(), spawnY());
        }
    }
    // Spawn dark clouds using backend data if available
    if (spawnData && spawnData.dark_clouds && spawnData.dark_clouds.length > 0) {
        for (const item of spawnData.dark_clouds) {
            spawnDarkCloud(item.x, item.y);
        }
    } else {
        // Fallback for initial page load
        for (let i = 0; i < darkcloudquantity; i++) spawnDarkCloud(randX(), spawnY());
    }
    spawnBlackHoles(blackholequantity);
    spawnTanks(TANK_COUNT);
    spawnCamps(CAMP_COUNT);
    spawnPushables(bonusMode ? 2000 : 20);
}
spawnWorld();
spawnCollectibles(PRESET_SPAWN_COUNT);
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 19: PLAYER COLLIDERS & PHYSICS
// [Keep all physics functions from previous version]
// ═══════════════════════════════════════════════════════════════════════════
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
// Recycling functions
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
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 20: COLLISION RESOLUTION (COSMETIC)
// ═══════════════════════════════════════════════════════════════════════════
function resolveCollisions() {
    let onGround = false;
    const muKinetic = 0.08;
    const r = PLAYER_W * 0.45;
    const I = 2.5 * r * r;
    const PLAYER_COLLIDERS = getPlayerColliders();
    const bodyCX = camX + PLAYER_X;
    const bodyCY = camY + PLAYER_Y;
    const contacts = [];
    // Cloud physics (cosmetic only)
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
    // Dark cloud - visual effect only
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
    // Black hole - PASS THROUGH (No physical collision)
    // Trigger logic is handled by checkBlackHoleCollision()
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
    // Pushables
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
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FIX #1: Stuck detection NO LONGER ends round - just shows waiting state    ║
// ╚════════════════════════════════════════════════════════════════════════════╝
let stuckLastY = 0;
let stuckStartTime = null;
function checkStuck() {
    if (inBlackHole || bhAnimating || gameSession.state !== GameState.ANIMATING) return;
    const movement = Math.abs(camY - stuckLastY);
    stuckLastY = camY;
    if (movement < 5) {
        if (!stuckStartTime) stuckStartTime = performance.now();
        else if (performance.now() - stuckStartTime > 3000) {
            // FIX #1: Don't force end round, just enter waiting state
            enterWaitingState();
        }
    } else {
        stuckStartTime = null;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 21: BLACK HOLE ANIMATION
// ═══════════════════════════════════════════════════════════════════════════
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
function exitBlackHole() {
    inBlackHole = false;
    fallScorePaused = false;
    camX = bhReturnX;
    camY = bhReturnY;
    velX = velY = angVel = 0;
    voidSprites.forEach(s => s.el.remove());
    voidSprites.length = 0;
    if (bhMovingBgEl) {
        bhMovingBgEl.remove();
        bhMovingBgEl = null;
    }
    sprite.style.backgroundImage = originalSpriteBg;
    startBlackHoleAnimation('exit', camX + PLAYER_X, camY + PLAYER_Y);
    exitingAnimation = true;
    exitAnimStart = performance.now();
    hideMultiplier();
    showScore();
}
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 22: MAIN UPDATE LOOP
// ═══════════════════════════════════════════════════════════════════════════
// ╔════════════════════════════════════════════════════════════════════════════╗
// ║ FIX #2: Time-based animation duration for black hole multiplier            ║
// ╚════════════════════════════════════════════════════════════════════════════╝
const BH_ANIMATION_DURATION = 3000; // 3 seconds to reach target multiplier
function update() {
    if (!introFinished) return;
    // Process RGS event timeline
    if (gameSession.state === GameState.ANIMATING || gameSession.state === GameState.WAITING_FOR_END) {
        processEventTimeline();
    }
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
        if (bhShowcaseStart === 0) {
            // Visual movement (cosmetic)
            camY -= BH_RISE_SPEED * (fastplayEnabled ? 3 : 1);
            // ╔════════════════════════════════════════════════════════════════╗
            // ║ FIX #2: TIME-BASED multiplier animation, NOT position-based    ║
            // ║ This eliminates perceived causality between movement & value   ║
            // ╚════════════════════════════════════════════════════════════════╝
            const elapsed = performance.now() - bhAnimationStartTime;
            const duration = fastplayEnabled ? BH_ANIMATION_DURATION / 3 : BH_ANIMATION_DURATION;
            const timeProgress = Math.min(elapsed / duration, 1);
            // Smooth easing function
            const eased = 1 - Math.pow(1 - timeProgress, 3);
            // Interpolate multiplier based on TIME, not position
            bhCurrentMultiplier = lerp(1, bhTargetMultiplier, eased);
            showMultiplier(bhCurrentMultiplier);
            // Exit when TIME animation reaches target
            if (timeProgress >= 1) {
                finalEarnings = originalEarnings * bhTargetMultiplier;
                bhShowcaseStart = performance.now();
            }
        } else {
            const elapsed = performance.now() - bhShowcaseStart;
            const duration = fastplayEnabled ? 333 : 1000;
            const progress = Math.min(elapsed / duration, 1);
            showcaseScore = originalEarnings + (finalEarnings - originalEarnings) * progress;
            if (elapsed >= duration) {
                // STAKE-COMPLIANT: Snap to backend payout, not physics-derived value
                visualScore = backendFinalPayoutDisplay;
                visualEarnings = visualScore;  // Keep legacy alias in sync
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
            velX = Math.sin((Math.random() - 0.5) * Math.PI / 2) * 28;
            velY = -Math.cos((Math.random() - 0.5) * Math.PI / 2) * 28;
            angVel = (Math.random() - 0.5) * 0.08;
        }
        render();
        requestAnimationFrame(update);
        return;
    }
    // Normal game loop - Skip if game is frozen
    if (gameFrozen) {
        render();
        requestAnimationFrame(update);
        return;
    }
    recycleClouds();
    recycleDarkClouds();
    recycleBlackHoles();
    recyclePushables();
    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║ INVERTED CONTROL: Physics drives Score                                  ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    updateInvertedScore();           // Calculate score from max depth reached
    checkBlackHoleCollision();       // Sync black hole trigger with visual collision
    checkNaturalGameEnd();           // End game when physically stopped (stuck)
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
    // Physics (cosmetic only)
    if (fallStarted && !onGround) {
        velY += GRAVITY;
    }
    if (forceLandingActive) {
        velY = Math.min(velY + 1, MAX_FALL);
        velX *= 0.9;
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
    velX *= onGround ? GROUND_FRICTION : AIR_FRICTION;
    angVel *= onGround ? 0.35 : 0.989;
    angle += angVel;
    // Flip detection
    angleAccumulator += angVel;
    if (Math.abs(angleAccumulator) >= 2 * Math.PI) {
        showFlipText(angleAccumulator > 0 ? 'backflip' : 'frontflip');
        angleAccumulator = 0;
    }
    // Collectible visual pickup
    function checkVisualPickup(arr) {
        const playerColliders = getPlayerColliders();
        for (let i = arr.length - 1; i >= 0; i--) {
            const c = arr[i];
            for (const pc of playerColliders) {
                if ((pc.x - c.x) ** 2 + (pc.y - c.y) ** 2 < (pc.r + 85) ** 2) {
                    c.el.remove();
                    arr.splice(i, 1);
                    break;
                }
            }
        }
    }
    checkVisualPickup(chains);
    checkVisualPickup(notes);
    // ╔════════════════════════════════════════════════════════════════════════╗
    // ║ FIX #1: Ground landing does NOT complete round                         ║
    // ║ It only enters waiting state - round_end comes from RGS                ║
    // ╚════════════════════════════════════════════════════════════════════════╝
    if (onGround && fallStarted && !betResolved && !awaitingRoundEnd) {
        if (landedTime === 0) {
            landedTime = performance.now();
        } else if (performance.now() - landedTime > 1000) {
            // FIX #1: Don't complete round, enter waiting state
            enterWaitingState();
        }
    } else if (!onGround) {
        landedTime = 0;
    }
    lastCamY = camY;
    render();
    // checkStuck(); // Handled by checkNaturalGameEnd
    requestAnimationFrame(update);
    updateGroundEntitiesVisibility();
}
function render() {
    if (inBlackHole && bhShowcaseStart === 0) {
        scoreEl.style.display = "none";
    } else {
        scoreEl.style.display = "block";
        // STAKE-COMPLIANT: Cap display to never exceed backend payout
        const display = (inBlackHole && bhShowcaseStart > 0) ? showcaseScore : visualScore;
        const cappedDisplay = backendFinalPayoutDisplay > 0
            ? Math.min(display, backendFinalPayoutDisplay)
            : display;
        scoreEl.textContent = `${TERMS.currency}${cappedDisplay.toFixed(2)}`;
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
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 23: LOADING SYSTEM & INTRO SEQUENCE
// ═══════════════════════════════════════════════════════════════════════════

let introFinished = false;
const studioVideo = document.getElementById("studioVideo");
const gameIntroVideo = document.getElementById("gameIntroVideo");
const startScreen = document.getElementById("startScreen");

function initLoadingSystem() {
    const minTime = 4000; // Minimum visual time (4 seconds)
    const startTime = performance.now();
    let loadedCount = 0;

    // Define critical assets to wait for
    // If these files don't exist, the error handler ensures we don't hang
    const assetUrls = [
        // "sounds/win.mp3",  // File missing
        // "sounds/loss.mp3", // File missing
        // "sounds/cardflip.wav", // File missing
    ];
    const totalAssets = assetUrls.length;

    const updateProgressBar = (percent) => {
        const bar = document.getElementById("loadingBarFill");
        if (bar) bar.style.width = `${percent}%`;
    };

    const finishLoading = () => {
        updateProgressBar(100);
        const elapsed = performance.now() - startTime;
        const remaining = Math.max(0, minTime - elapsed);

        setTimeout(() => {
            const overlay = document.getElementById("loadingOverlay");
            if (overlay) {
                overlay.style.opacity = "0"; // Fade out
                setTimeout(() => {
                    overlay.style.display = "none"; // Remove from DOM
                    playGameIntro(); // Start the next phase
                }, 500); // Wait for transition
            }
        }, remaining);
    };

    // Preload Assets
    assetUrls.forEach((src) => {
        const audio = new Audio();
        audio.src = src;
        audio.oncanplaythrough = () => { loadedCount++; };
        audio.onerror = () => {
            console.warn(`Failed to load ${src}`);
            loadedCount++; // Count as loaded to avoid blocking
        };
        audio.load();
    });

    // Progress Interval
    const interval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        // 0% -> 90% over 4 seconds
        const timeProgress = Math.min(90, (elapsed / minTime) * 100);

        // Check completion condition
        if (loadedCount === totalAssets) {
            const completeProgress = Math.min(100, (elapsed / minTime) * 100);
            updateProgressBar(completeProgress);
        } else {
            // Stall at 90%
            updateProgressBar(timeProgress);
        }

        if (elapsed >= minTime && loadedCount === totalAssets) {
            clearInterval(interval);
            finishLoading();
        }
    }, 50);
}

function playGameIntro() {
    if (!gameIntroVideo) {
        onGameIntroEnd();
        return;
    }
    gameIntroVideo.style.display = "block";
    const playPromise = gameIntroVideo.play();

    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.log("Auto-play prevented (game intro). Showing start screen.");
            onGameIntroEnd();
        });
    }

    gameIntroVideo.onended = onGameIntroEnd;
}

function onGameIntroEnd() {
    if (gameIntroVideo) gameIntroVideo.style.display = "none";

    if (startScreen) {
        startScreen.style.display = "flex";

        const handler = () => {
            startScreen.removeEventListener("click", handler);
            document.removeEventListener("keydown", handler);
            onStartPress();
        };

        startScreen.addEventListener("click", handler);
        document.addEventListener("keydown", handler);
    } else {
        onStartPress();
    }
}

async function onStartPress() {
    if (startScreen) startScreen.style.display = "none";
    introFinished = true;

    createRulesButton();
    createDisclaimer();

    await initializeGame();
    update();
}

// Start sequence on load
document.addEventListener('DOMContentLoaded', () => {
    initLoadingSystem();
});
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 24: VISUAL EFFECTS
// ═══════════════════════════════════════════════════════════════════════════
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
const animated_clouds = [];
let animated_clouds_lastTime = performance.now();
function createAnimatedCloud(layer, count, speedMin, speedMax, yMin, yMax, sizeScale) {
    const container = document.querySelector(layer);
    if (!container) return;
    // Use full viewport width plus buffer for complete coverage
    const spawnWidth = Math.max(window.innerWidth, 1920) + 1000;
    for (let i = 0; i < count; i++) {
        const cloud = document.createElement("div");
        const scale = (0.7 + Math.random() * 0.6) * sizeScale;
        const y = Math.random() * (yMax - yMin) + yMin;
        const x = Math.random() * spawnWidth - 500;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        cloud.style.position = "absolute";
        cloud.style.top = y + "px";
        cloud.style.transform = `translate3d(${x}px, 0, 0) scale(${scale})`;
        container.appendChild(cloud);
        animated_clouds.push({ el: cloud, x, y, speed, yMin, yMax, scale, spawnWidth });
    }
}
// Increased cloud counts for better coverage
createAnimatedCloud(".back", 25, 200, 450, 0, 850, 0.8);
createAnimatedCloud(".mid", 20, 450, 600, 0, 1050, 0.9);
createAnimatedCloud(".front", 15, 700, 1000, 0, 1200, 1.3);
function animateAnimatedClouds(now) {
    // Skip animation if game is frozen
    if (typeof gameFrozen !== 'undefined' && gameFrozen) {
        requestAnimationFrame(animateAnimatedClouds);
        return;
    }
    const dt = (now - animated_clouds_lastTime) / 1000;
    animated_clouds_lastTime = now;
    // Use full viewport width plus buffer for consistent wrapping
    const viewportWidth = Math.max(window.innerWidth, 1920) + 500;
    animated_clouds.forEach(c => {
        c.x += c.speed * dt;
        if (c.x > viewportWidth) {
            c.x = -500;
            c.y = Math.random() * (c.yMax - c.yMin) + c.yMin;
            c.el.style.top = c.y + "px";
        }
        c.el.style.transform = `translate3d(${c.x}px, 0, 0) scale(${c.scale})`;
    });
    requestAnimationFrame(animateAnimatedClouds);
}
requestAnimationFrame(animateAnimatedClouds);
// ═══════════════════════════════════════════════════════════════════════════
// SECTION 25: FASTPLAY SUPPORT
// ═══════════════════════════════════════════════════════════════════════════
let fastplayEnabled = false;
const fastplayBtn = document.createElement('button');
fastplayBtn.id = 'fastplayBtn';
fastplayBtn.textContent = TERMS.fastOff;
fastplayBtn.style.cssText = `
padding: 12px 20px; background: rgba(255, 200, 0, 0.9); color: #000; border: none;
border-radius: 16px; cursor: pointer; font-weight: 900; font-size: 16px;
box-shadow: inset 0 0 35px rgba(255,255,255,0.45), 0 18px 40px rgba(0,0,0,0.35);
white-space: nowrap;
`;
fastplayBtn.onclick = () => {
    fastplayEnabled = !fastplayEnabled;
    fastplayBtn.style.background = fastplayEnabled ?
        'rgba(0, 255, 100, 0.9)' : 'rgba(255, 200, 0, 0.9)';
    fastplayBtn.textContent = fastplayEnabled ? TERMS.fastOn : TERMS.fastOff;
};
// Add fast button to bet panel
const betPanel = document.querySelector('.bet-ui');
if (betPanel) {
    betPanel.appendChild(fastplayBtn);
} else {
    // Fallback: create a container in the bet panel area
    console.warn('Bet panel not found, fastplay button appended to body');
    document.body.appendChild(fastplayBtn);
}
// CSS for mini-player mode and animations
const complianceStyles = document.createElement('style');
complianceStyles.textContent = `
.mini-player #gameDisclaimer { display: none; }
.mini-player #rulesBtn { width: 30px; height: 30px; font-size: 18px; }
.mini-player #fastplayBtn { padding: 4px 8px; font-size: 12px; }
 
@keyframes floatUp {
0% { opacity: 1; transform: translateY(0); }
100% { opacity: 0; transform: translateY(-50px); }
}
 
@keyframes spin {
to { transform: rotate(360deg); }
}
`;
document.head.appendChild(complianceStyles);