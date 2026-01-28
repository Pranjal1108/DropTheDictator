"""Game configuration for Drop the Dictator."""

from src.config.config import Config
from src.config.distributions import Distribution
from src.config.config import BetMode


class GameConfig(Config):
    """Configuration class for Drop the Dictator."""

    def __init__(self):
        super().__init__()
        self.game_id = "drop_the_dictator"
        self.provider_numer = 999  # Placeholder
        self.working_name = "Drop the Dictator"
        self.wincap = 10000.0
        self.win_type = "hybrid" # or "crash" or something suitable
        self.rtp = 0.96
        self.construct_paths()

        # Game Dimensions (unused but required by some base classes maybe)
        self.num_reels = 0
        self.num_rows = []
        self.paytable = {}

        # Custom Config from original game
        # Adjusted for 60% Collectibles / 30% Falling / 10% Black Hole SPLIT
        # Falling (Base Game) Target: ~30% RTP
        # We need a low-return base game.
        self.MULTIPLIER_WEIGHTS = [
            (0.0, 70.0),     # High loss frequency to keep base RTP low (~30%)
            (0.8, 20.0),     # Primary small win
            (1.3, 9.6),      # Adjusted to hit 96.0% (was 9.0)
            (2.0, 5.0),
            (3.0, 2.0),
            (5.0, 0.8),
            (8.0, 0.2),
            (15.0, 0.1),
            (30.0, 0.05),
            (75.0, 0.01),
            (200.0, 0.005),
        ]
        
        # Collectibles Target: ~60% RTP
        # Massive value boost required
        self.COLLECTIBLES = {
            'coin_small': {'value_multiplier': 0.25, 'spawn_probability': 0.30, 'max_per_round': 8},  # Boosted for RTP gap
            'coin_medium': {'value_multiplier': 0.60, 'spawn_probability': 0.16, 'max_per_round': 5}, # Boosted for RTP gap
            'coin_large': {'value_multiplier': 1.00, 'spawn_probability': 0.06, 'max_per_round': 4},
            'power_up': {'value_multiplier': 2.50, 'spawn_probability': 0.02, 'max_per_round': 2}
        }

        # Black Hole Target: ~10% RTP
        # Triggers on 20% of rounds, applies ~2x avg multiplier to base win
        self.BLACK_HOLE = {
            'trigger_probability': 0.20, 
            'multiplier_weights': [
                (1.5, 40),
                (2.0, 30),
                (3.0, 15),
                (5.0, 10),
                (7.0, 4),
                (10.0, 1),
            ]
        }
        
        self.PROVABLY_FAIR = {
            'nonce_start': 1000000,
        }

        # Define Bet Mode
        self.bet_modes = [
            BetMode(
                name="base",
                cost=1.0,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=False,
                is_buybonus=False,
                distributions=[
                    # Dummy distribution to satisfy schema, logic handled in GameState
                    Distribution(
                        criteria="base",
                        quota=1.0,
                        conditions={
                            "reel_weights": {
                                "basegame": {"BR0": 1},
                            },
                        }
                    )
                ],
            ),
        ]
