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
        # Adjusted for 96% Total RTP (including Black Hole bonus factor of ~1.153x)
        # Base RTP target: ~83.25%
        self.MULTIPLIER_WEIGHTS = [
            (0.0, 52.0),     # Increased loss probability
            (0.8, 19.0),
            (1.3, 14.0),
            (2.0, 9.0),
            (3.0, 3.5),
            (5.0, 1.5),
            (8.0, 0.6),
            (15.0, 0.3),
            (30.0, 0.08),
            (75.0, 0.015),
            (200.0, 0.005),
        ]
        
        self.COLLECTIBLES = {
            'coin_small': {'value_multiplier': 0.05, 'spawn_probability': 0.15, 'max_per_round': 5},
            'coin_medium': {'value_multiplier': 0.10, 'spawn_probability': 0.08, 'max_per_round': 3},
            'coin_large': {'value_multiplier': 0.25, 'spawn_probability': 0.03, 'max_per_round': 2},
            'power_up': {'value_multiplier': 0.50, 'spawn_probability': 0.01, 'max_per_round': 1}
        }

        self.BLACK_HOLE = {
            'trigger_probability': 0.10,
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
