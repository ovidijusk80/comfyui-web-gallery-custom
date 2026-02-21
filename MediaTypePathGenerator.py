import datetime

class MediaTypePathGenerator:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "media_type": (["VIDEO", "AUDIO", "IMAGE"],),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("path_prefix",)
    FUNCTION = "generate_path"
    CATEGORY = "Web Gallery Tools"

    def generate_path(self, media_type):
        current_date = datetime.datetime.now().strftime("%Y-%m-%d")
        path = f"{media_type}/{current_date}/ComfyUI_"
        return (path,)
