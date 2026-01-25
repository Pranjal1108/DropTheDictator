# TODO: Fix Critical Issues for Stake Engine Approval

## 🚨 REMAINING BLOCKERS (CRITICAL)

## 1. Remove Frontend Payout Computation
- [ ] Frontend never computes money - only interpolates toward event.payout
- [ ] Remove all arithmetic: earnings += fallDistance * rate, earnings += collectibleValue
- [ ] Collectibles trigger animations only, not math
- [ ] Black hole multiplier from event only, no frontend calculation

## 2. Fix Black Hole Multiplier Derivation
- [ ] Remove bhCurrentMultiplier = Math.min(10, 1 + (riseHeight / 120))
- [ ] Remove finalEarnings = originalEarnings * bhCurrentMultiplier
- [ ] Multiplier comes from bonus_enter event only

## 3. Remove Rate Suppression Affecting Payout
- [ ] Penalties must not affect earnings, rate, multipliers, or progress
- [ ] Penalties can only be: time delays, stuns, visual effects, camera effects
- [ ] Remove earnings += baseRate * suppression

## 4. Make Purely Event-Driven Round End
- [ ] Frontend waits for round_end event, does not decide completion
- [ ] Ground contact affects animation only, not round logic
- [ ] Remove if (onGround && time > 1000) { completeRound() }

## 5. Complete Stake.us Terminology Replacement
- [ ] Centralize all text via language map
- [ ] Replace all gambling terms: "Total Winnings", "Multiplier", "Bonus"
- [ ] Ensure zero forbidden terms in DOM

## ✅ ALREADY FIXED

## 6. Remove Explicit Payout Steering
- [x] Removed getTargetPayout(), forced landing, direct payout logic

## 7. Event-Driven Architecture (Partial)
- [x] Process win, bonus_enter, bonus_exit, round_end events
- [x] Use event payout instead of recomputing

## 8. Social Mode Terminology (Partial)
- [x] Detect social=true, replace some terms

## 9. RGS Session Lifecycle
- [x] Auth → play → endround flow aligned

## 10. Rules Modal and Disclaimer
- [x] Modal with RTP, max win, disclaimer added

## 11. Responsive Scaling
- [x] Pop-out and fastplay scaling added
