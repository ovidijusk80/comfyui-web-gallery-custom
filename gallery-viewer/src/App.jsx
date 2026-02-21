import { useState, useEffect, useCallback, useRef } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import Masonry from 'react-masonry-css';
import { X, Download, Image as ImageIcon, Film, Folder, FolderOpen, Layers, Grid, List, Search, ChevronRight, ChevronDown, ChevronLeft, ZoomIn, Loader2 } from 'lucide-react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import PhotoAlbum from "react-photo-album";

const FolderTree = ({ folders, activeFolder, onFolderSelect }) => {
    const [expandedFolders, setExpandedFolders] = useState({});

    // Convert flat folder list to tree structure
    const buildTree = (folderList) => {
        const root = {};
        folderList.forEach(path => {
            const parts = path.split('/');
            let current = root;
            parts.forEach((part, index) => {
                if (!current[part]) {
                    current[part] = {
                        name: part,
                        path: parts.slice(0, index + 1).join('/'),
                        children: {},
                        isLeaf: index === parts.length - 1
                    };
                }
                current = current[part].children;
            });
        });
        return root;
    };

    const tree = buildTree(folders);

    const toggleFolder = (path) => {
        setExpandedFolders(prev => ({
            ...prev,
            [path]: !prev[path]
        }));
    };

    const renderNode = (node, depth = 0) => {
        const hasChildren = Object.keys(node.children).length > 0;
        const isExpanded = expandedFolders[node.path];
        const isActive = activeFolder === node.path;

        // List Skeleton
        const ListSkeleton = () => {
            return (
                <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 p-3 bg-gray-900/40 border border-gray-800/60 rounded-xl">
                            <div className="w-16 h-16 rounded-lg bg-gray-800 shrink-0 animate-shimmer" />
                            <div className="flex-1 min-w-0 space-y-2">
                                <div className="h-4 bg-gray-800 rounded w-1/3 animate-shimmer" />
                                <div className="flex items-center gap-3">
                                    <div className="h-3 bg-gray-800 rounded w-16 animate-shimmer" />
                                    <div className="h-3 bg-gray-800 rounded w-8 animate-shimmer" />
                                    <div className="h-3 bg-gray-800 rounded w-20 animate-shimmer" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            );
        };

        return (
            <div key={node.path}>
                <button
                    onClick={() => {
                        if (hasChildren) toggleFolder(node.path);
                        onFolderSelect(node.path);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 group ${isActive
                        ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                        : 'text-gray-400 hover:bg-gray-800/50 hover:text-white border border-transparent'
                        }`}
                    style={{ paddingLeft: `${depth * 12 + 12}px` }}
                >
                    {hasChildren && (
                        <span onClick={(e) => { e.stopPropagation(); toggleFolder(node.path); }} className="p-0.5 hover:bg-gray-700 rounded">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </span>
                    )}
                    {!hasChildren && <span className="w-4" />} {/* Spacer */}

                    {isActive
                        ? <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                        : <Folder className="w-4 h-4 text-gray-500 group-hover:text-white shrink-0" />
                    }
                    <span className="truncate" title={node.name}>{node.name}</span>
                </button>

                {isExpanded && hasChildren && (
                    <div className="border-l border-gray-800 ml-4 mt-1">
                        {Object.values(node.children).map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-0.5">
            <button
                onClick={() => onFolderSelect('')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 group ${activeFolder === ''
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-white border border-transparent'
                    }`}
            >
                <Layers className={`w-4 h-4 ${activeFolder === '' ? 'text-indigo-400' : 'text-gray-500 group-hover:text-white'}`} />
                All Outputs
            </button>
            {Object.values(tree).map(node => renderNode(node))}
        </div>
    );
};

function App() {
    const [files, setFiles] = useState([]);
    const [folders, setFolders] = useState([]);
    const [activeFolder, setActiveFolder] = useState('');
    const [hasMore, setHasMore] = useState(true);
    const [selectedFile, setSelectedFile] = useState(null);
    const [totalFiles, setTotalFiles] = useState(0);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [searchQuery, setSearchQuery] = useState('');
    const [isOriginalLoaded, setIsOriginalLoaded] = useState(false);

    // Reset original loaded state when selected file changes
    useEffect(() => {
        // Default to preview to save bandwidth/time
        setIsOriginalLoaded(false);
    }, [selectedFile?.filename, selectedFile?.subfolder]);

    // Create a ref to store the current abort controller
    const abortControllerRef = useRef(null);

    const fetchFiles = async (skip, limit, folder) => {
        // If there's a pending request, cancel it
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create new controller
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const url = `/web/gallery/list?skip=${skip}&limit=${limit}&folder=${encodeURIComponent(folder)}`;
            const response = await fetch(url, { signal: controller.signal });

            if (!response.ok) {
                throw new Error('Failed to fetch files');
            }
            const data = await response.json();
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Fetch aborted');
                return null; // Return null to indicate aborted
            }
            console.error("Error fetching files:", error);
            return { files: [], total: 0 };
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
            }
        }
    };

    const loadMore = useCallback(async () => {
        if (loading) return;

        // Check if we already have all files
        if (totalFiles > 0 && files.length >= totalFiles) {
            setHasMore(false);
            return;
        }

        setLoading(true);

        try {
            const limit = 50;
            const skip = files.length;

            const data = await fetchFiles(skip, limit, activeFolder);

            if (!data) return; // Handle aborted request

            if (!data.files || data.files.length === 0) {
                setHasMore(false);
            } else {
                setFiles(prev => {
                    // Filter out any potential duplicates from the new batch
                    const newFiles = data.files.filter(
                        newFile => !prev.some(p => p.filename === newFile.filename && p.subfolder === newFile.subfolder)
                    );
                    return [...prev, ...newFiles];
                });
                setTotalFiles(data.total);
                if (files.length + data.files.length >= data.total) {
                    setHasMore(false);
                }
            }
        } catch (e) {
            console.error("Load more error:", e);
        } finally {
            setLoading(false);
        }
    }, [files.length, activeFolder, loading, totalFiles]);

    // Initial load and folder change
    useEffect(() => {
        let isActive = true;

        // We don't want to clear files immediately if we're just loading more
        // But for folder change we do.
        setFiles([]);
        setHasMore(true);
        setTotalFiles(0);
        setLoading(true); // Set loading immediately

        const initialLoad = async () => {
            try {
                const data = await fetchFiles(0, 50, activeFolder);
                if (!isActive) return;

                if (data && data.files) {
                    setFiles(data.files);
                    setTotalFiles(data.total);
                    setHasMore(data.files.length < data.total);
                }
            } catch (e) {
                console.error("Initial load error:", e);
            } finally {
                if (isActive) setLoading(false);
            }
        };

        initialLoad();

        // Cleanup function to abort on unmount or re-run
        return () => {
            isActive = false;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [activeFolder]);

    // Fetch folders
    useEffect(() => {
        fetch('/web/gallery/folders')
            .then(r => r.json())
            .then(data => {
                if (data.folders) setFolders(data.folders);
            })
            .catch(console.error);
    }, []);

    const getFileUrl = (file, size = 'original') => {
        if (!file) return '';
        const params = new URLSearchParams();
        params.append('filename', file.filename);
        if (file.subfolder) params.append('subfolder', file.subfolder);
        params.append('type', file.type || 'output');

        if (size === 'thumbnail' || size === 'preview') {
            if (file.format) params.append('format', file.format);
            if (size === 'preview') params.append('size', 'preview');
            return `/web/gallery/thumbnail?${params.toString()}`;
        }

        return `/view?${params.toString()}`;
    };

    const handleDownload = (e, file) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = getFileUrl(file, 'original'); // Force full quality for download
        link.download = file.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredFiles = files.filter(file =>
        file.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Lightbox Image with loading state
    const LightboxImage = ({ src, alt, className, style, onLoad }) => {
        const [loaded, setLoaded] = useState(false);

        // Reset loaded state when src changes
        useEffect(() => {
            setLoaded(false);
        }, [src]);

        return (
            <div className="w-full h-full flex items-center justify-center relative">
                {!loaded && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="w-full h-full bg-gray-900/50 animate-shimmer absolute inset-0 rounded-sm"></div>
                        <div className="w-16 h-16 bg-gray-900/80 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-2xl border border-white/10 ring-1 ring-black/50 z-20">
                            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                        </div>
                    </div>
                )}
                <img
                    src={src}
                    alt={alt}
                    className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                    style={style}
                    onLoad={() => {
                        setLoaded(true);
                        onLoad?.();
                    }}
                />
            </div>
        );
    };

    // Image with skeleton for masonry grid
    const GridImage = ({ src, alt, aspectRatio, onClick, maxHeight }) => {
        const [loaded, setLoaded] = useState(false);

        return (
            <div
                className="relative w-full overflow-hidden bg-gray-900 cursor-pointer group"
                style={{
                    aspectRatio: `${1 / aspectRatio}`,
                    maxHeight: maxHeight !== 'none' ? maxHeight : undefined
                }}
                onClick={onClick}
            >
                {!loaded && (
                    <div className="absolute inset-0 bg-gray-800 animate-shimmer" />
                )}
                <img
                    src={src}
                    alt={alt}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                    loading="lazy"
                    onLoad={() => setLoaded(true)}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
            </div>
        );
    };

    const [columnCount, setColumnCount] = useState(() => {
        // Try to load from localStorage, default to 6
        const saved = localStorage.getItem('gallery_column_count');
        return saved ? parseInt(saved) : 6;
    });

    const [maxImageHeight, setMaxImageHeight] = useState(() => {
        const saved = localStorage.getItem('gallery_max_image_height');
        return saved || 'none';
    });

    useEffect(() => {
        localStorage.setItem('gallery_column_count', columnCount);
    }, [columnCount]);

    useEffect(() => {
        localStorage.setItem('gallery_max_image_height', maxImageHeight);
    }, [maxImageHeight]);

    const breakpointColumnsObj = {
        default: columnCount,
        1536: Math.min(columnCount, 5),
        1280: Math.min(columnCount, 4),
        1024: Math.min(columnCount, 3),
        768: Math.min(columnCount, 2)
    };

    // Skeleton Loader for Initial Grid
    const GridSkeleton = useCallback(() => {
        // Create a deterministic-looking random pattern of heights
        const skeletonItems = Array.from({ length: 40 }).map((_, i) => {
            const heights = [200, 300, 400, 250, 350, 280, 320, 380, 220, 260];
            return { height: heights[i % heights.length] };
        });

        return (
            <div className="w-full flex gap-1">
                <Masonry
                    breakpointCols={breakpointColumnsObj}
                    className="my-masonry-grid flex w-full gap-1"
                    columnClassName="my-masonry-grid_column flex flex-col gap-1"
                >
                    {skeletonItems.map((item, i) => (
                        <div
                            key={i}
                            className="w-full bg-gray-800 rounded-sm animate-shimmer"
                            style={{ height: `${item.height}px` }}
                        />
                    ))}
                </Masonry>
            </div>
        );
    }, []);

    // MiniMap Component for Zoom Navigation
    const MiniMap = ({ scale, positionX, positionY, instance, resetTransform, mapBgUrl }) => {
        // Determine dimensions from instance if available
        const imgWidth = instance?.contentComponent?.offsetWidth || 1000;
        const imgHeight = instance?.contentComponent?.offsetHeight || 1000;
        const containerWidth = instance?.wrapperComponent?.offsetWidth || 1000;
        const containerHeight = instance?.wrapperComponent?.offsetHeight || 1000;

        // Calculate viewport size relative to the scaled image
        // The total size of the image in pixels when zoomed is (imgWidth * scale) x (imgHeight * scale)
        const totalW = imgWidth * scale;
        const totalH = imgHeight * scale;

        // The visible percentage is simply container / total
        const visiblePercentW = Math.min(100, (containerWidth / totalW) * 100);
        const visiblePercentH = Math.min(100, (containerHeight / totalH) * 100);

        // Position calculation
        // positionX is the translation. If we pan right, X becomes negative.
        // The left edge of the viewport is at -positionX relative to the image origin.
        // So percentage left is (-positionX / totalW) * 100
        const leftPercent = (-positionX / totalW) * 100;
        const topPercent = (-positionY / totalH) * 100;

        // Clamp values
        const safeLeft = Math.max(0, Math.min(100 - visiblePercentW, leftPercent));
        const safeTop = Math.max(0, Math.min(100 - visiblePercentH, topPercent));

        // Determine aspect ratio for the map container
        // It should match the image's aspect ratio
        const aspectRatio = imgWidth / imgHeight;
        const isZoomed = scale > 1.01;

        return (
            <div className="absolute bottom-6 right-6 z-[100] flex flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
                {/* The Map Container */}
                <div
                    className={`bg-gray-900/90 backdrop-blur-md border border-white/10 p-1 rounded-lg shadow-2xl ring-1 ring-black/50 overflow-hidden w-40 relative group ${isZoomed ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{ aspectRatio: `${aspectRatio}` }}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isZoomed) resetTransform();
                    }}
                >
                    {/* Background Image */}
                    <img
                        src={mapBgUrl}
                        className="w-full h-full object-cover opacity-60"
                        alt="Minimap"
                    />

                    {/* Viewport Indicator Box */}
                    <div
                        className="absolute border-2 border-indigo-400 bg-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.6)] pointer-events-none transition-all duration-75 ease-linear box-border z-10"
                        style={{
                            width: `${visiblePercentW}%`,
                            height: `${visiblePercentH}%`,
                            left: `${safeLeft}%`,
                            top: `${safeTop}%`,
                            opacity: isZoomed ? 1 : 0.5
                        }}
                    />

                    {/* Reset Overlay */}
                    {isZoomed && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-white font-medium text-xs backdrop-blur-[1px] pointer-events-none z-20">
                            Click to Reset
                        </div>
                    )}
                </div>

                {/* Zoom Level Badge */}
                <div className="bg-gray-900/90 backdrop-blur-md border border-white/10 px-2 py-1 rounded text-[10px] text-gray-400 font-mono shadow-lg">
                    {Math.round(scale * 100)}%
                </div>
            </div>
        );
    };
    const handleNext = useCallback((e) => {
        e?.stopPropagation();
        const currentIndex = files.findIndex(f => f.filename === selectedFile?.filename && f.subfolder === selectedFile?.subfolder);
        if (currentIndex !== -1 && currentIndex < files.length - 1) {
            setSelectedFile(files[currentIndex + 1]);
        }
    }, [files, selectedFile]);

    const handlePrev = useCallback((e) => {
        e?.stopPropagation();
        const currentIndex = files.findIndex(f => f.filename === selectedFile?.filename && f.subfolder === selectedFile?.subfolder);
        if (currentIndex > 0) {
            setSelectedFile(files[currentIndex - 1]);
        }
    }, [files, selectedFile]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!selectedFile) return;
            if (e.key === 'ArrowRight') handleNext(e);
            if (e.key === 'ArrowLeft') handlePrev(e);
            if (e.key === 'Escape') setSelectedFile(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedFile, handleNext, handlePrev]);

    // List Skeleton
    const ListSkeleton = useCallback(() => {
        return (
            <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full animate-pulse">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 bg-gray-900/40 border border-gray-800/60 rounded-xl">
                        <div className="w-16 h-16 rounded-lg bg-gray-800 shrink-0" />
                        <div className="flex-1 min-w-0 space-y-2">
                            <div className="h-4 bg-gray-800 rounded w-1/3" />
                            <div className="flex items-center gap-3">
                                <div className="h-3 bg-gray-800 rounded w-16" />
                                <div className="h-3 bg-gray-800 rounded w-8" />
                                <div className="h-3 bg-gray-800 rounded w-20" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }, []);

    return (
        <div className="flex h-screen bg-gray-950 text-white font-sans overflow-hidden selection:bg-indigo-500/30">
            {/* Sidebar */}
            <div className="w-72 bg-gray-900/50 border-r border-gray-800 hidden md:flex flex-col shrink-0 backdrop-blur-sm">
                <div className="p-6 border-b border-gray-800/50">
                    <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                        <ImageIcon className="w-6 h-6 text-indigo-400" />
                        Gallery
                    </h1>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {/* Search */}
                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search files..."
                            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800">
                            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Total Files</div>
                            <div className="text-xl font-bold text-white">{totalFiles}</div>
                        </div>
                        <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800">
                            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Folders</div>
                            <div className="text-xl font-bold text-white">{folders.length + 1}</div>
                        </div>
                    </div>

                    {/* Folders */}
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1 flex items-center justify-between">
                            <span>Navigation</span>
                            <span className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">{folders.length}</span>
                        </div>
                        <nav className="space-y-1">
                            <FolderTree
                                folders={folders}
                                activeFolder={activeFolder}
                                onFolderSelect={setActiveFolder}
                            />
                        </nav>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-800/50 text-xs text-gray-600 text-center font-medium">
                    ComfyUI Gallery Extension v1.0
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-gray-950/50">
                <div className="h-16 border-b border-gray-800/50 bg-gray-900/30 backdrop-blur-md flex items-center px-6 justify-between shrink-0 z-10 sticky top-0">
                    <div className="flex items-center gap-4">
                        <h2 className="font-semibold text-lg flex items-center gap-2 text-white">
                            {activeFolder ? (
                                <>
                                    <FolderOpen className="w-5 h-5 text-indigo-400" />
                                    <span>{activeFolder}</span>
                                </>
                            ) : (
                                <>
                                    <Layers className="w-5 h-5 text-indigo-400" />
                                    <span>Latest Outputs</span>
                                </>
                            )}
                        </h2>
                        <div className="h-4 w-px bg-gray-700"></div>
                        <span className="text-sm text-gray-400">
                            {filteredFiles.length} items
                        </span>
                    </div>

                    <div className="flex items-center gap-2 bg-gray-800/50 p-1 rounded-lg border border-gray-700/50">
                        {viewMode === 'grid' && (
                            <div className="flex items-center mr-2 border-r border-gray-700/50 pr-2">
                                <button
                                    onClick={() => setColumnCount(Math.max(2, columnCount - 1))}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-all"
                                    title="Decrease Columns"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>
                                </button>
                                <span className="text-xs font-mono text-gray-500 w-6 text-center">{columnCount}</span>
                                <button
                                    onClick={() => setColumnCount(Math.min(12, columnCount + 1))}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-all"
                                    title="Increase Columns"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                                </button>
                            </div>
                        )}

                        <div className="flex items-center mr-2 border-r border-gray-700/50 pr-2">
                            <select
                                value={maxImageHeight}
                                onChange={(e) => setMaxImageHeight(e.target.value)}
                                className="bg-transparent text-xs text-gray-400 font-medium focus:outline-none hover:text-white cursor-pointer border-none p-1 rounded hover:bg-gray-700"
                                title="Max Image Height"
                            >
                                <option value="none" className="bg-gray-800">Default</option>
                                <option value="100vh" className="bg-gray-800">100% Screen</option>
                                <option value="80vh" className="bg-gray-800">80% Screen</option>
                                <option value="60vh" className="bg-gray-800">60% Screen</option>
                                <option value="40vh" className="bg-gray-800">40% Screen</option>
                                <option value="500px" className="bg-gray-800">500px</option>
                                <option value="300px" className="bg-gray-800">300px</option>
                                <option value="200px" className="bg-gray-800">200px</option>
                                <option value="128px" className="bg-gray-800">128px</option>
                                <option value="64px" className="bg-gray-800">64px</option>
                            </select>
                        </div>

                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            title="Grid View"
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded transition-all ${viewMode === 'list' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            title="List View"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div
                    id="scrollableDiv"
                    className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-gradient-to-br from-gray-950 to-gray-900"
                >
                    <InfiniteScroll
                        dataLength={files.length}
                        next={loadMore}
                        hasMore={hasMore}
                        scrollThreshold={0.5}
                        loader={
                            <div className="w-full mt-1">
                                {viewMode === 'grid' ? <GridSkeleton /> : <ListSkeleton />}
                            </div>
                        }
                        scrollableTarget="scrollableDiv"
                        className="pb-20"
                    >
                        {viewMode === 'grid' ? (
                            <div className="w-full flex flex-col gap-1">
                                {files.length === 0 && loading && <GridSkeleton />}

                                <Masonry
                                    breakpointCols={breakpointColumnsObj}
                                    className="my-masonry-grid flex w-full gap-1"
                                    columnClassName="my-masonry-grid_column flex flex-col gap-1"
                                >
                                    {files.map((file, itemIndex) => {
                                        // Robust file type detection
                                        const ext = file.filename.split('.').pop().toLowerCase();
                                        const format = (file.format || ext).toLowerCase();

                                        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(format);
                                        const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(format);

                                        const w = parseInt(file.width) || 800;
                                        const h = parseInt(file.height) || 600;
                                        const aspectRatio = h / w;

                                        if (isImage) {
                                            return (
                                                <GridImage
                                                    key={`${file.filename}-${itemIndex}`}
                                                    src={getFileUrl(file, 'thumbnail')}
                                                    alt={file.filename}
                                                    aspectRatio={aspectRatio}
                                                    onClick={() => setSelectedFile(file)}
                                                    maxHeight={maxImageHeight}
                                                />
                                            );
                                        }

                                        return (
                                            <div
                                                key={`${file.filename}-${itemIndex}`}
                                                className="relative group cursor-pointer bg-gray-900 overflow-hidden rounded-sm"
                                                style={{
                                                    aspectRatio: `${1 / aspectRatio}`,
                                                    maxHeight: maxImageHeight !== 'none' ? maxImageHeight : undefined
                                                }}
                                                onClick={() => setSelectedFile(file)}
                                            >
                                                <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-gray-500 bg-gray-800 hover:bg-gray-700 transition-colors">
                                                    {isVideo ? (
                                                        <Film className="w-8 h-8 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                                                    ) : (
                                                        <ImageIcon className="w-8 h-8 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                                                    )}
                                                    <span className="text-[10px] font-mono uppercase opacity-50">{format}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </Masonry>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 max-w-5xl mx-auto">
                                {files.length === 0 && loading && <ListSkeleton />}
                                {filteredFiles.map((file, idx) => {
                                    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(file.format.toLowerCase());
                                    return (
                                        <div
                                            key={`${file.filename}-${idx}`}
                                            className="group flex items-center gap-4 p-3 bg-gray-900/40 border border-gray-800/60 rounded-xl hover:bg-gray-800/60 hover:border-indigo-500/30 transition-all cursor-pointer"
                                            onClick={() => setSelectedFile(file)}
                                        >
                                            <div
                                                className={`rounded-lg overflow-hidden bg-gray-800 shrink-0 ${maxImageHeight === 'none' ? 'w-16 h-16' : 'flex items-center justify-center'}`}
                                                style={maxImageHeight !== 'none' ? { height: maxImageHeight } : {}}
                                            >
                                                {isImage ? (
                                                    <img
                                                        src={getFileUrl(file, 'thumbnail')}
                                                        alt={file.filename}
                                                        className={`object-cover ${maxImageHeight === 'none' ? 'w-full h-full' : 'h-full w-auto max-w-none'}`}
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className={`flex items-center justify-center text-gray-500 ${maxImageHeight === 'none' ? 'w-full h-full' : 'h-full w-16'}`}>
                                                        <Film className="w-6 h-6" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-medium text-gray-200 truncate group-hover:text-indigo-300 transition-colors">{file.filename}</h3>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                    <span className="flex items-center gap-1"><Folder className="w-3 h-3" /> {file.subfolder || 'Root'}</span>
                                                    <span className="uppercase bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">{file.format}</span>
                                                    <span>{new Date(file.date * 1000).toLocaleDateString()}</span>
                                                    {file.width > 0 && <span className="bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">{file.width}x{file.height}</span>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => handleDownload(e, file)}
                                                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Download className="w-5 h-5" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </InfiniteScroll>

                    {!hasMore && files.length > 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-600 gap-3">
                            <div className="w-12 h-1 bg-gray-800 rounded-full"></div>
                            <span className="text-xs uppercase tracking-widest font-medium">End of gallery</span>
                        </div>
                    )}

                    {files.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 animate-in fade-in duration-700">
                            <div className="bg-gray-800/30 p-8 rounded-full mb-6 ring-1 ring-gray-700/50">
                                <ImageIcon className="w-20 h-20 text-gray-700" />
                            </div>
                            <h3 className="text-2xl font-semibold text-gray-300 mb-2">No content found</h3>
                            <p className="text-sm text-gray-500 max-w-xs text-center">
                                {activeFolder ? `The folder "${activeFolder}" appears to be empty.` : 'Your output directory is empty. Generate some images to see them here!'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox Modal */}
            {selectedFile && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/98 backdrop-blur-xl animate-in fade-in duration-300"
                    onClick={() => setSelectedFile(null)}
                >
                    {/* Nav Buttons */}
                    <button
                        className="absolute left-6 top-1/2 -translate-y-1/2 z-50 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all backdrop-blur-md border border-white/5"
                        onClick={handlePrev}
                    >
                        <ChevronLeft className="w-8 h-8" />
                    </button>

                    <button
                        className="absolute right-6 top-1/2 -translate-y-1/2 z-50 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all backdrop-blur-md border border-white/5"
                        onClick={handleNext}
                    >
                        <ChevronRight className="w-8 h-8" />
                    </button>

                    <div
                        className="relative w-full h-full flex flex-col items-center justify-center"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close button */}
                        <button
                            className="absolute top-6 right-6 z-50 p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-all hover:rotate-90 duration-300 backdrop-blur-md border border-white/5"
                            onClick={() => setSelectedFile(null)}
                        >
                            <X className="w-6 h-6" />
                        </button>

                        {/* Content */}
                        <div className="flex-1 flex items-center justify-center w-full h-full overflow-hidden relative">
                            {['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(selectedFile.format.toLowerCase()) ? (
                                <TransformWrapper
                                    initialScale={1}
                                    minScale={0.5}
                                    maxScale={8}
                                    centerOnInit={true}
                                    disabled={!isOriginalLoaded}
                                    wheel={{ disabled: !isOriginalLoaded }}
                                    pinch={{ disabled: !isOriginalLoaded }}
                                    doubleClick={{ disabled: !isOriginalLoaded }}
                                >
                                    {({ state, instance, resetTransform }) => (
                                        <>
                                            <TransformComponent
                                                wrapperStyle={{ width: "100%", height: "100%" }}
                                                contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                                            >
                                                <LightboxImage
                                                    src={isOriginalLoaded ? getFileUrl(selectedFile, 'original') : getFileUrl(selectedFile, 'preview')}
                                                    alt={selectedFile.filename}
                                                    className="w-full h-full object-contain shadow-2xl rounded-sm"
                                                    style={{ width: "100%", height: "100%" }}
                                                />
                                            </TransformComponent>
                                            <MiniMap
                                                scale={state?.scale ?? 1}
                                                positionX={state?.positionX ?? 0}
                                                positionY={state?.positionY ?? 0}
                                                instance={instance}
                                                resetTransform={resetTransform}
                                                mapBgUrl={selectedFile ? getFileUrl(selectedFile, 'preview') : ''}
                                            />
                                        </>
                                    )}
                                </TransformWrapper>
                            ) : (
                                <video
                                    src={getFileUrl(selectedFile, 'original')}
                                    controls
                                    autoPlay
                                    className="max-w-full max-h-full shadow-2xl bg-black rounded-sm"
                                />
                            )}
                        </div>

                        {/* Metadata Bar */}
                        <div className="mt-8 w-full max-w-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl px-8 py-5 flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom-8 duration-500 ring-1 ring-white/5 z-50">
                            <div className="flex flex-col overflow-hidden mr-8">
                                <span className="font-semibold text-white truncate text-lg tracking-tight">{selectedFile.filename}</span>
                                <span className="text-sm text-gray-400 truncate flex items-center gap-3 mt-1">
                                    <span className="flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /> {selectedFile.subfolder || 'Output Root'}</span>
                                    <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                    <span className="uppercase font-mono text-xs bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">{selectedFile.format}</span>
                                    {selectedFile.width > 0 && (
                                        <>
                                            <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                            <span className="font-mono text-xs text-gray-300">{selectedFile.width}x{selectedFile.height}</span>
                                        </>
                                    )}
                                    <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                    <span>{new Date(selectedFile.date * 1000).toLocaleString()}</span>
                                </span>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                                {!isOriginalLoaded && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(selectedFile.format.toLowerCase()) && (
                                    <button
                                        onClick={() => setIsOriginalLoaded(true)}
                                        className="group flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-white font-medium transition-all"
                                    >
                                        <ZoomIn className="w-4 h-4" />
                                        Load Original
                                    </button>
                                )}

                                <div className="h-10 w-px bg-gray-700/50 mx-2"></div>
                                <button
                                    onClick={(e) => handleDownload(e, selectedFile)}
                                    className="group flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-medium transition-all active:scale-95 shadow-lg shadow-indigo-900/20 hover:shadow-indigo-900/40"

                                >
                                    <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                                    Download
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
