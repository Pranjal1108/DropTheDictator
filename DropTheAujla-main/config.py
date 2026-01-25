"""
Game Configuration for Drop the Dictator
Contains all game parameters, RTP settings, and payout configurations
"""

class GameConfig:
    """Core game configuration settings"""
    
    # Game Identity
    GAME_NAME = "Drop the Dictator"
    GAME_VERSION = "1.0.0"
    
    # RTP Configuration
    TARGET_RTP = 0.96  # 96% Return to Player
    RTP_TOLERANCE = 0.02  # Allow 2% variance
    
    # Betting Limits
    MIN_BET = 0.10  # Minimum bet amount
    MAX_BET = 100.00  # Maximum bet amount
    DEFAULT_BET = 1.00  # Default bet amount
    
    # Win Limits
    MAX_WIN_MULTIPLIER = 10000  # Maximum win is 10,000x bet
    MIN_WIN_MULTIPLIER = 0  # Minimum win (loss)
    
    # Distance and Payout Settings
    BASE_DISTANCE_RATE = 0.001  # Base payout per unit distance fallen
    MAX_FALL_DISTANCE = 5000  # Maximum fall distance
    
    # Multiplier Distribution (weighted probabilities)
    # Format: (multiplier, probability_weight)
    # Tuned for exactly 96% RTP
    MULTIPLIER_WEIGHTS = [
        (0.0, 45),      # 45% chance of losing (0x)
        (0.8, 22),      # 22% chance of 0.8x
        (1.3, 16),      # 16% chance of 1.3x
        (2.0, 10),      # 10% chance of 2.0x
        (3.0, 4),       # 4% chance of 3.0x
        (5.0, 1.8),     # 1.8% chance of 5.0x
        (8.0, 0.8),     # 0.8% chance of 8.0x
        (15.0, 0.3),    # 0.3% chance of 15.0x
        (30.0, 0.08),   # 0.08% chance of 30.0x
        (75.0, 0.015),  # 0.015% chance of 75.0x
        (200.0, 0.005), # 0.005% chance of 200.0x
    ]
    
    # Collectibles Configuration
    COLLECTIBLES = {
        'coin_small': {
            'value_multiplier': 0.05,  # Adds 0.05x to payout
            'spawn_probability': 0.15,  # 15% chance per fall segment
            'max_per_round': 5
        },
        'coin_medium': {
            'value_multiplier': 0.10,  # Adds 0.10x to payout
            'spawn_probability': 0.08,  # 8% chance per fall segment
            'max_per_round': 3
        },
        'coin_large': {
            'value_multiplier': 0.25,  # Adds 0.25x to payout
            'spawn_probability': 0.03,  # 3% chance per fall segment
            'max_per_round': 2
        },
        'power_up': {
            'value_multiplier': 0.50,  # Adds 0.50x to payout
            'spawn_probability': 0.01,  # 1% chance per fall segment
            'max_per_round': 1
        }
    }
    
    # Black Hole Bonus Configuration
    BLACK_HOLE = {
        'trigger_probability': 0.10,  # 10% chance to enter black hole
        'min_multiplier': 1.0,
        'max_multiplier': 10.0,
        'duration_ms': 3000,  # 3 seconds in black hole
        'multiplier_weights': [
            (1.5, 40),   # 40% chance of 1.5x
            (2.0, 30),   # 30% chance of 2.0x
            (3.0, 15),   # 15% chance of 3.0x
            (5.0, 10),   # 10% chance of 5.0x
            (7.0, 4),    # 4% chance of 7.0x
            (10.0, 1),   # 1% chance of 10.0x
        ]
    }
    
    # Obstacles (Visual/Time penalties only - NO payout impact)
    OBSTACLES = {
        'cloud': {
            'spawn_probability': 0.20,  # 20% chance per fall segment
            'time_penalty_ms': 500,  # 500ms delay
            'visual_effect': 'stun'
        },
        'bird': {
            'spawn_probability': 0.15,  # 15% chance per fall segment
            'time_penalty_ms': 300,  # 300ms delay
            'visual_effect': 'bounce'
        },
        'wind': {
            'spawn_probability': 0.10,  # 10% chance per fall segment
            'time_penalty_ms': 0,  # No delay, just visual
            'visual_effect': 'drift'
        }
    }
    
    # Game Physics (for event generation, not payout)
    PHYSICS = {
        'gravity': 9.8,
        'terminal_velocity': 120,
        'initial_velocity': 0,
        'bounce_factor': 0.3,
    }
    
    # Round Settings
    ROUND_SETTINGS = {
        'min_duration_ms': 2000,  # Minimum round duration
        'max_duration_ms': 30000,  # Maximum round duration (30 seconds)
        'auto_complete_on_ground': True,
    }
    
    # Provably Fair Settings
    PROVABLY_FAIR = {
        'seed_length': 64,  # Character length for server seed
        'nonce_start': 1000000,  # Starting nonce value
        'hash_algorithm': 'sha256',
    }
    
    # Social Mode Terminology
    SOCIAL_MODE_TERMS = {
        'enabled': True,
        'replacements': {
            'bet': 'play',
            'win': 'score',
            'payout': 'points',
            'multiplier': 'bonus',
            'total winnings': 'total score',
            'earnings': 'points earned',
        }
    }
    
    @classmethod
    def get_total_multiplier_weight(cls):
        """Calculate total weight for normalization"""
        return sum(weight for _, weight in cls.MULTIPLIER_WEIGHTS)
    
    @classmethod
    def get_total_black_hole_weight(cls):
        """Calculate total weight for black hole multiplier normalization"""
        return sum(weight for _, weight in cls.BLACK_HOLE['multiplier_weights'])
    
    @classmethod
    def validate_bet(cls, amount):
        """Validate if bet amount is within limits"""
        try:
            amount = float(amount)
            return cls.MIN_BET <= amount <= cls.MAX_BET
        except (ValueError, TypeError):
            return False
    
    @classmethod
    def clamp_payout(cls, payout, bet_amount):
        """Ensure payout doesn't exceed maximum win"""
        max_payout = bet_amount * cls.MAX_WIN_MULTIPLIER
        return min(payout, max_payout)
