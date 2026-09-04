# ShadowProducer 技术架构基线

> 状态：技术栈阶段基线 v0.2  
> 日期：2026-08-13  
> 上游需求：`PRODUCT_REQUIREMENTS.md`  
> 下一阶段：低保真 UI 与交互原型

---

## 1. 技术结论

ShadowProducer 采用 TypeScript 模块化单体架构，在一个 Monorepo 中维护三个独立运行单元：

```text
Web 应用
├─ Next.js
├─ 工作台与公开作品集
└─ UI Mock / 真实 API 适配

API 服务
├─ Fastify
├─ Better Auth
├─ REST / OpenAPI / SSE
├─ 应用命令与权限
└─ 审计与后台任务入口

Worker 服务
├─ Graphile Worker
├─ FFmpeg / FFprobe
├─ 文件与文档分析
├─ 分析型 Agent
└─ 通知与派生资产
```

三个运行单元共享领域模型、应用命令、数据契约和基础设施适配器，但分别构建、部署和扩缩容。

首版不采用微服务、Kubernetes、Kafka、GraphQL、Redis 队列、Serverless-only 或桌面 Runner。

## 2. 版本基线

技术文档锁定主版本和稳定分支，不在架构阶段硬编码每个补丁版本。创建代码仓库时必须重新核对安全公告并将精确版本写入锁文件。

截至 2026-08-13，建议起始基线：

| 组件 | 基线 |
|---|---|
| Node.js | 24 LTS |
| TypeScript | 7.0.x 稳定分支 |
| Next.js | 16.3.x 稳定分支 |
| React | 19.2.x，由 Next.js 稳定分支约束具体版本 |
| Fastify | 5.11.x 稳定分支 |
| PostgreSQL | 18.x |
| Better Auth | 1.6.x |
| Kysely | 0.29.x 稳定分支 |
| Graphile Worker | 0.17.x 稳定分支 |
| Tailwind CSS | 4.3.x 稳定分支 |

规则：

- 不采用 RC、Beta 或 Canary 版本作为首版生产基线。
- Drizzle ORM v1 在当前仍处于 Beta，因此首版数据访问改用稳定的 Kysely。
- 依赖必须锁定精确版本，并通过自动化依赖和安全检查升级。
- FFmpeg 镜像必须固定版本和镜像摘要，不能使用漂移的 `latest`。

## 3. 为什么采用模块化单体

本产品虽然包含多人协作、媒体处理和 Agent，但首版团队规模与业务复杂度尚不足以承担微服务成本。

模块化单体提供：

- 一个业务事务可以同时写入主数据、审计和 Outbox。
- 权限规则集中，不必在多个服务之间复制。
- UI 与 Agent 可以直接复用同一应用命令。
- 本地开发环境可以一键启动。
- Worker 可以独立扩容，不要求提前拆分全部业务服务。
- 未来可以按真实性能瓶颈拆出媒体、通知或 Agent 服务。

禁止：

- 按页面随意建立独立后端服务。
- 让 Worker 绕过应用层直接修改业务数据。
- 把模块化单体写成无边界的 `utils` 和跨目录调用集合。

## 4. Monorepo 结构

采用 `pnpm workspace` 和 Turborepo。

```text
shadowproducer/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ worker/
├─ packages/
│  ├─ contracts/
│  ├─ domain/
│  ├─ application/
│  ├─ auth/
│  ├─ database/
│  ├─ storage/
│  ├─ media/
│  ├─ agents/
│  ├─ notifications/
│  ├─ observability/
│  ├─ ui/
│  └─ test-fixtures/
├─ migrations/
├─ infra/
├─ docs/
└─ package.json
```

### 4.1 `apps/web`

- Next.js App Router。
- 登录后的工作台、团队、项目和审片界面。
- 免注册客户审片界面。
- 团队公开作品集。
- 不承载 FFmpeg、长时间 Agent 运行或持久后台任务。
- 不直接连接 PostgreSQL 或对象存储管理接口。

### 4.2 `apps/api`

- Fastify 长驻 API 服务。
- Better Auth 登录、会话和账号身份。
- REST API、OpenAPI、SSE 和上传签名。
- 调用 `packages/application` 中的命令与查询。
- 建立 ActorContext，执行权限校验和风险确认。
- 只通过正式存储端口访问数据库和对象存储。

### 4.3 `apps/worker`

- Graphile Worker 消费后台任务。
- 调用 FFmpeg、FFprobe、文档解析器和第三方远程模型 API。
- 视觉识别、OCR、语音转写和 embedding 生成统一由可配置的第三方远程模型 API 完成，首版采用 OpenAI-compatible 协议；服务器不部署本地视觉、ASR、OCR 或 embedding 模型。
- FFmpeg、FFprobe 只负责媒体元数据、转码、截帧和派生输入，不承担模型推理。
- 上传派生资产并提交业务命令。
- 支持超时、取消、重试、心跳、进度和资源限制。
- 不直接绕过应用命令写入正式业务对象。

## 5. 前端技术栈

### 5.1 核心框架

- Next.js App Router。
- React。
- TypeScript 严格模式。
- Tailwind CSS。
- shadcn/ui，组件源码纳入仓库并由项目维护。
- Radix UI Primitives。
- Lucide React。
- Motion for React。

Next.js 负责：

- 工作区页面和布局。
- 服务端渲染的首屏壳层。
- 公开作品集的 SEO 页面。
- 客户审片入口。
- 按需流式加载界面。

Next.js 不作为唯一业务后端。业务 API、SSE、身份会话、上传签名和后台任务入口统一由 Fastify 提供。

### 5.2 状态管理

- TanStack Query：远端数据、缓存、失效和请求状态。
- Zustand：Agent 面板、播放器联动、临时选择等本地交互状态。
- URL：导航空间、业务资源、个人聚合筛选、视图模式和可分享状态。
- React Hook Form：表单状态。
- TypeBox/JSON Schema：请求、响应和 Agent 工具参数验证。

不得把服务端业务数据长期复制到多个 Zustand Store 中。

导航空间与筛选状态必须分离：

- `/me/*` 是账号级个人空间，不依赖全局 `currentTeam` 或 `currentProject`。
- `/t/:teamId/*` 是单团队空间。
- `/t/:teamId/p/:projectId/*` 是单项目空间，并同时校验项目归属与访问权。
- 个人看板的 `teamFilter`、`projectFilter` 只是查询参数，不得写入团队或项目业务命令的默认目标。
- 团队页的团队选择和项目页的团队/项目级联选择是页面内导航控件，不放入所有页面共用的顶栏。

登录恢复由服务端会话和前端路由共同解析，顺序为：有效邀请或内部深链接、上次仍有权限的内部页面、`/me`。恢复上次页面前必须重新鉴权，失败时回退 `/me`，不能依赖客户端保存的旧团队或项目权限。

低保真原型使用以下等价 Hash 验证路由语义：

```text
#me/dashboard/all/all
#team/:teamId/:view
#project/:teamId/:projectId/:view
```

### 5.3 UI 组件策略

- 使用 shadcn/ui 的开放组件代码和 Radix 无样式可访问组件建立项目组件库。
- 视觉样式由 ShadowProducer 的设计 Token 控制。
- 默认紧凑、专业、直角，避免营销页式卡片堆叠。
- 所有核心页面必须具备加载、空、错误、无权限、离线、处理中和部分失败状态。
- 图标按钮优先使用 Lucide 图标并提供 Tooltip。
- Button、Dialog、Menu、Popover、Tabs、Tooltip、Form 等基础交互只保留一套项目组件契约，不并行引入 MUI Material、Ant Design 或其他完整视觉体系。
- 业务页面不得直接复制第三方示例样式。第三方能力必须经过项目组件封装，使用统一 Token、状态、键盘行为和可访问性约定。
- 优先复用成熟组件、官方适配器和经过验证的领域库；仅自研 ShadowProducer 独有的业务编排、状态联动和视觉表达。

### 5.4 专用交互组件

建议采用：

- Uppy：浏览器大文件上传。
- `@uppy/aws-s3`：S3 兼容直传与 Multipart。
- `hls.js`：非原生 HLS 浏览器的播放适配。
- 原生 `HTMLVideoElement`：统一播放时钟和媒体事件。
- React Konva：画面区域、箭头、笔迹等审片标注层。
- TanStack Table：结构化清单、联系人、供应商和制片拆解表。
- dnd-kit：镜头、任务、分组和排序交互。
- Tiptap：仅用于确实需要富文本编辑的文档区域。
- Motion for React：面板进出、共享元素、布局重排和跨状态连续动画。

日历和脚本编辑器的具体组件在低保真 UI 阶段确定，避免先选库再让产品迁就组件。

TanStack Table 是默认结构化表格引擎。只有在真实需求明确依赖其难以合理实现的大规模虚拟化、列固定、树数据、聚合或 Excel 导出时，才评估局部采用 MUI X Data Grid。若采用：

- 先验证 Community 版本是否足够。
- Pro/Premium 商业授权必须单独评估和批准。
- 通过项目级 `ProductionDataGrid` 组件隔离，不允许业务页面直接依赖 MUI 样式类、主题结构或内部 API。
- 不因局部 Data Grid 引入 MUI Material 的 Button、Dialog、Menu、Tabs 或 Form 作为第二套基础组件系统。

### 5.5 动效与交互反馈

- 动效服务于状态理解、空间连续性和操作反馈，不作为装饰性表演。
- 面板、抽屉、菜单、详情区和视图切换必须从触发位置进入，并沿相同路径退出。
- 布局重排优先使用 Motion layout animation；简单 hover、focus、颜色和边框变化使用 CSS transition。
- 默认微交互时长控制在 `120ms` 至 `220ms`，较大面板转换控制在 `220ms` 至 `320ms`，特殊业务动画需要单独说明理由。
- 禁止无来源缩放、持续漂浮、背景粒子、装饰性视差和影响信息扫描的循环动画。
- 所有动画必须支持 `prefers-reduced-motion`；降低动态后仍需保留清晰的状态、焦点和层级反馈。
- 动画不得改变业务状态的确定性，不得阻塞输入、保存、审批、取消或撤销。

## 6. API 与契约

### 6.1 API 形态

- REST：查询和业务写操作。
- OpenAPI：公开并验证 HTTP 契约。
- SSE：通知、后台任务进度、审片评论和 Agent 状态推送。
- 对象存储 Presigned URL：大文件直传和短期媒体访问。

首版不引入 GraphQL 和通用 WebSocket 网关。

### 6.2 契约定义

`packages/contracts` 使用 TypeBox 定义 JSON Schema：

- 请求参数。
- 响应结构。
- 错误码。
- 命令参数。
- Agent 工具参数。
- 后台任务 Payload。
- SSE 事件。
- 状态机。

同一份 Schema 用于：

- Fastify 路由验证与序列化。
- TypeScript 类型推导。
- OpenAPI 输出。
- Mock Server。
- Agent Function Tool 定义。
- 测试 Fixture 校验。

### 6.3 错误模型

统一错误至少包含：

```text
code
message
requestId
details
retryable
fieldErrors
```

权限拒绝、资源不存在、版本冲突、需要确认、任务处理中和部分成功必须使用不同错误或结果状态。

## 7. 业务命令层

用户界面和全局对话 Agent 共用应用命令：

```text
UI Intent ────────┐
                  ├─> Application Command
Agent Tool Call ──┘
                         │
                         ├─ Validate
                         ├─ Authorize
                         ├─ Confirm Risk
                         ├─ Execute Transaction
                         ├─ Audit
                         └─ Emit Outbox
```

每个命令包含：

- 唯一 `commandId`。
- 结构化输入 Schema。
- ActorContext。
- 目标作用域。
- 权限要求。
- 风险等级。
- 幂等键。
- 事务处理器。
- 审计摘要生成器。
- 明确输出和错误。

不要求所有命令暴露为一个通用 HTTP Endpoint。资源型 REST 路由和 Agent Tool 可以调用同一个应用命令处理器。

## 8. ActorContext 与权限

### 8.1 ActorContext

所有查询和写操作必须建立 ActorContext：

```text
actorType: user | agent | guest | system
authorizationAccountId?
agentRunId?
reviewSessionId?
teamId?
projectId?
requestId
ip?
userAgent?
```

Agent 操作同时记录：

- 发起用户。
- Agent Run。
- 实际命令。
- 审批人。

`authorizationAccountId` 是权限计算的主体。个人 Agent 执行命令时，该字段始终是发起对话的当前用户账号；`actorType: agent` 和 `agentRunId` 只增加执行归因与审计维度，不产生独立角色、成员关系或额外权限。

个人 Agent 的授权必须满足：

- 可读、可写资源集合与发起用户本人在同一时刻通过 UI 能访问的集合完全一致。
- Agent 不能拥有独立于用户的团队角色、项目角色或系统管理员权限。
- 计划生成、待审批恢复和实际执行三个阶段都按最新成员关系与资源归属重新鉴权。
- 用户确认只表示同意执行风险动作，不会补足原本缺失的业务权限。
- Agent 不能调用仅供 Migration、Worker System Task 或运维人员使用的内部命令。

### 8.2 权限实现

权限采用两层防护：

1. TypeScript 应用策略层：业务权限的权威实现。
2. PostgreSQL RLS：生产前必须完成的数据库纵深防护。

应用层不得只相信 URL 或请求体中的 `teamId`、`projectId`。每次命令和查询都必须从目标资源反查归属，并在事务内校验。

跨团队个人工作台通过显式授权 Scope 聚合，不能把 `currentTeam` 当作全系统唯一租户上下文。

### 8.3 数据库角色

建议分为：

- Migration Role。
- API Runtime Role。
- Worker Runtime Role。
- Read-only Support Role。

API 和 Worker 不使用超级用户连接。Worker 的系统任务也必须经过明确的系统权限和审计。

## 9. 身份认证

采用 Better Auth，仅负责账号身份和会话：

- 邮箱密码。
- 邮箱验证和密码重置。
- 可选的 Google 等 OAuth。
- 会话管理和设备退出。
- 后续可增加 Passkey 和双因素认证。

团队、项目、制片、导演、后期、共享联系人等业务授权不依赖 Better Auth Organization 插件作为唯一真相源，而由 ShadowProducer 自己的数据模型和策略层维护。

Better Auth 使用 PostgreSQL，并与 Fastify 集成。认证表建议放入独立 `auth` Schema。

客户免注册审片不创建正式账号，使用 ShadowProducer 自有 Review Session。

## 10. 客户审片令牌

`review_links` 保存：

- 高熵随机 Token 的 Hash。
- 审片任务。
- 可见版本。
- 权限 Scope。
- 过期时间。
- 密码 Hash。
- 最大访问或设备限制（可选）。
- `revoked_at`。
- 创建者和审计信息。

访问流程：

```text
外部链接
→ 验证 Token / 密码 / 有效期
→ 创建短期 Review Session Cookie
→ 按 Review Scope 查询
→ API 签发更短期的媒体 URL
```

审片 Token 本身不能直接成为对象存储的永久地址。

## 11. 数据库

### 11.1 数据库选择

采用 PostgreSQL 18。

原因：

- 复杂关联、事务和约束适合关系数据库。
- 多团队、多项目和共享联系人需要清晰的引用完整性。
- 支持 RLS、JSONB、全文搜索和 Trigram。
- 主数据、审计、Outbox 和后台队列可以在首版中共享事务。

### 11.2 数据访问

采用 Kysely：

- SQL 形态明确。
- TypeScript 查询类型安全。
- 对复杂 JOIN、CTE、窗口函数和事务保持控制。
- 不隐藏团队和项目 Scope。
- 迁移可以使用 Kysely Schema API 和审核后的原生 SQL。

迁移规则：

- 迁移文件按 UTC 时间命名。
- 生产只运行已提交并审核的迁移。
- 不使用自动 `push` 修改生产 Schema。
- 破坏性迁移必须拆成兼容发布步骤并提供回滚或前滚方案。
- 数据库类型由生产 Schema 自动生成，避免手写类型漂移。

### 11.3 PostgreSQL Schema

建议：

```text
auth              Better Auth
app               ShadowProducer 业务表
graphile_worker   Graphile Worker 管理表
```

不为每个团队创建独立 PostgreSQL Schema。团队隔离通过行级作用域、外键、策略和 RLS 实现。

### 11.4 首批扩展

- `pg_trgm`：模糊搜索和联系人查重。
- PostgreSQL Full Text Search：联系人、项目、文档元数据搜索。

P0 不引入 Elasticsearch、OpenSearch 或独立搜索服务。P1 在 PostgreSQL 启用 `pgvector`，存储第三方远程 embedding API 返回的向量并完成团队与项目范围内的相似度检索；应用服务器不生成本地向量。

## 12. 核心数据边界

### 12.1 账号与成员

- `accounts`
- `teams`
- `team_memberships`
- `projects`
- `project_memberships`

### 12.2 联系人与供应商

- `contacts`
- `contact_private_fields`
- `contact_shares`
- `team_contact_metadata`
- `project_contact_refs`
- `vendors`
- `vendor_contacts`

共享关系明确记录：

- 来源所有者。
- 目标团队或项目。
- 可见字段掩码。
- 是否允许继续关联新项目。
- 撤销时间。

### 12.3 文件与媒体

- `assets`
- `asset_versions`
- `asset_derivatives`
- `upload_sessions`
- `media_metadata`
- `processing_jobs`

### 12.4 审片

- `review_tasks`
- `review_versions`
- `review_links`
- `review_sessions`
- `review_comments`
- `review_annotations`
- `review_approvals`

### 12.5 Agent

- `agent_threads`
- `agent_messages`
- `agent_runs`
- `agent_steps`
- `agent_tool_calls`
- `agent_approvals`
- `analysis_jobs`
- `generated_artifacts`

### 12.6 系统记录

- `audit_events`
- `outbox_events`
- `notifications`
- `idempotency_records`

## 13. 对象存储与上传

### 13.1 存储

- 生产：S3 或完整兼容 S3 Multipart/Presigned API 的对象存储。
- 本地：MinIO。
- 数据库只保存元数据、对象 Key、校验和和业务关系。
- Bucket 默认私有。

### 13.2 上传流程

```text
1. API 创建 Upload Session
2. API 校验权限、大小、类型和配额
3. API 生成不可变对象 Key
4. 浏览器通过 Presigned Multipart 直传
5. 浏览器提交 Complete
6. API 验证部件、校验和和 Upload Session
7. API 创建 Asset Version
8. 同事务或 Outbox 入队安全扫描与媒体处理
```

`Complete` 必须幂等。

对象 Key 使用随机 ID 或内容 Hash，不使用可冲突的原始文件名。由于 Presigned URL 对相同 Key 的上传可能覆盖对象，系统不得为新上传复用旧 Key。

未完成 Multipart 必须定期清理。

### 13.3 下载和播放

- 内部成员由 API 校验权限后签发短期 GET URL。
- 客户必须先通过 Review Session 权限，再获取更短期媒体 URL。
- 公开作品集使用独立发布资产和 CDN 策略。
- 原始文件下载与审阅代理播放使用不同权限。

## 14. 后台队列

采用 Graphile Worker，使用同一个 PostgreSQL 集群的独立 Schema。

原因：

- 首版无需额外维护 Redis、RabbitMQ 或 Kafka。
- 支持重试、指数退避、定时任务和多 Worker。
- 可以与业务事务和 Outbox 协作。
- Worker 可以独立容器化和扩容。

重要语义：

- 队列按“至少执行一次”设计。
- 所有可能产生副作用的任务必须幂等。
- 失败重试不能重复发送通知、创建版本或发布作品。
- 大任务拆成可恢复的小步骤。
- Worker 非正常退出后的锁回收必须纳入运行监控。

首批任务：

- `scan-upload`
- `probe-media`
- `generate-thumbnail`
- `generate-review-proxy`
- `generate-waveform`
- `extract-document-text`
- `transcribe-media`
- `run-analysis-agent`
- `send-notification`
- `cleanup-upload-session`
- `cleanup-recycle-bin`

## 15. FFmpeg 与媒体管线

### 15.1 执行环境

- FFmpeg/FFprobe 仅在 Worker 容器内执行。
- 使用固定镜像版本和摘要。
- 每项任务拥有独立临时目录。
- 设置 CPU、内存、磁盘、超时和并发限制。
- 取消任务时终止本任务的完整子进程树。
- 完成、失败或取消后清理临时文件。

### 15.2 媒体处理

基础处理：

- FFprobe 元数据。
- 缩略图。
- 关键帧。
- 波形数据。
- 浏览器兼容审阅代理。

代理策略：

- 基础代理使用 H.264/AAC MP4，并启用 Fast Start。
- 长视频或大码率媒体可额外生成 HLS。
- 播放器根据派生资产选择原生 MP4 或 hls.js。
- 原始资产保持不可变。

### 15.3 时间基准

数据库使用整数微秒作为媒体时间主值：

```text
start_us
end_us
duration_us
```

同时保存：

- 原始 Timebase。
- 帧率分子和分母。
- 是否 VFR。
- 旋转信息。
- Review Proxy 的帧率和源时间映射。

评论锚点绑定：

```text
review_version_id
start_us
end_us?
```

画面标注使用相对视频画面的标准化坐标，不保存浏览器像素坐标。

## 16. 版本对比

P0 采用客户端同步双播放器：

- 选择两个版本。
- 使用同一逻辑时间位置。
- 支持并排、切换或滑动对比。
- 明确显示时间轴和时长差异。
- 旧版本评论始终绑定旧版本。

不同帧率、VFR 和时长差异通过微秒时间基准对齐。无法可靠对齐时必须明确提示，不伪造逐帧等价。

服务端像素差分视频不属于 P0。

## 17. Agent 架构

### 17.1 供应商与编排

采用自有 Agent Orchestrator 和可替换的第三方远程 Model Provider：

```text
Agent Orchestrator
├─ OpenAI Responses Provider（首个实现）
├─ Other Remote Provider Adapter（预留）
├─ Tool Registry
├─ Context Builder
├─ Approval Store
├─ Run State
└─ Audit / Trace
```

首个模型实现使用 OpenAI Responses API 的 Function Calling。首版不把业务编排完全托管给第三方 Agent 平台，也不把 OpenAI Agents SDK 作为不可替换的领域核心。

### 17.2 全局对话 Agent

- 对话线程存入应用数据库。
- 每轮请求建立当前 ActorContext。
- 查询工具只返回用户有权读取的数据。
- 写工具映射到正式应用命令。
- 写操作执行时重新鉴权。
- 高风险工具调用持久化为待审批状态。
- 审批后从持久状态恢复，不依赖浏览器连接保持。

### 17.3 分析型 Agent

- 通过 Graphile Worker 异步执行。
- 输入必须是应用中已上传且有权访问的文件或数据。
- 产出写入 `generated_artifacts` 或候选业务对象。
- 正式通告、作品发布和外部发送仍需用户确认。
- 失败和重试不得重复写入正式业务记录。

### 17.4 工具披露

不向模型一次暴露全部业务命令。

使用：

- 少量永久 Meta Tools。
- 根据当前页面、用户意图和权限加载领域 Tool Bundle。
- 低层数据库、对象存储、FFmpeg 和供应商 API 不直接暴露给模型。

### 17.5 模型数据策略

应用文件权限和向外部模型发送数据的权限是两件事。

技术实现必须支持团队级模型数据策略，例如：

- 禁止外部模型处理。
- 只允许文本。
- 只允许选中片段。
- 允许指定项目文件。

发送给模型的输入、来源和策略决策必须可审计。每次识别或 embedding 请求至少记录供应商、模型、用途、来源 revision、结果状态和维度；API Key 只保存在服务端。具体产品界面在低保真 UI 阶段设计。

第三方 API 不可用、超时或限流时，任务进入可重试失败态，不回退到服务器本地模型。更换供应商或模型后，旧结果按模型版本保留并可标记过期，重建向量不得覆盖来源资产或绕过 Actor Scope。

## 18. 实时与并发

### 18.1 SSE

SSE 用于：

- 通知。
- 后台任务进度。
- Agent Run 状态。
- 审片评论新增和状态更新。
- 通告发布和变更。

客户端写操作仍通过 REST。

### 18.2 并发编辑

P0 不采用 CRDT。

采用：

- `version` 或 `updated_at` 乐观锁。
- 自动保存携带旧版本号。
- 冲突时提示刷新、比较或另存草稿。
- 审片版本和已发布通告不可原地覆盖。

需要多人同时编辑同一富文本文档时，再独立评估 Yjs。

## 19. 通知

`packages/notifications` 定义统一端口：

- In-app。
- Email。
- 后续短信或企业聊天工具。

本地使用 Mailpit。生产邮件供应商通过 Adapter 接入，不让业务代码绑定某一家服务。

通知发送采用 Outbox + Worker：

- 业务事务成功后才发送。
- 使用幂等键避免重复发送。
- 保存发送、失败和重试状态。

## 20. 审计与 Outbox

`audit_events` 采用 Append-only 设计：

- Actor。
- 发起用户。
- Agent Run 或 Review Session。
- Command ID。
- Resource。
- Team / Project Scope。
- Request ID。
- Idempotency Key。
- 结果和变更摘要。
- 时间。

`outbox_events` 与业务修改在同一 PostgreSQL 事务提交，后台 Dispatcher 再触发：

- 通知。
- SSE。
- 媒体任务。
- Agent 分析。
- 搜索索引更新。

## 21. 搜索

P0：

- PostgreSQL Full Text Search。
- `pg_trgm` 模糊匹配。
- 团队、项目、联系人、供应商和素材元数据搜索。
- 搜索查询必须带 Actor Scope。

P1：

- 文档正文索引。
- 转写文本搜索。
- 使用第三方远程 embedding API 生成向量，在 PostgreSQL `pgvector` 中完成语义与多模态相似度检索；首版调用 OpenAI-compatible `/embeddings`。
- “本地向量检索”只表示向量数据库位于自有服务端；素材向量和每次查询向量都由第三方 API 生成，应用服务器不执行 embedding 推理。
- 向量记录绑定 `provider`、`model`、`dimensions`、来源对象与 `source_revision`，检索必须带 Actor Scope；来源变化后旧向量不再参与活动结果。

首版不部署 Elasticsearch、OpenSearch 或独立搜索服务，也不在应用服务器部署本地 embedding 或视觉模型。

## 22. 安全基线

- 所有 Bucket 私有。
- 所有上传使用不可变 Key。
- Presigned URL 设置短时有效期和最小权限。
- 上传完成后验证大小、类型和校验和。
- 文件签名和 MIME 不一致时拒绝或隔离。
- 上传文件进入安全扫描流程。
- API 和 Worker 使用非超级用户数据库角色。
- CSRF、CORS、Cookie 和 Trusted Origin 明确配置。
- 外部审片接口限流并记录审计。
- 日志不得写入密码、Token、完整 Cookie 或模型密钥。
- 团队隔离、联系人字段遮蔽和 Agent 越权必须有集成测试。

## 23. 可观测性

- Fastify/Pino 结构化日志。
- OpenTelemetry Trace 和 Metrics。
- 前端与后端异常聚合。
- Request ID 贯穿 Web、API、Worker、模型调用和 FFmpeg。
- 监控队列深度、任务耗时、失败率、媒体处理成本和模型成本。
- 监控未完成 Multipart、孤儿对象和长时间锁定的任务。

## 24. 本地开发环境

采用 Docker Compose：

```text
web
api
worker
postgres
minio
mailpit
```

要求：

- 一条命令启动依赖环境。
- Seed 包含多个团队、多个项目、不同角色和客户审片数据。
- Mock 模式不依赖 Docker 和真实外部模型。
- Real 模式显式启用对象存储、Worker、PostgreSQL `pgvector` 和第三方模型 API；模型推理能力不作为服务器本地运行时部署。
- 临时媒体目录挂载到任务专用路径并可清理。

## 25. 生产部署

P0 使用单区域容器部署：

- `web`、`api`、`worker` 为独立容器服务。
- 托管 PostgreSQL。
- S3 兼容对象存储。
- CDN。
- Worker 根据队列深度独立扩容。
- Web 与 API 通过同一站点域名或受控子域提供服务。

不要求首版使用 Kubernetes。可以从少量 VM 或托管容器平台起步，但数据库和对象存储必须有备份、生命周期和恢复方案。

## 26. UI-first 与 Mock-first

技术栈必须服务于既定工作流：

```text
需求
→ 技术栈
→ 低保真 UI
→ 高保真 UI
→ UI Contract Freeze
→ 技术 Spike
→ 功能开发
```

在功能开发前：

- `packages/contracts` 先定义页面需要的 ViewModel、Command 和状态机。
- `packages/test-fixtures` 提供固定、版本化 Mock 数据。
- MSW 模拟 API。
- Storybook 展示组件和页面状态。
- Playwright 验证完整 Mock 路径。
- 高保真阶段先建立共享 Token、基础组件、工作区壳层、动效契约和状态展示规范，再迁移业务页面。
- 首批高保真验证优先覆盖脚本协作、分镜 Layout 和审片工作台等高复杂度界面，避免只用简单 Dashboard 证明组件体系可用。

必须覆盖：

- Loading。
- Empty。
- Error。
- No permission。
- Offline / degraded。
- Uploading / processing。
- Partial success。
- Approval required。
- Agent running / failed / cancelled。
- Guest link expired / revoked。

Mock Provider 和 Real Provider 必须遵守相同契约。

## 27. 测试技术栈

- Vitest：领域、应用命令和工具函数。
- Fastify Inject：API 路由和契约。
- PostgreSQL 集成测试：权限、RLS、事务和并发。
- MSW：前端 Mock API。
- Storybook：组件和状态展示。
- Playwright：真实浏览器关键路径。
- Testcontainers 或隔离测试数据库：数据库和对象存储集成。

重点测试矩阵：

- 多团队与多项目隔离。
- 个人联系人字段共享。
- 客户 Review Scope。
- Agent 与本人权限一致。
- 高风险审批。
- 上传 Complete 幂等。
- Worker 重试幂等。
- 评论版本和时间码锚定。
- 项目归档后的作品集引用。

## 28. 暂不采用的方案

### 28.1 全部放入 Next.js

不采用。媒体任务、SSE、Agent 后台运行和独立 Worker 不应依赖 Next.js 请求生命周期。

### 28.2 微服务

不采用。会过早引入跨服务权限、事务、消息和运维复杂度。

### 28.3 Serverless-only

不采用。FFmpeg、长时间模型任务和可取消后台处理不适合只依赖短生命周期函数。

### 28.4 Redis + BullMQ

P0 不采用。Graphile Worker 足以减少一个基础设施依赖。队列规模或调度需求证明确有必要时再替换。

### 28.5 Prisma

不采用。当前业务需要频繁处理复杂 Scope、RLS、CTE 和明确 SQL，Kysely 更符合控制需求。

### 28.6 Drizzle ORM v1 Beta

不采用 Beta 作为生产地基。其稳定版成熟后可以重新评估，但没有迁移收益时不主动更换。

### 28.7 Supabase/Firebase 作为整体后端

不采用平台整体托管架构。可以使用兼容的 PostgreSQL 或对象存储服务，但身份、权限、媒体任务和 Agent 业务边界由应用掌控。

### 28.8 GraphQL

P0 不采用。REST、OpenAPI、SSE 和 Presigned Upload 已能清晰覆盖需求。

### 28.9 CRDT

P0 不采用。先使用版本化和乐观并发，真实需求出现后再增加。

## 29. UI Contract Freeze 后的技术 Spike

Spike 只验证关键能力，不提前开发完整功能。

### S1：多租户与权限

- 两团队、多个项目、个人联系人共享和客户链接。
- UI 与 Agent 调同一命令。
- 应用策略和 PostgreSQL RLS 同时阻止越权。
- 跨团队个人工作台不泄露私人数据。

### S2：大文件上传

- Uppy Multipart 直传。
- 断线重试。
- Complete 幂等。
- 未完成 Multipart 清理。
- 私有对象和短期播放 URL。

### S3：媒体 Worker

- 上传后 FFprobe。
- 生成缩略图和审阅代理。
- Worker 中断和重试。
- 超时、取消、进程树和临时目录清理。

### S4：时间码与标注

- CFR、VFR、不同帧率、旋转视频。
- 微秒锚点。
- 标准化标注坐标。
- 两版本同步播放。

### S5：客户审片

- Token Hash、密码、过期和撤销。
- Guest Scope。
- 评论和下载审计。
- 已撤销链接无法继续获取媒体 URL。

### S6：原生 Agent

- 一个查询工具。
- 一个低风险写工具。
- 一个高风险待审批工具。
- Agent 与用户本人权限一致。
- 越权拒绝。
- 幂等重试。
- 完整审计。

## 30. 技术阶段结论

ShadowProducer 的正式技术方向为：

```text
pnpm + Turborepo
TypeScript
Next.js + React
Tailwind CSS + Radix UI + Lucide
Fastify + TypeBox + OpenAPI + SSE
Better Auth
PostgreSQL + pgvector + Kysely + RLS
Graphile Worker
S3 / MinIO + Uppy Multipart
FFmpeg / FFprobe Worker
HTMLVideoElement + hls.js + React Konva
第三方多模态 / Embedding API Provider + OpenAI Responses API Provider + 自有 Agent Orchestrator
Vitest + MSW + Storybook + Playwright
Docker Compose + 容器化生产部署
```

该架构在不提前引入分布式系统复杂度的前提下，能够覆盖多团队权限、大文件媒体、客户审片、作品集和两类原生 Agent，并为下一阶段的低保真 UI 提供稳定契约边界。
