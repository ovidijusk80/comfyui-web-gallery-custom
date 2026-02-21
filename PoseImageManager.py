import os
import shutil
import random
import torch
import numpy as np
from PIL import Image, ImageOps

class PoseImageManager:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image_dir": ("STRING", {"default": "models/poses", "multiline": False}),
                "rename_non_openpose": ("BOOLEAN", {"default": False, "tooltip": "Rename non-OpenPose images to match pose name + _sample"}),
                "move_to_examples": ("BOOLEAN", {"default": False, "tooltip": "Move non-OpenPose images to 'examples' subfolder"}),
                "load_openpose_images": ("BOOLEAN", {"default": True, "tooltip": "Load OpenPose images into memory"}),
                "load_example_images": ("BOOLEAN", {"default": True, "tooltip": "Load example/other images into memory"}),
            },
            "optional": {
                "names_to_skip": ("STRING", {"default": "preview, previews, sample, samples, example, examples, thumb", "multiline": True, "placeholder": "Comma separated names to skip renaming (e.g. preview)"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING", "IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("example_images", "example_paths", "openpose_images", "openpose_paths", "result_text")
    OUTPUT_IS_LIST = (True, True, True, True, False)
    FUNCTION = "process_images"
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
    
    def load_image(self, path):
        try:
            if not os.path.exists(path):
                return None
            i = Image.open(path)
            i = ImageOps.exif_transpose(i)
            if i.mode == 'I':
                i = i.point(lambda i: i * (1 / 255))
            image = i.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]
            return image
        except Exception as e:
            print(f"Error loading {path}: {e}")
            return None

    def process_images(self, image_dir, rename_non_openpose, move_to_examples, load_openpose_images, load_example_images, names_to_skip=""):
        if not os.path.isdir(image_dir):
            return ([], [], [], [], f"Directory '{image_dir}' not found.")
            
        valid_extensions = ['.jpg', '.jpeg', '.png', '.webp']
        
        # Prepare skip list (names of folders or files to skip during recursive scan, AND for renaming logic)
        skip_names = []
        if names_to_skip:
            skip_names = [f.strip().lower() for f in names_to_skip.split(',') if f.strip()]
        
        # Recursive Scan
        all_files = []
        for root, dirs, files in os.walk(image_dir):
            # Check if current directory should be skipped
            # (e.g. if 'examples' is in skip list, or 'preview')
            # However, user logic is slightly complex: 
            # "path image_dir should also check subfolders/files which are not excluded"
            # So if a subfolder is named "examples" and "examples" is in names_to_skip, we probably shouldn't scan it?
            # Or does names_to_skip only apply to renaming?
            # The prompt says: "point of this node is to check models/poses/ ... rename example image ... if it doesnt contain names like `preview...`"
            # But now: "image_dir should also check subfolders/files which are not excluded"
            # It implies we should exclude subfolders if they match the excluded list.
            
            should_skip_dir = False
            dir_name = os.path.basename(root).lower()
            if root != image_dir: # Don't skip the root itself even if it matches (unlikely)
                 for skip in skip_names:
                    if skip == dir_name: # Exact match for directory name? or substring?
                        # Usually directory exclusion is by name
                        should_skip_dir = True
                        break
            
            if should_skip_dir:
                continue

            for file in files:
                if any(file.lower().endswith(ext) for ext in valid_extensions):
                    # Also check if file name itself is excluded?
                    # The original logic used names_to_skip to SKIP RENAMING, not skipping loading.
                    # But the new prompt says "check subfolders/files which are not excluded".
                    # If I exclude them here, they won't be processed at all.
                    # Let's assume names_to_skip applies to scanning too now.
                    
                    file_lower = file.lower()
                    should_skip_file = False
                    for skip in skip_names:
                         if skip in file_lower:
                             should_skip_file = True
                             break
                    
                    if not should_skip_file:
                        all_files.append(os.path.join(root, file))

        all_paths = all_files
        
        openpose_files = []
        other_files = []
        
        # 1. Classification
        for path in all_paths:
            try:
                if not os.path.exists(path):
                    continue
                    
                i = Image.open(path)
                i = ImageOps.exif_transpose(i)
                if i.mode == 'I':
                    i = i.point(lambda i: i * (1 / 255))
                image_pil = i.convert("RGB")
                image_np = np.array(image_pil)
                
                if self.is_openpose(image_np):
                    openpose_files.append(path)
                else:
                    other_files.append(path)
            except Exception as e:
                print(f"Error processing {path}: {e}")
                # Treat as other or skip? Let's skip if we can't read it.
                continue

        # Helper to get base name without extension
        def get_base_name(p):
            return os.path.splitext(os.path.basename(p))[0]

        # Map openpose base names for quick lookup
        op_bases = {get_base_name(p): p for p in openpose_files}
        
        # Sort op_bases by length (descending) to ensure longest prefix match
        sorted_op_bases = sorted(op_bases.keys(), key=len, reverse=True)
        
        final_other_paths = []
        renamed_count = 0
        moved_count = 0
        
        # 2. Rename and Move Logic
        for path in other_files:
            current_path = path
            filename = os.path.basename(current_path)
            base_name = get_base_name(current_path)
            ext = os.path.splitext(filename)[1]
            
            # --- Rename Logic ---
            if rename_non_openpose:
                # Note: We already filtered files that contain skip_names during scanning!
                # So should_skip_rename is redundant if we assume exclusion means "don't touch".
                # But let's keep logic safe.
                should_skip_rename = False
                for skip in skip_names:
                    if skip in base_name.lower():
                        should_skip_rename = True
                        break
                
                if not should_skip_rename:
                    matched_op_base = None
                    for op_base in sorted_op_bases:
                        if base_name.startswith(op_base):
                            suffix = base_name[len(op_base):]
                            if suffix == "":
                                matched_op_base = op_base
                                break
                            elif not suffix[0].isdigit():
                                matched_op_base = op_base
                                break
                    
                    if matched_op_base:
                        new_name = f"{matched_op_base}_sample{ext}"
                        new_full_path = os.path.join(os.path.dirname(current_path), new_name)
                        
                        if not os.path.exists(new_full_path):
                            try:
                                os.rename(current_path, new_full_path)
                                print(f"Renamed: {filename} -> {new_name}")
                                current_path = new_full_path
                                filename = new_name 
                                renamed_count += 1
                            except OSError as e:
                                print(f"Rename failed for {current_path}: {e}")
                        else:
                            print(f"Rename skipped: {new_name} already exists")

            # --- Move Logic ---
            if move_to_examples:
                examples_dir = os.path.join(image_dir, "examples")
                if not os.path.exists(examples_dir):
                    try:
                        os.makedirs(examples_dir)
                    except OSError:
                        pass
                
                new_full_path = os.path.join(examples_dir, filename)
                
                if not os.path.exists(new_full_path):
                    try:
                        shutil.move(current_path, new_full_path)
                        print(f"Moved: {filename} -> examples/{filename}")
                        current_path = new_full_path
                        moved_count += 1
                    except OSError as e:
                        print(f"Move failed for {current_path}: {e}")
                else:
                    print(f"Move skipped: {filename} already exists in examples/")
            
            final_other_paths.append(current_path)

        # 3. Load Images for Output
        max_load = 64
        
        # Load OpenPose images
        loaded_openpose_images = []
        final_openpose_paths = []
        op_loaded_count = 0
        
        # Always populate ALL paths first
        final_openpose_paths = list(openpose_files) # Return ALL paths found
        
        if load_openpose_images:
            # Only load up to max_load images
            for path in openpose_files:
                if op_loaded_count >= max_load:
                    break
                img = self.load_image(path)
                if img is not None:
                    loaded_openpose_images.append(img)
                    op_loaded_count += 1

        # Load Other/Example images
        loaded_other_images = []
        final_other_paths_valid = [] 
        other_loaded_count = 0
        
        # Always populate ALL paths first
        final_other_paths_valid = list(final_other_paths) # Return ALL paths found
        
        if load_example_images:
             # Only load up to max_load images
            for path in final_other_paths:
                if other_loaded_count >= max_load:
                    break
                img = self.load_image(path)
                if img is not None:
                    loaded_other_images.append(img)
                    other_loaded_count += 1

        # Generate Result Text
        result_text = f"Found {len(openpose_files)} OpenPose images and {len(other_files)} other images.\n"
        
        if load_openpose_images and len(openpose_files) > max_load:
            result_text += f"WARNING: Too many OpenPose images found. Loaded only {max_load} of {len(openpose_files)}.\n"
        if load_example_images and len(final_other_paths) > max_load:
            result_text += f"WARNING: Too many Example images found. Loaded only {max_load} of {len(final_other_paths)}.\n"
            
        if rename_non_openpose:
            result_text += f"Renamed {renamed_count} files.\n"
        if move_to_examples:
            result_text += f"Moved {moved_count} files to 'examples/' folder.\n"
            
        if not rename_non_openpose and not move_to_examples:
            result_text += "No actions taken (Preview Mode).\n"
            
            # Check if any "other" files are ALREADY renamed correctly
            # i.e. do they contain any of the skip words?
            already_processed_count = 0
            for path in final_other_paths:
                base_name = get_base_name(path).lower()
                for skip in skip_names:
                    if skip in base_name:
                        already_processed_count += 1
                        break
            
            if already_processed_count == len(final_other_paths) and len(final_other_paths) > 0:
                 result_text += "All found 'other' images appear to be already processed (contain skip words).\n"
            elif len(final_other_paths) > 0:
                 result_text += "Files listed in 'example_paths' are candidates for being examples of the OpenPose skeletons found.\n"
            else:
                 result_text += "No 'other' images found to process.\n"

        return (loaded_other_images, final_other_paths_valid, loaded_openpose_images, final_openpose_paths, result_text)
