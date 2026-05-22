from PIL import Image

def main():
    img_path = '/Users/matthewhon/.gemini/antigravity/brain/aa5e3be7-ae59-422b-a79f-2d37c0aff6e3/simulator_screenshot_current.png'
    img = Image.open(img_path)
    w, h = img.size
    
    # Search for blue pixels (iOS system dialog action text color)
    # Typically, iOS system dialog blue is around R=0..50, G=100..150, B=230..255.
    blue_pixels = []
    for y in range(int(h*0.5), int(h*0.65)):
        for x in range(int(w*0.5), int(w*0.8)):
            r, g, b = img.getpixel((x, y))[:3]
            if r < 100 and g < 150 and b > 200:
                blue_pixels.append((x, y))
                
    print(f"Total blue pixels: {len(blue_pixels)}")
    if blue_pixels:
        xs = [p[0] for p in blue_pixels]
        ys = [p[1] for p in blue_pixels]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        print(f"Blue pixels bounding box: x={min_x}..{max_x}, y={min_y}..{max_y}")
        print(f"Center: x={int((min_x+max_x)/2)}, y={int((min_y+max_y)/2)}")
    else:
        # If no blue pixels, let's print some pixels in the dialog region to inspect
        print("No blue pixels found. Inspecting colors...")
        for y in range(1400, 1600, 20):
            for x in range(600, 900, 50):
                print(f"x={x}, y={y}: {img.getpixel((x, y))[:3]}")

if __name__ == "__main__":
    main()
