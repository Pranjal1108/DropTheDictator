"""
Stake SDK Adapter for Drop the Dictator
Adapts physics-based game to SDK validation format
"""

import sys
from pathlib import Path
from typing import Dict, List, Tuple
from config import GameConfig
from game_math import RTPCalculator, MultiplierEngine

# Add SDK to path
sdk_path = Path(__file__).parent / "stake-math-sdk"
sys.path.insert(0, str(sdk_path))


class DropTheDictatorSDKAdapter:
    """
    Adapter to validate Drop the Dictator using Stake SDK methodology
    
    Since Drop the Dictator is physics-based (not slot-based), we convert
    our multiplier distribution into discrete outcomes that SDK can validate.
    """
    
    def __init__(self):
        """Initialize adapter with game config"""
        self.game_name = GameConfig.GAME_NAME
        self.target_rtp = GameConfig.TARGET_RTP
        self.multiplier_weights = GameConfig.MULTIPLIER_WEIGHTS
        
    def get_discrete_outcomes(self) -> List[Dict]:
        """
        Convert multiplier distribution to discrete outcomes
        
        Returns:
            List of outcome definitions with probabilities and payouts
        """
        outcomes = []
        total_weight = GameConfig.get_total_multiplier_weight()
        
        for multiplier, weight in self.multiplier_weights:
            probability = weight / total_weight
            
            outcomes.append({
                'id': f'mult_{multiplier}x',
                'multiplier': multiplier,
                'probability': probability,
                'weight': weight,
                'rtp_contribution': multiplier * probability
            })
        
        return outcomes
    
    def calculate_theoretical_rtp_sdk_method(self) -> Dict:
        """
        Calculate RTP using SDK methodology
        
        Returns:
            RTP calculation details
        """
        outcomes = self.get_discrete_outcomes()
        
        total_rtp = sum(outcome['rtp_contribution'] for outcome in outcomes)
        total_probability = sum(outcome['probability'] for outcome in outcomes)
        
        return {
            'theoretical_rtp': total_rtp,
            'theoretical_rtp_percentage': total_rtp * 100,
            'total_probability': total_probability,
            'num_outcomes': len(outcomes),
            'outcomes': outcomes,
            'target_rtp': self.target_rtp * 100,
            'variance_from_target': (total_rtp - self.target_rtp) * 100
        }
    
    def generate_outcome_table(self) -> str:
        """
        Generate CSV-style outcome table for SDK validation
        
        Returns:
            CSV formatted string
        """
        outcomes = self.get_discrete_outcomes()
        
        lines = ['Outcome ID,Multiplier,Probability,Weight,RTP Contribution']
        
        for outcome in outcomes:
            lines.append(
                f"{outcome['id']},"
                f"{outcome['multiplier']:.2f},"
                f"{outcome['probability']:.6f},"
                f"{outcome['weight']:.3f},"
                f"{outcome['rtp_contribution']:.6f}"
            )
        
        return '\n'.join(lines)
    
    def validate_against_target(self) -> Dict:
        """
        Validate RTP against target using SDK methodology
        
        Returns:
            Validation results
        """
        rtp_data = self.calculate_theoretical_rtp_sdk_method()
        
        is_valid = abs(rtp_data['variance_from_target']) <= (GameConfig.RTP_TOLERANCE * 100)
        
        return {
            **rtp_data,
            'is_valid': is_valid,
            'tolerance_percentage': GameConfig.RTP_TOLERANCE * 100,
            'validation_status': 'PASS' if is_valid else 'FAIL',
            'message': self._get_validation_message(rtp_data, is_valid)
        }
    
    def _get_validation_message(self, rtp_data: Dict, is_valid: bool) -> str:
        """Generate validation message"""
        if is_valid:
            return (
                f"✓ RTP {rtp_data['theoretical_rtp_percentage']:.2f}% "
                f"is within target {rtp_data['target_rtp']:.2f}% "
                f"± {GameConfig.RTP_TOLERANCE * 100:.2f}%"
            )
        else:
            return (
                f"✗ RTP {rtp_data['theoretical_rtp_percentage']:.2f}% "
                f"exceeds tolerance for target {rtp_data['target_rtp']:.2f}% "
                f"(variance: {rtp_data['variance_from_target']:+.2f}%)"
            )
    
    def compare_with_custom_math(self) -> Dict:
        """
        Compare SDK adapter calculations with custom math engine
        
        Returns:
            Comparison results
        """
        sdk_rtp = self.calculate_theoretical_rtp_sdk_method()['theoretical_rtp']
        custom_rtp = RTPCalculator.calculate_theoretical_rtp()
        
        difference = abs(sdk_rtp - custom_rtp)
        
        return {
            'sdk_rtp': sdk_rtp * 100,
            'custom_rtp': custom_rtp * 100,
            'difference': difference * 100,
            'match': difference < 0.0001,  # Allow for tiny floating point differences
            'status': '✓ MATCH' if difference < 0.0001 else '✗ MISMATCH'
        }
    
    def export_validation_report(self, filename: str = "sdk_validation_report.txt"):
        """
        Export complete validation report
        
        Args:
            filename: Output filename
        """
        validation = self.validate_against_target()
        comparison = self.compare_with_custom_math()
        
        report_lines = [
            "="*70,
            "STAKE SDK VALIDATION REPORT",
            f"Game: {self.game_name}",
            "="*70,
            "",
            "THEORETICAL RTP CALCULATION",
            "-"*70,
            f"Theoretical RTP: {validation['theoretical_rtp_percentage']:.4f}%",
            f"Target RTP: {validation['target_rtp']:.2f}%",
            f"Tolerance: ±{validation['tolerance_percentage']:.2f}%",
            f"Variance: {validation['variance_from_target']:+.4f}%",
            f"Status: {validation['validation_status']}",
            "",
            "OUTCOME DISTRIBUTION",
            "-"*70,
            f"Number of Outcomes: {validation['num_outcomes']}",
            f"Total Probability: {validation['total_probability']:.6f}",
            "",
            "COMPARISON WITH CUSTOM MATH ENGINE",
            "-"*70,
            f"SDK Method RTP: {comparison['sdk_rtp']:.4f}%",
            f"Custom Math RTP: {comparison['custom_rtp']:.4f}%",
            f"Difference: {comparison['difference']:.6f}%",
            f"Status: {comparison['status']}",
            "",
            "DETAILED OUTCOMES",
            "-"*70,
            self.generate_outcome_table(),
            "",
            "="*70,
            "VALIDATION SUMMARY",
            "="*70,
            validation['message'],
            f"SDK/Custom Match: {comparison['status']}",
            "="*70,
        ]
        
        report_content = '\n'.join(report_lines)
        
        # Save report with UTF-8 encoding to support checkmarks
        output_path = Path(__file__).parent / filename
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(report_content)
        
        print(report_content)
        print(f"\nReport saved to: {output_path}")
        
        return output_path


def main():
    """Run SDK validation"""
    print("Stake SDK Adapter for Drop the Dictator")
    print("="*70)
    print()
    
    adapter = DropTheDictatorSDKAdapter()
    
    # Run validation
    print("Running validation...")
    adapter.export_validation_report()
    
    print("\n" + "="*70)
    print("Validation complete!")
    print("="*70)


if __name__ == "__main__":
    main()
