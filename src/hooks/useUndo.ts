import { useRef, useCallback } from "react";

export interface UndoEntry {
    /** Key format: "bone:<name>" or "slot:<name>" */
    key: string;
    before: Record<string, number>;
    after: Record<string, number>;
}

const MAX_UNDO = 50;

/**
 * Lightweight undo stack for transform operations.
 * Each "undoable operation" runs from pointerdown → pointerup on Canvas tools.
 */
export function useUndo() {
    const stackRef = useRef<UndoEntry[]>([]);

    const pushUndo = useCallback((entry: UndoEntry) => {
        const stack = stackRef.current;
        stack.push(entry);
        if (stack.length > MAX_UNDO) {
            stack.shift();
        }
    }, []);

    const popUndo = useCallback((): UndoEntry | undefined => {
        return stackRef.current.pop();
    }, []);

    const canUndo = useCallback((): boolean => {
        return stackRef.current.length > 0;
    }, []);

    return { pushUndo, popUndo, canUndo };
}
