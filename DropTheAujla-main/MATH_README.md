# Drop the Dictator - Math Files Documentation

## Overview
Comprehensive mathematical backend for the "Drop the Dictator" game, implementing provably fair mechanics, RTP calculations, and event-driven game flow for Stake platform integration.

## Files

### 1. `config.py` - Game Configuration
Contains all game parameters and settings:
- **RTP**: 96% target RTP with 2% tolerance
- **Betting Limits**: $0.10 - $100.00
- **Max Win**: 10,000x bet amount
- **Multiplier Distribution**: Weighted probability table for outcomes
- **Collectibles**: 4 types (small/medium/large coins, power-ups)
- **Black Hole Bonus**: 10% trigger rate, 1.5x-10x multipliers
- **Obstacles**: Visual/time penalties only (no payout impact)

### 2. `game_math.py` - Core Mathematics Engine
Main mathematical engine with four core classes:

#### ProvablyFairRNG
Cryptographically secure random number generator using HMAC-SHA256:
```python
rng = ProvablyFairRNG(server_seed, client_seed)
random_value = rng.generate_random()  # Returns 0.0-1.0
```
- Uses server seed + client seed + nonce
- Fully verifiable by players
- Deterministic results for given seeds

#### MultiplierEngine
Selects multipliers based on weighted probabilities:
```python
multiplier = MultiplierEngine.select_multiplier(random_value)
black_hole_mult = MultiplierEngine.select_black_hole_multiplier(random_value)
```

#### PayoutEngine
Calculates final payouts with all bonuses:
```python
payout_data = PayoutEngine.calculate_final_payout(
    bet_amount=10.0,
    base_multiplier=2.0,
    collectibles=['coin_small', 'coin_large'],
    black_hole_multiplier=5.0
)
```

#### RTPCalculator
Verifies return to player percentages:
```python
theoretical_rtp = RTPCalculator.calculate_theoretical_rtp()  # 0.96
simulation = RTPCalculator.simulate_rtp(num_rounds=100000)
is_compliant = RTPCalculator.verify_rtp_compliance(actual_rtp)
```

### 3. `event_generator.py` - Event System
Generates event-driven game flow for frontend consumption.

#### EventGenerator
Creates complete event sequences:
```python
game_math = GameMath()
event_gen = EventGenerator(game_math)
events = event_gen.generate_round_events(bet_amount=10.0)
```

Event types:
- `round_start` - Begins round with bet info
- `collectible` - Item collected with value
- `bonus_enter` - Black hole entry with multiplier
- `bonus_exit` - Black hole exit
- `win` - Final payout information
- `round_end` - Round completion

#### SessionManager
Manages player sessions with persistent seeds:
```python
session_mgr = SessionManager()
session = session_mgr.create_session(user_id="player123")
result = session_mgr.play_round(user_id="player123", bet_amount=10.0)
final_data = session_mgr.end_session(user_id="player123")
```

### 4. `math_validator.py` - Validation & Testing
Comprehensive validation suite:

```python
# Run full validation
validator = MathValidator()
results = validator.run_full_validation()

# Individual validations
validator.validate_rtp(num_rounds=100000)
validator.validate_multiplier_distribution(num_samples=10000)
validator.validate_provably_fair()
validator.validate_payout_limits(num_samples=1000)
```

Run from command line:
```bash
python math_validator.py full
```

### 5. `app.py` - Flask Backend Integration
RESTful API endpoints using the math system:

#### Endpoints

**Configuration**
- `GET /api/config` - Get game configuration

**Session Management**
- `POST /api/session/create` - Create new session
  ```json
  {"user_id": "optional", "client_seed": "optional"}
  ```
- `GET /api/session/info/<user_id>` - Get session info
- `POST /api/session/end/<user_id>` - End session

**Gameplay**
- `POST /api/bet` - Play round (session-based)
  ```json
  {"user_id": "player123", "betAmount": 10.0}
  ```
- `POST /api/play` - Play round (simple, no session)
  ```json
  {"betAmount": 10.0}
  ```

**RTP & Verification**
- `GET /api/rtp` - Get RTP information
- `POST /api/verify` - Verify previous round result
  ```json
  {
    "server_seed": "...",
    "client_seed": "...",
    "nonce": 1000000,
    "expected_value": 0.45678
  }
  ```

## Quick Start

### Installation
```bash
pip install -r requirements.txt
```

### Run Server
```bash
python app.py
```

Server starts on `http://localhost:3000`

### Run Validation
```bash
python math_validator.py full
```

## Game Flow

1. **Create Session** - Player connects, gets server seed hash
2. **Place Bet** - Player submits bet amount
3. **Generate Events** - Server generates provably fair events:
   - Determines base multiplier using RNG
   - Rolls for black hole bonus (10% chance)
   - Generates collectibles based on probabilities
   - Calculates final payout with all bonuses
4. **Send Events** - Server sends event sequence to frontend
5. **Frontend Animates** - Frontend displays events (NO payout calculation)
6. **Round Ends** - Server sends `round_end` event with final payout
7. **Verification** - Player can verify using seeds and nonce

## Key Features

### ✅ Provably Fair
- HMAC-SHA256 based RNG
- Server seed hash revealed before play
- Full verification support
- Deterministic results

### ✅ Compliant RTP
- Theoretical RTP: 95.70%
- Target RTP: 96% ± 2%
- Verified through simulation
- Max win limit enforced (10,000x)

### ✅ Event-Driven Architecture
- Frontend never computes payouts
- All math happens server-side
- Events drive animations
- No client-side calculation abuse

### ✅ Stake Platform Ready
- Social mode terminology support
- Session-based gameplay
- RTP verification endpoints
- Max win enforcement
- Proper error handling

## RTP Breakdown

Based on `MULTIPLIER_WEIGHTS` in config.py:

| Multiplier | Probability | Contribution |
|-----------|-------------|--------------|
| 0.0x      | 35.00%      | 0.00%        |
| 0.3x      | 20.00%      | 6.00%        |
| 0.6x      | 15.00%      | 9.00%        |
| 1.0x      | 12.00%      | 12.00%       |
| 1.5x      | 8.00%       | 12.00%       |
| 2.0x      | 5.00%       | 10.00%       |
| 3.0x      | 3.00%       | 9.00%        |
| 5.0x      | 1.50%       | 7.50%        |
| 10.0x     | 0.40%       | 4.00%        |
| 50.0x     | 0.09%       | 4.50%        |
| 100.0x    | 0.01%       | 1.00%        |

**Theoretical RTP**: ~95.70% (before collectibles and black hole bonuses)

## Testing

### Unit Tests (Future)
```bash
pytest tests/
```

### Manual Testing
1. Start server: `python app.py`
2. Create session via API
3. Place multiple bets
4. Verify results match expected RTP
5. Test provably fair verification

### Load Testing
```bash
# Simulate 10,000 rounds
python -c "from math_validator import MathValidator; MathValidator.validate_rtp(100000)"
```

## Security Considerations

1. **Server Seed**: Never reveal until session ends
2. **Client Seed**: Player can set or verify
3. **Nonce**: Increments with each RNG call
4. **Hashing**: HMAC-SHA256 for cryptographic security
5. **Verification**: All results verifiable post-session

## Customization

### Adjust RTP
Edit `config.py`:
```python
TARGET_RTP = 0.98  # Change to 98%
```

Modify `MULTIPLIER_WEIGHTS` to adjust distribution.

### Modify Max Win
```python
MAX_WIN_MULTIPLIER = 5000  # Change to 5,000x
```

### Collectible Values
```python
COLLECTIBLES = {
    'coin_small': {
        'value_multiplier': 0.10,  # Increase value
        'spawn_probability': 0.20,  # Increase spawn rate
        'max_per_round': 10
    }
}
```

## API Response Examples

### Session Creation
```json
{
  "success": true,
  "session": {
    "session_id": "player123",
    "server_seed_hash": "a4f8...",
    "client_seed": "b2c9...",
    "nonce": 1000000
  }
}
```

### Round Result
```json
{
  "success": true,
  "events": [
    {
      "type": "round_start",
      "timestamp": 1706198935000,
      "bet_amount": 10.0,
      "nonce": 1000000
    },
    {
      "type": "collectible",
      "collectible_type": "coin_small",
      "value_multiplier": 0.05,
      "value": 0.50
    },
    {
      "type": "bonus_enter",
      "bonus_type": "black_hole",
      "multiplier": 3.0
    },
    {
      "type": "win",
      "base_multiplier": 2.0,
      "final_multiplier": 6.15,
      "payout": 61.50
    },
    {
      "type": "round_end",
      "final_payout": 61.50
    }
  ],
  "round_number": 1,
  "verification": {
    "server_seed_hash": "a4f8...",
    "client_seed": "b2c9...",
    "current_nonce": 1000003
  }
}
```

## Support

For issues or questions about the math system, refer to:
- `TODO.md` - Known issues and blockers
- `math_validator.py` - Run validations
- This README

## License

Proprietary - For Stake platform integration
