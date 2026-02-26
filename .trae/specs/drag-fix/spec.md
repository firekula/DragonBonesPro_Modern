# DragonBones Pro Modern Editor - 拖动操作修复 PRD

## Overview
- **Summary**: 修复DragonBones Pro Modern Editor中拖动操作的两个问题：1) 拖动时移动速度越来越快的问题，2) 图片拖动时控制点消失的问题。
- **Purpose**: 提高编辑器的用户体验，确保拖动操作的流畅性和稳定性。
- **Target Users**: 使用DragonBones Pro Modern Editor进行骨骼动画编辑的用户。

## Goals
- 修复拖动时移动速度越来越快的问题，确保拖动操作的线性响应。
- 修复图片拖动时控制点消失的问题，确保操作的连续性。
- 确保所有工具（移动、缩放、旋转）的拖动操作都能正确工作。

## Non-Goals (Out of Scope)
- 不修改其他功能的实现。
- 不改变现有的UI布局和视觉效果。
- 不添加新的功能，只修复现有问题。

## Background & Context
- 当前的拖动实现中，每次鼠标移动时都会计算从按下开始的总位移，并将这个总位移累加到当前值上，导致重复累加。
- 图片拖动时控制点消失可能是因为重新渲染时没有正确更新控制点位置。

## Functional Requirements
- **FR-1**: 修复拖动操作的位移计算逻辑，确保每次只应用相对位移而不是总位移。
- **FR-2**: 确保图片拖动时控制点位置正确更新，不会消失。
- **FR-3**: 确保所有工具（移动、缩放、旋转）的拖动操作都能正确工作。

## Non-Functional Requirements
- **NFR-1**: 拖动操作应该流畅，没有卡顿或闪烁。
- **NFR-2**: 拖动操作的响应应该线性，不会出现速度变化。
- **NFR-3**: 修复后应该保持与现有功能的兼容性。

## Constraints
- **Technical**: 基于现有的React、TypeScript和PIXI.js实现。
- **Dependencies**: 依赖现有的CanvasRenderer和App组件。

## Assumptions
- 用户使用鼠标进行拖动操作。
- 修复应该在不破坏现有功能的前提下进行。

## Acceptance Criteria

### AC-1: 拖动操作速度稳定
- **Given**: 用户选择一个骨骼或图片
- **When**: 用户按住鼠标并缓慢移动
- **Then**: 拖动速度应该稳定，不会越来越快
- **Verification**: `human-judgment`

### AC-2: 图片拖动时控制点可见
- **Given**: 用户选择一张图片
- **When**: 用户按住控制点并拖动
- **Then**: 控制点应该保持可见，跟随图片移动
- **Verification**: `human-judgment`

### AC-3: 所有工具拖动操作正常
- **Given**: 用户选择不同的工具（移动、缩放、旋转）
- **When**: 用户使用工具进行拖动操作
- **Then**: 所有工具的拖动操作都应该正常工作，没有异常行为
- **Verification**: `human-judgment`

## Open Questions
- [ ] 无