import os
import random
from folder_paths import get_filename_list
from server import PromptServer

class RandomCheckpointLoader:
    @classmethod
    def INPUT_TYPES(s):
        # Get all checkpoint filenames to extract folders
        ckpt_list = get_filename_list("checkpoints")
        folders = set()
        folders.add("All")
        folders.add("Root")
        for ckpt in ckpt_list:
            dirname = os.path.dirname(ckpt)
            if dirname:
                folders.add(dirname)
        
        sorted_folders = sorted(list(folders))
        
        return {
            "required": {
                "folder": ("STRING", {"default": "All", "multiline": True, "placeholder": "Folder names to include (comma separated, e.g. All, Root, SDXL, v1.5)", "folder_suggestions": sorted_folders, "all_checkpoints": ckpt_list}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            },
            "optional": {
                "exclude_names": ("STRING", {"default": "", "multiline": True, "placeholder": "Checkpoints or subfolders to exclude (comma separated)"}),
                "force_checkpoint": ("STRING", {"default": "", "multiline": False, "placeholder": "Force specific checkpoint (leave empty for random)"}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("ckpt_name",)
    OUTPUT_IS_LIST = (False,)
    FUNCTION = "get_checkpoints"
    CATEGORY = "Huko Tools"

    def get_checkpoints(self, folder, seed, exclude_names="", force_checkpoint="", unique_id=None):
        # Check force_checkpoint first
        if force_checkpoint and force_checkpoint.strip():
            selected = force_checkpoint.strip()
            # Notify UI of forced selection too
            if unique_id:
                PromptServer.instance.send_sync("web_gallery.random_checkpoint.update", {"node_id": unique_id, "checkpoint": selected, "mode": "fixed"})
            return (selected,)

        all_checkpoints = get_filename_list("checkpoints")
        candidates = []
        
        # Filter by folder(s)
        folders = [f.strip() for f in folder.replace('\n', ',').split(',') if f.strip()]
        if not folders:
            folders = ["All"]
            
        for f in folders:
            if f == "All":
                candidates.extend(all_checkpoints)
            elif f == "Root":
                candidates.extend([c for c in all_checkpoints if not os.path.dirname(c)])
            else:
                # Match exact folder or subfolders of that folder
                candidates.extend([c for c in all_checkpoints if os.path.dirname(c) == f or os.path.dirname(c).startswith(f + os.sep) or os.path.dirname(c).startswith(f + "/")])
        
        # Remove duplicates
        candidates = list(set(candidates))
            
        # Exclude
        if exclude_names:
            excludes = [e.strip() for e in exclude_names.replace('\n', ',').split(',') if e.strip()]
            filtered = []
            for ckpt in candidates:
                should_exclude = False
                for exc in excludes:
                    if exc in ckpt:
                        should_exclude = True
                        break
                if not should_exclude:
                    filtered.append(ckpt)
            candidates = filtered
            
        if not candidates:
            print(f"Warning: No checkpoints found in folders '{folder}' after exclusion.")
            return ("",)
            
        rng = random.Random(seed)
        
        # Selection
        selected = rng.choice(candidates)
        
        # Notify UI
        if unique_id:
            PromptServer.instance.send_sync("web_gallery.random_checkpoint.update", {"node_id": unique_id, "checkpoint": selected, "mode": "random"})
            
        return (selected,)
