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
│   └── components/
│       ├── CanvasRenderer.tsx # PixiJS 画布渲染器（精灵、骨骼、选中、动画）
│       ├── AnimationPlayer.ts # 动画关键帧插值引擎
│       ├── SceneTree.tsx      # 场景树面板（骨骼层级 + 嵌套插槽）
│       └── LayerPanel.tsx     # 图层面板（Z序排列 + 重排序）
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

### 3. 编辑工具系统

- **移动工具**：
  - 中心点拖拽：自由移动
  - X/Y 轴箭头拖拽：单向移动
  - 控制点大小：16px（缩放无关）
- **缩放工具**：
  - 8个方向缩放手柄
  - 世界坐标方向缩放
  - 控制点大小：16px（缩放无关）
- **旋转工具**：
  - 旋转圆弧 + 旋转手柄
  - 鼠标跟随角度旋转
  - 控制点大小：16px（缩放无关）

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
- 编辑工具使用相对位移/角度更新，确保拖动速度稳定
- 所有工具控制点和箭头大小为 16px（缩放无关）
