import os
import folder_paths
from server import PromptServer
from aiohttp import web
import sys
import io

# Try to import PIL, handle failure
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    print("Warning: PIL (Pillow) not found. Gallery images will not have dimensions.")
    HAS_PIL = False

# Serve the gallery frontend
WEB_ROOT = os.path.join(os.path.dirname(__file__), "web")
GALLERY_PATH = os.path.join(WEB_ROOT, "gallery")
THUMBNAIL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "thumbnails")

# Ensure directories exist
os.makedirs(GALLERY_PATH, exist_ok=True)
os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)

@PromptServer.instance.routes.get("/web/gallery/thumbnail")
async def get_thumbnail(request):
    filename = request.query.get("filename")
    subfolder = request.query.get("subfolder", "")
    size_mode = request.query.get("size", "small")  # "small" or "preview"
    custom_path = request.query.get("path", "")
    
    if not filename:
        return web.Response(status=400, text="Missing filename")
        
    if custom_path:
        # 1. Try absolute path
        if os.path.exists(custom_path) and os.path.isdir(custom_path):
            output_dir = custom_path
        # 2. Try relative to base_path
        else:
            base_path = folder_paths.base_path
            abs_custom_path = os.path.abspath(os.path.join(base_path, custom_path))
            if os.path.exists(abs_custom_path) and os.path.isdir(abs_custom_path):
                output_dir = abs_custom_path
            else:
                # Fallback to output directory if custom path is invalid
                # print(f"[Gallery] Custom path '{custom_path}' not found. Defaulting to output directory.")
                # We should actually return an error here instead of defaulting, so the frontend can show it.
                # But previously we defaulted. The user now wants to know WHY path is incorrect.
                # So we should return 400 with a descriptive message.
                pass 
                # Let the code proceed to error return if output_dir is not set? 
                # No, the logic above is a bit nested.
                
                # Check absolute path attempt
                if os.path.isabs(custom_path) and not os.path.exists(custom_path):
                     return web.json_response({
                        "error": f"Path is incorrect. \n\nTried absolute path: '{custom_path}' (does not exist).",
                        "details": "Please check if the folder exists on the server."
                     }, status=400)
                
                # Check relative path attempt
                base_path = folder_paths.base_path
                abs_custom_path = os.path.abspath(os.path.join(base_path, custom_path))
                
                return web.json_response({
                    "error": f"Path is incorrect.",
                    "details": f"Tried absolute path: '{custom_path}'\nTried relative to ComfyUI root: '{abs_custom_path}'\n\nNeither existed."
                }, status=400)
    else:
        output_dir = folder_paths.get_output_directory()

    full_path = os.path.join(output_dir, subfolder, filename)
    
    if not os.path.exists(full_path):
        return web.Response(status=404, text="File not found")
        
    # Determine target size
    if size_mode == "preview":
        target_size = (1920, 1920)
        quality = 90
    else:
        target_size = (400, 400)
        quality = 85
        
    # Check if thumbnail exists
    # Include size in cache filename to distinguish between small and preview
    thumb_filename = f"{size_mode}_{subfolder.replace('/', '_').replace(os.sep, '_')}_{filename}"
    thumb_path = os.path.join(THUMBNAIL_CACHE_DIR, thumb_filename)
    
    if os.path.exists(thumb_path):
        return web.FileResponse(thumb_path)
        
    # Generate thumbnail
    try:
        if not HAS_PIL:
            # Fallback to original if PIL not available
            return web.FileResponse(full_path)
            
        with Image.open(full_path) as img:
            # Convert to RGB if needed
            if img.mode in ('RGBA', 'LA'):
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1])
                img = background
            
            # Resize logic: maintain aspect ratio
            img.thumbnail(target_size, Image.Resampling.LANCZOS)
            
            # Save to cache
            img.save(thumb_path, "JPEG", quality=quality, optimize=True)
            
        return web.FileResponse(thumb_path)
    except Exception as e:
        print(f"Error generating thumbnail for {filename}: {e}")
        # Fallback to original on error
        return web.FileResponse(full_path)

@PromptServer.instance.routes.get("/web/gallery/info")
async def get_image_info(request):
    import json
    filename = request.query.get("filename")
    subfolder = request.query.get("subfolder", "")
    custom_path = request.query.get("path", "")
    
    if not filename:
        return web.json_response({"error": "Missing filename"}, status=400)
        
    if custom_path:
        if os.path.exists(custom_path) and os.path.isdir(custom_path):
            output_dir = custom_path
        else:
            base_path = folder_paths.base_path
            abs_custom_path = os.path.abspath(os.path.join(base_path, custom_path))
            if os.path.exists(abs_custom_path) and os.path.isdir(abs_custom_path):
                output_dir = abs_custom_path
            else:
                output_dir = folder_paths.get_output_directory()
    else:
        output_dir = folder_paths.get_output_directory()
        
    full_path = os.path.join(output_dir, subfolder, filename)
    
    if not os.path.exists(full_path):
        return web.json_response({"error": "File not found"}, status=404)
        
    info = {
        "filename": filename,
        "subfolder": subfolder,
        "checkpoints": [],
        "loras": []
    }
    
    if HAS_PIL and filename.lower().endswith('.png'):
        try:
            with Image.open(full_path) as img:
                # Retrieve parameters (ComfyUI stores prompt in 'prompt' or 'workflow' or 'parameters')
                # Usually it's in img.info
                text_info = img.info
                
                # Check for 'prompt' (the API format) or 'workflow' (the UI format)
                # We prioritize 'prompt' as it contains the actual execution values
                prompt_json = None
                if 'prompt' in text_info:
                    try:
                        prompt_json = json.loads(text_info['prompt'])
                    except:
                        pass
                
                if prompt_json:
                    # Parse prompt for Checkpoints and LoRAs
                    for key, node in prompt_json.items():
                        class_type = node.get('class_type', '')
                        inputs = node.get('inputs', {})
                        
                        # Checkpoints
                        if 'CheckpointLoader' in class_type:
                            ckpt = inputs.get('ckpt_name')
                            if ckpt and ckpt not in info['checkpoints']:
                                info['checkpoints'].append(ckpt)
                                
                        # LoRAs
                        if 'LoraLoader' in class_type:
                            lora = inputs.get('lora_name')
                            if lora and lora not in info['loras']:
                                info['loras'].append(lora)
                                
        except Exception as e:
            print(f"Error reading metadata for {filename}: {e}")
            
    return web.json_response(info)

@PromptServer.instance.routes.get("/web/gallery")
async def serve_gallery_index(request):
    index_path = os.path.join(GALLERY_PATH, "index.html")
    if os.path.exists(index_path):
        return web.FileResponse(index_path)
    return web.Response(text="Gallery not built yet. Please run build.", status=404)

PromptServer.instance.routes.static("/web/gallery/assets", os.path.join(GALLERY_PATH, "assets"))
PromptServer.instance.routes.static("/web/gallery/lib", os.path.join(WEB_ROOT, "lib"))

@PromptServer.instance.routes.get("/web/gallery/folders")
async def list_gallery_folders(request):
    try:
        custom_path = request.query.get('path', '')
        output_dir = ""
        
        if custom_path:
            # 1. Try absolute path
            if os.path.exists(custom_path) and os.path.isdir(custom_path):
                output_dir = custom_path
            # 2. Try relative to base_path
            else:
                base_path = folder_paths.base_path
                abs_custom_path = os.path.abspath(os.path.join(base_path, custom_path))
                if os.path.exists(abs_custom_path) and os.path.isdir(abs_custom_path):
                    output_dir = abs_custom_path
                else:
                    # Return empty if path invalid (or error?)
                    # If we return error, sidebar might break. Let's return empty folders but maybe with error note?
                    # For now, let's just return empty list or default to output? 
                    # User wants to know if path is wrong.
                    # But this endpoint is for sidebar.
                    return web.json_response({"folders": []})
        else:
            output_dir = folder_paths.get_output_directory()

        folders = set()
        # Walk to find all subdirectories
        for root, dirs, filenames in os.walk(output_dir):
            rel_path = os.path.relpath(root, output_dir)
            if rel_path != ".":
                # Ensure we use forward slashes for consistency in JS
                folders.add(rel_path.replace("\\", "/"))
        
        return web.json_response({"folders": sorted(list(folders))})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/web/gallery/list")
async def list_gallery_files(request):
    try:
        # Get custom path from query, default to output directory
        custom_path = request.query.get('path', '')
        exclude_str = request.query.get('exclude', '')
        
        exclude_patterns = []
        if exclude_str:
            exclude_patterns = [p.strip().lower() for p in exclude_str.split(',') if p.strip()]
        
        output_dir = ""
        
        if custom_path:
            # 1. Try absolute path
            if os.path.exists(custom_path) and os.path.isdir(custom_path):
                output_dir = custom_path
            # 2. Try relative to base_path
            else:
                base_path = folder_paths.base_path
                abs_custom_path = os.path.abspath(os.path.join(base_path, custom_path))
                if os.path.exists(abs_custom_path) and os.path.isdir(abs_custom_path):
                    output_dir = abs_custom_path
                else:
                    # Return detailed error
                    details = ""
                    if os.path.isabs(custom_path):
                        details = f"Tried absolute path: '{custom_path}' (does not exist)."
                    else:
                        details = f"Tried absolute path: '{custom_path}'\nTried relative to ComfyUI root: '{abs_custom_path}'\n\nNeither existed."
                        
                    return web.json_response({
                        "error": "Path is incorrect",
                        "details": details
                    }, status=400)
        else:
            output_dir = folder_paths.get_output_directory()
            
        print(f"[Gallery] Listing files from: {output_dir}")
        
        target_folder = request.query.get('folder', '')
        search_query = request.query.get('search', '').lower().strip()
        recursive = request.query.get('recursive', 'false') == 'true'
        print(f"[Gallery] Target folder: '{target_folder}', Search: '{search_query}', Recursive: {recursive}")
        
        files = []
        subfolders = []
        
        # If searching, we might want to search recursively? 
        # User said: "show only these filse folders if user search for those"
        # "leave only these with values split it into two folder folders and image names"
        # This implies we should return matching subfolders AND matching files.
        
        for root, dirs, filenames in os.walk(output_dir):
            rel_path = os.path.relpath(root, output_dir)
            current_subfolder = rel_path if rel_path != "." else ""
            
            # Ensure consistent slashes
            current_subfolder = current_subfolder.replace("\\", "/")
            
            # Navigation Logic vs Search Logic
            if not search_query:
                # Normal navigation mode
                if recursive:
                    # Recursive mode: Show files from target_folder AND its subfolders
                    if target_folder:
                         # Check if current_subfolder is target_folder OR a child of target_folder
                         if current_subfolder != target_folder and not current_subfolder.startswith(target_folder + "/"):
                             continue
                    else:
                        # If root, we show everything (already walking everything)
                        pass
                else:
                    # Strict mode (default): Only files in exactly the target folder
                    if target_folder:
                         if current_subfolder != target_folder:
                            continue
                    else:
                        if current_subfolder != "":
                            continue
            else:
                # Search mode: Scan EVERYTHING
                # Filter directories that match search
                for d in dirs:
                    if search_query in d.lower():
                        # Add to subfolders list if it matches
                        # But we need to be careful about structure. 
                        # The frontend expects 'subfolders' to be just names relative to current view?
                        # Or should we return full relative paths?
                        # If we are searching globally, we probably want to show where they are.
                        # But the current frontend 'subfolders' logic is simple list of names.
                        # Let's add them as specific "folder" type items in the file list? 
                        # Or keep them in subfolders list but formatted differently?
                        
                        # User request: "split it into two folder folders and image names"
                        # So we should populate 'subfolders' with matches found anywhere?
                        # But 'subfolders' in the response usually means "folders inside current view".
                        # If we search, "current view" is the search result.
                        pass

            for filename in filenames:
                if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.mp4', '.gif')):
                    full_path = os.path.join(root, filename)
                    
                    # Check exclusion patterns
                    if exclude_patterns:
                        path_to_check = full_path.lower()
                        if any(pattern in path_to_check for pattern in exclude_patterns):
                            continue
                    
                    # Search Filter
                    if search_query:
                         if search_query not in filename.lower():
                             continue
                    
                    # Get file stats
                    try:
                        stat = os.stat(full_path)
                        created_time = stat.st_mtime
                    except OSError:
                        created_time = 0

                    # Get image dimensions
                    width = 0
                    height = 0
                    if HAS_PIL and filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                        try:
                            # Use a try-except block specifically for image opening to avoid crashing the loop
                            # We open strictly to read the header
                            with Image.open(full_path) as img:
                                width, height = img.size
                        except Exception:
                            # If image is corrupt or cannot be read, just ignore dimensions
                            pass
                        
                    files.append({
                        "filename": filename,
                        "subfolder": current_subfolder,
                        "type": "output",
                        "format": os.path.splitext(filename)[1][1:],
                        "date": created_time,
                        "width": width,
                        "height": height
                    })
        
        # If searching, we also need to populate subfolders that match the query
        if search_query:
             for root, dirs, filenames in os.walk(output_dir):
                rel_path = os.path.relpath(root, output_dir)
                current_subfolder = rel_path if rel_path != "." else ""
                
                for d in dirs:
                    if search_query in d.lower():
                         # We found a matching folder. 
                         # We need to present it such that clicking it navigates there.
                         # The frontend expects simple names in 'subfolders'.
                         # If we return "A/B/MatchedFolder", the frontend sidebar might not handle it if it expects just names.
                         # But wait, the frontend builds a tree now.
                         # The 'subfolders' return key was used for the OLD sidebar.
                         # The NEW sidebar fetches /folders (full tree).
                         # So 'subfolders' in this response is mainly used for... actually it's NOT used for the sidebar anymore.
                         # It was used to update the sidebar in the old version.
                         # But wait, did we remove the usage?
                         # JS: "if (skip === 0) { refreshSidebarSelection(); }"
                         # So 'subfolders' in JSON is effectively unused by the new sidebar.
                         # However, the user wants "split it into two folder folders and image names".
                         # This likely means in the GRID view? Or just visually separated?
                         # "show only these filse folders if user search for those"
                         # This implies showing matching folders in the main view area?
                         
                         folder_path = os.path.join(current_subfolder, d).replace("\\", "/")
                         if folder_path.startswith("/"): folder_path = folder_path[1:]
                         
                         subfolders.append(folder_path)
        
        # Always return success if directory exists, even if empty
        # If user provided a path and it was resolved successfully, we return it as root_path
        # The frontend will show "No images found" if files list is empty, which is correct.
        
        print(f"[Gallery] Found {len(files)} files")
        
        # Sort by date descending
        files.sort(key=lambda x: x['date'], reverse=True)
        
        # Pagination
        try:
            skip = int(request.query.get('skip', 0))
            limit = int(request.query.get('limit', 50))
        except ValueError:
            skip = 0
            limit = 50
            
        paginated_files = files[skip:skip+limit]
        
        return web.json_response({
            "files": paginated_files,
            "total": len(files),
            "skip": skip,
            "limit": limit,
            "root_path": output_dir,
            "subfolders": subfolders
        })
    except Exception as e:
        print(f"Error in gallery list: {e}")
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)
