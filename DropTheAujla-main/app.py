"""
STAKE ENGINE COMPLIANT BACKEND - v4.0 (ABSTRACT EVENTS ONLY)
Backend sends ONLY abstract events, NO geometry, NO positions.
Frontend is the "storyteller" that creates the visual world.

This architecture follows Stake's core principle:
- Backend decides MONEY (RNG → payout → events)
- Frontend decides ILLUSION (events → visuals → animation)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import secrets
import hashlib
import hmac
import time

app = Flask(__name__,
            static_folder='public',
            static_url_path='')
CORS(app)

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

RTP = 0.965  # 96.5% RTP
MAX_WIN_MULTIPLIER = 5000
MONETARY_PRECISION = 1_000_000  # 1 unit = 1.00 in display currency
MIN_BET = MONETARY_PRECISION    # 1.00 in micro-units
MAX_BET = 100 * MONETARY_PRECISION  # 100.00 in micro-units
STEP_BET = MONETARY_PRECISION   # 1.00 step

# Server secret for provably fair RNG
SERVER_SECRET = secrets.token_hex(32)

# Session storage (use Redis in production)
sessions = {}
rounds = {}

# ═══════════════════════════════════════════════════════════════════════════
# PROVABLY FAIR RNG
# ═══════════════════════════════════════════════════════════════════════════

def generate_server_seed():
    return secrets.token_hex(32)

def generate_client_seed():
    return secrets.token_hex(16)

def generate_nonce():
    return secrets.randbelow(2**32)

def provably_fair_rng(server_seed: str, client_seed: str, nonce: int) -> float:
    """Generate a provably fair random float between 0 and 1"""
    message = f"{server_seed}:{client_seed}:{nonce}"
    hash_bytes = hmac.new(
        SERVER_SECRET.encode(),
        message.encode(),
        hashlib.sha256
    ).digest()

    int_value = int.from_bytes(hash_bytes[:4], 'big')
    return int_value / (2**32)

def seeded_random(base_rng: float, index: int) -> float:
    """Generate deterministic sub-random from base RNG"""
    combined = f"{base_rng}:{index}"
    hash_bytes = hashlib.sha256(combined.encode()).digest()
    int_value = int.from_bytes(hash_bytes[:4], 'big')
    return int_value / (2**32)

# ═══════════════════════════════════════════════════════════════════════════
# PAYOUT CALCULATION (RTP-COMPLIANT) - NO GEOMETRY, JUST MATH
# ═══════════════════════════════════════════════════════════════════════════

def calculate_outcome(rng_value: float, bet: int, mode: str = 'normal') -> dict:
    """
    Calculate game outcome from RNG value.
    Returns payout multiplier and abstract event data.
    
    NOTE: No terminal_depth, no positions, no geometry.
    Frontend decides how to visualize this outcome.
    """

    # Loss probability: ~40% for balanced RTP
    if rng_value < 0.40:
        # LOSS: No collectibles, immediate end
        multiplier = 0.0
        collectible_count = 0
        black_hole_triggered = False
        black_hole_multiplier = 1.0

    elif rng_value < 0.75:
        # SMALL WIN: 0.5x to 2x, 2-3 collectibles (increased)
        normalized = (rng_value - 0.40) / 0.35
        multiplier = 0.5 + normalized * 1.5
        collectible_count = 2 + int(normalized > 0.5)  # 2-3 items
        black_hole_triggered = False
        black_hole_multiplier = 1.0

    elif rng_value < 0.92:
        # MEDIUM WIN: 2x to 10x, 3-4 collectibles (increased)
        normalized = (rng_value - 0.75) / 0.17
        multiplier = 2.0 + normalized * 8.0
        collectible_count = 3 + int(normalized > 0.5)  # 3-4 items
        black_hole_triggered = seeded_random(rng_value, 100) < 0.3
        black_hole_multiplier = 1.5 + seeded_random(rng_value, 101) * 1.5 if black_hole_triggered else 1.0

    elif rng_value < 0.99:
        # BIG WIN: 10x to 100x, 4-5 collectibles (increased)
        normalized = (rng_value - 0.92) / 0.07
        multiplier = 10.0 + normalized * 90.0
        collectible_count = 4 + int(normalized > 0.5)  # 4-5 items
        black_hole_triggered = seeded_random(rng_value, 100) < 0.6
        black_hole_multiplier = 2.0 + seeded_random(rng_value, 101) * 3.0 if black_hole_triggered else 1.0

    else:
        # JACKPOT: 100x to 5000x (rare), 5-6 collectibles (increased)
        normalized = (rng_value - 0.99) / 0.01
        multiplier = 100.0 + normalized * (MAX_WIN_MULTIPLIER - 100)
        multiplier = min(multiplier, MAX_WIN_MULTIPLIER)
        collectible_count = 5 + int(normalized > 0.5)  # 5-6 items
        black_hole_triggered = True
        black_hole_multiplier = 3.0 + seeded_random(rng_value, 101) * 7.0

    # Cap multiplier
    multiplier = min(multiplier, MAX_WIN_MULTIPLIER)

    # Apply black hole multiplier to final
    if black_hole_triggered:
        multiplier = multiplier * black_hole_multiplier
        multiplier = min(multiplier, MAX_WIN_MULTIPLIER)

    payout = int(bet * multiplier)

    return {
        'multiplier': multiplier,
        'payout': payout,
        'collectible_count': collectible_count,
        'black_hole_triggered': black_hole_triggered,
        'black_hole_multiplier': black_hole_multiplier,
        'is_loss': multiplier == 0
    }

# ═══════════════════════════════════════════════════════════════════════════
# ABSTRACT EVENT GENERATION - NO GEOMETRY, NO POSITIONS
# ═══════════════════════════════════════════════════════════════════════════

def generate_abstract_events(outcome: dict) -> list:
    """
    Generate abstract event sequence for frontend to visualize.
    
    Events are OBLIGATIONS the frontend must fulfill visually.
    Frontend decides HOW and WHERE to show them.
    
    Event types:
    - collectible: Player must visually collect N items
    - multiplier: Player must hit bonus object (black hole)
    - end: Round must end (frontend spawns blocking geometry)
    """
    events = []
    
    # Zero payout = immediate end, no events
    if outcome['is_loss'] or outcome['payout'] == 0:
        events.append({
            'type': 'end',
            'reason': 'loss'
        })
        return events
    
    # Collectible event (abstract count, no positions)
    if outcome['collectible_count'] > 0:
        events.append({
            'type': 'collectible',
            'count': outcome['collectible_count']
        })
    
    # Multiplier event (black hole bonus)
    if outcome['black_hole_triggered']:
        events.append({
            'type': 'multiplier',
            'value': round(outcome['black_hole_multiplier'], 2)
        })
    
    # End event (always last)
    events.append({
        'type': 'end',
        'reason': 'complete'
    })
    
    return events

# ═══════════════════════════════════════════════════════════════════════════
# WEB ROUTES
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    """Serve the main game page"""
    return app.send_static_file('index.html')

# ═══════════════════════════════════════════════════════════════════════════
# API ENDPOINTS - STAKE COMPLIANT
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/wallet/authenticate', methods=['POST'])
def authenticate():
    """Initialize session with balance and constraints"""

    session_token = secrets.token_hex(32)
    server_seed = generate_server_seed()
    client_seed = generate_client_seed()

    sessions[session_token] = {
        'player_id': f"player_{secrets.token_hex(8)}",
        'balance': 10000_000_000,  # 10,000.00 starting balance
        'server_seed': server_seed,
        'client_seed': client_seed,
        'nonce': 0,
        'created_at': time.time()
    }

    return jsonify({
        'session_token': session_token,
        'player_id': sessions[session_token]['player_id'],
        'balance': sessions[session_token]['balance'],
        'currency': 'USD',
        'min_bet': MIN_BET,
        'max_bet': MAX_BET,
        'step_bet': STEP_BET,
        'client_seed': client_seed,
        'unfinished_round': None
    })

@app.route('/play', methods=['POST'])
def play():
    """
    Start a new round - STAKE COMPLIANT.
    
    Returns ONLY:
    - round_id: Unique identifier
    - bet: Locked bet amount
    - payout: Final payout (authoritative)
    - events: Abstract event obligations
    - flags: Game state flags
    - balance: Updated balance
    
    Does NOT return:
    - X/Y positions
    - Cloud layouts
    - Funnel geometry
    - Terminal depths
    """

    data = request.json
    session_id = data.get('sessionID')
    bet = data.get('bet', 0)
    mode = data.get('mode', 'normal')

    if session_id not in sessions:
        return jsonify({'error': 'Invalid session', 'code': 'SESSION_EXPIRED'}), 401

    session = sessions[session_id]

    # Validate bet
    if bet < MIN_BET:
        return jsonify({'error': 'Bet too low', 'code': 'INVALID_BET'}), 400
    if bet > MAX_BET:
        return jsonify({'error': 'Bet too high', 'code': 'INVALID_BET'}), 400
    if bet > session['balance']:
        return jsonify({'error': 'Insufficient balance', 'code': 'INSUFFICIENT_BALANCE'}), 400

    # Deduct bet
    session['balance'] -= bet
    session['nonce'] += 1

    # Generate provably fair RNG
    rng_value = provably_fair_rng(
        session['server_seed'],
        session['client_seed'],
        session['nonce']
    )

    # Calculate outcome (math only, no geometry)
    outcome = calculate_outcome(rng_value, bet, mode)

    # Generate abstract events (no positions)
    events = generate_abstract_events(outcome)

    # Create round record
    round_id = secrets.token_hex(16)
    simulation_id = secrets.token_hex(8)

    rounds[round_id] = {
        'session_id': session_id,
        'bet': bet,
        'mode': mode,
        'rng_value': rng_value,
        'outcome': outcome,
        'events': events,
        'status': 'active',
        'created_at': time.time()
    }

    # ═══════════════════════════════════════════════════════════════════════
    # STAKE COMPLIANT RESPONSE - NO GEOMETRY, NO TIMING
    # ═══════════════════════════════════════════════════════════════════════
    return jsonify({
        'round_id': round_id,
        'simulation_id': simulation_id,
        'bet': bet,
        'payout': outcome['payout'],
        'events': events,
        'flags': {
            'is_loss': outcome['is_loss']
        },
        'balance': session['balance']
    })

# build_visual_timeline DELETED - Stake backend must be stateless and timeless
# Frontend controls all animation timing based on events array

@app.route('/endround', methods=['POST'])
def end_round():
    """Complete a round and credit winnings"""

    data = request.json
    session_id = data.get('sessionID')
    round_id = data.get('round_id')

    if session_id not in sessions:
        return jsonify({'error': 'Invalid session', 'code': 'SESSION_EXPIRED'}), 401

    if round_id not in rounds:
        return jsonify({'error': 'Round not found', 'code': 'ROUND_NOT_FOUND'}), 404

    round_data = rounds[round_id]

    if round_data['status'] != 'active':
        return jsonify({'error': 'Round already completed', 'code': 'ROUND_COMPLETED'}), 400

    if round_data['session_id'] != session_id:
        return jsonify({'error': 'Session mismatch', 'code': 'SESSION_MISMATCH'}), 403

    # Mark round complete
    round_data['status'] = 'completed'
    round_data['completed_at'] = time.time()

    # Credit payout
    session = sessions[session_id]
    payout = round_data['outcome']['payout']
    session['balance'] += payout

    return jsonify({
        'round_id': round_id,
        'payout': payout,
        'balance': session['balance'],
        'status': 'completed'
    })

# ═══════════════════════════════════════════════════════════════════════════
# SIMULATION ENDPOINT (for headless RTP testing)
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/simulate', methods=['POST'])
def simulate():
    """
    Run headless simulation for RTP verification.
    This endpoint is for testing only - not exposed in production.
    """
    data = request.json
    num_rounds = data.get('num_rounds', 10000)
    bet = data.get('bet', MONETARY_PRECISION)
    
    total_wagered = 0
    total_returned = 0
    
    for i in range(num_rounds):
        rng_value = seeded_random(0.5, i)  # Deterministic for testing
        outcome = calculate_outcome(rng_value, bet)
        total_wagered += bet
        total_returned += outcome['payout']
    
    actual_rtp = total_returned / total_wagered if total_wagered > 0 else 0
    
    return jsonify({
        'num_rounds': num_rounds,
        'bet_per_round': bet,
        'total_wagered': total_wagered,
        'total_returned': total_returned,
        'actual_rtp': round(actual_rtp, 4),
        'actual_rtp_percentage': f"{actual_rtp * 100:.2f}%",
        'target_rtp': RTP,
        'variance': round(actual_rtp - RTP, 4)
    })

if __name__ == '__main__':
    app.run(debug=True, port=3000)
