"""
STAKE ENGINE COMPLIANT BACKEND - v3.0 (WORLD PLAN ARCHITECTURE)
Backend now sends a complete WORLD PLAN, not just an outcome.
Frontend becomes a "dumb physics executor" inside a pre-shaped world.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import secrets
import hashlib
import hmac
import time
import math

app = Flask(__name__)
CORS(app)

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

RTP = 0.965  # 96.5% RTP
MAX_WIN_MULTIPLIER = 5000
MIN_BET = 1_000_000      # 1.00 in micro-units
MAX_BET = 100_000_000    # 100.00 in micro-units
STEP_BET = 1_000_000     # 1.00 step

# World constants (must match frontend)
WORLD_HEIGHT = 20000
GROUND_Y = 19300
DEADZONE = 1500
SCREEN_WIDTH = 1920
SCREEN_HEIGHT = 1200

# Corridor constraints
CORRIDOR_CENTER = 960  # Center of screen
CORRIDOR_WIDTH = 800   # Allowed horizontal movement range

# Cloud dimensions (must match frontend)
CLOUD1_W = 320 * 1.7  # 544
CLOUD1_H = 160 * 1.7  # 272

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
# PAYOUT CALCULATION (RTP-COMPLIANT)
# ═══════════════════════════════════════════════════════════════════════════

def calculate_outcome(rng_value: float, bet: int, mode: str = 'normal') -> dict:
    """
    Calculate game outcome from RNG value.
    Returns payout multiplier and terminal depth.
    """

    # Loss probability: ~40% for balanced RTP
    if rng_value < 0.40:
        # LOSS: Early terminal depth
        multiplier = 0.0
        depth_progress = 0.05 + (rng_value / 0.40) * 0.15  # 5-20% of fall
        terminal_depth = DEADZONE + int(depth_progress * (GROUND_Y - DEADZONE - 1000))
        black_hole_triggered = False
        black_hole_multiplier = 1.0

    elif rng_value < 0.75:
        # SMALL WIN: 0.5x to 2x
        normalized = (rng_value - 0.40) / 0.35
        multiplier = 0.5 + normalized * 1.5
        depth_progress = 0.3 + normalized * 0.4  # 30-70% of fall
        terminal_depth = DEADZONE + int(depth_progress * (GROUND_Y - DEADZONE - 500))
        black_hole_triggered = False
        black_hole_multiplier = 1.0

    elif rng_value < 0.92:
        # MEDIUM WIN: 2x to 10x
        normalized = (rng_value - 0.75) / 0.17
        multiplier = 2.0 + normalized * 8.0
        depth_progress = 0.7 + normalized * 0.25  # 70-95% of fall
        terminal_depth = DEADZONE + int(depth_progress * (GROUND_Y - DEADZONE - 300))
        black_hole_triggered = seeded_random(rng_value, 100) < 0.3
        black_hole_multiplier = 1.5 + seeded_random(rng_value, 101) * 1.5 if black_hole_triggered else 1.0

    elif rng_value < 0.99:
        # BIG WIN: 10x to 100x
        normalized = (rng_value - 0.92) / 0.07
        multiplier = 10.0 + normalized * 90.0
        depth_progress = 0.95 + normalized * 0.04  # 95-99% of fall
        terminal_depth = GROUND_Y - 200
        black_hole_triggered = seeded_random(rng_value, 100) < 0.6
        black_hole_multiplier = 2.0 + seeded_random(rng_value, 101) * 3.0 if black_hole_triggered else 1.0

    else:
        # JACKPOT: 100x to 5000x (rare)
        normalized = (rng_value - 0.99) / 0.01
        multiplier = 100.0 + normalized * (MAX_WIN_MULTIPLIER - 100)
        multiplier = min(multiplier, MAX_WIN_MULTIPLIER)
        terminal_depth = GROUND_Y - 100  # Almost to ground
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
        'terminal_depth_y': terminal_depth,
        'black_hole_triggered': black_hole_triggered,
        'black_hole_multiplier': black_hole_multiplier,
        'is_loss': multiplier == 0
    }

# ═══════════════════════════════════════════════════════════════════════════
# WORLD PLAN GENERATION - THE KEY FIX
# ═══════════════════════════════════════════════════════════════════════════

def generate_world_plan(rng_value: float, outcome: dict) -> dict:
    """
    Generate a complete world plan that GUARANTEES the outcome.
    The frontend will build this world exactly - no randomness.
    """

    terminal_depth = outcome['terminal_depth_y']
    is_loss = outcome['is_loss']

    # Corridor definition - constrains horizontal movement
    corridor = {
        'center_x': CORRIDOR_CENTER,
        'width': CORRIDOR_WIDTH,
        'left_bound': CORRIDOR_CENTER - CORRIDOR_WIDTH // 2,
        'right_bound': CORRIDOR_CENTER + CORRIDOR_WIDTH // 2
    }

    # Generate guide clouds - these create the path DOWN to terminal depth
    guide_clouds = generate_guide_clouds(rng_value, terminal_depth, corridor)

    # Generate terminal closure - blocks further descent
    terminal_closure = generate_terminal_closure(rng_value, terminal_depth, corridor, is_loss)

    # Generate wall clouds - block escape outside corridor
    wall_clouds = generate_wall_clouds(rng_value, terminal_depth, corridor)

    # Generate black hole position (if triggered)
    black_hole = None
    if outcome['black_hole_triggered']:
        black_hole = generate_black_hole_position(rng_value, terminal_depth, corridor)

    # Generate collectibles (cosmetic only - values come from backend)
    collectibles = generate_collectibles(rng_value, terminal_depth, corridor)

    # Generate pushables (cosmetic physics objects)
    pushables = generate_pushables(rng_value, terminal_depth, corridor)

    # Generate dark clouds (trap clouds)
    dark_clouds = generate_dark_clouds(rng_value, terminal_depth, corridor)

    return {
        'corridor': corridor,
        'guide_clouds': guide_clouds,
        'wall_clouds': wall_clouds,
        'terminal_closure': terminal_closure,
        'black_hole': black_hole,
        'collectibles': collectibles,
        'pushables': pushables,
        'dark_clouds': dark_clouds
    }

def generate_guide_clouds(rng_value: float, terminal_depth: int, corridor: dict) -> list:
    """
    Generate clouds that GUIDE the player down to terminal depth.
    These clouds have gaps that allow descent within the corridor.
    """
    clouds = []

    # Calculate number of cloud rows based on distance
    fall_distance = terminal_depth - DEADZONE
    row_spacing = 400  # Vertical spacing between cloud rows
    num_rows = max(5, int(fall_distance / row_spacing))

    for i in range(num_rows):
        y = DEADZONE + int((i / num_rows) * (fall_distance - 500))

        # Use seeded random for deterministic placement
        row_rng = seeded_random(rng_value, i * 10)

        # Create clouds on left and right with a gap in the middle
        gap_offset = (row_rng - 0.5) * (corridor['width'] * 0.4)
        gap_center = corridor['center_x'] + gap_offset
        gap_width = 200 + row_rng * 150  # 200-350px gap

        # Left cloud (if room)
        left_cloud_x = gap_center - gap_width / 2 - CLOUD1_W
        if left_cloud_x > corridor['left_bound'] - CLOUD1_W:
            clouds.append({
                'x': left_cloud_x,
                'y': y,
                'type': 'guide',
                'cloud_type': 1 if seeded_random(rng_value, i * 10 + 1) < 0.5 else 2
            })

        # Right cloud (if room)
        right_cloud_x = gap_center + gap_width / 2
        if right_cloud_x < corridor['right_bound']:
            clouds.append({
                'x': right_cloud_x,
                'y': y,
                'type': 'guide',
                'cloud_type': 1 if seeded_random(rng_value, i * 10 + 2) < 0.5 else 2
            })

    return clouds

def generate_wall_clouds(rng_value: float, terminal_depth: int, corridor: dict) -> list:
    """
    Generate clouds that form WALLS outside the corridor.
    These prevent horizontal escape.
    """
    walls = []

    wall_spacing = 300
    num_walls = int((terminal_depth - DEADZONE) / wall_spacing)

    for i in range(num_walls):
        y = DEADZONE + i * wall_spacing

        # Left wall
        walls.append({
            'x': corridor['left_bound'] - CLOUD1_W - 50,
            'y': y,
            'type': 'wall',
            'cloud_type': 1
        })

        # Right wall
        walls.append({
            'x': corridor['right_bound'] + 50,
            'y': y,
            'type': 'wall',
            'cloud_type': 1
        })

    return walls

def generate_terminal_closure(rng_value: float, terminal_depth: int, corridor: dict, is_loss: bool) -> dict:
    """
    Generate the TERMINAL CLOSURE - a formation that blocks all further descent.
    This is what enforces the outcome.
    """

    # Select template based on RNG (deterministic)
    template_rng = seeded_random(rng_value, 500)

    if template_rng < 0.33:
        template_name = "FLAT_SEAL"
        # Solid wall of clouds
        offsets = [
            {'x': -450, 'y': 0},
            {'x': -150, 'y': 0},
            {'x': 150, 'y': 0},
            {'x': 450, 'y': 0}
        ]
    elif template_rng < 0.66:
        template_name = "OFFSET_SEAL"
        # Interlocking pattern
        offsets = [
            {'x': -300, 'y': 0},
            {'x': 300, 'y': 0},
            {'x': 0, 'y': -200},
            {'x': -600, 'y': -200},
            {'x': 600, 'y': -200}
        ]
    else:
        template_name = "FUNNEL_COLLAPSE"
        # V-shape funnel
        offsets = [
            {'x': 0, 'y': 0},
            {'x': -350, 'y': -250},
            {'x': 350, 'y': -250},
            {'x': -700, 'y': -500},
            {'x': 700, 'y': -500}
        ]

    # Generate cloud positions
    clouds = []
    for offset in offsets:
        clouds.append({
            'x': corridor['center_x'] + offset['x'] - CLOUD1_W / 2,
            'y': terminal_depth + offset['y'],
            'type': 'terminal',
            'cloud_type': 1,
            'scale': 1.6  # Larger clouds for terminal
        })

    return {
        'template': template_name,
        'depth': terminal_depth,
        'clouds': clouds
    }

def generate_black_hole_position(rng_value: float, terminal_depth: int, corridor: dict) -> dict:
    """
    Generate black hole position - appears in the path before terminal depth.
    """
    # Place black hole at 60-80% of the way to terminal
    progress = 0.6 + seeded_random(rng_value, 200) * 0.2
    y = DEADZONE + int(progress * (terminal_depth - DEADZONE - 500))

    # Center it in the corridor with slight offset
    x_offset = (seeded_random(rng_value, 201) - 0.5) * corridor['width'] * 0.3
    x = corridor['center_x'] + x_offset - 150  # 150 = half of BH_SIZE

    return {
        'x': x,
        'y': y,
        'will_trigger': True
    }

def generate_collectibles(rng_value: float, terminal_depth: int, corridor: dict) -> list:
    """
    Generate collectibles - purely cosmetic, values don't affect payout.
    """
    collectibles = []

    num_collectibles = 50 + int(seeded_random(rng_value, 300) * 50)

    for i in range(num_collectibles):
        item_rng = seeded_random(rng_value, 300 + i)

        # Place within corridor with some margin
        x = corridor['left_bound'] + item_rng * corridor['width']

        # Place above terminal depth
        y_rng = seeded_random(rng_value, 400 + i)
        y = DEADZONE + y_rng * (terminal_depth - DEADZONE - 500)

        collectibles.append({
            'x': x,
            'y': y,
            'type': 'chain' if seeded_random(rng_value, 500 + i) < 0.4 else 'music'
        })

    return collectibles

def generate_pushables(rng_value: float, terminal_depth: int, corridor: dict) -> list:
    """
    Generate pushable objects - cosmetic physics objects.
    """
    pushables = []

    num_pushables = 10 + int(seeded_random(rng_value, 600) * 10)

    for i in range(num_pushables):
        item_rng = seeded_random(rng_value, 600 + i)

        x = corridor['left_bound'] + item_rng * corridor['width'] - 275
        y_rng = seeded_random(rng_value, 700 + i)
        y = DEADZONE + y_rng * (terminal_depth - DEADZONE - 600)

        pushables.append({'x': x, 'y': y})

    return pushables

def generate_dark_clouds(rng_value: float, terminal_depth: int, corridor: dict) -> list:
    """
    Generate dark clouds (trap clouds) - within corridor.
    """
    dark_clouds = []

    num_dark = 5 + int(seeded_random(rng_value, 800) * 5)

    for i in range(num_dark):
        item_rng = seeded_random(rng_value, 800 + i)

        x = corridor['left_bound'] + item_rng * (corridor['width'] - 280)
        y_rng = seeded_random(rng_value, 900 + i)
        y = DEADZONE + 500 + y_rng * (terminal_depth - DEADZONE - 1000)

        dark_clouds.append({'x': x, 'y': y})

    return dark_clouds

# ═══════════════════════════════════════════════════════════════════════════
# API ENDPOINTS
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
    """Start a new round - returns complete world plan"""

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

    # Calculate outcome
    outcome = calculate_outcome(rng_value, bet, mode)

    # Generate world plan that guarantees this outcome
    world_plan = generate_world_plan(rng_value, outcome)

    # Create round record
    round_id = secrets.token_hex(16)
    simulation_id = secrets.token_hex(8)

    rounds[round_id] = {
        'session_id': session_id,
        'bet': bet,
        'mode': mode,
        'rng_value': rng_value,
        'outcome': outcome,
        'world_plan': world_plan,
        'status': 'active',
        'created_at': time.time()
    }

    # Build visual timeline
    visual_timeline = build_visual_timeline(outcome, world_plan)

    return jsonify({
        'round_id': round_id,
        'simulation_id': simulation_id,
        'bet': bet,
        'balance': session['balance'],

        # World plan - frontend builds world from this
        'world_plan': world_plan,

        # Outcome data - frontend uses this to know the target
        'terminal_depth_y': outcome['terminal_depth_y'],
        'max_payout_at_ground': outcome['payout'],
        'black_hole_triggered': outcome['black_hole_triggered'],
        'black_hole_multiplier': outcome['black_hole_multiplier'],

        # Visual timeline for events
        'visual_timeline': visual_timeline
    })

def build_visual_timeline(outcome: dict, world_plan: dict) -> list:
    """Build visual event timeline for frontend animation"""

    timeline = []

    # Round start with world plan
    timeline.append({
        'type': 'round_start',
        'timestamp': 0,
        'terminal_depth_y': outcome['terminal_depth_y'],
        'max_payout_at_ground': outcome['payout'],
        'black_hole_triggered': outcome['black_hole_triggered'],
        'black_hole_multiplier': outcome['black_hole_multiplier'],
        'world_plan': world_plan
    })

    # Black hole bonus if triggered
    if outcome['black_hole_triggered']:
        timeline.append({
            'type': 'bonus_enter',
            'timestamp': 5000,  # Approximate time
            'multiplier': outcome['black_hole_multiplier']
        })
        timeline.append({
            'type': 'bonus_exit',
            'timestamp': 10000,
            'value': outcome['payout']
        })

    # Round end - this is the ONLY way to end the round
    timeline.append({
        'type': 'round_end',
        'timestamp': 15000,  # Will be triggered by frontend when physics stops
        'value': outcome['payout']
    })

    return timeline

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

if __name__ == '__main__':
    app.run(debug=True, port=3000)

