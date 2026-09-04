# ShadowProducer 高保真 UI 基线

> 状态：方向已确认，进入高保真实施  
> 日期：2026-08-23  
> 上游：`PRODUCT_REQUIREMENTS.md`、`TECHNICAL_ARCHITECTURE.md`、`LOW_FIDELITY_UI.md`

## 1. 阶段目标

高保真阶段在不改变已确认信息架构和业务边界的前提下，建立可复用、可验证、可持续扩展的产品视觉与交互系统。

本阶段只使用确定性 Mock Fixture，不连接真实账号、API、数据库、对象存储、媒体 Worker 或模型服务。完成高保真评审后进入 UI Contract Freeze，再进行技术 Spike 和功能开发。

## 2. 硬性原则

1. UI 视觉表现和交互体验是产品核心能力，不接受通用后台模板式交付。
2. 保持当前低保真确定的中性亮色工作台、Klein Blue `#002FA7` 受控强调、直角几何、连续面板和内部隔断。
3. 动效必须优雅、可逆、克制，并帮助用户理解状态变化和空间关系。
4. 尽可能复用成熟组件和领域库，只从零开发 ShadowProducer 独有的业务体验。
5. 不因组件库便利改变脚本、分镜、拆解、通告、审片和资源管理的专业工作流。
6. 所有核心控件和页面必须覆盖键盘操作、焦点状态、降低动态以及必要的无障碍语义。

## 3. 前端基础

```text
Next.js App Router
React + TypeScript strict
Tailwind CSS
shadcn/ui + Radix UI
Lucide React
Motion for React
```

领域能力：

```text
TanStack Table        结构化清单和宽表
Tiptap                脚本协作编辑
dnd-kit               镜头、任务和分组拖放
React Konva           审片画面标注
Uppy                  文件上传
HTMLVideoElement
+ hls.js              审片播放
```

MUI Material、Ant Design 等完整视觉体系不作为应用基础。MUI X Data Grid 仅在 TanStack Table 无法合理满足已确认高级需求时局部评估，并必须通过项目组件隔离。

## 4. 组件复用顺序

实现一个交互时按以下顺序选择：

1. 复用项目现有组件。
2. 使用 shadcn/ui 已有组件并适配项目 Token。
3. 组合 Radix Primitive 和现有项目组件。
4. 使用成熟领域库并封装为项目组件。
5. 只有前四种方式无法满足明确业务契约时才自研。

不得同时维护两套 Button、Dialog、Menu、Popover、Tabs、Tooltip 或 Form 基础体系。

## 5. 视觉契约

- 圆角：`0px`。
- 页面结构：连续工作台与内部隔断，不使用漂浮页面卡片。
- 背景：中性浅灰；主工作面为白色或近白色。
- 强调色：Klein Blue `#002FA7`，只用于当前选择、主操作、关键进度和必要焦点。
- 状态色：成功、警告、危险、信息各有独立语义，不使用同色系包办全部状态。
- 阴影：只用于浮层、菜单、拖拽对象和确实脱离文档流的元素。
- 密度：优先服务长时间工作、快速扫描、比较和重复操作。
- 图标：统一使用 Lucide；陌生图标必须有 Tooltip。

## 6. 动效契约

动效分为三层：

| 层级 | 用途 | 默认时长 |
|---|---|---|
| 微反馈 | hover、focus、press、选中、状态色 | 120–180ms |
| 组件转换 | 菜单、Popover、详情切换、折叠 | 160–220ms |
| 空间转换 | 抽屉、面板重排、共享元素、视图切换 | 220–320ms |

规则：

- 进入和退出沿同一路径。
- 选择联动和布局变化优先使用 layout animation。
- 列表增删保留来源与去向，不突然闪现或消失。
- 拖拽必须明确显示抓取、目标位置、禁止区和提交结果。
- 保存、上传、解析、Agent 执行和审批必须提供持续状态反馈。
- `prefers-reduced-motion` 下取消位移、缩放和视差，保留必要淡入淡出与状态变化。
- 动画不得阻塞操作，也不得造成布局抖动、文字重排或点击目标漂移。

## 7. 首批验证界面

高保真组件体系优先通过以下复杂界面验证：

1. 脚本多人协作编辑器。
2. 分镜卡片、表格与 Layout 节奏预演。
3. 审片文件浏览器与视频批注工作台。

这些界面验证通过后，再批量迁移工作台、日历、便签、团队、项目概览和资源库页面。

## 8. 验收门槛

- 视觉风格与低保真基线连续，不出现通用 SaaS 或 Material 后台观感。
- 桌面、平板、手机和 Agent 打开状态均无页面级意外溢出。
- 关键交互具有进入、进行、完成、失败和撤销反馈。
- 动画在正常模式与降低动态模式下均可完成全部操作。
- Loading、Empty、Error、No permission、Offline、Processing、Partial success 和 Approval required 均有可演示状态。
- Storybook 展示共享组件和页面状态。
- Playwright 覆盖关键 Mock 路径、键盘交互、溢出和浏览器控制台。
- 高保真评审通过前不接入真实服务。
