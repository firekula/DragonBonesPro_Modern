import { Move, ZoomIn, RotateCw } from "lucide-react";

export type ToolType = 'move' | 'scale' | 'rotate';
export type ModeType = 'edit' | 'animation';

interface TopBarProps {
    handleOpenClick: () => void;
    handleExportClick: () => void;
    selectedTool: ToolType;
    setSelectedTool: (tool: ToolType) => void;
    mode: ModeType;
    handleModeChange: () => void;
}

export function TopBar({
    handleOpenClick,
    handleExportClick,
    selectedTool,
    setSelectedTool,
    mode,
    handleModeChange,
}: TopBarProps) {
    return (
        <div className="flex items-center h-8 bg-[#383838] px-2 border-b border-[#1a1a1a]">
            <div className="flex gap-4">
                <div className="relative group">
                    <span className="cursor-pointer hover:text-white">File</span>
                    <div className="absolute top-full left-0 bg-[#2a2a2a] border border-[#444] rounded shadow-lg w-32 hidden group-hover:block">
                        <div className="p-1 cursor-pointer hover:bg-[#3a3a3a]" onClick={handleOpenClick}>Open...</div>
                        <div className="p-1 cursor-pointer hover:bg-[#3a3a3a]" onClick={handleExportClick}>Export...</div>
                    </div>
                </div>
                <span className="cursor-pointer hover:text-white">Edit</span>
                <span className="cursor-pointer hover:text-white">View</span>
                <span className="cursor-pointer hover:text-white">Help</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setSelectedTool('move')}
                        className={`p-1 rounded ${selectedTool === 'move' ? 'bg-blue-600 text-white' : 'hover:bg-[#555]'}`}
                        title="移动工具"
                    >
                        <Move size={14} />
                    </button>
                    <button
                        onClick={() => setSelectedTool('scale')}
                        className={`p-1 rounded ${selectedTool === 'scale' ? 'bg-blue-600 text-white' : 'hover:bg-[#555]'}`}
                        title="缩贴工具"
                    >
                        <ZoomIn size={14} />
                    </button>
                    <button
                        onClick={() => setSelectedTool('rotate')}
                        className={`p-1 rounded ${selectedTool === 'rotate' ? 'bg-blue-600 text-white' : 'hover:bg-[#555]'}`}
                        title="旋转工具"
                    >
                        <RotateCw size={14} />
                    </button>
                </div>
                <button
                    onClick={handleModeChange}
                    className={`px-3 py-1 text-xs rounded ${mode === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'} hover:opacity-80 transition-opacity`}
                >
                    {mode === 'edit' ? '编辑模式' : '动画模式'}
                </button>
            </div>
        </div>
    );
}
