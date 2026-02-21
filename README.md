# ComfyUI Web Gallery & Custom Tools

A collection of custom nodes and a web-based gallery for [ComfyUI](https://github.com/comfyanonymous/ComfyUI). This pack provides tools for managing images, loading random batches, handling pose datasets, and a dedicated gallery interface for browsing your generations.

## Motivation

This project was born out of a specific need for better **OpenPose** workflow management. I needed custom logic to verify, filter, and organize OpenPose images (distinguishing between pose skeletons and example images) effectively. What started as a few specific nodes for ControlNet/OpenPose workflows evolved into this comprehensive toolkit and gallery.

## Features

- **Web Gallery**: A built-in gallery to browse, search, and view your ComfyUI output images with metadata support (prompts, models used).
- **Image Management Nodes**: Tools to recursively load, batch, and filter images.
- **Randomization**: Randomly load images or checkpoints to add variety to your workflows.
- **Pose/ControlNet Tools**: specific utilities for organizing OpenPose and Canny datasets.

## Installation

1.  Navigate to your ComfyUI custom nodes directory:
    ```bash
    cd ComfyUI/custom_nodes/
    ```
2.  Clone this repository:
    ```bash
    git clone https://github.com/ovidijusk80/comfyui-web-gallery-custom.git
    ```
3.  Restart ComfyUI.

## Nodes Overview

### 🖼️ Web Gallery Nodes

#### **Gallery Image Picker**
*Category: Web Gallery*
Allows you to select images directly from a path.
- **Inputs**: Path to scan.
- **Features**: Shows previews, handles masks, and allows excluding specific files.
- **Outputs**: Selected Image, Mask, and File Path.

### 🛠️ Web Gallery Tools

#### **Recursive Image Loader**
Scans a directory (and optionally subdirectories) to load image paths.
- **Modes**: Sequential, Reverse, or Random order.
- **Features**: Batch size control, start index offset.

#### **Random Image Batcher**
Takes a list of image paths and creates a random batch of images.
- **Validation**: Optional checks for **OpenPose** (black background, colored limbs) or **Canny** (black background, white lines) format.
- **Filtering**: Can skip specific filenames (e.g., "preview", "sample").

#### **Random Image Loader**
Combines recursive loading and random selection in one node.
- **Usage**: Point to a dataset folder to get a random batch of images for testing or training.
- **Features**: Same OpenPose/Canny validation as the batcher.

#### **Random Checkpoint Loader**
Randomly selects a checkpoint model from a specified folder.
- **Usage**: Great for testing prompts across multiple models or adding variety to generations.
- **Features**: Filter by folder (Root, All, or specific subfolders), exclude specific names, or force a specific checkpoint.

#### **Pose Image Manager**
A utility for organizing ControlNet datasets (specifically OpenPose).
- **Function**: Scans a directory for OpenPose images.
- **Organization**: Can rename non-OpenPose images (treating them as examples) and move them to an `examples` subfolder.
- **Outputs**: Lists of OpenPose images and Example images separately.

#### **Media Type Path Generator**
Helper to generate date-based paths for saving outputs.
- **Format**: `{media_type}/{YYYY-MM-DD}/ComfyUI_`
- **Types**: VIDEO, AUDIO, IMAGE.

## Web Gallery Interface

The extension includes a web interface to browse your output directory.
- **Access**: typically available at `/web/gallery` relative to your ComfyUI URL (e.g., `http://127.0.0.1:8188/web/gallery`).
- **Features**:
    -   Thumbnail view with efficient lazy loading.
    -   Image metadata inspection (Prompt, Checkpoint, LoRAs).
    -   Folder navigation and search.

## Contributing

This is a small project that is still being actively worked on. If you have any suggestions, feature requests, or encounter any issues, please do let me know!

Feel free to open issues or submit pull requests for improvements.
