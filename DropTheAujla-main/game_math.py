"""
Core Game Mathematics Module for Drop the Dictator
Handles RTP calculation, provably fair RNG, and payout engine
"""

import hashlib
import hmac
import random
from typing import Tuple, Dict, List, Optional
from config import GameConfig


class ProvablyFairRNG:
    """Provably fair random number generator using cryptographic hashing"""
    
    def __init__(self, server_seed: Optional[str] = None, client_seed: Optional[str] = None):
        """
        Initialize with server and client seeds
        
        Args:
            server_seed: Server-provided seed (hashed before use)
            client_seed: Client-provided seed for verification
        """
        self.server_seed = server_seed or self._generate_server_seed()
        self.client_seed = client_seed or self._generate_client_seed()
        self.nonce = GameConfig.PROVABLY_FAIR['nonce_start']
        
    def _generate_server_seed(self) -> str:
        """Generate cryptographically secure server seed"""
        return hashlib.sha256(
            str(random.SystemRandom().random()).encode()
        ).hexdigest()
    
    def _generate_client_seed(self) -> str:
        """Generate client seed"""
        return hashlib.sha256(
            str(random.SystemRandom().random()).encode()
        ).hexdigest()[:16]
    
    def get_server_seed_hash(self) -> str:
        """Return hashed server seed for client verification"""
        return hashlib.sha256(self.server_seed.encode()).hexdigest()
    
    def generate_random(self) -> float:
        """
        Generate provably fair random number between 0 and 1
        Uses HMAC-SHA256(server_seed, client_seed:nonce)
        
        Returns:
            Float between 0.0 and 1.0
        """
        message = f"{self.client_seed}:{self.nonce}"
        hash_result = hmac.new(
            self.server_seed.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        # Convert first 8 hex characters to number between 0 and 1
        value = int(hash_result[:8], 16) / 0xFFFFFFFF
        self.nonce += 1
        
        return value
    
    def verify_result(self, server_seed: str, client_seed: str, nonce: int, expected_value: float) -> bool:
        """
        Verify a previous result using known seeds and nonce
        
        Args:
            server_seed: Original server seed
            client_seed: Original client seed
            nonce: Nonce used for that round
            expected_value: Expected random value
            
        Returns:
            True if verification passes
        """
        message = f"{client_seed}:{nonce}"
        hash_result = hmac.new(
            server_seed.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        value = int(hash_result[:8], 16) / 0xFFFFFFFF
        return abs(value - expected_value) < 0.0001  # Allow small floating point variance


class MultiplierEngine:
    """Handles multiplier selection based on weighted probabilities"""
    
    @staticmethod
    def select_multiplier(random_value: float) -> float:
        """
        Select multiplier based on weighted distribution
        
        Args:
            random_value: Random float between 0 and 1
            
        Returns:
            Selected multiplier value
        """
        total_weight = GameConfig.get_total_multiplier_weight()
        cumulative = 0
        threshold = random_value * total_weight
        
        for multiplier, weight in GameConfig.MULTIPLIER_WEIGHTS:
            cumulative += weight
            if threshold <= cumulative:
                return multiplier
        
        # Fallback to last multiplier
        return GameConfig.MULTIPLIER_WEIGHTS[-1][0]
    
    @staticmethod
    def select_black_hole_multiplier(random_value: float) -> float:
        """
        Select black hole bonus multiplier
        
        Args:
            random_value: Random float between 0 and 1
            
        Returns:
            Black hole multiplier value
        """
        total_weight = GameConfig.get_total_black_hole_weight()
        cumulative = 0
        threshold = random_value * total_weight
        
        for multiplier, weight in GameConfig.BLACK_HOLE['multiplier_weights']:
            cumulative += weight
            if threshold <= cumulative:
                return multiplier
        
        # Fallback to last multiplier
        return GameConfig.BLACK_HOLE['multiplier_weights'][-1][0]


class PayoutEngine:
    """Calculates final payout for a round"""
    
    @staticmethod
    def calculate_base_payout(bet_amount: float, multiplier: float) -> float:
        """
        Calculate base payout from bet and multiplier
        
        Args:
            bet_amount: Amount wagered
            multiplier: Base multiplier for the round
            
        Returns:
            Base payout amount
        """
        return bet_amount * multiplier
    
    @staticmethod
    def apply_collectibles(base_payout: float, bet_amount: float, collectibles: List[str]) -> Tuple[float, float]:
        """
        Apply collectible bonuses to payout
        
        Args:
            base_payout: Base payout before collectibles
            bet_amount: Original bet amount
            collectibles: List of collected item types
            
        Returns:
            Tuple of (new_payout, collectible_bonus_multiplier)
        """
        bonus_multiplier = 0
        
        for collectible_type in collectibles:
            if collectible_type in GameConfig.COLLECTIBLES:
                bonus_multiplier += GameConfig.COLLECTIBLES[collectible_type]['value_multiplier']
        
        # Collectible bonus is added to base
        collectible_value = bet_amount * bonus_multiplier
        return base_payout + collectible_value, bonus_multiplier
    
    @staticmethod
    def apply_black_hole_bonus(payout: float, black_hole_multiplier: float) -> float:
        """
        Apply black hole multiplier to current payout
        
        Args:
            payout: Current payout amount
            black_hole_multiplier: Black hole multiplier (1.0-10.0)
            
        Returns:
            New payout after black hole bonus
        """
        return payout * black_hole_multiplier
    
    @staticmethod
    def calculate_final_payout(
        bet_amount: float,
        base_multiplier: float,
        collectibles: List[str] = None,
        black_hole_multiplier: float = 1.0
    ) -> Dict[str, float]:
        """
        Calculate complete final payout with all bonuses
        
        Args:
            bet_amount: Amount wagered
            base_multiplier: Base game multiplier
            collectibles: List of collected items (optional)
            black_hole_multiplier: Black hole bonus multiplier (optional)
            
        Returns:
            Dictionary containing payout breakdown
        """
        collectibles = collectibles or []
        
        # Base payout
        base_payout = PayoutEngine.calculate_base_payout(bet_amount, base_multiplier)
        
        # Add collectibles
        payout_with_collectibles, collectible_bonus = PayoutEngine.apply_collectibles(
            base_payout, bet_amount, collectibles
        )
        
        # Apply black hole bonus
        final_payout = PayoutEngine.apply_black_hole_bonus(
            payout_with_collectibles, black_hole_multiplier
        )
        
        # Clamp to max win
        final_payout = GameConfig.clamp_payout(final_payout, bet_amount)
        
        return {
            'base_payout': base_payout,
            'base_multiplier': base_multiplier,
            'collectible_bonus': collectible_bonus,
            'black_hole_multiplier': black_hole_multiplier,
            'final_payout': final_payout,
            'final_multiplier': final_payout / bet_amount if bet_amount > 0 else 0
        }


class RTPCalculator:
    """Calculate and verify Return to Player percentage"""
    
    @staticmethod
    def calculate_theoretical_rtp() -> float:
        """
        Calculate theoretical RTP based on multiplier weights
        
        Returns:
            Expected RTP as decimal (e.g., 0.96 for 96%)
        """
        total_weight = GameConfig.get_total_multiplier_weight()
        expected_value = 0
        
        for multiplier, weight in GameConfig.MULTIPLIER_WEIGHTS:
            probability = weight / total_weight
            expected_value += multiplier * probability
        
        return expected_value
    
    @staticmethod
    def simulate_rtp(num_rounds: int = 100000, bet_amount: float = 1.0) -> Dict[str, float]:
        """
        Simulate actual RTP over many rounds
        
        Args:
            num_rounds: Number of rounds to simulate
            bet_amount: Bet amount per round
            
        Returns:
            Dictionary with simulation results
        """
        rng = ProvablyFairRNG()
        total_wagered = 0
        total_returned = 0
        results = []
        
        for _ in range(num_rounds):
            # Generate multiplier
            rand_val = rng.generate_random()
            multiplier = MultiplierEngine.select_multiplier(rand_val)
            
            # Calculate payout (simplified, no collectibles/black holes)
            payout = bet_amount * multiplier
            
            total_wagered += bet_amount
            total_returned += payout
            results.append(multiplier)
        
        actual_rtp = total_returned / total_wagered if total_wagered > 0 else 0
        
        return {
            'actual_rtp': actual_rtp,
            'actual_rtp_percentage': actual_rtp * 100,
            'total_wagered': total_wagered,
            'total_returned': total_returned,
            'num_rounds': num_rounds,
            'average_multiplier': sum(results) / len(results),
            'max_multiplier': max(results),
            'min_multiplier': min(results),
        }
    
    @staticmethod
    def verify_rtp_compliance(actual_rtp: float) -> bool:
        """
        Check if actual RTP is within acceptable tolerance
        
        Args:
            actual_rtp: Measured RTP value
            
        Returns:
            True if within tolerance
        """
        target = GameConfig.TARGET_RTP
        tolerance = GameConfig.RTP_TOLERANCE
        
        return (target - tolerance) <= actual_rtp <= (target + tolerance)


class GameMath:
    """Main interface for game mathematics"""
    
    def __init__(self, server_seed: Optional[str] = None, client_seed: Optional[str] = None):
        """Initialize game math with optional seeds"""
        self.rng = ProvablyFairRNG(server_seed, client_seed)
    
    def generate_round_result(self, bet_amount: float) -> Dict:
        """
        Generate complete round result with all elements
        
        Args:
            bet_amount: Amount wagered
            
        Returns:
            Complete round result dictionary
        """
        # Validate bet
        if not GameConfig.validate_bet(bet_amount):
            raise ValueError(f"Invalid bet amount: {bet_amount}")
        
        # Generate base multiplier
        base_multiplier = MultiplierEngine.select_multiplier(self.rng.generate_random())
        
        # Determine if black hole triggers
        black_hole_triggered = self.rng.generate_random() < GameConfig.BLACK_HOLE['trigger_probability']
        black_hole_multiplier = 1.0
        
        if black_hole_triggered:
            black_hole_multiplier = MultiplierEngine.select_black_hole_multiplier(
                self.rng.generate_random()
            )
        
        # Generate collectibles (simplified for now)
        collectibles = self._generate_collectibles()
        
        # Generate spawn positions for visual elements
        spawn_data = self._generate_spawn_data(black_hole_triggered)
        
        # Calculate final payout
        payout_data = PayoutEngine.calculate_final_payout(
            bet_amount,
            base_multiplier,
            collectibles,
            black_hole_multiplier
        )
        
        return {
            'bet_amount': bet_amount,
            'nonce': self.rng.nonce - (3 if black_hole_triggered else 1),  # Adjust for RNG calls
            'base_multiplier': base_multiplier,
            'collectibles': collectibles,
            'black_hole_triggered': black_hole_triggered,
            'black_hole_multiplier': black_hole_multiplier,
            'spawn_data': spawn_data,
            **payout_data,
            'server_seed_hash': self.rng.get_server_seed_hash(),
        }
    
    def _generate_collectibles(self) -> List[str]:
        """Generate collectibles for the round"""
        collectibles = []
        
        for collectible_type, config in GameConfig.COLLECTIBLES.items():
            max_count = config['max_per_round']
            spawn_prob = config['spawn_probability']
            
            count = 0
            for _ in range(max_count):
                if self.rng.generate_random() < spawn_prob:
                    collectibles.append(collectible_type)
                    count += 1
        
        return collectibles
    
    def _generate_spawn_data(self, black_hole_triggered: bool) -> Dict:
        """
        Generate all spawn positions using provably fair RNG.
        Frontend should use these positions instead of Math.random()
        
        Returns:
            Dictionary with all spawn data
        """
        # World constants (matching frontend)
        SCREEN_W = 1920
        WORLDH = 20000
        GROUND_Y = WORLDH - 700  # GROUND_HEIGHT = 700
        DEADZONE = 1500
        TOP_SAFE = DEADZONE
        BOTTOM_SAFE = GROUND_Y - DEADZONE
        
        # DESCENT CORRIDOR CONSTANTS
        # Matches frontend map center (roughly 8000)
        WORLD_CENTER_X = 8000 
        CORRIDOR_WIDTH = 1400  # Narrow corridor to force interaction
        CORRIDOR_MIN_X = WORLD_CENTER_X - (CORRIDOR_WIDTH / 2)
        CORRIDOR_MAX_X = WORLD_CENTER_X + (CORRIDOR_WIDTH / 2)
        
        spawn_data = {
            'collectibles': [],
            'black_holes': [],
            'clouds': [],
            'dark_clouds': [],
            'pushables': [],
            'config': {
                'screen_w': SCREEN_W,
                'world_h': WORLDH,
                'ground_y': GROUND_Y,
                'deadzone': DEADZONE,
                'corridor_width': CORRIDOR_WIDTH,
                'world_center_x': WORLD_CENTER_X
            }
        }
        
        # Helper for random X within corridor
        def get_corridor_x():
            return CORRIDOR_MIN_X + self.rng.generate_random() * CORRIDOR_WIDTH
        
        # Generate collectible positions
        collectible_count = 300 
        for i in range(collectible_count):
            ctype = 'chain' if self.rng.generate_random() < 0.4 else 'music'
            x = get_corridor_x()
            y = TOP_SAFE + self.rng.generate_random() * (BOTTOM_SAFE - TOP_SAFE)
            spawn_data['collectibles'].append({
                'type': ctype,
                'x': round(x, 2),
                'y': round(y, 2),
                'index': i
            })
        
        # Generate black hole positions
        bh_count = 50 
        BH_SIZE = 300
        for i in range(bh_count):
            x = get_corridor_x()
            y = TOP_SAFE + self.rng.generate_random() * (BOTTOM_SAFE - DEADZONE - BH_SIZE - TOP_SAFE)
            # Mark which black hole will trigger bonus (if any)
            will_trigger = (i == 0 and black_hole_triggered)
            spawn_data['black_holes'].append({
                'x': round(x, 2),
                'y': round(y, 2),
                'will_trigger': will_trigger,
                'index': i
            })
        
        # Generate cloud positions
        cloud_count = 200 
        CLOUD_H = 280
        for i in range(cloud_count):
            cloud_type = 1 if self.rng.generate_random() < 0.5 else 2
            x = get_corridor_x()
            y = TOP_SAFE + self.rng.generate_random() * (BOTTOM_SAFE - CLOUD_H - TOP_SAFE)
            spawn_data['clouds'].append({
                'type': cloud_type,
                'x': round(x, 2),
                'y': round(y, 2),
                'index': i
            })
        
        # Generate dark cloud positions
        dark_cloud_count = 40
        DARK_H = 280
        for i in range(dark_cloud_count):
            x = get_corridor_x()
            y = TOP_SAFE + self.rng.generate_random() * (GROUND_Y - 500 - DARK_H - TOP_SAFE)
            spawn_data['dark_clouds'].append({
                'x': round(x, 2),
                'y': round(y, 2),
                'index': i
            })
        
        # Generate pushable positions
        pushable_count = 20 
        PUSHABLE_SIZE = 550
        for i in range(pushable_count):
            x = get_corridor_x()
            y = TOP_SAFE + self.rng.generate_random() * (BOTTOM_SAFE - PUSHABLE_SIZE - TOP_SAFE)
            spawn_data['pushables'].append({
                'x': round(x, 2),
                'y': round(y, 2),
                'index': i
            })
        
        return spawn_data
    
    def get_verification_data(self) -> Dict[str, str]:
        """Get data needed for provably fair verification"""
        return {
            'server_seed_hash': self.rng.get_server_seed_hash(),
            'client_seed': self.rng.client_seed,
            'current_nonce': self.rng.nonce,
        }

