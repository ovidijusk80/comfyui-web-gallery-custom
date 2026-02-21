import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "web_gallery.Gallery",
    async setup() {
        // Function to create the button
        const createButton = () => {
            // Find the action bar container using the specific class structure provided
            // We look for the flex container that holds the buttons
            const actionBar = document.querySelector(".actionbar-container .flex");
            
            if (actionBar) {
                // Check if button already exists
                if (document.getElementById("web_gallery-gallery-button")) return true;

                const galleryBtn = document.createElement("button");
                galleryBtn.id = "web_gallery-gallery-button";
                galleryBtn.className = "relative inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap appearance-none border-none font-medium font-inter transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-muted-foreground bg-transparent hover:bg-secondary-background-hover px-2 py-1 text-xs h-7 rounded-full lm-top-menu-button";
                galleryBtn.setAttribute("aria-label", "Open Gallery");
                galleryBtn.setAttribute("data-pd-tooltip", "true");
                galleryBtn.style.borderRadius = "4px";
                galleryBtn.style.padding = "6px";
                // galleryBtn.style.backgroundColor = "var(--primary-bg)"; // Optional: match style if needed

                // Icon (Gallery/Image icon) - Updated to be more aligned with ComfyUI style
                galleryBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: inherit;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                `;

                galleryBtn.onclick = () => {
                    openGallery();
                };

                // Append to the action bar
                actionBar.appendChild(galleryBtn);
                return true;
            }
            return false;
        };

        // Try immediately
        if (!createButton()) {
            // If not found, observe DOM changes to find when the action bar is added
            const observer = new MutationObserver((mutations) => {
                if (createButton()) {
                    // observer.disconnect(); 
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Fallback: Also try periodically for a few seconds
            const interval = setInterval(() => {
                if (createButton()) {
                    clearInterval(interval);
                    observer.disconnect();
                }
            }, 1000);
        }
    }
});

function openGallery() {
    window.open("/web/gallery", "_blank");
}
