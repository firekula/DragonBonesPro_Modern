import { useEffect, useRef, type MutableRefObject } from "react";

interface UsePanZoomProps {
    containerRef: MutableRefObject<HTMLElement | null>;
    onTransform: (pan: { x: number; y: number }, zoom: number) => void;
}

export function usePanZoom({ containerRef, onTransform }: UsePanZoomProps) {
    const panRef = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1);
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const apply = () => onTransform(panRef.current, zoomRef.current);

        // Zoom with scroll wheel
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
            zoomRef.current = Math.max(0.1, Math.min(5, zoomRef.current + delta * zoomRef.current));
            apply();
        };

        // Pan with middle-click or right-click drag
        const handleMouseDown = (e: MouseEvent) => {
            if (e.button === 1 || e.button === 2) {
                // Middle or Right click
                isDraggingRef.current = true;
                lastMouseRef.current = { x: e.clientX, y: e.clientY };
                e.preventDefault();
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingRef.current) {
                const dx = e.clientX - lastMouseRef.current.x;
                const dy = e.clientY - lastMouseRef.current.y;
                panRef.current.x += dx;
                panRef.current.y += dy;
                lastMouseRef.current = { x: e.clientX, y: e.clientY };
                apply();
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (e.button === 1 || e.button === 2) {
                isDraggingRef.current = false;
            }
        };

        // Prevent context menu on right-click
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        container.addEventListener("mousedown", handleMouseDown);
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        container.addEventListener("contextmenu", handleContextMenu);

        return () => {
            container.removeEventListener("wheel", handleWheel);
            container.removeEventListener("mousedown", handleMouseDown);
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            container.removeEventListener("contextmenu", handleContextMenu);
        };
    }, [containerRef, onTransform]);

    return { panRef, zoomRef };
}
