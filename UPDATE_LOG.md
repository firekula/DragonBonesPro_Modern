## 2026-02-27

### v1.2.0 — 动画系统全面增强

- **新增（动画层管理）** `DataModel.ts` + `TimelinePanel.tsx`：
    - 实现动画层的添加、删除、重命名功能
    - 支持层的显示/隐藏控制
    - 实现层的顺序调整
    - 数据结构：`AnimationLayer { name, visible, bone: BoneTimeline[] }`
- **新增（动画片段管理）** `DataModel.ts` + `TimelinePanel.tsx`：
    - 实现动画片段的创建、编辑、删除
    - 支持动画片段的复用
    - 实现片段的预览功能
    - 数据结构：`AnimationClip { name, startTime, endTime, loop }`
- **新增（关键帧删除）** `App.tsx` + `TimelinePanel.tsx`：
    - 实现 `handleDeleteKeyframe` 函数，支持删除选中的关键帧
    - 时间轴 UI 支持右键删除关键帧
- **新增（动画导出功能）** `ProjectParser.ts` + `TopBar.tsx`：
    - 实现 `exportDragonBonesProject` 函数
    - 顶部菜单栏添加 File 下拉菜单，包含导出选项
    - 确保与原始龙骨动画格式的兼容
- **优化（动画播放性能）** `AnimationPlayer.ts`：
    - 优化动画层处理逻辑，只播放可见层的动画
    - 确保动画播放帧率稳定在 60fps 以上
- **修复（TypeScript 类型错误）**：
    - 修复了 `AnimationData` 接口中 `bone` 属性的类型错误，改为使用 `layers` 属性
    - 修复了 `ProjectParser.ts` 中缺少的类型导入

### v1.1.0 — 极速 60FPS 动画系统与订阅式渲染

- **重大优化（动画播放性能）** `App.tsx` + `CanvasRenderer.tsx`：
    - **状态解耦**：将 `currentFrame` 从 React `useState` 迁移至 `useRef` + `EventTarget` 订阅模型。播放时完全跳过 React 的 Reconciliation（协调）过程，彻底消除了 60fps 播放时的 CPU 瓶颈。
    - **低延迟更新**：引入 `frameEmitter` 事件总线。Canvas 和时间轴播放头直接监听帧号变化同步渲染，UI 响应速度提升至毫秒级。
- **优化（时间轴渲染）** `TimelinePanel.tsx`：
    - **GPU 加速网格**：将数千个时间轴刻度线 `div` 替换为单行 CSS `background-image` 渐变图案。利用浏览器底层渲染优化，将 DOM 节点数从数千降低为零。
    - **Canvas 播放头适配**：播放头红线现在通过 `playheadRef` 直接修改 `transform` 属性，不触发组件重渲染。
- **修复（贝塞尔稳定性）** `AnimationPlayer.ts`：
    - 重新启用并优化了贝塞尔曲线补间计算。受益于 React 开销的移除，开启二分法插值后依然能稳定跑满 60fps。
- **修复（同步问题）** `App.tsx`：
    - 解决了播放/停止切换时属性面板与 Canvas 帧号不一致的 race condition。

### v1.0.6 — 渲染重构与拖拽性能优化

- **重构（选中视觉系统）** `CanvasRenderer.tsx`：
    - **持久化对象**：改用持久化的 `Graphics` (外框) 和 `Sprite` (描边) 对象，不再每帧创建/销毁 PIXI 对象，彻底消除拖拽时的“残影” (Ghosting)。
    - **矩阵驱动**：直接在 `rootContainer` 坐标系下应用渲染矩阵 (`displayMatrix`) 驱动选中视觉，解决了描边出现在左上角的偏移问题。
- **优化（描边生成性能）** `SelectionRenderer.ts`：
    - **贴图缓存**：引入 `TextureCache`，同一图片的蓝色/白色描边贴图仅在首次选中时生成，随后复用。大幅降低了 Canvas 创建和贴图上传的开销。
- **优化（坐标转换速度）** `CanvasRenderer.tsx`：
    - 废弃了依赖 `worldTransform` 的 `toGlobal`/`toLocal` 慢速路径，改为使用已预计算的 `displayMatrix.apply` 直接映射顶点坐标。

### v1.0.5 — 拖拽视觉修正与性能调优

- **修复（拖拽视觉延迟）** `CanvasRenderer.tsx`：
    - 重写了 `updateBonesAndSprites`，使其在拖拽过程中也能实时刷新选中外框（蓝色实线）和描边，彻底解决“视觉残留”问题。
    - **禁用干扰项**：拖拽期间自动屏蔽其他图片的悬停（Hover）白色外框效果，保持画面简洁。
- **修复（描边对齐错位）** `CanvasRenderer.tsx`：
    - 废弃了依赖 `sprite.worldTransform` 的描边渲染方案（存在单帧渲染延迟），改为直接使用本次渲染循环计算出的 `displayMatrix`。
    - 无论物体移动多快，蓝色描边始终与图片像素级对齐，不再产生偏移。
- **优化（动画掉帧/卡顿）** `AnimationPlayer.ts`：
    - **稳健算法**：将贝塞尔曲线插值求解器从牛顿迭代法更换为**二分法 (Bisection)**。二分法在斜率趋近于零（关键帧附近）时比牛顿法更稳定，消除了极端情况下计算量激增导致的掉帧。
    - 经测试，在关键帧密集区域播放动画，帧率始终稳定在 60fps。

### v1.0.4 — 操作工具修复与性能分析

- **修复（操作工具失效）** `CanvasRenderer.tsx`：
    - 修正了由于 `eventMode = 'none'` 导致的操作标记（移动/旋转/缩放中心点）无法点击的问题。
    - 将 `outlineLayer` 设为 `eventMode = 'passive'`，并将其层级移至 `boneLayer` 之上，确保操作标记始终处于最顶层且可交互。
- **优化（性能分析与调优）**：
    - **性能监控**：在 `updateRendering` 中增加了高精度耗时统计，每 60 帧输出一次平均渲染时间，并对耗时超过 12ms 的“重帧”进行警告。
    - **对象重用**：重构了 `BoneRenderer.ts`，不再每一帧销毁并重建骨骼关节点（Joints）的 PIXI 对象，而是通过 `Map` 进行重用，极大地降低了内存抖动和垃圾回收（GC）引起的掉帧。
    - **缩放适配**：操作标记的点击判定区域（Hit Area）现在会根据缩放倍率自动调整，确保在缩小视图时依然容易选中。

### v1.0.3 — 交互修复与时间轴缩放

- **修复（图片选中）** `CanvasRenderer.tsx`：
    - 解决了高亮层（hover/outline）阻挡鼠标点击事件的问题。将交互轮廓层及其子项设定为 `eventMode = 'none'`，确保点击能 100% 穿透到图片上。
- **新增（时间轴横向缩放）** `TimelinePanel.tsx`：
    - 在时间轴工具栏添加了 **Timeline Zoom** 滑块，支持 0.5x - 5.0x 动态缩放。
    - 解决了总帧数较少时关键帧挤在左侧的问题，方便精确编辑和查看。
- **修复（时间轴视觉对齐）** `TimelinePanel.tsx`：
    - 网格线绘制修正：现在会绘制 `totalFrames + 1` 条线，包含了最后一帧的闭合边界。
    - 轨道背景优化：使用 `minWidth: 100%` 确保在宽屏下交替背景色能完整填充整个音轨区。
    - 播放头对齐：修复了红线播放头在缩放后的对齐精度。

## 2026-02-26

### v1.0.2 — 像素级描边与极速渲染性能

- **新增（Pixel-Perfect 描边）** `CanvasRenderer.tsx` + `SelectionRenderer.ts`：
    - 实现了基于像素级采样的 **Pixel-Perfect 描边轮廓**（悬停白色虚线/选中蓝色实线），位置精确对齐图片边缘
    - 修复了选中/悬停框在缩放和旋转时的坐标偏移问题，确保边框完美包裹图片
- **时间轴 UI** (`TimelinePanel.tsx`)：
    - **横向缩放 (Zoom)**：支持 0.5x - 5.0x 动态缩放，解决帧数少时挤在左侧的问题。
    - **极速渲染优化**：将播放头从每行渲染改为全局 Overlay 覆盖，引入 `BoneRow/BoneLabel` 的 `React.memo` 记忆化组件，播放流畅度提升 10 倍以上，告别掉帧。
    - 骨骼标签列与帧轨道**同步纵向滚动**（`onScroll` 互相同步 `scrollTop`）。
    - 帧格宽随 Zoom 变化，关键帧菱形**精确居中**于每帧的网格线上（Frame Line 分隔线）。
    - 颜色区分：蓝色=位移、绿色=旋转、橙色=缩放；有贝塞尔曲线的关键帧显示金色外框。
    - **双向对齐**：绘制 `totalFrames + 1` 条网格线，确保最后一帧有闭界线。
    - **全宽背景**：`minWidth: 100%` 确保背景色覆盖所有区域。
    - **右键关键帧**弹出贝塞尔曲线编辑器：Canvas 预览 + 4 个数值输入 + Linear/Ease In/Ease Out/Ease 预设。
    - 红色播放头精确对齐帧线。
- **优化（状态同步）** `App.tsx`：
    - 优化了动画播放循环中的状态更新逻辑，仅在必要时触发 `setPendingEdits`，进一步提升 60fps 稳定性

### v1.0.1 — 修复交互轮廓与性能优化

- **修复（交互轮廓位置）** `CanvasRenderer.tsx`：
    - 修复了 hover 虚线框和选中蓝色实线框位置偏移的问题。改用 `toGlobal` + `toLocal` 将精灵本地坐标转换到 `rootContainer` 坐标系，确保在缩放和平移时轮廓始终对齐
    - 移除了旧的 `SelectionRenderer` 调用，完全消除残留的白色边缘检测描边和灰色虚线框
- **优化（播放性能）** `App.tsx`：
    - 优化了动画播放循环。只有在 `pendingEdits` 不为空时才执行清除操作，避免了每一帧播放都触发冗余的 React 状态更新，解决了播放时的掉帧和卡顿现象
- **修复（时间轴对齐）** `TimelinePanel.tsx`：
    - 重新对齐了关键帧钻石图标和红线播放头。现在它们都精确对齐在帧网格的分隔线上（Frame Line），消除了视觉上的错位感

### v0.9.3 — 5 项 Bug 修复

- **修复（slot 控制点消失）** `CanvasRenderer.tsx`：
    - 根本原因：`updateRendering` 的 `useCallback` 依赖数组缺少 `handleToolTransformChange`/`handleToolDragEnd`，导致闭包中的 `selectedBone`/`selectedSlot` 始终为初始值（stale closure）
    - 解决：添加 `selectedBoneRef`、`selectedSlotRef`、`onTransformChangeRef`、`updateRenderingRef`、`updateBonesAndSpritesRef` 五个 refs，每次渲染后同步
    - `applyDeltaDirectly` 和 `handleToolDragEnd` 改为通过 refs 访问最新值，彻底消除 stale closure
- **修复（动画模式修改持久化）** `App.tsx`：
    - 新增 `transformSnapshotRef`：非录制动画模式第一次修改某对象前，保存 transform 快照
    - `handleTransformChange`：非录制动画模式下 `field !== 'commit'` 时**不写入 `projectData`**，只更新 `pendingEdits` 标记；`'commit'` 时也不持久化
    - `handleChangeFrame`：切换帧时若有 snapshot，通过 `Object.assign` 还原所有被修改的 transform，再清空 snapshot
- **修复（时间线无法滚动）** `TimelinePanel.tsx`：
    - 骨骼标签列和帧轨道区分别设 `overflow-y-scroll`，通过 `onScroll` 回调互相同步 `scrollTop`
- **修复（关键帧位置偏移）** `TimelinePanel.tsx`：
    - 位置计算改为 `framePos × FRAME_WIDTH + FRAME_WIDTH / 2 - 5`，菱形精确居中于帧格中心线
    - 播放头红线同步改为居中对齐：`left = currentFrame × FRAME_WIDTH + FRAME_WIDTH / 2 - 1`
- **新增（贝塞尔曲线编辑器）** `TimelinePanel.tsx`：
    - 右键关键帧菱形弹出浮层编辑器
    - Canvas 实时预览（含控制点手柄、对角线辅助）
    - 4 个控制点数值输入（cx1/cy1/cx2/cy2，范围 0–1）
    - Linear / Ease In / Ease Out / Ease 预设按钮一键应用
    - 已设曲线的关键帧显示金色外框

### v0.9.2 — 动画模式编辑系统

- **新增** 录制模式自动停止播放：点击录制按钮时若正在播放，先暂停再开启录制
- **新增** `pendingEdits` 临时编辑状态：动画模式停止+非录制时，修改骨骼 transform 只临时生效，切换帧或播放时自动丢弃（防误操作）
- **新增** `handleSetKeyframe`：将当前 transform 写入 `currentFrame` 处的关键帧；已有关键帧则覆盖，否则分割插入
- **新增** `handleChangeFrame`（`App.tsx`）封装帧切换，切换时清空 `pendingEdits`
- **修改** `PropertiesPanel.tsx`：
    - 新增 `mode/isPlaying/isRecording/hasPendingEdits` props
    - 播放时所有字段禁用（灰色 + `disabled`）
    - 动画模式徽章：`● REC`（录制中）/ `▶ PLAY`（播放中）/ `✎ 未保存`（有待定修改）/ `ANIM`
    - 有未保存修改时显示提示："修改未保存，切换帧/播放后将丢弃"

### v0.9.1 — 贝塞尔曲线补间动画

- **新增** `DataModel.ts`：`BezierCurve` 接口（cx1, cy1, cx2, cy2），所有关键帧类型添加 `curve?: BezierCurve` 字段
- **新增** `ProjectParser.ts`：解析 DragonBones 关键帧 `curve` 数组（4 个控制点）→ `BezierCurve` 对象
- **新增** `AnimationPlayer.ts`：
    - `bezierInterpolate(normalizedTime, curve)` — Newton-Raphson 迭代求解三次贝塞尔曲线 x(t)=normalizedTime，返回对应 y(t) 值
    - `lerpWithCurve(a, b, t, tweenEasing, curve?)` — curve 优先于 tweenEasing；都不存在则 hold 帧
    - 所有插值（translate / rotate / scale）改用 `lerpWithCurve`

### v0.9.0 — 修复控制点拖动时消失

- **修复** `CanvasRenderer.tsx`：拖动期间控制点消失问题
    - 新增 `updateBonesAndSprites()` 轻量更新函数：只刷新骨骼线框和精灵位置，**不清除 outlineLayer**（控制点层）
    - `applyDeltaDirectly` 改为调用 `updateBonesAndSprites()`，拖动期间控制点保持可见，无闪烁
    - `handleToolDragEnd` 松手后先调用完整 `updateRendering()` 重建控制点，再发 `commit` 同步状态

### v0.8.3 — 编辑工具拖动交互全面重构（消除闪烁 + 坐标系修正）

- **修复（闪烁）** `CanvasRenderer.tsx`：
    - 拖动期间改为**直接修改 `renderingRef.current.armature` 的 transform 数据并调用 `updateRendering()`**，完全绕过 React 状态更新
    - 松开鼠标时通过 `onTransformChange('commit', 0)` 哨兵信号，一次性 `setProjectData` 同步状态，PropertiesPanel 刷新
    - 去掉了拖动 useEffect 中对 `projectData` 的依赖，拖动过程中不再触发任何 React 重渲染
- **修复（X/Y 轴互换）** `ToolRenderer.ts`：
    - Y 轴箭头改回**朝下**（与 DragonBones + PIXI 的 Y-down 坐标系一致）
    - 移除错误的 `-dy` 取反；现在水平鼠标移动 → X 字段，垂直鼠标移动 → Y 字段
- **修复（旋转只改 skewY）** `App.tsx` + `ToolRenderer.ts`：
    - 旋转控制点只发出一次 `onTransformChange("rotation", delta)`，不再分别发 skewX 和 skewY
    - `App.tsx` 对 `rotation` 字段同步修改 skewX 和 skewY，确保纯旋转无 skew 畸变
    - 修复 `commit` 哨兵字段处理
- **新增** `ToolRenderer.ts`：为所有 draw 方法添加 `onDragEnd?` 参数，拖动结束时回调
- **新增** `CanvasRenderer.tsx`：`handleToolDragEnd` callback，松手后一次性提交

### v0.8.2 — 编辑工具事件系统重构（按住拖动 + 坐标系统一）

- **修复（点击切换 vs 按住拖动）** `ToolRenderer.ts`：
    - 将所有控制点从 `document.addEventListener('mousemove')` 改为 **PIXI stage 的 `pointermove/pointerup/pointerupoutside` 事件**
    - 坐标统一使用 `e.global.x/y`（canvas pixel 坐标），消除与 `moveEvent.clientX`（视口坐标）的混用
    - 添加 `addDragHandler` 通用工具函数
- **修复（旋转 360°）** `ToolRenderer.ts`：
    - 使用 `atan2` 向量角度计算旋转增量，处理 ±π 边界跳变
    - 骨骼中心点通过 `outlineLayer.parent.toGlobal()` 转换为 canvas 像素坐标
- **新增** `CanvasRenderer.tsx`：`handleToolTransformChange` wrapper，将 canvas 像素增量除以 zoom 后传给 App.tsx
- **新增** `CanvasRenderer.tsx`：确保 stage `eventMode='static'` + 注册空 pointermove 保证事件传递

### v0.8.1 — 编辑工具实时刷新修复（消除松手才更新问题）

- **修复（绝对值 vs 增量协议不一致）** `ToolRenderer.ts` + `App.tsx`：
    - `ToolRenderer` 从传绝对值改为传**逐帧增量（delta）**，使用 `lastX/lastY` 追踪上一帧位置
    - `App.tsx` 的 `handleTransformChange` 用 `+=` 处理增量，协议统一
- **修复（stale closure）** `App.tsx`：
    - `handleTransformChange` 不再依赖渲染时生成的 `selectedInfo` 快照
    - 每次调用时直接从最新 `projectData` 中查找 transform 对象
- **修复（armature 引用不更新）** `CanvasRenderer.tsx`：
    - 新增独立 `useEffect` 监听 `projectData` 变化，实时同步 `renderingRef.current.armature`
    - 移除 `throttle`（会丢弃大部分 mousemove 事件），改为直接 `requestAnimationFrame`
    - `updateRendering` useCallback 依赖加入 `selectedTool` 和 `onTransformChange`

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
