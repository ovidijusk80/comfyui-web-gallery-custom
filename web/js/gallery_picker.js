import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

app.registerExtension({
    name: "web_gallery.GalleryPicker",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "GalleryImagePicker") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
                nodeType.prototype.onNodeCreated = function () {
                    const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                    
                    const node = this;
                    
                    // --- Preview Logic ---
                    node.imgs = [];
                    node._lastImagePath = "";
                    node.imageIndex = 0;

                        // Override onExecuted to handle preview images from server
                        const origOnExecuted = node.onExecuted;
                        node.onExecuted = function(message) {
                            if (origOnExecuted) origOnExecuted.apply(this, arguments);
                            
                            if (message && message.images) {
                                // Clear existing previews (from initial load)
                                node.imgs = [];
                                message.images.forEach(imgData => {
                                    const img = new Image();
                                    // Construct URL correctly using api.apiURL
                                    let url = `/view?filename=${encodeURIComponent(imgData.filename)}&type=${imgData.type}`;
                                    if (imgData.subfolder) url += `&subfolder=${encodeURIComponent(imgData.subfolder)}`;
                                    
                                    img.src = api.apiURL(url);
                                    img.filename = imgData.filename;
                                    img.onload = () => { app.graph.setDirtyCanvas(true); };
                                    node.imgs.push(img);
                                });
                                node.imageIndex = 0;
                                node.setDirtyCanvas(true);
                            }
                        };

                    node.updatePreview = function() {
                    const imagePathWidget = node.widgets.find(w => w.name === "image_path");
                    if (!imagePathWidget) return;
                    
                    const currentVal = imagePathWidget.value;
                    const paths = currentVal ? currentVal.split("\n").map(p => p.trim()).filter(p => p) : [];
                    
                    // Update Search Button Label
                    const searchBtn = node.widgets.find(w => w.name.startsWith("Search Images"));
                    if (searchBtn) {
                        searchBtn.name = `Search Images (${paths.length})`;
                    }

                    const showPreviewWidget = node.widgets.find(w => w.name === "show_preview");
                    const showPreview = showPreviewWidget ? showPreviewWidget.value : true;

                    // Locate navigation widgets
                    let prevBtn = node.widgets.find(w => w.name === "Prev");
                    let nextBtn = node.widgets.find(w => w.name === "Next");
                    let spacer = node.widgets.find(w => w.name === "preview_spacer");

                    if (!showPreview) {
                        // Hide everything related to preview
                        if (prevBtn) prevBtn.hidden = true;
                        if (nextBtn) nextBtn.hidden = true;
                        if (spacer) {
                            // Can't easily hide spacer if it's not a real widget with hidden property support in computeSize?
                            // We can just set its height to 0 in computeSize if we have access to it.
                            // But computeSize is defined on the object.
                            spacer.computeSize = function(width) { return [width, 0]; };
                        }
                        node.imgs = []; // Clear images so draw loop does nothing
                        
                        // IMPORTANT: We must also update the widgets array to ensure hidden buttons don't mess up layout
                        // or just rely on 'hidden' property which standard ComfyUI respects.
                        
                        // Resize node to collapse space
                        node.onResize && node.onResize(node.size);
                        return;
                    }

                    // Restore spacer height if preview is enabled
                    if (spacer) {
                         spacer.computeSize = function(width) { return [width, 300]; };
                    } else {
                        // If spacer is missing but preview is ON, we need to create it!
                        // This logic is handled below in the "Ensure they exist" block
                    }

                    // Handle Navigation Widgets & Spacer
                    // Ensure they exist if we need them
                    
                    if (!spacer) {
                        spacer = {
                            name: "preview_spacer",
                            type: "preview_spacer",
                            computeSize: function(width) {
                                return [width, 300];
                            }
                        };
                        node.widgets.push(spacer);
                    }

                    if (!prevBtn) {
                        prevBtn = node.addWidget("button", "Prev", "prev", () => {
                            node.imageIndex = (node.imageIndex - 1 + node.imgs.length) % node.imgs.length;
                            node.setDirtyCanvas(true);
                        });
                    }
                    
                    if (!nextBtn) {
                        nextBtn = node.addWidget("button", "Next", "next", () => {
                            node.imageIndex = (node.imageIndex + 1) % node.imgs.length;
                            node.setDirtyCanvas(true);
                        });
                    }
                    
                    // Set Visibility
                    const hasMultiple = paths.length > 1;
                    prevBtn.hidden = !hasMultiple;
                    nextBtn.hidden = !hasMultiple;
                    
                    // Reorder Widgets: [Others] -> Prev -> Spacer -> Next
                    const others = node.widgets.filter(w => w.name !== "Prev" && w.name !== "Next" && w.name !== "preview_spacer");
                    node.widgets = [...others, prevBtn, spacer, nextBtn];
                    
                    // Force reload if we have value but no images (e.g. after load)
                    if (currentVal === node._lastImagePath && node.imgs && node.imgs.length > 0) return;
                    
                    node._lastImagePath = currentVal;
                    node.imgs = [];
                    node.imageIndex = 0;
                    
                    if (paths.length === 0) {
                        node.setDirtyCanvas(true);
                        return;
                    }

                    // --- NEW LOGIC: If < 4 images, show all ---
                    // Wait, "show all of them" means tiling them in the preview area?
                    // Or simply not using the carousel logic?
                    // "if its less than 4 images show all of them but if its more show only one and keep current logic"
                    // This implies a grid view for <= 3 images, and single view for > 3.
                    
                    const MAX_GRID_IMAGES = 3;
                    node.isGridView = paths.length <= MAX_GRID_IMAGES;
                    
                    paths.forEach(p => {
                        // ... loading logic ...
                        const normalized = p.replace(/\\/g, "/");
                        const lastSlash = normalized.lastIndexOf("/");
                        let dir = "";
                        let name = "";
                        
                        if (lastSlash === -1) {
                            name = normalized;
                        } else {
                            dir = p.substring(0, lastSlash);
                            name = p.substring(lastSlash + 1);
                        }
                        
                        const img = new Image();
                        img.onload = () => { app.graph.setDirtyCanvas(true); };
                        img.onerror = () => { img.error = true; app.graph.setDirtyCanvas(true); };
                        
                        const src = `/web/gallery/thumbnail?filename=${encodeURIComponent(name)}&path=${encodeURIComponent(dir)}&size=preview`;
                        img.src = src;
                        img.filename = name;
                        node.imgs.push(img);
                    });

                    // Navigation buttons should be hidden if in grid view (<= 3 images)
                    if (node.isGridView) {
                        if (prevBtn) prevBtn.hidden = true;
                        if (nextBtn) nextBtn.hidden = true;
                    }
                    
                    node.onResize && node.onResize(node.size);

                    // Resize logic - Apply fixed height overrides for inputs
                    if (node.widgets) {
                         for (const w of node.widgets) {
                             // Override height for single-line string inputs that might be rendered too tall
                             if (w.type === "text" || w.type === "STRING" || w.type === "customtext") {
                                 if (w.name === "exclude" || w.name === "path") {
                                     // Ensure multiline is false
                                     if (w.options) {
                                         w.options.multiline = false; 
                                     }
                                     // Override computeSize to return a fixed small height
                                     w.computeSize = function(width) {
                                         return [width, 30]; // Fixed 30px height
                                     };
                                     
                                     // Also try to set the input element height directly if it exists
                                     if (w.inputEl) {
                                         w.inputEl.style.height = "30px";
                                         w.inputEl.style.minHeight = "30px";
                                     }
                                 }
                             }
                         }
                    }
                    
                    // We rely on the spacer widget to drive the height now.
                    // node.setSize(node.computeSize()); // Trigger layout recalculation
                    node.onResize && node.onResize(node.size);
                };
                
                // Hook into widget change
                // We need to find the widget after creation
                setTimeout(() => {
                    const w = node.widgets.find(w => w.name === "image_path");
                    if (w) {
                        // Force hide the widget to prevent it from taking up space
                        w.hidden = true;
                        // But we still need its value, so we keep the callback
                        const origCallback = w.callback;
                        w.callback = function() {
                            if (origCallback) origCallback.apply(this, arguments);
                            node.updatePreview();
                        }
                    }
                    
                    const showPreviewWidget = node.widgets.find(w => w.name === "show_preview");
                    if (showPreviewWidget) {
                        const origCallback = showPreviewWidget.callback;
                        showPreviewWidget.callback = function() {
                            if (origCallback) origCallback.apply(this, arguments);
                            node.updatePreview();
                        }
                    }
                }, 100);

                node.onDrawBackground = function(ctx) {
                    if (!this.imgs || this.imgs.length === 0) {
                         return;
                    }
                    
                    // Ensure index is valid
                    if (this.imageIndex >= this.imgs.length) this.imageIndex = 0;
                    const img = this.imgs[this.imageIndex];
                    
                    // Find spacer to determine drawing area
                    const spacer = this.widgets.find(w => w.name === "preview_spacer");
                    if (!spacer || spacer.last_y === undefined) return;
                    
                    const margin = 10;
                    // Use the spacer's position for drawing
                    const topOffset = spacer.last_y;
                    const h = 300; // Height of the spacer
                    const w = this.size[0] - margin * 2;
                    
                    // Draw preview background to confirm area
                    ctx.save();
                    // ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
                    // ctx.fillRect(margin, topOffset, w, h); 
                    
                    // Clip to drawing area
                    ctx.beginPath();
                    ctx.rect(margin, topOffset, w, h);
                    ctx.clip();
                    
                    if (node.isGridView) {
                         // Draw Grid (1 to 3 images)
                         // We split the height of 300px among them? Or width?
                         // "show all of them" usually implies side-by-side or grid.
                         // Given the vertical layout, maybe side-by-side is better if aspect ratio allows.
                         // Let's do horizontal split.
                         
                         const count = this.imgs.length;
                         if (count === 0) return;
                         
                         const cellW = w / count;
                         const cellH = h; // Full height
                         
                         this.imgs.forEach((img, i) => {
                             const cellX = margin + i * cellW;
                             const cellY = topOffset;
                             
                             // Draw cell border/bg?
                             // ctx.strokeRect(cellX, cellY, cellW, cellH);
                             
                             if (!img.complete || img.naturalWidth === 0) {
                                  // Placeholder
                                  ctx.fillStyle = "#222";
                                  ctx.fillRect(cellX + 2, cellY + 2, cellW - 4, cellH - 4);
                                  ctx.fillStyle = "#aaa";
                                  ctx.textAlign = "center";
                                  ctx.fillText(img.error ? "Error" : "Loading", cellX + cellW/2, cellY + cellH/2);
                             } else {
                                 // Draw Image
                                 const aspect = img.naturalWidth / img.naturalHeight;
                                 const areaAspect = (cellW - 4) / (cellH - 4);
                                 
                                 let dW, dH;
                                 if (aspect > areaAspect) {
                                     dW = cellW - 4;
                                     dH = dW / aspect;
                                 } else {
                                     dH = cellH - 4;
                                     dW = dH * aspect;
                                 }
                                 
                                 const dX = cellX + 2 + (cellW - 4 - dW) / 2;
                                 const dY = cellY + 2 + (cellH - 4 - dH) / 2;
                                 
                                 try {
                                     ctx.drawImage(img, dX, dY, dW, dH);
                                 } catch(e) {}
                                 
                                 // Small filename overlay
                                 /*
                                 ctx.fillStyle = "rgba(0,0,0,0.6)";
                                 ctx.fillRect(cellX + 2, cellY + cellH - 20, cellW - 4, 18);
                                 ctx.fillStyle = "#fff";
                                 ctx.font = "10px Arial";
                                 ctx.textAlign = "center";
                                 // Truncate name
                                 let name = img.filename || "";
                                 if (name.length > 15) name = "..." + name.slice(-12);
                                 ctx.fillText(name, cellX + cellW/2, cellY + cellH - 8);
                                 */
                             }
                         });
                         
                    } else {
                        // Standard Single View Logic
                        if (!img.complete || img.naturalWidth === 0) {
                            // Draw placeholder
                            ctx.fillStyle = "#222";
                            ctx.fillRect(margin, topOffset, w, h);
                            ctx.fillStyle = "#aaa";
                            ctx.font = "14px Arial";
                            ctx.textAlign = "center";
                            if (img.error) {
                                 ctx.fillText("Image Not Found", margin + w/2, topOffset + h/2);
                            } else {
                                 ctx.fillText("Loading...", margin + w/2, topOffset + h/2);
                            }
                        } else {
                            // Draw Image Centered and Contained
                            const aspect = img.naturalWidth / img.naturalHeight;
                            const areaAspect = w / h;
                            
                            let drawW, drawH;
                            if (aspect > areaAspect) {
                                drawW = w;
                                drawH = w / aspect;
                            } else {
                                drawH = h;
                                drawW = h * aspect;
                            }
                            
                            const drawX = margin + (w - drawW) / 2;
                            const drawY = topOffset + (h - drawH) / 2;
                            
                            try {
                                ctx.drawImage(img, drawX, drawY, drawW, drawH);
                            } catch (e) {
                                console.error("GalleryPicker: Failed to draw image", e);
                            }
                            
                            // Draw Info Overlay
                            ctx.fillStyle = "rgba(0,0,0,0.6)";
                            ctx.fillRect(margin, topOffset + h - 24, w, 24);
                            
                            ctx.fillStyle = "#fff";
                            ctx.font = "12px Arial";
                            ctx.textAlign = "left";
                            ctx.fillText(img.filename || "", margin + 5, topOffset + h - 8);
                            
                            // Counter
                            if (this.imgs.length > 1) {
                                ctx.textAlign = "right";
                                ctx.fillText(`${this.imageIndex + 1} / ${this.imgs.length}`, margin + w - 5, topOffset + h - 8);
                            }
                        }
                    }
                    
                    ctx.restore();
                };
                
                // Trigger preview on load
                const onConfigure = node.onConfigure;
                node.onConfigure = function() {
                    const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;
                    setTimeout(() => node.updatePreview(), 100);
                    return r;
                };

                // Add a button widget to open the gallery
                node.addWidget("button", "Search Images", "search", () => {
                    const pathWidget = node.widgets.find(w => w.name === "path");
                    const path = pathWidget ? pathWidget.value : "";
                    const excludeWidget = node.widgets.find(w => w.name === "exclude");
                    const exclude = excludeWidget ? excludeWidget.value : "";
                    
                    // Retrieve last used subfolder from node properties or local storage if path hasn't changed significantly?
                    // Or better: store the last visited subfolder for a specific root path in localStorage.
                    // Key: ComfyUI_Gallery_LastSubfolder_{path}
                    
                    showGallery(node, path, exclude, (newExclude) => {
                        if (excludeWidget && newExclude !== undefined) {
                            excludeWidget.value = newExclude;
                        }
                    });
                });
                
                // Add CSS to force single line on specific inputs if ComfyUI overrides it
                const styleId = "gallery-picker-styles";
                if (!document.getElementById(styleId)) {
                    const style = document.createElement("style");
                    style.id = styleId;
                    style.innerHTML = `
                        .comfy-multiline-input {
                            min-height: 50px;
                        }
                    `;
                    document.head.appendChild(style);
                }

                return r;
            };
        }
    }
});

function showGallery(node, searchPath, excludePattern, onExcludeChange) {
    // Inject Font Awesome
    if (!document.getElementById("font-awesome-css")) {
        const link = document.createElement("link");
        link.id = "font-awesome-css";
        link.rel = "stylesheet";
        link.href = "/web/gallery/lib/font-awesome/css/all.min.css";
        document.head.appendChild(link);
    }

    // State
    let skip = 0;
    const limit = 50;
    let loading = false;
    let hasMore = true;
    let rootPath = ""; // The absolute path of the root
    let currentSearchPath = searchPath; // The configured root path
    let currentSubfolder = ""; // Relative navigation from root
    let recursiveLoad = localStorage.getItem("ComfyUI_Gallery_RecursiveLoad") === "true";
    
    // Attempt to load last visited subfolder for this specific search path
    const storageKey = `ComfyUI_Gallery_LastSubfolder_${searchPath || "default"}`;
    const lastSub = localStorage.getItem(storageKey);
    if (lastSub) {
        currentSubfolder = lastSub;
    }

    const selectedFiles = new Set(); // Stores full paths of selected files
    let lastSelectedFile = null; // For info panel
    let lastSelectedFullPath = null; // For styling
    let infoPanelOpen = false;

    // UI References
    let grid, loader, sidebarList, breadcrumbContainer, infoPanel, infoContent, resizerInfo;

    // Create modal overlay
    const modal = document.createElement("div");
    Object.assign(modal.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.8)",
        zIndex: "10000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(5px)"
    });
    
    // Main container
    const container = document.createElement("div");
    Object.assign(container.style, {
        width: "95%",
        height: "95%",
        backgroundColor: "#1e1e1e",
        borderRadius: "12px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 4px 30px rgba(0, 0, 0, 0.5)",
        border: "1px solid #333"
    });
    
    // --- Header ---
    const header = document.createElement("div");
    Object.assign(header.style, {
        padding: "10px 20px",
        borderBottom: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        backgroundColor: "#252525"
    });

    const topBar = document.createElement("div");
    Object.assign(topBar.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
    });
    
    const title = document.createElement("h3");
    title.textContent = "Gallery Image Picker";
    title.style.margin = "0";
    title.style.color = "#eee";
    title.style.fontSize = "16px";
    
    const controls = document.createElement("div");
    Object.assign(controls.style, { display: "flex", gap: "10px" });

    const showLatestBtn = document.createElement("button");
    showLatestBtn.textContent = "Show Latest";
    Object.assign(showLatestBtn.style, {
        padding: "6px 12px",
        backgroundColor: "#1976d2",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "12px",
        display: currentSearchPath ? "block" : "none"
    });
    showLatestBtn.onmouseover = () => showLatestBtn.style.backgroundColor = "#2196f3";
    showLatestBtn.onmouseout = () => showLatestBtn.style.backgroundColor = "#1976d2";
    
    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Select (0)";
    Object.assign(selectBtn.style, {
        padding: "6px 12px",
        backgroundColor: "#2e7d32",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: "bold"
    });
    selectBtn.onmouseover = () => selectBtn.style.backgroundColor = "#388e3c";
    selectBtn.onmouseout = () => selectBtn.style.backgroundColor = "#2e7d32";
    
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    Object.assign(closeBtn.style, {
        padding: "6px 12px",
        backgroundColor: "#444",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "12px"
    });
    closeBtn.onmouseover = () => closeBtn.style.backgroundColor = "#555";
    closeBtn.onmouseout = () => closeBtn.style.backgroundColor = "#444";
    closeBtn.onclick = () => document.body.removeChild(modal);

    controls.appendChild(showLatestBtn);
    controls.appendChild(selectBtn);
    controls.appendChild(closeBtn);
    topBar.appendChild(title);
    topBar.appendChild(controls);
    header.appendChild(topBar);

    // --- Search & Filter Bar ---
    const filterBar = document.createElement("div");
    Object.assign(filterBar.style, {
        display: "flex",
        gap: "10px",
        alignItems: "center",
        flexWrap: "wrap",
        fontSize: "12px",
        color: "#ccc"
    });

    // Path Input
    const pathInputContainer = document.createElement("div");
    pathInputContainer.style.display = "flex";
    pathInputContainer.style.alignItems = "center";
    pathInputContainer.style.gap = "5px";
    
    const pathLabel = document.createElement("label");
    pathLabel.textContent = "Root Path:";
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.value = currentSearchPath || "";
    pathInput.placeholder = "Default Output";
    Object.assign(pathInput.style, {
        backgroundColor: "#333",
        border: "1px solid #444",
        color: "#fff",
        padding: "4px 8px",
        borderRadius: "4px",
        width: "200px"
    });
    // Update path on enter
    pathInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            currentSearchPath = pathInput.value;
            currentSubfolder = ""; // Reset subfolder when root changes
            resetAndLoad();
            loadSidebarFolders();
            showLatestBtn.style.display = currentSearchPath ? "block" : "none";
        }
    });
    
    pathInputContainer.appendChild(pathLabel);
    pathInputContainer.appendChild(pathInput);
    filterBar.appendChild(pathInputContainer);

    // Search Input
    const searchInputContainer = document.createElement("div");
    searchInputContainer.style.display = "flex";
    searchInputContainer.style.alignItems = "center";
    searchInputContainer.style.gap = "5px";
    
    const searchLabel = document.createElement("label");
    searchLabel.textContent = "Search:";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.id = "gallery-search-input";
    searchInput.placeholder = "Filename or folder...";
    Object.assign(searchInput.style, {
        backgroundColor: "#333",
        border: "1px solid #444",
        color: "#fff",
        padding: "4px 8px",
        borderRadius: "4px",
        width: "150px"
    });
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            resetAndLoad();
        }
    });
    searchInputContainer.appendChild(searchLabel);
    searchInputContainer.appendChild(searchInput);
    filterBar.appendChild(searchInputContainer);

    header.appendChild(filterBar);
    container.appendChild(header);

    // --- Bottom Bar (Ignored Items) ---
    const bottomBar = document.createElement("div");
    Object.assign(bottomBar.style, {
        padding: "8px 20px",
        backgroundColor: "#252525",
        borderTop: "1px solid #333",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        fontSize: "12px",
        color: "#ccc"
    });
    
    const ignoreLabel = document.createElement("label");
    ignoreLabel.textContent = "Ignored Patterns (comma separated):";
    
    const ignoreInput = document.createElement("input");
    ignoreInput.type = "text";
    ignoreInput.value = excludePattern || "";
    ignoreInput.placeholder = "e.g. thumb, temp, .txt";
    Object.assign(ignoreInput.style, {
        flex: "1",
        backgroundColor: "#333",
        border: "1px solid #444",
        color: "#fff",
        padding: "4px 8px",
        borderRadius: "4px"
    });
    
    const applyIgnoreBtn = document.createElement("button");
    applyIgnoreBtn.textContent = "Apply";
    Object.assign(applyIgnoreBtn.style, {
        padding: "4px 12px",
        backgroundColor: "#444",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer"
    });
    applyIgnoreBtn.onclick = () => {
        excludePattern = ignoreInput.value;
        if (onExcludeChange) onExcludeChange(excludePattern);
        resetAndLoad();
    };
    // Also apply on Enter
    ignoreInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            excludePattern = ignoreInput.value;
            if (onExcludeChange) onExcludeChange(excludePattern);
            resetAndLoad();
        }
    });

    bottomBar.appendChild(ignoreLabel);
    bottomBar.appendChild(ignoreInput);
    bottomBar.appendChild(applyIgnoreBtn);
    container.appendChild(bottomBar); // Append to main container at end? No, layout order.

    // Re-arrange layout: Header -> Breadcrumbs -> Main -> Bottom
    // We already appended header.
    // Breadcrumbs next.
    
    // --- Breadcrumb Bar ---
    const breadcrumbBar = document.createElement("div");
    Object.assign(breadcrumbBar.style, {
        padding: "8px 20px",
        backgroundColor: "#2a2a2a",
        borderBottom: "1px solid #333",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "13px",
        color: "#ccc"
    });

    breadcrumbContainer = document.createElement("div");
    breadcrumbContainer.style.display = "flex";
    breadcrumbContainer.style.gap = "5px";
    
    // Removed Info Toggle Button from here as requested
    
    breadcrumbBar.appendChild(breadcrumbContainer);
    container.appendChild(breadcrumbBar);

    // --- Main Body ---
    const mainBody = document.createElement("div");
    Object.assign(mainBody.style, {
        flex: "1",
        display: "flex",
        overflow: "hidden"
    });
    container.appendChild(mainBody);
    
    // Append Bottom Bar last
    container.appendChild(bottomBar);

    // Resizer Logic
    const makeResizable = (resizer, element, direction = "right") => {
        let startX, startWidth;
        const onMouseMove = (e) => {
            const dx = e.clientX - startX;
            const newWidth = direction === "right" ? startWidth + dx : startWidth - dx;
            if (newWidth > 150) {
                element.style.width = `${newWidth}px`;
            }
        };
        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.body.style.cursor = "default";
            if (direction === "right") {
                localStorage.setItem("ComfyUI_web_gallery_Gallery_SidebarWidth", element.style.width);
            } else {
                localStorage.setItem("ComfyUI_web_gallery_Gallery_InfoWidth", element.style.width);
            }
        };
        resizer.addEventListener("mousedown", (e) => {
            startX = e.clientX;
            startWidth = parseInt(getComputedStyle(element).width, 10);
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
            document.body.style.cursor = "col-resize";
            e.preventDefault(); 
        });
    };

    // Selection state for drag
    let isSelectionDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragSelectionBox = null;
    let initialSelectedSet = null; // Snapshot of selection at drag start
    
    // Create drag selection box
    dragSelectionBox = document.createElement("div");
    Object.assign(dragSelectionBox.style, {
        position: "fixed",
        border: "1px solid rgba(76, 175, 80, 0.8)",
        backgroundColor: "rgba(76, 175, 80, 0.2)",
        display: "none",
        zIndex: "99999", // High z-index
        pointerEvents: "none"
    });
    document.body.appendChild(dragSelectionBox);

    // Mouse down on Grid Container to start selection (Moved below gridContainer definition)
    // gridContainer.addEventListener("mousedown", ...);

    const onWindowMouseMove = (e) => {
        if (!isSelectionDragging) return;
        
        const currentX = e.clientX;
        const currentY = e.clientY;
        
        const width = Math.abs(currentX - dragStartX);
        const height = Math.abs(currentY - dragStartY);
        const left = Math.min(currentX, dragStartX);
        const top = Math.min(currentY, dragStartY);
        
        Object.assign(dragSelectionBox.style, {
            left: left + "px",
            top: top + "px",
            width: width + "px",
            height: height + "px"
        });
        
        // Check intersection with cards
        const boxRect = { left, top, right: left + width, bottom: top + height };
        
        // We need to check all visible cards
        const cards = grid.children;
        for (let card of cards) {
            const rect = card.getBoundingClientRect();
            const fullPath = card.dataset.fullPath;
            if (!fullPath) continue;
            
            // Check intersection
            const intersect = !(rect.right < boxRect.left || 
                              rect.left > boxRect.right || 
                              rect.bottom < boxRect.top || 
                              rect.top > boxRect.bottom);
            
            if (intersect) {
                // Add to selection
                selectedFiles.add(fullPath);
            } else {
                // If we are not holding Ctrl, we might want to remove from selection if it was not initially selected?
                // Windows behavior: 
                // Normal drag: Selects everything in box, deselects everything else (unless Ctrl held).
                // Since we cleared on mousedown if no Ctrl, we just add.
                // If Ctrl was held, we toggle? Or just add? Usually add.
                // Let's stick to additive for simplicity in this loop, relying on initial clear.
                
                // However, if we move box AWAY from an item, it should be deselected if it wasn't selected before drag.
                // Re-evaluating logic:
                // Correct logic: FinalSelection = (InitialSelection \setminus ItemsInBox) U (ItemsInBox) ? 
                // No, standard is:
                // No Keys: Clear all first. Box selects items.
                // Ctrl: Toggle items in box? Or Add? Windows explorer adds/toggles.
                
                // Let's implement: Items in box become selected. Items NOT in box revert to 'initialSelectedSet' state (if Ctrl) or unselected (if no Ctrl).
                
                if (e.ctrlKey) {
                    if (initialSelectedSet.has(fullPath)) {
                        selectedFiles.add(fullPath); // Keep it
                    } else {
                        selectedFiles.delete(fullPath); // Revert to unselected
                    }
                } else {
                    selectedFiles.delete(fullPath); // Deselect if no longer in box
                }
            }
        }
        updateCardStyles();
        updateSelectButton();
    };

    const onWindowMouseUp = (e) => {
        if (isSelectionDragging) {
            isSelectionDragging = false;
            dragSelectionBox.style.display = "none";
        }
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);

    // --- Sidebar (Folder View) ---
    const savedSidebarWidth = localStorage.getItem("ComfyUI_web_gallery_Gallery_SidebarWidth") || "200px";
    const sidebar = document.createElement("div");
    Object.assign(sidebar.style, {
        width: savedSidebarWidth,
        minWidth: "150px",
        backgroundColor: "#222",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column"
    });
    
    // Resizer 1 (Sidebar)
    const resizerSidebar = document.createElement("div");
    Object.assign(resizerSidebar.style, {
        width: "5px",
        cursor: "col-resize",
        backgroundColor: "#333",
        zIndex: "10",
        flexShrink: "0"
    });
    resizerSidebar.onmouseover = () => resizerSidebar.style.backgroundColor = "#555";
    resizerSidebar.onmouseout = () => resizerSidebar.style.backgroundColor = "#333";
    
    makeResizable(resizerSidebar, sidebar, "right");
    
    const sidebarTitle = document.createElement("div");
    Object.assign(sidebarTitle.style, {
        padding: "10px",
        fontSize: "12px",
        fontWeight: "bold",
        color: "#888",
        borderBottom: "1px solid #333",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
    });
    
    const sidebarTitleText = document.createElement("span");
    sidebarTitleText.textContent = "Folders";
    sidebarTitle.appendChild(sidebarTitleText);
    
    // Settings Gear Icon
    const settingsBtn = document.createElement("button");
    settingsBtn.innerHTML = '<i class="fas fa-cog"></i>'; 
    Object.assign(settingsBtn.style, {
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: "14px",
        padding: "0",
        opacity: "0.7",
        color: "#ccc"
    });
    settingsBtn.onmouseover = () => settingsBtn.style.opacity = "1";
    settingsBtn.onmouseout = () => settingsBtn.style.opacity = "0.7";
    
    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        openSettingsModal();
    };
    
    sidebarTitle.appendChild(settingsBtn);
    sidebar.appendChild(sidebarTitle);

    sidebarList = document.createElement("div");
    sidebarList.style.padding = "5px";
    sidebar.appendChild(sidebarList);
    mainBody.appendChild(sidebar);
    mainBody.appendChild(resizerSidebar); // Add Resizer

    // --- Grid Container ---
    const gridContainer = document.createElement("div");
    Object.assign(gridContainer.style, {
        flex: "1",
        overflowY: "auto",
        padding: "20px",
        backgroundColor: "#1e1e1e",
        display: "flex",
        flexDirection: "column",
        minWidth: "200px" // Ensure grid doesn't disappear
    });

    // Mouse down on Grid Container to start selection
    gridContainer.addEventListener("mousedown", (e) => {
        // Only start if clicking on background or grid gaps, not on card itself (though card click is handled separately)
        // Actually, Windows behavior: clicking on item selects it, clicking on background clears.
        // Dragging from background starts box selection.
        
        if (e.target.closest(".gallery-card")) return; // Let card click handler handle item interaction
        
        // Clicked on background
        isSelectionDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        // If not holding Ctrl/Shift, clear selection on mouse down (Windows behavior)
        if (!e.ctrlKey && !e.shiftKey) {
            selectedFiles.clear();
            lastSelectedFile = null;
            lastSelectedFullPath = null;
            updateInfoPanel(null);
            updateSelectButton();
            updateCardStyles();
        }
        
        // Snapshot current selection for additive logic if needed (e.g. Ctrl drag)
        initialSelectedSet = new Set(selectedFiles);
        
        Object.assign(dragSelectionBox.style, {
            left: dragStartX + "px",
            top: dragStartY + "px",
            width: "0px",
            height: "0px",
            display: "block"
        });
        
        e.preventDefault(); // Prevent text selection
    });
    
    grid = document.createElement("div");
    Object.assign(grid.style, {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: "15px",
        alignContent: "start" // Ensure items start at top
    });
    gridContainer.appendChild(grid);
    
    loader = document.createElement("div");
    loader.textContent = "Loading...";
    Object.assign(loader.style, {
        textAlign: "center",
        padding: "20px",
        color: "#888",
        display: "none",
        width: "100%"
    });
    gridContainer.appendChild(loader);
    mainBody.appendChild(gridContainer);

    // Resizer 2 (Info Panel)
    resizerInfo = document.createElement("div");
    Object.assign(resizerInfo.style, {
        width: "5px",
        cursor: "col-resize",
        backgroundColor: "#333",
        zIndex: "10",
        flexShrink: "0",
        display: "none" // Initially hidden as Info Panel is hidden
    });
    resizerInfo.onmouseover = () => resizerInfo.style.backgroundColor = "#555";
    resizerInfo.onmouseout = () => resizerInfo.style.backgroundColor = "#333";

    // --- Info Panel ---
    const savedInfoWidth = localStorage.getItem("ComfyUI_web_gallery_Gallery_InfoWidth") || "250px";
    infoPanel = document.createElement("div");
    Object.assign(infoPanel.style, {
        width: savedInfoWidth,
        minWidth: "200px",
        backgroundColor: "#222",
        overflowY: "auto",
        display: "none", // Default closed
        padding: "15px",
        position: "relative" // For absolute close button
    });
    
    makeResizable(resizerInfo, infoPanel, "left");
    
    infoContent = document.createElement("div");
    infoContent.style.color = "#ccc";
    infoContent.style.fontSize = "13px";
    infoContent.innerHTML = "<div style='color:#666;text-align:center;margin-top:20px'>Select an image to see details</div>";
    
    // Close button for info panel
    const closeInfoBtn = document.createElement("button");
    closeInfoBtn.innerHTML = '<i class="fas fa-times"></i>';
    Object.assign(closeInfoBtn.style, {
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "none",
        border: "none",
        color: "#888",
        fontSize: "16px",
        cursor: "pointer",
        padding: "0 5px"
    });
    closeInfoBtn.onclick = () => {
        infoPanelOpen = false;
        infoPanel.style.display = "none";
        if (resizerInfo) resizerInfo.style.display = "none";
    };
    closeInfoBtn.onmouseover = () => closeInfoBtn.style.color = "#fff";
    closeInfoBtn.onmouseout = () => closeInfoBtn.style.color = "#888";
    
    infoPanel.appendChild(closeInfoBtn);
    infoPanel.appendChild(infoContent);
    
    mainBody.appendChild(resizerInfo);
    mainBody.appendChild(infoPanel);

    modal.appendChild(container);
    document.body.appendChild(modal);

    // --- Logic Functions ---

    const expandImage = (file) => {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.9)",
            zIndex: "10002",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out"
        });

        const encodedPath = encodeURIComponent(currentSearchPath || "");
        const encodedSub = encodeURIComponent(file.subfolder || "");
        const encodedFile = encodeURIComponent(file.filename);
        const src = `/web/gallery/thumbnail?filename=${encodedFile}&subfolder=${encodedSub}&path=${encodedPath}&size=preview`;

        const img = document.createElement("img");
        img.src = src;
        Object.assign(img.style, {
            maxWidth: "95%",
            maxHeight: "95%",
            objectFit: "contain",
            boxShadow: "0 0 20px rgba(0,0,0,0.5)",
            cursor: "default"
        });
        
        // Prevent clicking image from closing
        img.onclick = (e) => e.stopPropagation();

        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        Object.assign(closeBtn.style, {
            position: "absolute",
            top: "20px",
            right: "20px",
            background: "rgba(0,0,0,0.5)",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            fontSize: "24px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
        });
        closeBtn.onmouseover = () => closeBtn.style.background = "rgba(0,0,0,0.8)";
        closeBtn.onmouseout = () => closeBtn.style.background = "rgba(0,0,0,0.5)";
        
        closeBtn.onclick = () => document.body.removeChild(overlay);

        overlay.appendChild(img);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        overlay.onclick = () => document.body.removeChild(overlay);
    };

    const openSettingsModal = () => {
        const settingsOverlay = document.createElement("div");
        Object.assign(settingsOverlay.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: "10001",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
        });
        
        const settingsBox = document.createElement("div");
        Object.assign(settingsBox.style, {
            width: "300px",
            backgroundColor: "#252525",
            borderRadius: "8px",
            padding: "20px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            border: "1px solid #333",
            color: "#eee"
        });
        
        const settingsHeader = document.createElement("h3");
        settingsHeader.textContent = "Gallery Settings";
        settingsHeader.style.margin = "0 0 15px 0";
        settingsHeader.style.fontSize = "16px";
        settingsHeader.style.borderBottom = "1px solid #333";
        settingsHeader.style.paddingBottom = "10px";
        settingsBox.appendChild(settingsHeader);
        
        // Option: Recursive Load
        const recursiveOption = document.createElement("div");
        recursiveOption.style.marginBottom = "15px";
        recursiveOption.style.display = "flex";
        recursiveOption.style.alignItems = "center";
        recursiveOption.style.justifyContent = "space-between";
        
        const recursiveLabel = document.createElement("label");
        recursiveLabel.textContent = "Include Subfolder Images";
        recursiveLabel.title = "Show images from all subfolders of the current folder";
        recursiveLabel.style.fontSize = "13px";
        
        const recursiveCheckbox = document.createElement("input");
        recursiveCheckbox.type = "checkbox";
        recursiveCheckbox.checked = recursiveLoad;
        recursiveCheckbox.onchange = (e) => {
            recursiveLoad = e.target.checked;
            localStorage.setItem("ComfyUI_Gallery_RecursiveLoad", recursiveLoad);
        };
        
        recursiveOption.appendChild(recursiveLabel);
        recursiveOption.appendChild(recursiveCheckbox);
        settingsBox.appendChild(recursiveOption);
        
        // Close Button
        const closeSettingsBtn = document.createElement("button");
        closeSettingsBtn.textContent = "Close & Reload";
        Object.assign(closeSettingsBtn.style, {
            width: "100%",
            padding: "8px",
            backgroundColor: "#1976d2",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginTop: "10px"
        });
        closeSettingsBtn.onclick = () => {
            document.body.removeChild(settingsOverlay);
            resetAndLoad();
        };
        
        settingsBox.appendChild(closeSettingsBtn);
        settingsOverlay.appendChild(settingsBox);
        document.body.appendChild(settingsOverlay);
        
        // Close on overlay click
        settingsOverlay.onclick = (e) => {
            if (e.target === settingsOverlay) {
                document.body.removeChild(settingsOverlay);
                resetAndLoad();
            }
        };
    };

    const updateCardStyles = () => {
        const cards = grid.children;
        for (let card of cards) {
            const fullPath = card.dataset.fullPath;
            if (!fullPath) continue;

            const isSelected = selectedFiles.has(fullPath);
            const isActive = lastSelectedFullPath === fullPath;
            const checkmark = card.querySelector(".checkmark");

            if (isSelected) {
                if (isActive) {
                    // Selected and Active (Viewing Info)
                    card.style.opacity = "1";
                    card.style.filter = "brightness(1.1)";
                    card.style.border = "2px solid #4caf50";
                } else {
                    // Selected but Not Active (Older selection)
                    card.style.opacity = "1";
                    card.style.filter = "grayscale(30%)";
                    card.style.border = "2px solid #4caf50";
                }
                if (checkmark) checkmark.style.display = "flex";
            } else {
                // Not Selected
                card.style.opacity = "1";
                card.style.filter = "none";
                card.style.border = "1px solid #333";
                if (checkmark) checkmark.style.display = "none";
                
                // If it's active (viewing info) but not selected, maybe highlight border differently?
                // User didn't specify, but usually "Active" implies some highlight.
                // Let's give it a grey border if active but not selected?
                if (isActive) {
                     card.style.border = "1px solid #888";
                }
            }
        }
    };

    const updateSelectButton = () => {
        selectBtn.textContent = `Select (${selectedFiles.size})`;
    };

    const updateBreadcrumbs = () => {
        breadcrumbContainer.innerHTML = "";
        
        // Root "Home" icon/text
        const homeSpan = document.createElement("span");
        homeSpan.textContent = "Root";
        homeSpan.style.cursor = "pointer";
        homeSpan.style.fontWeight = currentSubfolder === "" ? "bold" : "normal";
        homeSpan.style.color = currentSubfolder === "" ? "#fff" : "#aaa";
        homeSpan.onclick = () => {
            if (currentSubfolder !== "") {
                currentSubfolder = "";
                resetAndLoad();
            }
        };
        breadcrumbContainer.appendChild(homeSpan);

        if (currentSubfolder) {
            const parts = currentSubfolder.split(/[/\\]/);
            let pathAccumulator = "";
            
            parts.forEach((part, index) => {
                const separator = document.createElement("span");
                separator.textContent = " / ";
                separator.style.color = "#666";
                breadcrumbContainer.appendChild(separator);
                
                pathAccumulator += (pathAccumulator ? "/" : "") + part;
                const currentPath = pathAccumulator; // Closure capture
                
                const partSpan = document.createElement("span");
                partSpan.textContent = part;
                const isLast = index === parts.length - 1;
                
                partSpan.style.cursor = isLast ? "default" : "pointer";
                partSpan.style.fontWeight = isLast ? "bold" : "normal";
                partSpan.style.color = isLast ? "#fff" : "#aaa";
                
                if (!isLast) {
                    partSpan.onclick = () => {
                        currentSubfolder = currentPath;
                        resetAndLoad();
                    };
                }
                breadcrumbContainer.appendChild(partSpan);
            });
        }
    };

    const updateSidebar = (folders) => {
        sidebarList.innerHTML = "";
        
        // Always fetch all folders to show full tree structure
        // But for now, let's just use what the API gives us. 
        // Wait, the previous implementation only showed *subfolders of current*. 
        // User wants "show all parents like in normal folder view".
        // This implies a full directory tree or at least the ability to see the hierarchy.
        // We need to change the API call or how we handle it.
        // Let's fetch the full folder list from /web/gallery/folders
    };

    // New function to build tree
    const buildFolderTree = (allFolders) => {
        sidebarList.innerHTML = "";
        
        // Root item
        const rootItem = document.createElement("div");
        rootItem.innerHTML = '<i class="fas fa-folder"></i> Root';
        Object.assign(rootItem.style, {
            padding: "4px 8px",
            cursor: "pointer",
            color: currentSubfolder === "" ? "#fff" : "#aaa",
            fontWeight: currentSubfolder === "" ? "bold" : "normal",
            fontSize: "13px"
        });
        rootItem.onclick = () => {
            currentSubfolder = "";
            resetAndLoad();
            refreshSidebarSelection();
        };
        sidebarList.appendChild(rootItem);

        // Process folders into a tree structure or just flat list with indentation?
        // Flat list with indentation is easier for now given the path strings (e.g. "A/B/C")
        
        allFolders.forEach(folderPath => {
            const depth = folderPath.split("/").length;
            const folderName = folderPath.split("/").pop();
            
            const item = document.createElement("div");
            item.innerHTML = '<i class="fas fa-folder"></i> ' + folderName;
            item.title = folderPath;
            Object.assign(item.style, {
                padding: "4px 8px",
                paddingLeft: `${depth * 15 + 8}px`, // Indent
                cursor: "pointer",
                color: "#aaa",
                fontSize: "13px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
            });
            
            // Highlight current
            if (currentSubfolder === folderPath) {
                item.style.color = "#fff";
                item.style.fontWeight = "bold";
                item.style.backgroundColor = "#333";
            }
            
            item.onmouseover = () => { if(currentSubfolder !== folderPath) item.style.backgroundColor = "#2a2a2a"; };
            item.onmouseout = () => { if(currentSubfolder !== folderPath) item.style.backgroundColor = "transparent"; };
            
            item.onclick = () => {
                currentSubfolder = folderPath;
                resetAndLoad();
                refreshSidebarSelection();
            };
            
            sidebarList.appendChild(item);
        });
    };

    const refreshSidebarSelection = () => {
        // Re-render sidebar styling without rebuilding DOM if possible, 
        // but rebuilding is cheap for < 1000 folders. 
        // Let's just re-fetch or re-render? 
        // We need the list of folders. 
        // Let's store the list of folders globally in this scope.
        if (cachedFolders) buildFolderTree(cachedFolders);
    };

    let cachedFolders = [];
    const loadSidebarFolders = async () => {
        try {
            const encodedPath = encodeURIComponent(currentSearchPath || "");
            const response = await fetch(`/web/gallery/folders?path=${encodedPath}`);
            const data = await response.json();
            if (data.folders) {
                cachedFolders = data.folders;
                buildFolderTree(cachedFolders);
            } else {
                cachedFolders = [];
                buildFolderTree([]);
            }
        } catch (e) {
            console.error("Failed to load folder structure", e);
            cachedFolders = [];
            buildFolderTree([]);
        }
    };

    let currentInfoRequestId = 0;
    const updateInfoPanel = async (fileData) => {
        if (!fileData) {
            infoContent.innerHTML = "<div style='color:#666;text-align:center;margin-top:20px'>Select an image to see details</div>";
            return;
        }
        
        const requestId = ++currentInfoRequestId;
        
        // Show loading state
        infoContent.innerHTML = `
            <div style="margin-bottom: 15px">
                <div style="font-weight:bold;color:#fff;margin-bottom:5px">Filename</div>
                <div style="word-break:break-all">${fileData.filename}</div>
            </div>
            <div style="color:#888;font-style:italic">Loading metadata...</div>
        `;
        
        try {
            const encodedPath = encodeURIComponent(currentSearchPath || "");
            const encodedSub = encodeURIComponent(fileData.subfolder || "");
            const encodedFile = encodeURIComponent(fileData.filename);
            
            const response = await fetch(`/web/gallery/info?path=${encodedPath}&subfolder=${encodedSub}&filename=${encodedFile}`);
            const meta = await response.json();
            
            if (requestId !== currentInfoRequestId) return;
            if (meta.error) throw new Error(meta.error);
            
            const date = new Date(fileData.date * 1000).toLocaleString();
            
            let html = `
                <div style="margin-bottom: 15px">
                    <div style="font-weight:bold;color:#fff;margin-bottom:5px">Filename</div>
                    <div style="word-break:break-all">${meta.filename}</div>
                </div>
                <div style="margin-bottom: 15px">
                    <div style="font-weight:bold;color:#fff;margin-bottom:5px">Dimensions</div>
                    <div>${fileData.width} x ${fileData.height}</div>
                </div>
                <div style="margin-bottom: 15px">
                    <div style="font-weight:bold;color:#fff;margin-bottom:5px">Date Modified</div>
                    <div>${date}</div>
                </div>
                 <div style="margin-bottom: 15px">
                    <div style="font-weight:bold;color:#fff;margin-bottom:5px">Format</div>
                    <div>${fileData.format.toUpperCase()}</div>
                </div>
                <div style="margin-bottom: 15px">
                    <div style="font-weight:bold;color:#fff;margin-bottom:5px">Path</div>
                    <div style="word-break:break-all;font-size:11px;color:#888">${meta.subfolder ? meta.subfolder + "/" : ""}${meta.filename}</div>
                </div>
            `;
            
            // Checkpoints
            if (meta.checkpoints && meta.checkpoints.length > 0) {
                html += `
                <div style="margin-bottom: 15px; border-top: 1px solid #333; padding-top: 10px;">
                    <div style="font-weight:bold;color:#4caf50;margin-bottom:5px">Checkpoints</div>
                    ${meta.checkpoints.map(ckpt => `<div style="font-size:12px;margin-bottom:2px">🔸 ${ckpt}</div>`).join('')}
                </div>`;
            }
            
            // LoRAs
            if (meta.loras && meta.loras.length > 0) {
                html += `
                <div style="margin-bottom: 15px">
                    <div style="font-weight:bold;color:#2196f3;margin-bottom:5px">LoRAs</div>
                    ${meta.loras.map(lora => `<div style="font-size:12px;margin-bottom:2px">🔹 ${lora}</div>`).join('')}
                </div>`;
            }
            
            infoContent.innerHTML = html;
            
        } catch (e) {
            if (requestId !== currentInfoRequestId) return;
            console.error("Error fetching image info:", e);
            // Fallback to basic info if fetch fails
             const date = new Date(fileData.date * 1000).toLocaleString();
             infoContent.innerHTML = `
                <div style="margin-bottom: 15px">
                    <div style="font-weight:bold;color:#fff;margin-bottom:5px">Filename</div>
                    <div style="word-break:break-all">${fileData.filename}</div>
                </div>
                <div style="margin-bottom: 15px">
                    <div style="font-weight:bold;color:#fff;margin-bottom:5px">Dimensions</div>
                    <div>${fileData.width} x ${fileData.height}</div>
                </div>
                <div style="color:red;font-size:12px">Failed to load metadata</div>
            `;
        }
    };

        const updateStorage = () => {
            localStorage.setItem(storageKey, currentSubfolder);
        };

        const resetAndLoad = () => {
            grid.innerHTML = "";
            skip = 0;
            hasMore = true;
            updateStorage(); // Save current subfolder
            updateBreadcrumbs();
            loadImages();
        };

    // Pre-populate selected files from widget
    const existingWidget = node.widgets.find(w => w.name === "image_path");
    if (existingWidget && existingWidget.value) {
        existingWidget.value.split("\n").forEach(p => {
            if (p.trim()) selectedFiles.add(p.trim());
        });
        updateSelectButton();
    }

    // Actions
    showLatestBtn.onclick = () => {
        currentSearchPath = "";
        currentSubfolder = "";
        title.textContent = "Gallery: Output Directory (Latest)";
        showLatestBtn.style.display = "none";
        pathInput.value = "";
        resetAndLoad();
        loadSidebarFolders();
    };

        selectBtn.onclick = () => {
            const imagePathWidget = node.widgets.find(w => w.name === "image_path");
            if (imagePathWidget) {
                // Ensure we are only getting the image path, not the exclude list or anything else
                // selectedFiles is a Set of file paths/names
                imagePathWidget.value = Array.from(selectedFiles).join("\n");
                
                if (node.updatePreview) node.updatePreview();
            }
            
            // Persist exclude list if it was changed
            if (ignoreInput.value !== excludePattern) {
                excludePattern = ignoreInput.value;
                if (onExcludeChange) onExcludeChange(excludePattern);
            }

            document.body.removeChild(modal);
            app.graph.setDirtyCanvas(true);
        };

    async function loadImages() {
        if (loading || !hasMore) return;
        loading = true;
        loader.style.display = "block";
        
        try {
            const encodedPath = encodeURIComponent(currentSearchPath || "");
            const encodedExclude = encodeURIComponent(excludePattern || "");
            const encodedFolder = encodeURIComponent(currentSubfolder || "");
            const searchVal = document.querySelector("#gallery-search-input")?.value || ""; // We need to access search input value
            const encodedSearch = encodeURIComponent(searchVal);
            
            const url = `/web/gallery/list?path=${encodedPath}&folder=${encodedFolder}&exclude=${encodedExclude}&search=${encodedSearch}&skip=${skip}&limit=${limit}&recursive=${recursiveLoad}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                const data = await response.json();
                const errorMessage = data.error || "Failed to fetch images";
                const errorDetails = data.details || "";
                
                // Construct a more detailed error message for display
                let displayMsg = errorMessage;
                if (errorDetails) {
                    displayMsg += `\n\n${errorDetails}`;
                }
                
                throw new Error(displayMsg);
            }
            
            const data = await response.json();
            rootPath = data.root_path;
            
            // If it's a new search (skip=0), we should check for matching subfolders if we are in search mode
            if (skip === 0) {
                 grid.innerHTML = ""; // Clear existing
                 
                 // Only show folders in grid if we are searching. 
                 // Normal navigation is done via Sidebar as requested.
                 if (searchVal && data.subfolders && data.subfolders.length > 0) {
                     const folderSection = document.createElement("div");
                     folderSection.style.gridColumn = "1 / -1";
                     folderSection.style.marginBottom = "10px";
                     folderSection.innerHTML = `<div style="color:#888;font-size:12px;margin-bottom:5px">Folders:</div>`;
                     
                     const folderGrid = document.createElement("div");
                     Object.assign(folderGrid.style, {
                         display: "grid",
                         gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                         gap: "10px"
                     });
                     
                     data.subfolders.forEach(sub => {
                         const folderCard = document.createElement("div");
                         Object.assign(folderCard.style, {
                             padding: "10px",
                             backgroundColor: "#333",
                             borderRadius: "6px",
                             cursor: "pointer",
                             color: "#eee",
                             fontSize: "13px",
                             border: "1px solid #444",
                             display: "flex",
                             alignItems: "center",
                             gap: "5px"
                         });
                         folderCard.innerHTML = `<i class="fas fa-folder" style="font-size:16px"></i> <span style="word-break:break-all">${sub.split("/").pop()}</span>`;
                         
                         folderCard.onmouseover = () => folderCard.style.backgroundColor = "#444";
                         folderCard.onmouseout = () => folderCard.style.backgroundColor = "#333";
                         
                         folderCard.onclick = () => {
                             // Clear search and navigate to folder
                             const searchInput = document.querySelector("#gallery-search-input");
                             const wasSearch = searchInput && searchInput.value;
                             
                             if (searchInput) searchInput.value = "";
                             
                             if (wasSearch) {
                                 // Search result click -> Jump to that folder
                                 currentSubfolder = sub;
                             } else {
                                 // Normal navigation click -> Drill down
                                 currentSubfolder = currentSubfolder ? (currentSubfolder + "/" + sub) : sub;
                             }
                             
                             resetAndLoad();
                         };
                         
                         folderGrid.appendChild(folderCard);
                     });
                     
                     folderSection.appendChild(folderGrid);
                     grid.appendChild(folderSection);
                     
                     // Separator
                     const separator = document.createElement("div");
                     separator.style.gridColumn = "1 / -1";
                     separator.style.borderBottom = "1px solid #333";
                     separator.style.margin = "10px 0";
                     grid.appendChild(separator);
                 }
                 
                 refreshSidebarSelection();
            }
            
            if (data.files && data.files.length > 0) {
                // ... (rest of file rendering logic)
                // Clear any previous error messages if we found files
                const existingErrors = gridContainer.querySelectorAll(".gallery-error-msg");
                existingErrors.forEach(el => el.remove());

                data.files.forEach(file => {
                    // Construct absolute path for matching
                    let fullPath = rootPath;
                    if (file.subfolder) fullPath += "/" + file.subfolder;
                    fullPath += "/" + file.filename;
                    fullPath = fullPath.replace(/\\/g, "/").replace(/\/+/g, "/");
                    
                    const card = document.createElement("div");
                    card.dataset.fullPath = fullPath;
                    
                    Object.assign(card.style, {
                        backgroundColor: "#2a2a2a",
                        borderRadius: "8px",
                        overflow: "hidden",
                        cursor: "pointer",
                        transition: "transform 0.2s, box-shadow 0.2s, opacity 0.2s",
                        border: "1px solid #333",
                        display: "flex",
                        flexDirection: "column",
                        position: "relative"
                    });
                    
                    // Card Header Style Injection
                    if (!document.getElementById("gallery-card-styles")) {
                        const style = document.createElement("style");
                        style.id = "gallery-card-styles";
                        style.textContent = `
                            .card-header {
                                position: absolute;
                                top: 0;
                                left: 0;
                                width: 100%;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                padding: 6px 10px;
                                background: linear-gradient(180deg, rgba(0,0,0,.65), rgba(0,0,0,.0));
                                border-top-left-radius: 8px;
                                border-top-right-radius: 8px;
                                z-index: 20;
                                box-sizing: border-box;
                            }
                            .base-model-label {
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                padding: 2px 8px;
                                color: #fff;
                                background: rgba(0,0,0,.5);
                                border-radius: 10px;
                                font: 700 10px/1.1 system-ui, Segoe UI, Roboto, Arial;
                                border: 1px solid rgba(255,255,255,0.2);
                            }
                            .model-separator::before {
                                content: "|";
                                opacity: .6;
                                margin: 0 4px;
                            }
                            .card-actions {
                                display: flex;
                                gap: 6px;
                            }
                            .info-btn {
                                display: inline-flex;
                                align-items: center;
                                justify-content: center;
                                width: 24px;
                                height: 24px;
                                border: 0;
                                background: transparent;
                                color: #fff;
                                opacity: .9;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                            }
                            .info-btn:hover {
                                opacity: 1;
                                background: rgba(255,255,255,.2);
                            }
                            .info-btn:active {
                                transform: translateY(1px);
                            }
                        `;
                        document.head.appendChild(style);
                    }

                    card.onmouseover = () => {
                        card.style.transform = "translateY(-2px)";
                        card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
                        if (!selectedFiles.has(fullPath) && lastSelectedFullPath !== fullPath) {
                            card.style.borderColor = "#666";
                        }
                    };
                    card.onmouseout = () => {
                        card.style.transform = "none";
                        card.style.boxShadow = "none";
                        if (selectedFiles.has(fullPath)) card.style.borderColor = "#4caf50";
                        else if (lastSelectedFullPath === fullPath) card.style.borderColor = "#888";
                        else card.style.borderColor = "#333";
                    };
                    
                    // Card Header
                    const cardHeader = document.createElement("div");
                    cardHeader.className = "card-header";
                    
                    // Left Pill (Type Info)
                    const format = file.format.toUpperCase();
                    const pill = document.createElement("div");
                    pill.className = "card-header-info";
                    pill.innerHTML = `
                        <span class="base-model-label" title="Format | ${format}">
                            <span class="model-sub-type">IMG</span>
                            <span class="model-separator"></span>
                            <span class="model-base-type">${format}</span>
                        </span>
                    `;
                    cardHeader.appendChild(pill);
                    
                    // Right Actions (Info Button)
                    const actions = document.createElement("div");
                    actions.className = "card-actions";
                    
                    // Expand Button
                    const expandBtn = document.createElement("button");
                    expandBtn.className = "info-btn";
                    expandBtn.title = "Expand image";
                    expandBtn.innerHTML = '<i class="fas fa-expand"></i>'; 
                    
                    expandBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        expandImage(file);
                    };
                    actions.appendChild(expandBtn);
                    
                    const infoBtn = document.createElement("button");
                    infoBtn.className = "info-btn";
                    infoBtn.title = "More info";
                    // Using unicode info symbol as requested fallback
                    infoBtn.innerHTML = '<i class="fas fa-info-circle"></i>'; 
                    
                    infoBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent card selection
                        infoPanelOpen = true;
                        infoPanel.style.display = "block";
                        if (resizerInfo) resizerInfo.style.display = "block";
                        
                        lastSelectedFile = file;
                        lastSelectedFullPath = fullPath;
                        updateInfoPanel(file);
                        updateCardStyles();
                    };
                    
                    actions.appendChild(infoBtn);
                    cardHeader.appendChild(actions);
                    
                    card.appendChild(cardHeader);

                    // Selection Checkmark (Moved to avoid overlap with header elements)
                    // Let's place it top-center or just below the header?
                    // Or overlay it on the image but lower down?
                    // Actually, if we put it top-left, it overlaps the pill.
                    // Let's put it at bottom-right of the image area?
                    const checkmark = document.createElement("div");
                    checkmark.className = "checkmark";
                    checkmark.innerHTML = '<i class="fas fa-check"></i>';
                    Object.assign(checkmark.style, {
                        position: "absolute",
                        top: "35px", // Below header
                        right: "8px", 
                        backgroundColor: "#4caf50",
                        color: "white",
                        borderRadius: "50%",
                        width: "24px",
                        height: "24px",
                        display: "none", // Controlled by updateCardStyles
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: "10",
                        fontSize: "14px",
                        fontWeight: "bold",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.5)"
                    });
                    card.appendChild(checkmark);
                    
                    // Image Container
                    const imgContainer = document.createElement("div");
                    Object.assign(imgContainer.style, {
                        width: "100%",
                        paddingTop: "100%", // 1:1 Aspect Ratio
                        position: "relative",
                        backgroundColor: "#000"
                    });
                    
                    const img = document.createElement("img");
                    const thumbUrl = `/web/gallery/thumbnail?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder)}&path=${encodedPath}&size=small`;
                    
                    img.src = thumbUrl;
                    Object.assign(img.style, {
                        position: "absolute",
                        top: "0",
                        left: "0",
                        width: "100%",
                        height: "100%",
                        objectFit: "contain"
                    });
                    
                    imgContainer.appendChild(img);
                    card.appendChild(imgContainer);
                    
                    // Info
                    const info = document.createElement("div");
                    Object.assign(info.style, {
                        padding: "8px",
                        fontSize: "12px",
                        color: "#ccc",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                    });
                    info.textContent = file.filename;
                    info.title = file.filename;
                    card.appendChild(info);
                    
                    // Click Handler
                    card.onclick = () => {
                        if (selectedFiles.has(fullPath)) {
                            selectedFiles.delete(fullPath);
                        } else {
                            selectedFiles.add(fullPath);
                        }
                        lastSelectedFile = file;
                        lastSelectedFullPath = fullPath;
                        updateInfoPanel(file);
                        updateSelectButton();
                        updateCardStyles();
                    };
                    
                    grid.appendChild(card);
                });
                
                skip += data.files.length;
                if (data.files.length < limit) hasMore = false;
                
                updateCardStyles(); // Apply initial styles
            } else {
                hasMore = false;
            }
        } catch (e) {
            console.error("Error loading gallery images:", e);
            const errorMsg = document.createElement("div");
            errorMsg.className = "gallery-error-msg";
            errorMsg.style.color = "#ff6b6b";
            errorMsg.style.padding = "20px";
            errorMsg.style.gridColumn = "1 / -1"; 
            errorMsg.style.textAlign = "center";
            errorMsg.style.whiteSpace = "pre-wrap"; // Preserve newlines
            errorMsg.style.backgroundColor = "rgba(255,0,0,0.1)";
            errorMsg.style.border = "1px solid #ff6b6b";
            errorMsg.style.borderRadius = "8px";
            
            // Clean up the error message if it's just "Error: ..."
            let cleanMsg = e.message.replace(/^Error: /, "");
            errorMsg.textContent = cleanMsg;
            
            gridContainer.appendChild(errorMsg);
        } finally {
            loading = false;
            loader.style.display = "none";
        }
    }

    // Initial Load
    updateBreadcrumbs();
    loadImages();
    loadSidebarFolders(); // Fetch folder structure once
    
    // Infinite Scroll
    gridContainer.onscroll = () => {
        if (gridContainer.scrollTop + gridContainer.clientHeight >= gridContainer.scrollHeight - 100) {
            loadImages();
        }
    };
}
