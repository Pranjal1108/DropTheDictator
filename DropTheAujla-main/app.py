from flask import Flask, request, jsonify, send_from_directory
import random

app = Flask(__name__, static_folder='public', static_url_path='')

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/bet', methods=['POST'])
def bet():
    data = request.get_json()
    bet_amount = data.get('betAmount')

    if not bet_amount or bet_amount <= 0:
        return jsonify({'error': 'Invalid bet'}), 400

    bet_amount = float(bet_amount)
    r = random.random()

    if r < 0.55:
        multiplier = 0
    elif r < 0.80:
        multiplier = 0.6
    elif r < 0.93:
        multiplier = 1.3
    elif r < 0.98:
        multiplier = 2.0
    else:
        multiplier = 4.0

    target_payout = bet_amount * multiplier

    return jsonify({
        'targetPayout': target_payout,
        'cloudPlan': ['support', 'boost', 'boost', 'terminator']
    })

if __name__ == '__main__':
    app.run(debug=True, port=3000)
