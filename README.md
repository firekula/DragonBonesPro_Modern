# DragonBones Modern Editor

基于 TypeScript + React + PixiJS + Electron 的 DragonBones 骨骼动画编辑器。

## 技术栈

| 技术         | 版本  | 用途               |
| ------------ | ----- | ------------------ |
| React        | 19.2  | UI 框架            |
| PixiJS       | 8.16  | 2D 渲染引擎        |
| Electron     | -     | 桌面应用框架       |
| Vite         | -     | 开发构建工具       |
| TypeScript   | -     | 类型安全           |
| Tailwind CSS | -     | 样式（通过 class） |
| amf3-ts      | 1.1.0 | AMF3 二进制解析    |
| JSZip        | 3.10  | ZIP 文件解压       |
| lucide-react | -     | 图标库             |

## 项目结构

```
modern-editor/
├── electron/
│   └── main.js              # Electron 主进程
├── src/
│   ├── DataModel.ts          # 数据模型定义（骨骼、插槽、皮肤、动画等）
│   ├── ProjectParser.ts      # .dbproj 文件解析器（ZIP + AMF3）
│   ├── App.tsx               # 主应用组件（布局、状态管理、动画播放）
│   ├── App.css               # 应用样式
│   ├── main.tsx              # React 入口
│   ├── index.css             # 全局样式
│   ├── amf3-ts.d.ts          # AMF3 类型声明
│   ├── hooks/
│   │   └── usePanZoom.ts     # 画布缩放/平移 Hook
│   ├── renderer/             # PixiJS 渲染子模块
│   │   ├── BoneRenderer.ts   # 骨骼线框 + 关节点绘制
│   │   ├── GridRenderer.ts   # 网格与坐标轴
│   │   ├── HitTestHelper.ts  # 像素级 alpha hitArea 生成
│   │   ├── SelectionRenderer.ts # 选中轮廓 + 虚线框
│   │   └── ToolRenderer.ts   # 编辑工具控制点（移动/缩放/旋转）
│   └── components/
│       ├── CanvasRenderer.tsx # PixiJS 画布渲染器（精灵、骨骼、选中、动画）
│       ├── AnimationPlayer.ts # 动画关键帧插值引擎
│       ├── PropertiesPanel.tsx # 属性面板
│       ├── SceneTree.tsx      # 场景树面板（骨骼层级 + 嵌套插槽）
│       ├── LayerPanel.tsx     # 图层面板（Z序排列 + 重排序）
│       ├── TimelinePanel.tsx  # 时间轴面板
│       └── TopBar.tsx         # 顶部工具栏
├── test_output.json          # 解析测试输出
└── package.json
```

## 核心功能

### 1. 文件加载

- 支持加载 `.dbproj` 文件（DragonBones Pro 项目格式）
- 支持 ZIP 打包和原生 AMF3 二进制两种格式
- 自动解析：骨骼、插槽、皮肤、贴图集、动画数据
- 解密密钥：`DRAGONBONES_IS_BEST`

### 2. 画布渲染 (CanvasRenderer)

- PixiJS 8 渲染引擎，支持精灵 + 骨骼线框
- **缩放**：滚轮缩放（0.1x ~ 5x）
- **平移**：右键/中键拖拽
- **动态网格**：PIXI.Graphics 绘制的网格，跟随缩放/平移
- **坐标轴**：灰色十字线参考

### 3. 编辑工具系统 (ToolRenderer)

- **移动工具**：
    - 中心点拖拽：X/Y 双向自由移动
    - X 轴箭头（→）：仅水平移动，约束 X 轴
    - Y 轴箭头（↓）：仅垂直移动，约束 Y 轴
- **缩放工具**：8 个方向缩放手柄（边中点 + 四角）
- **旋转工具**：角度手柄（`atan2` 向量角度计算，支持完整 360°，处理 ±180° 折返）
- **实现细节**：
    - 事件系统：使用 **PIXI stage 的 `pointermove/pointerup`**（非 `document.addEventListener`），坐标统一使用 `e.global.x/y`（canvas pixel 坐标），彻底消除坐标系混用
    - **无闪烁拖动**：拖动期间直接修改 `renderingRef.current.armature` 数据并调用 `updateRendering()`，完全绕过 React 重渲染；松手后通过哨兵信号一次性 `setProjectData` 同步状态
    - Zoom 适配：CanvasRenderer 的 wrapper 将 canvas 像素增量除以当前 zoom，得到 DragonBones 世界单位
    - 控制点大小缩放无关：`controlSize = 16 / zoom`，始终保持 16px 视觉大小
    - 旋转使用单一 `rotation` 字段，App.tsx 同步修改 `skewX` 和 `skewY`，确保纯旋转无 skew 畸变

### 4. 模式切换

- **编辑模式**：
    - 暂停动画播放
    - 可以编辑骨骼/插槽的 Transform 属性
    - 可以使用编辑工具进行可视化编辑
- **动画模式**：
    - 自动开始播放动画
    - 支持录制功能（待实现）
    - 支持设置关键帧（待实现）

### 5. 选中交互

- **像素级精确点击**：通过 `hitArea` API 采样贴图 alpha 通道，仅非透明区域响应
- **透明区域穿透**：上层精灵的透明区域不阻挡下层精灵的点击
- **骨骼关节点击**：点击骨骼原点圆圈选中骨骼
- **点击空白取消选中**：Stage pointerdown 清除选中
- **选中效果**：
    - 虚线边界框（灰色虚线矩形）
    - 白色轮廓线（2px 半径边缘检测，提取非透明像素轮廓）
- **缩放无关线宽**：骨骼线条、关节点、虚线框的线宽除以 zoomRef.current

### 6. 属性面板

- 显示选中骨骼/插槽的 Transform 属性
- **可编辑**：X、Y、Rotation、ScaleX、ScaleY、SkewY
- **快速修改**：数字部分可以左右拖动快速修改
- 修改数值后画布实时刷新

### 7. 场景树 (SceneTree)

- 骨骼层级树形结构
- 嵌套显示每个骨骼下的插槽
- 展开/折叠 + 选中高亮

### 8. 图层面板 (LayerPanel)

- 按 Z 序排列所有插槽
- 上移/下移重排序控件

### 9. 动画系统

- **数据模型**：`AnimationData` → `BoneTimeline[]` → `TranslateKeyframe[]` / `RotateKeyframe[]` / `ScaleKeyframe[]`
- **关键帧插值**：`AnimationPlayer.ts` — `findKeyframe` 查找 + `lerp` 线性插值
- **播放循环**：`requestAnimationFrame` 驱动，按 frameRate 推进帧
- **动画控制**：播放/暂停/步进/重置按钮
- **动画选择器**：下拉菜单切换不同动画
- **时间轴 UI**：
    - 左侧骨骼名称列表
    - 右侧帧刻度 + 关键帧菱形标记（蓝色=位移，绿色=旋转）
    - 红色播放头指示当前帧

### 8. 窗口自适应

- `ResizeObserver` 监听容器尺寸变化
- 全屏/窗口切换自动刷新画布

## 数据模型 (DataModel.ts)

```typescript
DragonBonesData
├── name, version, frameRate
├── armatures: ArmatureData[]
│   ├── bones: BoneData[]        // 骨骼（含 localTransform）
│   ├── slots: SlotData[]        // 插槽（含 zOrder, displayIndex）
│   ├── skins: SkinData[]        // 皮肤 → SkinSlotData[] → DisplayData[]
│   └── animations: AnimationData[]  // 动画
│       ├── name, duration, playTimes
│       └── bone: BoneTimeline[]
│           ├── translateFrame: TranslateKeyframe[]  // {x, y, duration, tweenEasing}
│           ├── rotateFrame: RotateKeyframe[]        // {rotate, duration, tweenEasing}
│           └── scaleFrame: ScaleKeyframe[]          // {x, y, duration, tweenEasing}
├── images: Record<string, string>  // Blob URL 映射
└── textureAtlas: { SubTexture[] }  // 贴图集 JSON
```

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式（Vite + Electron 热重载）
npm run electron:dev

# 生产构建
npm run electron:build
```

## 注意事项

- Vite 默认使用 5173 端口，如端口被占用需先关闭占用进程
- `.dbproj` 文件通过文件选择对话框加载
- 动画播放时，关键帧数据为相对于静止姿态的增量值（delta）
- 编辑工具使用逐帧相对位移/角度增量更新，坐标系为 DragonBones 世界坐标（Y 轴向下）
- 拖动期间直接操作 PIXI 对象（无 React 重渲染），松手后才同步 React 状态，避免闪烁
- 控制点和箭头大小为视觉 16px（缩放无关，实际值除以 zoom）
