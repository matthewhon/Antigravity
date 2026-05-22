import sys
from PIL import Image

def main():
    img_path = '/Users/matthewhon/.gemini/antigravity/brain/aa5e3be7-ae59-422b-a79f-2d37c0aff6e3/simulator_screenshot_current.png'
    try:
        img = Image.open(img_path)
    except Exception as e:
        print(f"Failed to open image: {e}")
        return

    # Resize to something readable in the console
    w, h = img.size
    aspect = h / w
    new_w = 80
    new_h = int(new_w * aspect * 0.5)  # 0.5 because console characters are taller than they are wide
    
    img_small = img.resize((new_w, new_h)).convert('L')
    
    # Simple character scale
    chars = " .:-=+*#%@"
    num_chars = len(chars)
    
    print(f"Image dimensions: {w}x{h} -> resized to {new_w}x{new_h}")
    for y in range(new_h):
        line = ""
        for x in range(new_w):
            val = img_small.getpixel((x, y))
            idx = int(val / 256 * num_chars)
            idx = min(idx, num_chars - 1)
            line += chars[idx]
        print(line)

if __name__ == "__main__":
    main()
