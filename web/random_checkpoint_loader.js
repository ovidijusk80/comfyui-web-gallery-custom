import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "web_gallery.RandomCheckpointLoader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RandomCheckpointLoader") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                const node = this;
                
                // --- Folder Suggestion Logic ---
                const folderWidget = this.widgets.find(w => w.name === "folder");
                // Access input options from nodeData
                const folderOptions = nodeData.input.required.folder[1];
                
                if (folderWidget && folderOptions && folderOptions.folder_suggestions) {
                    const suggestions = ["Select folder to add...", ...folderOptions.folder_suggestions];
                    
                    // Add a combo widget helper
                    this.addWidget(
                        "combo", 
                        "Add Folder", 
                        suggestions[0], 
                        (value, canvas, node, pos, event) => {
                            if (value && value !== "Select folder to add...") {
                                const currentVal = folderWidget.value;
                                let newVal = "";
                                
                                // Clean up current value
                                const currentTrimmed = currentVal ? currentVal.trim() : "";
                                
                                if (currentTrimmed === "" || currentTrimmed === "All") {
                                    newVal = value;
                                } else {
                                    // Check if already present
                                    const parts = currentTrimmed.split(',').map(p => p.trim());
                                    if (!parts.includes(value)) {
                                        newVal = currentTrimmed + ", " + value;
                                    } else {
                                        newVal = currentTrimmed;
                                    }
                                }
                                
                                folderWidget.value = newVal;
                                
                                // Reset the combo value back to prompt visually if possible
                                setTimeout(() => {
                                    const w = this.widgets.find(w => w.name === "Add Folder");
                                    if (w) w.value = suggestions[0];
                                }, 100);
                            }
                        }, 
                        { values: suggestions }
                    );
                }
                
                // --- History / Mode Logic ---
                
                // History storage
                this.checkpointHistory = [];
                
                // 1. Display Widget (Last Loaded)
                // We add a text widget that is read-only
                const displayWidget = this.addWidget("text", "Last Loaded", "None", () => {}, { serialize: false });
                
                // Helper: Pick random checkpoint from current configuration
                function getRandomCheckpoint() {
                    const allCheckpoints = folderOptions.all_checkpoints || [];
                    const folderVal = folderWidget.value;
                    let folders = folderVal.split(',').map(f => f.trim()).filter(f => f);
                    if (folders.length === 0) folders = ["All"];
                    
                    let candidates = [];
                    
                    for (const f of folders) {
                        if (f === "All") {
                            candidates = [...candidates, ...allCheckpoints];
                        } else if (f === "Root") {
                            candidates = [...candidates, ...allCheckpoints.filter(c => !c.includes("/") && !c.includes("\\"))];
                        } else {
                            candidates = [...candidates, ...allCheckpoints.filter(c => {
                                // Normalize separators
                                const normC = c.replace(/\\/g, "/");
                                const lastSlash = normC.lastIndexOf("/");
                                const dir = lastSlash === -1 ? "" : normC.substring(0, lastSlash);
                                return dir === f || dir.startsWith(f + "/");
                            })];
                        }
                    }
                    
                    // Unique
                    candidates = [...new Set(candidates)];
                    
                    if (candidates.length === 0) return null;
                    const idx = Math.floor(Math.random() * candidates.length);
                    return candidates[idx];
                }

                // 2. Buttons
                
                // "Generate Fixed" (Fix Current)
                this.addWidget("button", "Generate Fixed", null, () => {
                    const val = getRandomCheckpoint();
                    if (val) {
                        const forceWidget = node.widgets.find(w => w.name === "force_checkpoint");
                        if (forceWidget) {
                            forceWidget.value = val;
                            displayWidget.value = val + " (Fixed)";
                        }
                    } else {
                        displayWidget.value = "No checkpoints found!";
                    }
                });
                
                // "Always Randomize"
                this.addWidget("button", "Always Randomize", null, () => {
                    const forceWidget = node.widgets.find(w => w.name === "force_checkpoint");
                    if (forceWidget) {
                        // If already random, maybe show preview?
                        // User said: "shows the upcoming run checkpoint model and clicking it second time should switch to random"
                        // Interpreting as: 
                        // If fixed -> Switch to Random
                        // If random -> Just show "Random Mode" or maybe a preview?
                        
                        if (forceWidget.value !== "") {
                            forceWidget.value = "";
                            displayWidget.value = "Random Mode (Ready)";
                        } else {
                            // Already random.
                            displayWidget.value = "Random Mode (Ready)";
                        }
                    }
                });

                // "Reuse Last" (Go back to previous)
                this.addWidget("button", "Reuse Previous", null, () => {
                    // History has [oldest, ..., newest]
                    // If we are currently at "newest", previous is index - 2?
                    // Let's simplify: Reuse the *last loaded* one from history, but maybe pop it?
                    // User said: "go back to previous one"
                    
                    if (node.checkpointHistory.length > 1) {
                         // Get the one before the current one
                         // Current one is at length-1
                         const prev = node.checkpointHistory[node.checkpointHistory.length - 2];
                         if (prev) {
                             const forceWidget = node.widgets.find(w => w.name === "force_checkpoint");
                             if (forceWidget) {
                                 forceWidget.value = prev;
                                 displayWidget.value = prev + " (Fixed)";
                                 // Update history? Or just let next run handle it?
                                 // If we set force, next run will output "prev".
                             }
                         }
                    } else if (node.checkpointHistory.length === 1) {
                        // Only one in history, reuse it
                        const last = node.checkpointHistory[0];
                        const forceWidget = node.widgets.find(w => w.name === "force_checkpoint");
                        if (forceWidget) {
                             forceWidget.value = last;
                             displayWidget.value = last + " (Fixed)";
                        }
                    }
                });
                
                // Event Listener for updates from Python
                function onExecuted(event) {
                    // event.detail is the payload
                    if (event.detail && event.detail.node_id && event.detail.node_id.toString() === node.id.toString()) {
                        const ckpt = event.detail.checkpoint;
                        const mode = event.detail.mode;
                        
                        if (ckpt) {
                            // Update Display
                            if (displayWidget) {
                                displayWidget.value = ckpt + (mode === "fixed" ? " (Fixed)" : "");
                            }
                            
                            // Update History
                            // Only add if different from last? Or always add trace?
                            // Let's always add to track sequence
                            const last = node.checkpointHistory[node.checkpointHistory.length - 1];
                            if (last !== ckpt) {
                                node.checkpointHistory.push(ckpt);
                                // Limit history
                                if (node.checkpointHistory.length > 20) node.checkpointHistory.shift();
                            }
                        }
                    }
                }
                
                api.addEventListener("web_gallery.random_checkpoint.update", onExecuted);
                
                // Cleanup
                const onRemoved = node.onRemoved;
                node.onRemoved = function() {
                    api.removeEventListener("web_gallery.random_checkpoint.update", onExecuted);
                    if (onRemoved) onRemoved.apply(this, arguments);
                };
                
                return r;
            };
        }
    }
});
