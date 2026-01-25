
import os

def check_file():
    path = "games/drop_the_dictator/library/publish_files/index.json"
    with open(path, "rb") as f:
        content = f.read()
        
    print(f"File length: {len(content)}")
    print(f"Starts with BOM: {content.startswith(b'\xef\xbb\xbf')}")
    print(f"Ends with newline: {content.endswith(b'\n')}")
    
    # Check if valid ascii/utf-8
    try:
        content.decode('utf-8')
        print("Valid UTF-8")
    except:
        print("Invalid UTF-8")

if __name__ == "__main__":
    check_file()
