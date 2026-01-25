"""Run script for Drop the Dictator."""

from gamestate import GameState
from game_config import GameConfig
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs

if __name__ == "__main__":
    num_threads = 1
    batching_size = 50000
    compression = True # User asked for .zst, so True
    profiling = False

    # Simulate enough rounds to get good stats
    num_sim_args = {
        "base": int(1e5), 
    }

    config = GameConfig()
    gamestate = GameState(config)

    # 1. Run Simulations (Create Books and Lookup Tables)
    create_books(
        gamestate,
        config,
        num_sim_args,
        batching_size,
        num_threads,
        compression,
        profiling,
    )

    # 2. Generate Configs (index.json)
    generate_configs(gamestate)
    
    print("Files generated.")
