
import json
import os
import csv
import zstandard as zstd

def verify_format():
    print("Verifying files with strict structure...")
    
    base_path = "games/drop_the_dictator/library/publish_files"

    # 1. index.json
    try:
        with open(f"{base_path}/index.json", "r") as f:
            content = f.read()
            if not content.endswith("\n"):
                print("⚠️ index.json missing final newline")
            index = json.loads(content)
            assert "modes" in index, "index.json missing 'modes'"
            
            # Verify paths in index.json exist
            weights_path = index["modes"][0]["weights"]
            events_path = index["modes"][0]["events"]
            
            if not os.path.exists(f"{base_path}/{weights_path}"):
                raise FileNotFoundError(f"Weights file not found at {weights_path}")
            if not os.path.exists(f"{base_path}/{events_path}"):
                raise FileNotFoundError(f"Events file not found at {events_path}")

            print("✅ index.json schema and paths valid")
            
    except Exception as e:
        print(f"❌ index.json error: {e}")

    # 2. lookup_tables
    try:
        # Check folder existence explicitly
        if not os.path.isdir(f"{base_path}/lookup_tables"):
             raise FileNotFoundError("lookup_tables folder missing")

        with open(f"{base_path}/{weights_path}", "r") as f:
            reader = csv.reader(f)
            row = next(reader)
            assert len(row) == 3, f"CSV expected 3 columns, got {len(row)}"
            print("✅ lookup_tables structure valid")
    except Exception as e:
        print(f"❌ lookup_tables error: {e}")

    # 3. books (zst)
    try:
        with open(f"{base_path}/{events_path}", "rb") as fh:
            dctx = zstd.ZstdDecompressor()
            with dctx.stream_reader(fh) as reader:
                chunk = reader.read(4096)
                text = chunk.decode("utf-8")
                first_line = text.split("\n")[0]
                obj = json.loads(first_line)
                required = ["id", "payoutMultiplier", "events"]
                missing = [k for k in required if k not in obj]
                if missing:
                    raise ValueError(f"Missing keys: {missing}")
                print("✅ books structure valid")
                
    except Exception as e:
        print(f"❌ books error: {e}")

if __name__ == "__main__":
    verify_format()
