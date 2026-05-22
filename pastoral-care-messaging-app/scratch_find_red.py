from PIL import Image

def main():
    img_path = '/Users/matthewhon/.gemini/antigravity/brain/aa5e3be7-ae59-422b-a79f-2d37c0aff6e3/simulator_screenshot_current.png'
    img = Image.open(img_path)
    w, h = img.size
    
    red_pixels = []
    for y in range(h):
        for x in range(w):
            r, g, b = img.getpixel((x, y))[:3]
            # Red color for Delete Folder: R should be high, G and B relatively low and close to each other.
            if r > 180 and g < 100 and b < 100:
                red_pixels.append((x, y))
                
    print(f"Total red pixels: {len(red_pixels)}")
    if red_pixels:
        xs = [p[0] for p in red_pixels]
        ys = [p[1] for p in red_pixels]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        print(f"Red pixels bounding box: x={min_x}..{max_x}, y={min_y}..{max_y}")
        print(f"Center: x={int((min_x+max_x)/2)}, y={int((min_y+max_y)/2)}")
    else:
        # Let's inspect a few pixels near the center of the image to see what color the text actually is
        print("No red pixels found. Inspecting some pixels near center...")
        for y in range(int(h*0.7), int(h*0.8), 20):
            for x in range(int(w*0.4), int(w*0.6), 50):
                print(f"x={x}, y={y}: {img.getpixel((x, y))[:3]}")

if __name__ == "__main__":
    main()
