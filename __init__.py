from .GalleryImagePicker import GalleryImagePicker
from .MediaTypePathGenerator import MediaTypePathGenerator
from .RecursiveImageLoader import RecursiveImageLoader
from .RandomImageBatcher import RandomImageBatcher
from .RandomImageLoader import RandomImageLoader
from .RandomCheckpointLoader import RandomCheckpointLoader
from .PoseImageManager import PoseImageManager
from . import gallery_server

NODE_CLASS_MAPPINGS = {
    "GalleryImagePicker": GalleryImagePicker,
    "MediaTypePathGenerator": MediaTypePathGenerator,
    "RecursiveImageLoader": RecursiveImageLoader,
    "RandomImageBatcher": RandomImageBatcher,
    "RandomImageLoader": RandomImageLoader,
    "RandomCheckpointLoader": RandomCheckpointLoader,
    "PoseImageManager": PoseImageManager,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GalleryImagePicker": "Gallery Image Picker",
    "MediaTypePathGenerator": "Media Type Path Generator",
    "RecursiveImageLoader": "Recursive Image Loader",
    "RandomImageBatcher": "Random Image Batcher",
    "RandomImageLoader": "Random Image Loader",
    "RandomCheckpointLoader": "Random Checkpoint Loader",
    "PoseImageManager": "Pose Image Manager",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
