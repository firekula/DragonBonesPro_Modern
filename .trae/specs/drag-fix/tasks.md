# DragonBones Pro Modern Editor - 拖动操作修复 实现计划

## [/] Task 1: 修复移动工具的拖动逻辑
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 修改移动工具的拖动逻辑，确保每次只应用相对位移而不是总位移
  - 实现方式：在鼠标移动事件中，计算与上一次鼠标位置的相对位移，而不是与起始位置的总位移
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-1.1: 拖动移动工具时，速度应该稳定，不会越来越快
  - `human-judgment` TR-1.2: 图片拖动时控制点应该保持可见
- **Notes**: 需要修改CanvasRenderer.tsx中移动工具的事件处理逻辑

## [ ] Task 2: 修复缩放工具的拖动逻辑
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 修改缩放工具的拖动逻辑，确保每次只应用相对位移而不是总位移
  - 实现方式：在鼠标移动事件中，计算与上一次鼠标位置的相对位移，而不是与起始位置的总位移
- **Acceptance Criteria Addressed**: AC-1, AC-3
- **Test Requirements**:
  - `human-judgment` TR-2.1: 拖动缩放工具时，速度应该稳定，不会越来越快
  - `human-judgment` TR-2.2: 缩放操作应该正常工作，没有异常行为
- **Notes**: 需要修改CanvasRenderer.tsx中缩放工具的事件处理逻辑

## [ ] Task 3: 修复旋转工具的拖动逻辑
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 修改旋转工具的拖动逻辑，确保每次只应用相对角度变化而不是总角度
  - 实现方式：在鼠标移动事件中，计算与上一次鼠标位置的相对角度变化，而不是与起始位置的总角度
- **Acceptance Criteria Addressed**: AC-1, AC-3
- **Test Requirements**:
  - `human-judgment` TR-3.1: 拖动旋转工具时，速度应该稳定，不会越来越快
  - `human-judgment` TR-3.2: 旋转操作应该正常工作，没有异常行为
- **Notes**: 需要修改CanvasRenderer.tsx中旋转工具的事件处理逻辑

## [ ] Task 4: 修复图片拖动时控制点消失的问题
- **Priority**: P0
- **Depends On**: Task 1, Task 2, Task 3
- **Description**: 
  - 确保图片拖动时控制点位置正确更新，不会消失
  - 实现方式：确保在拖动过程中，控制点的位置会随着图片的移动而更新
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgment` TR-4.1: 拖动图片时，控制点应该保持可见，跟随图片移动
  - `human-judgment` TR-4.2: 拖动过程中没有闪烁或卡顿
- **Notes**: 需要确保在updateRendering函数中正确计算控制点位置

## [ ] Task 5: 测试所有工具的拖动操作
- **Priority**: P1
- **Depends On**: Task 1, Task 2, Task 3, Task 4
- **Description**: 
  - 测试所有工具（移动、缩放、旋转）的拖动操作是否正常工作
  - 确保修复后没有引入新的问题
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgment` TR-5.1: 所有工具的拖动操作都应该正常工作
  - `human-judgment` TR-5.2: 没有引入新的问题或异常行为
- **Notes**: 需要手动测试所有工具的拖动操作
