"""
Math Validation and Testing Utilities for Drop the Dictator
Validates RTP, distribution, and game fairness
"""

from game_math import GameMath, RTPCalculator, MultiplierEngine, ProvablyFairRNG
from config import GameConfig
from typing import Dict, List
import statistics


class MathValidator:
    """Validates game mathematics and fairness"""
    
    @staticmethod
    def validate_rtp(num_rounds: int = 100000) -> Dict:
        """
        Run RTP validation simulation
        
        Args:
            num_rounds: Number of rounds to simulate
            
        Returns:
            Validation results
        """
        print(f"Running RTP validation over {num_rounds:,} rounds...")
        
        results = RTPCalculator.simulate_rtp(num_rounds=num_rounds, bet_amount=1.0)
        theoretical_rtp = RTPCalculator.calculate_theoretical_rtp()
        is_compliant = RTPCalculator.verify_rtp_compliance(results['actual_rtp'])
        
        print(f"\n{'='*60}")
        print(f"RTP VALIDATION RESULTS")
        print(f"{'='*60}")
        print(f"Theoretical RTP: {theoretical_rtp*100:.2f}%")
        print(f"Actual RTP: {results['actual_rtp_percentage']:.2f}%")
        print(f"Target RTP: {GameConfig.TARGET_RTP*100:.2f}%")
        print(f"Tolerance: ±{GameConfig.RTP_TOLERANCE*100:.2f}%")
        print(f"Variance: {(results['actual_rtp'] - theoretical_rtp)*100:+.2f}%")
        print(f"Compliant: {'✓ YES' if is_compliant else '✗ NO'}")
        print(f"\nTotal Wagered: ${results['total_wagered']:,.2f}")
        print(f"Total Returned: ${results['total_returned']:,.2f}")
        print(f"Average Multiplier: {results['average_multiplier']:.4f}x")
        print(f"Max Multiplier: {results['max_multiplier']:.2f}x")
        print(f"Min Multiplier: {results['min_multiplier']:.2f}x")
        print(f"{'='*60}\n")
        
        return {
            **results,
            'theoretical_rtp': theoretical_rtp,
            'is_compliant': is_compliant,
            'variance': results['actual_rtp'] - theoretical_rtp,
        }
    
    @staticmethod
    def validate_multiplier_distribution(num_samples: int = 10000) -> Dict:
        """
        Validate multiplier distribution matches configured weights
        
        Args:
            num_samples: Number of samples to generate
            
        Returns:
            Distribution analysis
        """
        print(f"Validating multiplier distribution over {num_samples:,} samples...")
        
        rng = ProvablyFairRNG()
        multiplier_counts = {}
        
        # Initialize counts
        for multiplier, _ in GameConfig.MULTIPLIER_WEIGHTS:
            multiplier_counts[multiplier] = 0
        
        # Generate samples
        for _ in range(num_samples):
            rand_val = rng.generate_random()
            multiplier = MultiplierEngine.select_multiplier(rand_val)
            multiplier_counts[multiplier] += 1
        
        # Calculate expected vs actual
        total_weight = GameConfig.get_total_multiplier_weight()
        
        print(f"\n{'='*80}")
        print(f"MULTIPLIER DISTRIBUTION ANALYSIS")
        print(f"{'='*80}")
        print(f"{'Multiplier':<12} {'Expected %':<12} {'Actual %':<12} {'Difference':<12} {'Count':<10}")
        print(f"{'-'*80}")
        
        results = []
        for multiplier, weight in GameConfig.MULTIPLIER_WEIGHTS:
            expected_pct = (weight / total_weight) * 100
            actual_count = multiplier_counts[multiplier]
            actual_pct = (actual_count / num_samples) * 100
            difference = actual_pct - expected_pct
            
            print(f"{multiplier:<12.2f} {expected_pct:<12.2f} {actual_pct:<12.2f} {difference:<+12.2f} {actual_count:<10}")
            
            results.append({
                'multiplier': multiplier,
                'expected_pct': expected_pct,
                'actual_pct': actual_pct,
                'difference': difference,
                'count': actual_count,
            })
        
        print(f"{'='*80}\n")
        
        return {
            'num_samples': num_samples,
            'results': results,
        }
    
    @staticmethod
    def validate_provably_fair() -> bool:
        """
        Validate provably fair system
        
        Returns:
            True if all verifications pass
        """
        print("Validating provably fair system...")
        
        rng = ProvablyFairRNG(
            server_seed="test_server_seed_12345",
            client_seed="test_client_seed"
        )
        
        # Generate some values
        nonce_start = rng.nonce
        values = []
        
        for i in range(5):
            values.append({
                'nonce': rng.nonce,
                'value': rng.generate_random()
            })
        
        # Verify each value
        all_verified = True
        print(f"\n{'='*60}")
        print(f"PROVABLY FAIR VERIFICATION")
        print(f"{'='*60}")
        
        for item in values:
            verified = rng.verify_result(
                server_seed="test_server_seed_12345",
                client_seed="test_client_seed",
                nonce=item['nonce'],
                expected_value=item['value']
            )
            
            status = "✓ PASS" if verified else "✗ FAIL"
            print(f"Nonce {item['nonce']}: {status} (value: {item['value']:.8f})")
            
            if not verified:
                all_verified = False
        
        print(f"{'='*60}")
        print(f"Overall: {'✓ ALL VERIFIED' if all_verified else '✗ VERIFICATION FAILED'}")
        print(f"{'='*60}\n")
        
        return all_verified
    
    @staticmethod
    def validate_payout_limits(num_samples: int = 1000) -> Dict:
        """
        Validate that payouts respect maximum win limits
        
        Args:
            num_samples: Number of rounds to test
            
        Returns:
            Validation results
        """
        print(f"Validating payout limits over {num_samples:,} samples...")
        
        game_math = GameMath()
        violations = []
        max_multiplier_seen = 0
        
        for _ in range(num_samples):
            result = game_math.generate_round_result(bet_amount=10.0)
            
            if result['final_multiplier'] > GameConfig.MAX_WIN_MULTIPLIER:
                violations.append(result)
            
            max_multiplier_seen = max(max_multiplier_seen, result['final_multiplier'])
        
        print(f"\n{'='*60}")
        print(f"PAYOUT LIMIT VALIDATION")
        print(f"{'='*60}")
        print(f"Max Win Limit: {GameConfig.MAX_WIN_MULTIPLIER:,.0f}x")
        print(f"Max Multiplier Seen: {max_multiplier_seen:,.2f}x")
        print(f"Violations: {len(violations)}")
        print(f"Status: {'✓ PASS' if len(violations) == 0 else '✗ FAIL'}")
        print(f"{'='*60}\n")
        
        return {
            'num_samples': num_samples,
            'max_multiplier_seen': max_multiplier_seen,
            'violations': len(violations),
            'is_valid': len(violations) == 0,
        }
    
    @staticmethod
    def run_full_validation() -> Dict:
        """
        Run complete validation suite
        
        Returns:
            Complete validation results
        """
        print("\n" + "="*60)
        print("RUNNING FULL MATH VALIDATION SUITE")
        print("="*60 + "\n")
        
        results = {}
        
        # 1. Provably Fair
        results['provably_fair'] = MathValidator.validate_provably_fair()
        
        # 2. Multiplier Distribution
        results['distribution'] = MathValidator.validate_multiplier_distribution(10000)
        
        # 3. RTP
        results['rtp'] = MathValidator.validate_rtp(100000)
        
        # 4. Payout Limits
        results['payout_limits'] = MathValidator.validate_payout_limits(1000)
        
        # Summary
        print("\n" + "="*60)
        print("VALIDATION SUMMARY")
        print("="*60)
        print(f"Provably Fair: {'✓ PASS' if results['provably_fair'] else '✗ FAIL'}")
        print(f"RTP Compliance: {'✓ PASS' if results['rtp']['is_compliant'] else '✗ FAIL'}")
        print(f"Payout Limits: {'✓ PASS' if results['payout_limits']['is_valid'] else '✗ FAIL'}")
        print(f"="*60 + "\n")
        
        return results


# CLI interface for running validations
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "full":
        MathValidator.run_full_validation()
    else:
        print("Math Validator for Drop the Dictator")
        print("=" * 60)
        print("\nAvailable validations:")
        print("  python math_validator.py full     - Run complete validation suite")
        print("\nQuick validation:")
        MathValidator.validate_rtp(10000)
