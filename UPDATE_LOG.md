# 更新日志 (UPDATE_LOG)

## 2026-02-26

### v0.8.0 — 编辑工具系统与交互优化

- **新增** 编辑工具（移动、缩放、旋转）：
  - `App.tsx`：新增工具选择器（移动、缩放、旋转按钮）
  - `CanvasRenderer.tsx`：新增工具控制点渲染（移动箭头、缩放手柄、旋转圆弧）
- **新增** 编辑/动画模式切换：
  - `App.tsx`：新增 `mode` 状态（'edit' | 'animation'）
  - 动画模式→编辑模式：暂停动画 + 重置到初始状态
  - 编辑模式→动画模式：开始播放动画
- **新增** 录制按钮和设置关键帧按钮：
  - `App.tsx`：新增 `isRecording` 状态和录制切换按钮
  - 新增 `handleSetKeyframe` 函数（待实现）
- **修改** `CanvasRenderer.tsx`：
  - 增大工具可视化编辑的控制点和箭头大小（16px控制点，32px箭头长度）
  - 为可视化编辑的控制点和箭头添加点击和拖动功能
  - 优化渲染逻辑，使用 `requestAnimationFrame` 和节流函数减少闪烁
- **修改** `App.tsx`：
  - 修复旋转功能，确保同时更新 `skewX` 和 `skewY`，避免出现 Skew X 的感觉
  - 调整 Transform 布局，数字部分可以左右拖动快速修改
  - 修改 `handleTransformChange` 函数，使用增量更新而不是直接赋值
- **修复** 拖动操作问题：
  - 移动工具：每次只应用相对位移而不是总位移
  - 缩放工具：每次只应用相对位移而不是总位移
  - 旋转工具：每次只应用相对角度变化而不是总角度
  - 图片拖动时控制点保持可见，跟随图片移动

### v0.7.0 — 基础编辑工具与时间线优化

- **新增** 时间线区域滚动功能
- **新增** 骨骼列表点击选中功能
- **修改** 时间线左侧骨骼列表：点击可直接选中骨骼
- **修改** 时间线区域：支持上下滚动以显示更多骨骼

### v0.6.0 — 动画播放系统

- **新增** `DataModel.ts`：`AnimationData`、`BoneTimeline`、`TranslateKeyframe`、`RotateKeyframe`、`ScaleKeyframe` 类型定义
- **新增** `ProjectParser.ts`：解析 raw AMF3 数据中的 `animation` 数组，提取骨骼关键帧（translateFrame、rotateFrame、scaleFrame）
- **新增** `AnimationPlayer.ts`：关键帧查找引擎（`findKeyframe`）+ 线性插值（`lerp`）+ 骨骼动画变换评估（`evaluateBoneTimeline`）
- **修改** `CanvasRenderer.tsx`：新增 `currentAnimation` / `currentFrame` props，骨骼变换计算中叠加动画 delta
- **修改** `App.tsx`：
    - 动画状态管理（`selectedAnimIndex`、`currentFrame`、`isPlaying`）
    - `requestAnimationFrame` 播放循环，按 frameRate 推进
    - 动画选择器下拉菜单
    - 播放/暂停/步进/重置按钮
    - 时间轴 UI：骨骼列表 + 帧刻度 + 关键帧菱形标记 + 红色播放头

### v0.5.3 — 点击空白区域取消选中

- **修改** `CanvasRenderer.tsx`：新增 `onDeselect` prop，Stage 设置 `eventMode='static'` + `hitArea=app.screen`
- **修改** `App.tsx`：新增 `handleDeselect` 回调，清除 `selectedBone` 和 `selectedSlot`

### v0.5.2 — 窗口自适应

- **修改** `CanvasRenderer.tsx`：添加 `ResizeObserver` 监听容器尺寸变化，全屏/窗口化切换时自动 `app.resize()` + 重新定位 rootContainer

### v0.5.1 — 像素级精确点击（hitArea 方案）

- **修改** `CanvasRenderer.tsx`：
    - 使用 `sprite.hitArea = { contains(x, y) }` 替代 `containsPoint` 覆写
    - `hitArea.contains()` 接收 PixiJS 预转换的局部坐标，直接查询 alpha 通道
    - 透明像素返回 `false`，事件自动穿透到下层精灵

### v0.5.0 — Spine 风格选中效果 + 缩放优化

- **修改** `CanvasRenderer.tsx`：
    - 移除蓝色 tint 变色选中效果
    - 新增虚线边界框（灰色虚线矩形，`drawDashedRect` 辅助函数）
    - 新增白色轮廓线（2px 半径边缘检测，4邻域 → 多邻域扩展）
    - 轮廓通过离屏 Canvas 生成纹理叠加渲染
    - CSS 静态网格改为 PIXI.Graphics 动态网格，跟随缩放/平移
    - 骨骼线条、关节点、虚线框线宽除以 `zoomRef.current`，实现缩放无关

### v0.4.0 — 画布缩放、平移、点击选中、属性编辑

- **修改** `CanvasRenderer.tsx`：
    - 缩放：滚轮缩放（0.1x ~ 5x），`zoomRef` 持久化
    - 平移：右键/中键拖拽，`panRef` 持久化
    - 精灵点击选中：`eventMode='static'`，`sprite.on('pointerdown')`
    - 骨骼关节点击：透明 Graphics hit area
    - 选中骨骼高亮（白色线条 + 红色关节点）
    - 选中插槽高亮（蓝色 tint → 后续改为白色描边）
- **修改** `App.tsx`：
    - `handleSelectBone`、`handleSelectSlot` 回调
    - `handleTransformChange`：直接修改数据模型 + 浅拷贝触发重渲染
    - 属性面板输入框从只读改为可编辑

### v0.3.0 — 场景树、图层面板、App 布局重构

- **新增** `SceneTree.tsx`：骨骼层级树，展开/折叠，嵌套显示插槽
- **新增** `LayerPanel.tsx`：Z-order 排列，上移/下移控件
- **修改** `App.tsx`：左侧面板标签页切换（Tree / Layers），属性面板显示选中项 Transform

### v0.2.0 — PixiJS 画布渲染

- **新增** `CanvasRenderer.tsx`：
    - PixiJS 8 Application 初始化 + 清理
    - 贴图集子贴图裁切 + 精灵渲染
    - 骨骼变换矩阵计算（skewX/skewY + parent chain）
    - 骨骼线框 + 关节点可视化
    - 坐标轴参考线

### v0.1.0 — 项目初始化 + 文件解析

- 使用 Vite + React + TypeScript + Electron 创建项目
- **新增** `DataModel.ts`：DragonBonesData、BoneData、SlotData、SkinData、DisplayData 等类型
- **新增** `ProjectParser.ts`：
    - `.dbproj` 文件加载（ZIP 或原生 AMF3）
    - XOR 解密（密钥 `DRAGONBONES_IS_BEST`）
    - AMF3 二进制解析骨骼、插槽、皮肤数据
    - 贴图集 JSON 解析
    - 贴图 PNG → Blob URL 转换
- **新增** `amf3-ts.d.ts`：AMF3 库类型声明
- **新增** `App.tsx`：基础布局（左面板、画布、时间轴、右面板）

---

## 文件变更清单

| 文件                                | 状态     | 说明                                            |
| ----------------------------------- | -------- | ----------------------------------------------- |
| `src/DataModel.ts`                  | 核心     | 所有数据类型定义（骨骼、插槽、皮肤、动画）      |
| `src/ProjectParser.ts`              | 核心     | .dbproj 文件解析（ZIP + AMF3 + XOR 解密）       |
| `src/App.tsx`                       | 核心     | 主组件（布局、状态管理、动画播放循环、UI）      |
| `src/components/CanvasRenderer.tsx` | 核心     | PixiJS 渲染（精灵、骨骼、选中、缩放平移、动画） |
| `src/components/AnimationPlayer.ts` | 核心     | 动画关键帧插值引擎                              |
| `src/components/SceneTree.tsx`      | UI       | 骨骼层级树面板                                  |
| `src/components/LayerPanel.tsx`     | UI       | Z-order 图层面板                                |
| `src/amf3-ts.d.ts`                  | 类型     | AMF3 库类型声明                                 |
| `electron/main.js`                  | Electron | 主进程入口                                      |

## 已知问题

- Vite 端口 5173 被占用时需手动关闭原有进程
- 动画插值目前仅支持线性（`tweenEasing: 0`），贝塞尔曲线待实现
- FFD（Free Form Deformation）网格变形动画尚未支持
- IK 约束尚未实现
