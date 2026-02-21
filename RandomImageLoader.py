import os
import random
import torch
import numpy as np
from PIL import Image, ImageOps

class RandomImageLoader:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image_dir": ("STRING", {"default": "", "multiline": True, "placeholder": "Input directory containing images"}),
                "subfolders": ("BOOLEAN", {"default": False, "tooltip": "Search recursively in subfolders"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 64}),
                "load_images": ("BOOLEAN", {"default": True}),
                "check_openpose": ("BOOLEAN", {"default": False, "tooltip": "Check if image matches OpenPose format (black background with colored limbs)"}),
                "check_canny": ("BOOLEAN", {"default": False, "tooltip": "Check if image matches Canny format (black background with white lines)"}),
            },
            "optional": {
                "names_to_skip": ("STRING", {"default": "preview, previews, sample, samples, example, linart, lineart", "multiline": True, "placeholder": "Comma separated folder/file names to skip (e.g. preview, previews)"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING", "INT")
    RETURN_NAMES = ("images", "image_paths", "total_files_count")
    OUTPUT_IS_LIST = (True, True, False)
    FUNCTION = "load_random_images"
    CATEGORY = "Huko Tools"

    def is_openpose(self, img_array):
        # OpenPose images typically have a black background and colored limbs
        # Simple heuristic: Check if background is dominant black
        # This is a basic check; robust OpenPose detection is complex
        # Assumption: OpenPose images are mostly black (>50%) with some color
        
        # Convert to grayscale to check for black background
        # OpenPose background is (0,0,0)
        
        # Check if majority of pixels are black (or close to black)
        # Using a threshold for "black" to account for compression artifacts
        threshold = 30
        black_pixels = np.all(img_array < threshold, axis=-1)
        black_ratio = np.mean(black_pixels)
        
        # OpenPose skeletons are thin, so background should be very dominant
        # e.g., > 80% black
        return black_ratio > 0.8

    def is_canny(self, img_array):
        # Canny images are black background with white lines
        # Check if pixels are mostly black or white/grayscale
        
        # Check if image is grayscale (R=G=B)
        # Allow small deviation for compression
        r, g, b = img_array[:,:,0], img_array[:,:,1], img_array[:,:,2]
        is_grayscale = np.all(np.abs(r - g) < 10) and np.all(np.abs(g - b) < 10)
        
        if not is_grayscale:
            return False
            
        # Check for dominant black background
        threshold = 30
        black_pixels = np.all(img_array < threshold, axis=-1)
        black_ratio = np.mean(black_pixels)
        
        # Canny edges are thin, so background is dominant
        return black_ratio > 0.8

    def load_random_images(self, image_dir, subfolders, seed, batch_size, load_images, check_openpose, check_canny, names_to_skip=""):
        if not os.path.isdir(image_dir):
            raise FileNotFoundError(f"Directory '{image_dir}' cannot be found.")
            
        valid_extensions = ['.jpg', '.jpeg', '.png', '.webp']
        image_files = []
        
        # 1. Recursive Scan
        if subfolders:
            for root, dirs, files in os.walk(image_dir):
                for file in files:
                    if any(file.lower().endswith(ext) for ext in valid_extensions):
                        image_files.append(os.path.join(root, file))
        else:
            image_files = [os.path.join(image_dir, f) for f in os.listdir(image_dir) if any(f.lower().endswith(ext) for ext in valid_extensions)]
        
        if not image_files:
            raise FileNotFoundError(f"No valid images found in '{image_dir}'.")
            
        total_found = len(image_files)
        
        # 2. Filter Skip Names
        skip_names = []
        if names_to_skip:
            skip_names = [f.strip().lower() for f in names_to_skip.split(',') if f.strip()]
            
        filtered_files = []
        if skip_names:
            for path in image_files:
                path_lower = path.lower().replace('\\', '/')
                
                should_skip = False
                for skip in skip_names:
                    if skip in path_lower:
                        should_skip = True
                        break
                
                if not should_skip:
                    filtered_files.append(path)
            image_files = filtered_files
        
        if not image_files:
             return ([], [], total_found)

        # 3. Random Selection with Validation
        rng = random.Random(seed)
        
        loaded_images = []
        final_paths = []
        
        # Create a copy of files to pick from
        available_files = list(image_files)
        # Shuffle initially to ensure random pick order
        rng.shuffle(available_files)
        
        attempts = 0
        max_attempts = len(available_files) * 2 # Safety break
        
        while len(final_paths) < batch_size and available_files:
            if not available_files:
                break
                
            # Pick a file
            # If we need random selection with replacement (when batch_size > available), 
            # we might need different logic. But for "validation" logic, usually we want unique valid images first.
            # If batch_size > available valid images, we can't fulfill it without duplicates.
            # Let's try to find unique valid images first.
            
            path = available_files.pop(0)
            
            try:
                # We MUST load the image to check content if validation is enabled
                if check_openpose or check_canny:
                    if not os.path.exists(path):
                        continue
                        
                    i = Image.open(path)
                    i = ImageOps.exif_transpose(i)
                    if i.mode == 'I':
                        i = i.point(lambda i: i * (1 / 255))
                    image_pil = i.convert("RGB")
                    image_np = np.array(image_pil)
                    
                    # Validate
                    is_valid = True
                    if check_openpose and not self.is_openpose(image_np):
                        is_valid = False
                    if check_canny and not self.is_canny(image_np):
                        is_valid = False
                        
                    if not is_valid:
                        continue # Skip this image, try next
                        
                    # If valid, process for output
                    image_tensor = image_np.astype(np.float32) / 255.0
                    image_tensor = torch.from_numpy(image_tensor)[None,]
                    
                    if load_images:
                        loaded_images.append(image_tensor)
                    final_paths.append(path)
                else:
                    # No validation needed
                    final_paths.append(path)
                    if load_images:
                        # Load image logic duplicated here or we can structure differently
                        # For efficiency, if validation not needed, we shouldn't have loaded it above
                        if not os.path.exists(path):
                            continue
                        i = Image.open(path)
                        i = ImageOps.exif_transpose(i)
                        if i.mode == 'I':
                            i = i.point(lambda i: i * (1 / 255))
                        image = i.convert("RGB")
                        image = np.array(image).astype(np.float32) / 255.0
                        image = torch.from_numpy(image)[None,]
                        loaded_images.append(image)

            except Exception as e:
                print(f"Error processing {path}: {e}")
                continue
                
        # If we ran out of unique files but still need more for batch_size (and validation passed),
        # we might need to reuse valid ones.
        if len(final_paths) < batch_size and final_paths:
            # Fill the rest with random choices from the valid ones found
            needed = batch_size - len(final_paths)
            extras = rng.choices(final_paths, k=needed)
            for path in extras:
                 final_paths.append(path)
                 if load_images:
                     # We need to find the matching loaded image or reload
                     # Since we might not have kept mapping, reloading is safer but slower.
                     # Or we can just duplicate the tensor if we have it.
                     # Simplest is to reload or copy.
                     try:
                        i = Image.open(path)
                        i = ImageOps.exif_transpose(i)
                        image = i.convert("RGB")
                        image = np.array(image).astype(np.float32) / 255.0
                        image = torch.from_numpy(image)[None,]
                        loaded_images.append(image)
                     except:
                        pass

        return (loaded_images, final_paths, total_found)
