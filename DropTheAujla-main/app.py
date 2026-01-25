"""
Drop the Dictator - Flask Backend
Integrates provably fair game math with event-driven architecture
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from event_generator import SessionManager, generate_round
from game_math import RTPCalculator, GameMath
from config import GameConfig
import uuid

app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)  # Enable CORS for development

# Global session manager
session_manager = SessionManager()

@app.route('/')
def index():
    """Serve main game page"""
    return send_from_directory('public', 'index.html')


@app.route('/api/config', methods=['GET'])
def get_config():
    """Get game configuration"""
    return jsonify({
        'game_name': GameConfig.GAME_NAME,
        'version': GameConfig.GAME_VERSION,
        'min_bet': GameConfig.MIN_BET,
        'max_bet': GameConfig.MAX_BET,
        'default_bet': GameConfig.DEFAULT_BET,
        'max_win_multiplier': GameConfig.MAX_WIN_MULTIPLIER,
        'target_rtp': GameConfig.TARGET_RTP * 100,  # Convert to percentage
        'collectibles': {
            name: {
                'value_multiplier': config['value_multiplier'],
                'spawn_probability': config['spawn_probability']
            }
            for name, config in GameConfig.COLLECTIBLES.items()
        }
    })


@app.route('/api/session/create', methods=['POST'])
def create_session():
    """Create new game session with provably fair seeds"""
    data = request.get_json() or {}
    
    # Get or generate user ID
    user_id = data.get('user_id') or str(uuid.uuid4())
    client_seed = data.get('client_seed')  # Optional client seed
    
    try:
        session_data = session_manager.create_session(user_id, client_seed)
        
        return jsonify({
            'success': True,
            'session': session_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/session/info/<user_id>', methods=['GET'])
def get_session_info(user_id):
    """Get current session information"""
    session = session_manager.get_session(user_id)
    
    if not session:
        return jsonify({
            'success': False,
            'error': 'Session not found'
        }), 404
    
    return jsonify({
        'success': True,
        'session_id': user_id,
        'round_count': session['round_count'],
        'verification': session['game_math'].get_verification_data()
    })


@app.route('/api/bet', methods=['POST'])
def bet():
    """Place bet and play round (session-based)"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    user_id = data.get('user_id')
    bet_amount = data.get('betAmount')
    
    # Validate inputs
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400
    
    if not bet_amount:
        return jsonify({'error': 'betAmount required'}), 400
    
    try:
        bet_amount = float(bet_amount)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid bet amount'}), 400
    
    # Validate bet range
    if not GameConfig.validate_bet(bet_amount):
        return jsonify({
            'error': f'Bet must be between {GameConfig.MIN_BET} and {GameConfig.MAX_BET}'
        }), 400
    
    try:
        # Play round through session
        result = session_manager.play_round(user_id, bet_amount)
        
        return jsonify({
            'success': True,
            **result
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Internal error: {str(e)}'
        }), 500


@app.route('/api/play', methods=['POST'])
def play_simple():
    """
    Simple play endpoint without session (for testing/quick play)
    Creates a new round with random seeds
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    bet_amount = data.get('betAmount')
    
    if not bet_amount:
        return jsonify({'error': 'betAmount required'}), 400
    
    try:
        bet_amount = float(bet_amount)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid bet amount'}), 400
    
    # Validate bet range
    if not GameConfig.validate_bet(bet_amount):
        return jsonify({
            'error': f'Bet must be between {GameConfig.MIN_BET} and {GameConfig.MAX_BET}'
        }), 400
    
    try:
        # Generate round without session
        result = generate_round(bet_amount)
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Internal error: {str(e)}'
        }), 500


@app.route('/api/session/end/<user_id>', methods=['POST'])
def end_session(user_id):
    """End session and get verification data"""
    try:
        final_data = session_manager.end_session(user_id)
        
        return jsonify({
            'success': True,
            'final_data': final_data
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404


@app.route('/api/rtp', methods=['GET'])
def get_rtp_info():
    """Get RTP information"""
    theoretical_rtp = RTPCalculator.calculate_theoretical_rtp()
    
    return jsonify({
        'target_rtp': GameConfig.TARGET_RTP * 100,
        'theoretical_rtp': theoretical_rtp * 100,
        'tolerance': GameConfig.RTP_TOLERANCE * 100,
        'max_win': GameConfig.MAX_WIN_MULTIPLIER
    })


@app.route('/api/verify', methods=['POST'])
def verify_round():
    """Verify a previous round result"""
    data = request.get_json()
    
    required_fields = ['server_seed', 'client_seed', 'nonce', 'expected_value']
    if not all(field in data for field in required_fields):
        return jsonify({
            'success': False,
            'error': 'Missing required fields'
        }), 400
    
    try:
        game_math = GameMath()
        is_valid = game_math.rng.verify_result(
            server_seed=data['server_seed'],
            client_seed=data['client_seed'],
            nonce=int(data['nonce']),
            expected_value=float(data['expected_value'])
        )
        
        return jsonify({
            'success': True,
            'verified': is_valid
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def server_error(e):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    print("="*60)
    print("Drop the Dictator - Game Server")
    print("="*60)
    print(f"Game: {GameConfig.GAME_NAME} v{GameConfig.GAME_VERSION}")
    print(f"Target RTP: {GameConfig.TARGET_RTP * 100}%")
    print(f"Max Win: {GameConfig.MAX_WIN_MULTIPLIER:,}x")
    print(f"Bet Range: ${GameConfig.MIN_BET} - ${GameConfig.MAX_BET}")
    print("="*60)
    print("\nStarting server on http://localhost:3000")
    print("="*60 + "\n")
    
    app.run(debug=True, port=3000)
