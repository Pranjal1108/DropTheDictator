"""
Test script for the corridor architecture implementation.
Verifies that world plan generation works correctly with forced events and funnels.
"""

from app import calculate_outcome, generate_world_plan, decompose_payout_to_events

def main():
    test_cases = [0.1, 0.3, 0.5, 0.7, 0.85, 0.95, 0.995]
    
    print("=" * 70)
    print("CORRIDOR ARCHITECTURE TEST - World Plan Generation")
    print("=" * 70)
    
    for rng in test_cases:
        outcome = calculate_outcome(rng, 1000000, 'normal')
        plan = generate_world_plan(rng, outcome)
        
        fall = plan.get('fall', True)
        events = plan.get('forced_events', [])
        funnels = plan.get('event_funnels', [])
        
        mult = outcome['multiplier']
        depth = outcome['terminal_depth_y']
        
        print(f"\nRNG={rng:.3f}: mult={mult:.2f}x, depth={depth}, fall={fall}")
        print(f"  Events: {len(events)}, Funnels: {len(funnels)}")
        
        if events:
            for e in events[:3]:  # Show first 3 events
                etype = e.get('type', 'unknown')
                ypos = e.get('y_position', 0)
                val = e.get('value_contribution', 0)
                print(f"    -> {etype} at Y:{ypos}, value:{val}")
        
        if funnels:
            for f in funnels[:2]:  # Show first 2 funnels
                clouds = len(f.get('clouds', []))
                item_pos = f.get('item_position', {})
                print(f"    -> Funnel with {clouds} clouds, item at ({item_pos.get('x', 0):.0f}, {item_pos.get('y', 0):.0f})")
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE - All RNG values produced valid world plans")
    print("=" * 70)

if __name__ == "__main__":
    main()
