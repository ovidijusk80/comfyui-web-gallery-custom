import os
import random
import torch
import numpy as np
from PIL import Image, ImageOps

class RandomImageBatcher:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image_paths": ("STRING", {"forceInput": True}),
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
    RETURN_NAMES = ("images", "image_paths", "count")
    OUTPUT_IS_LIST = (True, True, False)
    INPUT_IS_LIST = True
    FUNCTION = "get_random_batch"
    CATEGORY = "Web Gallery Tools"

    def is_openpose(self, img_array):
        threshold = 30
        black_pixels = np.all(img_array < threshold, axis=-1)
        black_ratio = np.mean(black_pixels)
        return black_ratio > 0.8

    def is_canny(self, img_array):
        r, g, b = img_array[:,:,0], img_array[:,:,1], img_array[:,:,2]
        is_grayscale = np.all(np.abs(r - g) < 10) and np.all(np.abs(g - b) < 10)
        
        if not is_grayscale:
            return False
            
        threshold = 30
        black_pixels = np.all(img_array < threshold, axis=-1)
        black_ratio = np.mean(black_pixels)
        return black_ratio > 0.8

    def get_random_batch(self, image_paths, seed, batch_size, load_images, check_openpose, check_canny, names_to_skip=""):
        # image_paths comes in as a list of strings
        # Since INPUT_IS_LIST = True, all inputs are lists.
        # But for seed, batch_size, load_images, we usually want the first value if they are single values but wrapped in list
        
        # Unpack single value inputs if they come as lists (which they do when INPUT_IS_LIST=True)
        # Note: In ComfyUI, if INPUT_IS_LIST is True, *all* inputs are passed as lists.
        # We need to take the first element for the parameters that are not lists in our logic.
        
        paths = []
        # image_paths should be a list of strings. If it's a list of lists (e.g. multiple inputs connected), flatten it?
        # Usually standard connection gives a list of strings.
        
        # Handle image_paths
        for item in image_paths:
            if isinstance(item, list):
                paths.extend(item)
            else:
                paths.append(item)
                
        # Handle parameters
        current_seed = seed[0] if isinstance(seed, list) else seed
        current_batch_size = batch_size[0] if isinstance(batch_size, list) else batch_size
        should_load = load_images[0] if isinstance(load_images, list) else load_images
        do_openpose = check_openpose[0] if isinstance(check_openpose, list) else check_openpose
        do_canny = check_canny[0] if isinstance(check_canny, list) else check_canny
        
        # Handle names_to_skip
        skip_names_str = names_to_skip[0] if isinstance(names_to_skip, list) else names_to_skip
        skip_names = []
        if skip_names_str:
            skip_names = [f.strip().lower() for f in skip_names_str.split(',') if f.strip()]

        if not paths:
             return ([], [], 0)
             
        # Filter paths based on names_to_skip
        if skip_names:
            filtered_paths = []
            for path in paths:
                path_lower = path.lower().replace('\\', '/')
                
                # Check if any skip name is in the path
                should_skip = False
                for skip in skip_names:
                    if skip in path_lower:
                        should_skip = True
                        break
                
                if not should_skip:
                    filtered_paths.append(path)
            paths = filtered_paths
            
        if not paths:
             # If all filtered out
             return ([], [], 0)

        # Use local random instance
        rng = random.Random(current_seed)
        
        loaded_images = []
        final_paths = []
        
        # Create a copy of files to pick from
        available_files = list(paths)
        # Shuffle initially to ensure random pick order
        rng.shuffle(available_files)
        
        while len(final_paths) < current_batch_size and available_files:
            path = available_files.pop(0)
            
            try:
                # We MUST load the image to check content if validation is enabled
                if do_openpose or do_canny:
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
                    if do_openpose and not self.is_openpose(image_np):
                        is_valid = False
                    if do_canny and not self.is_canny(image_np):
                        is_valid = False
                        
                    if not is_valid:
                        continue # Skip this image, try next
                        
                    # If valid, process for output
                    image_tensor = image_np.astype(np.float32) / 255.0
                    image_tensor = torch.from_numpy(image_tensor)[None,]
                    
                    if should_load:
                        loaded_images.append(image_tensor)
                    final_paths.append(path)
                else:
                    # No validation needed
                    final_paths.append(path)
                    if should_load:
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
        if len(final_paths) < current_batch_size and final_paths:
            # Fill the rest with random choices from the valid ones found
            needed = current_batch_size - len(final_paths)
            extras = rng.choices(final_paths, k=needed)
            for path in extras:
                 final_paths.append(path)
                 if should_load:
                     try:
                        i = Image.open(path)
                        i = ImageOps.exif_transpose(i)
                        image = i.convert("RGB")
                        image = np.array(image).astype(np.float32) / 255.0
                        image = torch.from_numpy(image)[None,]
                        loaded_images.append(image)
                     except:
                        pass
             
        return (loaded_images, final_paths, len(final_paths))
