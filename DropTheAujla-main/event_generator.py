"""
Event Generator for Drop the Dictator
Generates event-driven game flow for frontend consumption
"""

from typing import List, Dict, Optional
from game_math import GameMath
from config import GameConfig
import time


class EventGenerator:
    """Generates game events based on round results"""
    
    def __init__(self, game_math: GameMath):
        """
        Initialize event generator
        
        Args:
            game_math: GameMath instance for calculating results
        """
        self.game_math = game_math
    
    def generate_round_events(self, bet_amount: float) -> List[Dict]:
        """
        Generate complete event sequence for a round
        
        Args:
            bet_amount: Amount wagered
            
        Returns:
            List of events representing the entire round
        """
        # Get round result from math engine
        result = self.game_math.generate_round_result(bet_amount)
        
        events = []
        
        # 1. Round start event
        events.append(self._create_round_start_event(result))
        
        # 2. Collectible events (if any)
        if result['collectibles']:
            events.extend(self._create_collectible_events(result))
        
        # 3. Black hole events (if triggered)
        if result['black_hole_triggered']:
            events.extend(self._create_black_hole_events(result))
        
        # 4. Win event
        events.append(self._create_win_event(result))
        
        # 5. Round end event
        events.append(self._create_round_end_event(result))
        
        return events
    
    def _create_round_start_event(self, result: Dict) -> Dict:
        """Create round start event with terminal depth for world construction.
        
        The frontend receives terminal_depth_y (where to place blocking geometry)
        rather than final_payout directly. This inverts the dependency:
        - Payout determines world construction (blocking geometry)
        - Physics determines motion
        - Max depth reached determines final score
        """
        # Convert payout to terminal depth (Y coordinate)
        # Higher payout = deeper descent = larger Y value
        # World height is approximately 20000, ground at 18500
        WORLD_START_Y = 0
        WORLD_GROUND_Y = 18500
        MAX_DESCENT = WORLD_GROUND_Y - 1000  # Maximum reachable depth
        
        final_payout = result['final_payout']
        bet_amount = result['bet_amount']
        
        # Calculate payout ratio (0 to MAX_WIN multiplier, e.g. 0 to 5000)
        max_multiplier = 10  # Reasonable max for depth calculation
        payout_ratio = min((final_payout / bet_amount) if bet_amount > 0 else 0, max_multiplier) / max_multiplier
        
        # Terminal depth: linear mapping from payout ratio to depth
        # Zero payout = early stop, max payout = near ground
        terminal_depth_y = int(WORLD_START_Y + payout_ratio * MAX_DESCENT)
        
        return {
            'type': 'round_start',
            'timestamp': int(time.time() * 1000),
            'bet_amount': result['bet_amount'],
            'nonce': result['nonce'],
            'server_seed_hash': result['server_seed_hash'],
            'spawn_data': result.get('spawn_data', {}),
            # Send terminal_depth_y instead of final_payout
            # Frontend will calculate score from max_depth_reached
            'terminal_depth_y': terminal_depth_y,
            'max_payout_at_ground': bet_amount * max_multiplier,  # For score calculation
            'black_hole_triggered': result['black_hole_triggered'],
            'black_hole_multiplier': result['black_hole_multiplier'],
        }
    
    def _create_collectible_events(self, result: Dict) -> List[Dict]:
        """Create events for collected items"""
        events = []
        
        for i, collectible_type in enumerate(result['collectibles']):
            collectible_config = GameConfig.COLLECTIBLES.get(collectible_type, {})
            value_multiplier = collectible_config.get('value_multiplier', 0)
            
            events.append({
                'type': 'collectible',
                'timestamp': int(time.time() * 1000) + (i * 100),  # Stagger events
                'collectible_type': collectible_type,
                'value_multiplier': value_multiplier,
                'value': result['bet_amount'] * value_multiplier,
                'index': i,
            })
        
        return events
    
    def _create_black_hole_events(self, result: Dict) -> List[Dict]:
        """Create black hole bonus entry/exit events"""
        events = []
        
        # Black hole entry
        events.append({
            'type': 'bonus_enter',
            'timestamp': int(time.time() * 1000),
            'bonus_type': 'black_hole',
            'multiplier': result['black_hole_multiplier'],
            'duration_ms': GameConfig.BLACK_HOLE['duration_ms'],
        })
        
        # Black hole exit (happens after duration)
        events.append({
            'type': 'bonus_exit',
            'timestamp': int(time.time() * 1000) + GameConfig.BLACK_HOLE['duration_ms'],
            'bonus_type': 'black_hole',
            'final_multiplier': result['black_hole_multiplier'],
        })
        
        return events
    
    def _create_win_event(self, result: Dict) -> Dict:
        """Create win event with payout information"""
        return {
            'type': 'win',
            'timestamp': int(time.time() * 1000),
            'base_multiplier': result['base_multiplier'],
            'collectible_bonus': result['collectible_bonus'],
            'black_hole_multiplier': result['black_hole_multiplier'],
            'final_multiplier': result['final_multiplier'],
            'payout': result['final_payout'],
            'base_payout': result['base_payout'],
        }
    
    def _create_round_end_event(self, result: Dict) -> Dict:
        """Create round end event"""
        return {
            'type': 'round_end',
            'timestamp': int(time.time() * 1000),
            'final_payout': result['final_payout'],
            'final_multiplier': result['final_multiplier'],
            'nonce': result['nonce'],
        }
    
    def generate_obstacle_events(self, obstacle_types: List[str]) -> List[Dict]:
        """
        Generate obstacle events (visual/time penalties only)
        These do NOT affect payout, only animations and delays
        
        Args:
            obstacle_types: List of obstacle types encountered
            
        Returns:
            List of obstacle events
        """
        events = []
        
        for i, obstacle_type in enumerate(obstacle_types):
            if obstacle_type in GameConfig.OBSTACLES:
                obstacle_config = GameConfig.OBSTACLES[obstacle_type]
                
                events.append({
                    'type': 'obstacle',
                    'timestamp': int(time.time() * 1000) + (i * 150),
                    'obstacle_type': obstacle_type,
                    'time_penalty_ms': obstacle_config['time_penalty_ms'],
                    'visual_effect': obstacle_config['visual_effect'],
                    'affects_payout': False,  # Explicitly mark as visual only
                })
        
        return events


class SessionManager:
    """Manages game sessions with provably fair seed generation"""
    
    def __init__(self):
        """Initialize session manager"""
        self.sessions = {}
    
    def create_session(self, user_id: str, client_seed: Optional[str] = None) -> Dict:
        """
        Create new game session
        
        Args:
            user_id: Unique user identifier
            client_seed: Optional client-provided seed
            
        Returns:
            Session data including server seed hash
        """
        game_math = GameMath(client_seed=client_seed)
        event_generator = EventGenerator(game_math)
        
        session_data = {
            'user_id': user_id,
            'game_math': game_math,
            'event_generator': event_generator,
            'created_at': int(time.time() * 1000),
            'round_count': 0,
        }
        
        self.sessions[user_id] = session_data
        
        return {
            'session_id': user_id,
            'server_seed_hash': game_math.get_verification_data()['server_seed_hash'],
            'client_seed': game_math.rng.client_seed,
            'nonce': game_math.rng.nonce,
        }
    
    def get_session(self, user_id: str) -> Optional[Dict]:
        """Get existing session"""
        return self.sessions.get(user_id)
    
    def play_round(self, user_id: str, bet_amount: float) -> Dict:
        """
        Play a round for user session
        
        Args:
            user_id: User identifier
            bet_amount: Bet amount
            
        Returns:
            Round events and results
        """
        session = self.get_session(user_id)
        
        if not session:
            raise ValueError(f"No session found for user: {user_id}")
        
        # Generate events
        events = session['event_generator'].generate_round_events(bet_amount)
        
        # Update session
        session['round_count'] += 1
        
        return {
            'events': events,
            'round_number': session['round_count'],
            'verification': session['game_math'].get_verification_data(),
        }
    
    def end_session(self, user_id: str) -> Dict:
        """
        End session and return final verification data
        
        Args:
            user_id: User identifier
            
        Returns:
            Final session data for verification
        """
        session = self.sessions.pop(user_id, None)
        
        if not session:
            raise ValueError(f"No session found for user: {user_id}")
        
        return {
            'user_id': user_id,
            'total_rounds': session['round_count'],
            'server_seed': session['game_math'].rng.server_seed,  # Reveal after session
            'client_seed': session['game_math'].rng.client_seed,
            'final_nonce': session['game_math'].rng.nonce,
        }


# Convenience function for simple round generation
def generate_round(bet_amount: float, server_seed: Optional[str] = None, 
                  client_seed: Optional[str] = None) -> Dict:
    """
    Generate a complete round with events (convenience function)
    
    Args:
        bet_amount: Amount to wager
        server_seed: Optional server seed
        client_seed: Optional client seed
        
    Returns:
        Dictionary with events and result data
    """
    game_math = GameMath(server_seed=server_seed, client_seed=client_seed)
    event_generator = EventGenerator(game_math)
    
    events = event_generator.generate_round_events(bet_amount)
    verification = game_math.get_verification_data()
    
    return {
        'events': events,
        'verification': verification,
    }
