import os
import folder_paths
import random
from PIL import Image, ImageOps, ImageSequence
import torch
import numpy as np

class GalleryImagePicker:
    INPUT_TYPES = classmethod(lambda cls: {
        "required": {
            "path": ("STRING", {"default": "", "multiline": False}), # Base path or specific path
        },
        "optional": {
            "image_path": ("STRING", {"default": "", "multiline": False, "hidden": True}), # Stores the selected image path(s)
            "exclude": ("STRING", {"default": "", "multiline": False}), # Comma separated
            "show_preview": ("BOOLEAN", {"default": True, "label_on": "Show Preview", "label_off": "Hide Preview"}),
        }
    })

    RETURN_TYPES = ("IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("image", "mask", "image_path")
    FUNCTION = "load_image"
    CATEGORY = "Web Gallery"

    def load_image(self, path, exclude, image_path, show_preview):
        if not image_path:
            raise ValueError("No image selected. Please select an image using the picker.")
        
        # Split paths by newline if multiple are selected
        paths = [p.strip() for p in image_path.split('\n') if p.strip()]
        
        if not paths:
             raise ValueError("No valid image paths found.")

        all_images = []
        all_masks = []
        
        for p in paths:
            if not os.path.exists(p):
                print(f"Warning: Selected image not found: {p}")
                continue
                
            img = Image.open(p)
            
            for i in ImageSequence.Iterator(img):
                i = ImageOps.exif_transpose(i)
                if i.mode == 'I':
                    i = i.point(lambda i: i * (1 / 255))
                image = i.convert("RGB")
                image = np.array(image).astype(np.float32) / 255.0
                image = torch.from_numpy(image)[None,]
                if 'A' in i.getbands():
                    mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
                    mask = 1. - torch.from_numpy(mask)
                else:
                    mask = torch.zeros((image.shape[1], image.shape[2]), dtype=torch.float32, device="cpu")
                all_images.append(image)
                all_masks.append(mask.unsqueeze(0))

        if not all_images:
             raise ValueError("Failed to load any images from the selection.")

        # If multiple images are loaded, they must have same dimensions for batching in a single tensor
        # If dimensions differ, we might need to resize or error out. 
        # Standard ComfyUI behavior is usually to error or user ensures same size.
        # But let's try to be safe: check dimensions of first image and resize others if needed?
        # Or just cat and let torch throw error if mismatch.
        # Let's check dimensions.
        first_shape = all_images[0].shape
        for i in range(1, len(all_images)):
             if all_images[i].shape != first_shape:
                 # Resize to match first image
                 # Permute to BCHW for resize
                 img_t = all_images[i].permute(0, 3, 1, 2)
                 target_h, target_w = first_shape[1], first_shape[2]
                 img_t = torch.nn.functional.interpolate(img_t, size=(target_h, target_w), mode="bilinear", align_corners=False)
                 all_images[i] = img_t.permute(0, 2, 3, 1)
                 
                 # Resize mask too
                 mask_t = all_masks[i].unsqueeze(1) # B, C, H, W
                 mask_t = torch.nn.functional.interpolate(mask_t, size=(target_h, target_w), mode="nearest")
                 all_masks[i] = mask_t.squeeze(1)

        output_image = torch.cat(all_images, dim=0)
        output_mask = torch.cat(all_masks, dim=0)

        # Generate previews (Save to temp)
        output_dir = folder_paths.get_temp_directory()
        filename_prefix = "GalleryPicker_temp_" + ''.join(random.choice("abcdefghijklmnopqrstupvxyz") for x in range(5))
        
        results = []
        for i, img_tensor in enumerate(output_image):
            # Convert tensor back to uint8 numpy array
            # img_tensor is (H, W, C)
            i_np = 255. * img_tensor.cpu().numpy()
            img = Image.fromarray(np.clip(i_np, 0, 255).astype(np.uint8))
            
            file = f"{filename_prefix}_{i:05}.png"
            img.save(os.path.join(output_dir, file), compress_level=1)
            results.append({
                "filename": file,
                "subfolder": "",
                "type": "temp"
            })

        return {
            "ui": {"images": results},
            "result": (output_image, output_mask, image_path)
        }
