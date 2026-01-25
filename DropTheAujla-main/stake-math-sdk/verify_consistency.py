
import csv
import json
import zstandard as zstd
import os

def check_consistency():
    base_path = "games/drop_the_dictator/library/publish_files"
    csv_path = f"{base_path}/lookup_tables/lookUpTable_base_0.csv"
    books_path = f"{base_path}/books_base.jsonl.zst"
    
    # 1. Load CSV
    print(f"Loading {csv_path}...")
    lut = {}
    with open(csv_path, "r") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if not row: continue
            try:
                # Format: id, weight, payout
                idx = int(row[0])
                # weight = row[1]
                payout = int(row[2])
                lut[idx] = payout
            except ValueError as e:
                print(f"Error parse CSV line {i}: {row} - {e}")
                
    print(f"Loaded {len(lut)} rows from CSV.")
    
    # 2. Check Books
    print(f"Checking {books_path}...")
    count = 0
    mismatches = 0
    
    with open(books_path, "rb") as fh:
        dctx = zstd.ZstdDecompressor()
        with dctx.stream_reader(fh) as reader:
            # We need to process line by line. 
            # stream_reader provides a stream. We need to buffer and split lines.
            buffer = ""
            while True:
                chunk = reader.read(65536)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8")
                
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    if not line.strip(): continue
                    
                    obj = json.loads(line)
                    bid = obj.get("id")
                    pm = obj.get("payoutMultiplier")
                    
                    if bid not in lut:
                        print(f"❌ ID {bid} in book NOT found in LUT!")
                        mismatches += 1
                    else:
                        lut_payout = lut[bid]
                        if lut_payout != pm:
                            print(f"❌ Mismatch ID {bid}: Book={pm}, LUT={lut_payout}")
                            mismatches += 1
                            if mismatches > 10: break
                    count += 1
                    if count % 10000 == 0:
                        print(f"Checked {count}...")
                
                if mismatches > 10: break

    if mismatches == 0:
        print("✅ SUCCESS: All books match LUT entries.")
    else:
        print(f"❌ FAILED: Found {mismatches} mismatches.")

if __name__ == "__main__":
    check_consistency()
