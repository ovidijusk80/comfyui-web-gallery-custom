import os

class RecursiveImageLoader:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image_dir": ("STRING", {"default": "", "multiline": True, "placeholder": "Input directory containing images"}),
                "subfolders": ("BOOLEAN", {"default": False, "tooltip": "Search recursively in subfolders"})
            },
            "optional": {
                "batch_size": ("INT", {"default": 0, "min": 0, "step": 1, "tooltip": "Number of images to load (0 = all images)"}),
                "start_from": ("INT", {"default": 1, "min": 1, "step": 1, "tooltip": "Start from Nth image (1 = first image)"}),
                "sort_method": (["sequential", "reverse", "random"], {"default": "sequential", "tooltip": "Image loading order: sequential/reverse/random"})
            }
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("image_paths", "files_count")
    OUTPUT_IS_LIST = (True, False)
    FUNCTION = "get_image_paths"
    CATEGORY = "Web Gallery Tools"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        if 'sort_method' in kwargs and kwargs['sort_method'] == "random":
            return float("NaN")
        return hash(frozenset(kwargs))

    def get_image_paths(self, image_dir: str, subfolders: bool = False, batch_size: int = 0, start_from: int = 1, sort_method: str = "sequential"):
        if not os.path.isdir(image_dir):
            raise FileNotFoundError(f"Directory '{image_dir}' cannot be found.")
            
        valid_extensions = ['.jpg', '.jpeg', '.png', '.webp']
        image_files = []
        
        if subfolders:
            for root, dirs, files in os.walk(image_dir):
                for file in files:
                    if any(file.lower().endswith(ext) for ext in valid_extensions):
                        image_files.append(os.path.join(root, file))
        else:
            image_files = [os.path.join(image_dir, f) for f in os.listdir(image_dir) if any(f.lower().endswith(ext) for ext in valid_extensions)]
        
        if not image_files:
            raise FileNotFoundError(f"No valid images found in '{image_dir}'.")

        if sort_method == "sequential":
            image_files.sort()
        elif sort_method == "reverse":
            image_files.sort(reverse=True)
        elif sort_method == "random":
            import random
            random.shuffle(image_files)

        start_index = min(start_from - 1, len(image_files) - 1)
        if start_index < 0:
             start_index = 0
             
        image_files = image_files[start_index:]
        if batch_size > 0:
            image_files = image_files[:batch_size]
        
        return (image_files, len(image_files))
