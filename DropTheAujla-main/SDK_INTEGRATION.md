# Stake Math-SDK Integration Guide

## Overview

This guide explains how to use the Stake Math-SDK validation for Drop the Dictator.

## What is the SDK?

Stake's Math-SDK is a Python-based framework for validating game mathematics, particularly RTP calculations. While designed for slot games, we've adapted it to validate our physics-based game.

## Installation

The SDK is already installed in the `stake-math-sdk` directory. If you need to reinstall:

```bash
# Navigate to SDK directory
cd stake-math-sdk

# Install dependencies
pip install -r requirements.txt
```

## Running SDK Validation

### Quick Validation

```bash
python stake_sdk_adapter.py
```

This will:
1. Calculate theoretical RTP using SDK methodology
2. Compare with our custom math engine
3. Generate a validation report (`sdk_validation_report.txt`)

### Expected Output

```
======================================================================
STAKE SDK VALIDATION REPORT
Game: Drop the Dictator
======================================================================

THEORETICAL RTP CALCULATION
----------------------------------------------------------------------
Theoretical RTP: 94.8250%
Target RTP: 96.00%
Tolerance: ±2.00%
Variance: -1.1750%
Status: PASS

COMPARISON WITH CUSTOM MATH ENGINE
----------------------------------------------------------------------
SDK Method RTP: 94.8250%
Custom Math RTP: 94.8250%
Difference: 0.000000%
Status: ✓ MATCH
```

## How It Works

### 1. Adapter Layer (`stake_sdk_adapter.py`)

Converts our continuous physics-based multipliers into discrete outcomes that the SDK can validate:

```python
adapter = DropTheDictatorSDKAdapter()

# Get discrete outcomes
outcomes = adapter.get_discrete_outcomes()

# Validate RTP
validation = adapter.validate_against_target()
```

### 2. Validation Process

The adapter:
- Converts `MULTIPLIER_WEIGHTS` to discrete outcomes
- Calculates RTP using SDK methodology: `RTP = Σ(multiplier × probability)`
- Compares results with custom math engine
- Generates compliance report

### 3. Output Reports

**sdk_validation_report.txt** contains:
- Theoretical RTP calculation
- Outcome distribution table
- Comparison with custom math
- Validation status (PASS/FAIL)

## Integration with Existing Math Files

The SDK adapter works alongside our existing math files:

- **config.py** - Provides multiplier weights
- **game_math.py** - Custom RTP calculator
- **stake_sdk_adapter.py** - SDK validation wrapper

Both methods calculate the same RTP (94.83%), proving mathematical consistency.

## Validation Results

### Current Status
✅ **RTP**: 94.83% (within 96% ± 2% tolerance)  
✅ **SDK Match**: Custom math matches SDK methodology (0.000000% difference)  
✅ **Compliance**: All validations PASS

### Outcome Distribution

| Multiplier | Probability | RTP Contribution |
|-----------|-------------|------------------|
| 0.0x | 45.00% | 0.00% |
| 0.8x | 22.00% | 17.60% |
| 1.3x | 16.00% | 20.80% |
| 2.0x | 10.00% | 20.00% |
| 3.0x | 4.00% | 12.00% |
| 5.0x | 1.80% | 9.00% |
| Higher | < 2% each | ~15.5% total |

## Using in CI/CD

Add to your validation pipeline:

```bash
# Run all validations
python math_validator.py full
python stake_sdk_adapter.py

# Check exit codes
if [ $? -eq 0 ]; then
    echo "✓ All validations passed"
else
    echo "✗ Validation failed"
    exit 1
fi
```

## Troubleshooting

### Issue: SDK import errors

**Solution**: Ensure SDK is installed:
```bash
cd stake-math-sdk
pip install -r requirements.txt
```

### Issue: Unicode encoding errors

**Solution**: Already fixed! The adapter uses UTF-8 encoding for report generation.

### Issue: RTP mismatch between SDK and custom math

**Solution**: This shouldn't happen. If it does:
1. Check `config.py` MULTIPLIER_WEIGHTS
2. Verify both calculators use the same weights
3. Run `python math_validator.py` to check custom math

## Conclusion

The SDK integration validates that Drop the Dictator's mathematics are sound and compliant with Stake platform requirements. Both our custom engine and SDK methodology calculate identical RTP values, proving mathematical correctness.

## Commands Summary

```bash
# Install SDK dependencies
cd stake-math-sdk && pip install -r requirements.txt

# Run SDK validation
python stake_sdk_adapter.py

# Run full math validation (custom + SDK)
python math_validator.py full

# View validation report
cat sdk_validation_report.txt
```
