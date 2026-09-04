import type { AgentPreviewBody, ContactField } from "@shadowproducer/contracts"

type AgentRequestScope = {
  teamId: string
  projectId: string
  projectScoped: boolean
  now?: Date
  timeZone?: string
}

function calendarMoment(request: string, now: Date) {
  const explicitDate = request.match(
    /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  )
  const relativeDate = request.match(/今天|明天|后天/)
  if (!explicitDate && !relativeDate) return null

  const year = explicitDate?.[1] ? Number(explicitDate[1]) : now.getFullYear()
  const month = explicitDate ? Number(explicitDate[2]) - 1 : now.getMonth()
  const relativeOffset =
    relativeDate?.[0] === "后天" ? 2 : relativeDate?.[0] === "明天" ? 1 : 0
  const day = explicitDate ? Number(explicitDate[3]) : now.getDate() + relativeOffset
  const time = request.match(
    /(?:(上午|下午|晚上|中午|凌晨)\s*)?(\d{1,2})\s*(?:[:：点时])\s*(\d{1,2})?\s*分?/,
  )
  let hour = time ? Number(time[2]) : 0
  const minute = time?.[3] ? Number(time[3]) : 0
  if ((time?.[1] === "下午" || time?.[1] === "晚上") && hour < 12) hour += 12
  if (time?.[1] === "凌晨" && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null

  const startsAt = new Date(year, month, day, hour, minute)
  if (
    startsAt.getFullYear() !== year ||
    startsAt.getMonth() !== month ||
    (explicitDate && startsAt.getDate() !== Number(explicitDate[3]))
  ) {
    return null
  }
  return { startsAt, allDay: !time, explicitDate, relativeDate, time }
}

function requestTimeZone(scope: AgentRequestScope) {
  return (
    scope.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Shanghai"
  )
}

function localDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function requestField(request: string, labels: string[]) {
  return request
    .match(
      new RegExp(`(?:^|[；;])\\s*(?:${labels.join("|")})\\s*[：:]\\s*([^；;]+)`),
    )?.[1]
    ?.trim()
}

function requestTailField(request: string, labels: string[]) {
  return request
    .match(
      new RegExp(`(?:^|[；;])\\s*(?:${labels.join("|")})\\s*[：:]\\s*([\\s\\S]+)$`),
    )?.[1]
    ?.trim()
}

function requestIdList(request: string, labels: string[]) {
  const value = requestField(request, labels)
  if (value === undefined) return undefined
  if (/^(?:清空|无|取消)$/.test(value)) return []
  const ids = [
    ...new Set(
      value
        .split(/[、，,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
  return ids.length <= 100 && ids.every((item) => item.length <= 100) ? ids : null
}

function scriptVersionCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (!scope.projectScoped) return null
  const create =
    /(?:创建|新建|另存).{0,12}(?:脚本|剧本)?版本|(?:脚本|剧本)版本.{0,12}(?:创建|新建|另存)/.test(
      request,
    )
  const update =
    /(?:更新|修改|保存).{0,12}(?:脚本|剧本)(?:正文|内容|协作稿)?|(?:脚本|剧本)(?:正文|内容|协作稿)?.{0,12}(?:更新|修改|保存)/.test(
      request,
    )
  if (!create && !update) return null

  const documentId = requestField(request, ["文档ID", "脚本文档ID"])
  const documentTitle =
    requestField(request, ["文档", "脚本文档"]) ??
    request.match(/(?:脚本|剧本|文档)\s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim()
  const content = requestTailField(request, ["正文", "内容"])
  if (!content || content.length > 200_000) return null

  if (create) {
    const meta = requestField(request, ["版本说明", "版本名"])
    if (!meta || meta.length > 120) return null
    return {
      action: "create_script_version",
      teamId: scope.teamId,
      projectId: scope.projectId,
      documentId,
      documentTitle,
      content,
      meta,
    }
  }
  return {
    action: "update_script_version",
    teamId: scope.teamId,
    projectId: scope.projectId,
    documentId,
    documentTitle,
    content,
  }
}

function scriptBreakdownAnalysisCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !scope.projectScoped ||
    !/(?:分析|拆解|提取).{0,20}(?:脚本|剧本)|(?:脚本|剧本).{0,20}(?:分析|拆解|提取)/.test(
      request,
    )
  ) {
    return null
  }
  return {
    action: "create_script_breakdown_analysis",
    teamId: scope.teamId,
    projectId: scope.projectId,
    documentId: requestField(request, ["文档ID", "脚本文档ID"]),
    documentTitle:
      requestField(request, ["文档", "脚本文档"]) ??
      request.match(/(?:脚本|剧本|文档)\s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim(),
    versionId: requestField(request, ["版本ID", "脚本版本ID"]),
  }
}

function mediaAnalysisCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  const quotedTarget = request
    .match(/对\s*[“"「]([^”"」]+)[”"」].{0,12}(?:镜头)?分析/)?.[1]
    ?.trim()
  if (
    !quotedTarget &&
    !/(?:分析|解析|检测).{0,20}(?:素材|视频)|(?:素材|视频).{0,20}(?:镜头分析|镜头检测|分析|解析)/.test(
      request,
    )
  ) {
    return null
  }
  const assetId = requestField(request, ["素材ID", "视频素材ID"])
  const assetName =
    requestField(request, ["素材", "素材名称", "视频素材"]) ??
    request.match(/(?:素材|视频)\s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim() ??
    quotedTarget
  if (!assetId && !assetName) return null
  return {
    action: "create_media_analysis",
    teamId: scope.teamId,
    projectId: scope.projectScoped ? scope.projectId : undefined,
    assetId,
    assetName,
  }
}

function taskUpdateCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  const taskId = requestField(request, ["任务ID"])
  const taskTitle = request.match(/(?:任务|待办)s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim()
  if (!taskId && !taskTitle) return null

  const title = requestField(request, ["新标题", "新名称"])
  const statusValue =
    requestField(request, ["状态"]) ??
    request.match(
      /(?:状态s*(?:改为|调整为|更新为|设为)|标记为)s*(待开始|进行中|等待他人|已完成)/,
    )?.[1]
  if (
    statusValue !== undefined &&
    !["待开始", "进行中", "等待他人", "已完成"].includes(statusValue)
  ) {
    return null
  }
  const status = statusValue as "待开始" | "进行中" | "等待他人" | "已完成" | undefined

  const dueDateValue =
    requestField(request, ["截止日期", "截止时间"]) ??
    request.match(
      /截止(?:日期|时间)?\s*(?:改为|调整为|更新为|设为)\s*((?:\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*日|今天|明天|后天|取消|清空|无)/,
    )?.[1]
  let dueDate: string | null | undefined
  if (dueDateValue && /^(取消|清空|无)$/.test(dueDateValue)) {
    dueDate = null
  } else if (dueDateValue) {
    const due = calendarMoment(dueDateValue, scope.now ?? new Date())?.startsAt
    if (!due) return null
    dueDate = [
      due.getFullYear(),
      String(due.getMonth() + 1).padStart(2, "0"),
      String(due.getDate()).padStart(2, "0"),
    ].join("-")
  }
  const target = requestField(request, ["目标视图", "目标"])
  if ([title, dueDate, status, target].every((value) => value === undefined)) return null

  return {
    action: "update_task",
    teamId: scope.teamId,
    projectId: scope.projectScoped ? scope.projectId : undefined,
    taskId,
    taskTitle,
    title,
    dueDate,
    status,
    target,
  }
}

function breakdownUpdateCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !scope.projectScoped ||
    !/(修改|更新|调整|改).{0,30}(制片拆解|拆解项|拆解候选)|(制片拆解|拆解项|拆解候选).{0,30}(修改|更新|调整|改)/.test(
      request,
    )
  ) {
    return null
  }

  const itemId = requestField(request, ["拆解项ID", "条目ID"])
  const itemName =
    requestField(request, ["拆解项名称", "候选内容名称"]) ??
    request.match(/(?:制片拆解项|拆解项|拆解候选)\s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim()
  if (!itemId && !itemName) return null

  const stateValue = requestField(request, ["状态"])
  if (
    stateValue !== undefined &&
    !["待确认", "待安排", "待采购或租赁", "已联系", "已确认", "已完成"].includes(
      stateValue,
    )
  ) {
    return null
  }
  const state = stateValue as
    | "待确认"
    | "待安排"
    | "待采购或租赁"
    | "已联系"
    | "已确认"
    | "已完成"
    | undefined
  const item = requestField(request, ["新候选内容", "新内容"])
  const requirementType = requestField(request, ["需求类型", "要求类型"])
  const specification = requestField(request, ["规格说明", "规格"])
  const quantity = requestField(request, ["数量"])
  const preparation = requestField(request, ["准备要求", "准备"])
  const department = requestField(request, ["负责部门", "部门"])
  const supplierIds = requestIdList(request, ["供应商ID"])
  const taskIds = requestIdList(request, ["关联任务ID", "任务ID"])
  const teamContactIds = requestIdList(request, ["团队联系人ID"])
  const sharedContactIds = requestIdList(request, ["共享联系人ID"])
  const shootingDayIds = requestIdList(request, ["拍摄日ID"])
  const callSheetIds = requestIdList(request, ["通告表ID", "通告单ID"])
  if (
    supplierIds === null ||
    taskIds === null ||
    teamContactIds === null ||
    sharedContactIds === null ||
    shootingDayIds === null ||
    callSheetIds === null
  ) {
    return null
  }
  const responsibleValue = requestField(request, ["负责人账号ID", "负责人ID"])
  const responsibleAccountId =
    responsibleValue === undefined
      ? undefined
      : /^(?:清空|无|取消)$/.test(responsibleValue)
        ? null
        : responsibleValue.length <= 100
          ? responsibleValue
          : undefined
  if (responsibleValue !== undefined && responsibleAccountId === undefined) return null
  const contactRefs =
    teamContactIds !== undefined || sharedContactIds !== undefined
      ? [
          ...(teamContactIds ?? []).map((contactId) => ({
            contactId,
            source: "team" as const,
          })),
          ...(sharedContactIds ?? []).map((contactId) => ({
            contactId,
            source: "member-shared" as const,
          })),
        ]
      : undefined
  if (
    [
      item,
      requirementType,
      specification,
      quantity,
      preparation,
      department,
      state,
      supplierIds,
      responsibleAccountId,
      taskIds,
      contactRefs,
      shootingDayIds,
      callSheetIds,
    ].every((value) => value === undefined)
  ) {
    return null
  }

  return {
    action: "update_breakdown",
    teamId: scope.teamId,
    projectId: scope.projectId,
    itemId,
    itemName,
    item,
    requirementType,
    specification,
    quantity,
    preparation,
    department,
    state,
    supplierIds,
    responsibleAccountId,
    taskIds,
    contactRefs,
    shootingDayIds,
    callSheetIds,
  }
}

function executionResources(request: string) {
  return (
    [
      ["cast", "演员"],
      ["crew", "工作人员"],
      ["location", "场地"],
      ["equipment", "设备"],
    ] as const
  ).flatMap(([type, label]) =>
    (requestField(request, [label]) ?? "")
      .split(/[、，,]/)
      .map((resourceName) => resourceName.trim())
      .filter(Boolean)
      .map((resourceName) => ({
        id: resourceName.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "-"),
        type,
        name: resourceName,
      })),
  )
}

function executionStageCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (!/(创建|新增|添加).{0,20}(执行阶段|执行计划|拍摄阶段)/.test(request)) {
    return null
  }
  const name =
    request
      .match(/(?:执行阶段|执行计划|拍摄阶段)\s*[“"「]([^”"」]+)[”"」]/)?.[1]
      ?.trim() ??
    request.match(/(?:执行阶段|执行计划|拍摄阶段)\s*[：:]\s*([^；;]+)/)?.[1]?.trim()
  const starts = calendarMoment(
    requestField(request, ["开始时间", "开始"]) ?? "",
    scope.now ?? new Date(),
  )?.startsAt
  const ends = calendarMoment(
    requestField(request, ["结束时间", "结束"]) ?? "",
    scope.now ?? new Date(),
  )?.startsAt
  const owner = requestField(request, ["负责人"])
  if (!name || !starts || !ends || starts >= ends || !owner) return null

  const progressValue = requestField(request, ["进度"])
  const progress =
    progressValue === undefined ? 0 : Number(progressValue.replace(/%$/, ""))
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) return null
  const stateValue = requestField(request, ["状态"])
  const state = ["未开始", "进行中", "已完成", "已暂停"].includes(stateValue ?? "")
    ? (stateValue as "未开始" | "进行中" | "已完成" | "已暂停")
    : "未开始"
  const resources = executionResources(request)

  return {
    action: "create_execution_stage",
    teamId: scope.teamId,
    projectId: scope.projectId,
    name,
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    originalTimezone:
      requestField(request, ["原始时区", "时区"]) ?? requestTimeZone(scope),
    progress,
    owner,
    state,
    note: requestField(request, ["备注"]),
    resources,
  }
}

function executionStageUpdateCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !/(修改|更新|调整|改).{0,30}(执行阶段|执行计划|拍摄阶段)|(执行阶段|执行计划|拍摄阶段).{0,30}(修改|更新|调整|改)/.test(
      request,
    )
  ) {
    return null
  }
  const stageId = requestField(request, ["阶段ID", "计划ID"])
  const stageName =
    request
      .match(/(?:执行阶段|执行计划|拍摄阶段)\s*[“"「]([^”"」]+)[”"」]/)?.[1]
      ?.trim() ??
    request.match(/(?:执行阶段|执行计划|拍摄阶段)\s*[：:]\s*([^；;]+)/)?.[1]?.trim()
  if (!stageId && !stageName) return null

  const startsValue = requestField(request, ["开始时间", "开始"])
  const endsValue = requestField(request, ["结束时间", "结束"])
  const starts = startsValue
    ? calendarMoment(startsValue, scope.now ?? new Date())?.startsAt
    : undefined
  const ends = endsValue
    ? calendarMoment(endsValue, scope.now ?? new Date())?.startsAt
    : undefined
  if (
    (startsValue && !starts) ||
    (endsValue && !ends) ||
    (starts && ends && starts >= ends)
  ) {
    return null
  }

  const progressValue = requestField(request, ["进度"])
  const progress = progressValue ? Number(progressValue.replace(/%$/, "")) : undefined
  if (
    progress !== undefined &&
    (!Number.isInteger(progress) || progress < 0 || progress > 100)
  ) {
    return null
  }
  const stateValue = requestField(request, ["状态"])
  if (
    stateValue !== undefined &&
    !["未开始", "进行中", "已完成", "已暂停"].includes(stateValue)
  ) {
    return null
  }
  const state = stateValue as "未开始" | "进行中" | "已完成" | "已暂停" | undefined
  const hasResourceField = ["演员", "工作人员", "场地", "设备"].some(
    (label) => requestField(request, [label]) !== undefined,
  )
  const resources = hasResourceField ? executionResources(request) : undefined
  const name = requestField(request, ["新名称"])
  const owner = requestField(request, ["负责人"])
  const note = requestField(request, ["备注"])
  const timezoneValue = requestField(request, ["原始时区", "时区"])
  const originalTimezone =
    timezoneValue ?? (starts || ends ? requestTimeZone(scope) : undefined)
  if (
    [name, starts, ends, originalTimezone, progress, owner, state, note, resources].every(
      (value) => value === undefined,
    )
  ) {
    return null
  }

  return {
    action: "update_execution_stage",
    teamId: scope.teamId,
    projectId: scope.projectId,
    stageId,
    stageName,
    name,
    startsAt: starts?.toISOString(),
    endsAt: ends?.toISOString(),
    originalTimezone,
    progress,
    owner,
    state,
    note,
    resources,
  }
}

function shootingDayCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (!scope.projectScoped || !/(创建|新增|添加).{0,20}(拍摄日|拍摄日期)/.test(request)) {
    return null
  }
  const dateValue = requestField(request, ["拍摄日期", "日期"])
  const date = dateValue
    ? calendarMoment(dateValue, scope.now ?? new Date())?.startsAt
    : undefined
  const dayNumberValue = requestField(request, ["拍摄日序", "日序", "第几天"])
  const dayNumber = dayNumberValue ? Number(dayNumberValue.replace(/^第|天$/g, "")) : NaN
  const title =
    requestField(request, ["标题", "名称"]) ??
    request.match(/拍摄日\s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim()
  if (!date || !Number.isInteger(dayNumber) || dayNumber < 1 || !title) return null
  return {
    action: "create_shooting_day",
    teamId: scope.teamId,
    projectId: scope.projectId,
    shootDate: localDate(date),
    dayNumber,
    title,
    originalTimezone:
      requestField(request, ["原始时区", "时区"]) ?? requestTimeZone(scope),
  }
}

function shootingDayUpdateCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !scope.projectScoped ||
    !/(修改|更新|调整|改).{0,30}(拍摄日|拍摄日期)|(拍摄日|拍摄日期).{0,30}(修改|更新|调整|改)/.test(
      request,
    )
  ) {
    return null
  }
  const shootingDayId = requestField(request, ["拍摄日ID"])
  const shootingDayTitle =
    requestField(request, ["目标拍摄日", "原拍摄日标题"]) ??
    request.match(/拍摄日\s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim()
  if (!shootingDayId && !shootingDayTitle) return null

  const dateValue = requestField(request, ["新日期", "拍摄日期", "日期"])
  const date = dateValue
    ? calendarMoment(dateValue, scope.now ?? new Date())?.startsAt
    : undefined
  if (dateValue && !date) return null
  const dayNumberValue = requestField(request, ["新拍摄日序", "新日序", "日序"])
  const dayNumber = dayNumberValue
    ? Number(dayNumberValue.replace(/^第|天$/g, ""))
    : undefined
  if (dayNumber !== undefined && (!Number.isInteger(dayNumber) || dayNumber < 1)) {
    return null
  }
  const statusValue = requestField(request, ["状态"])
  if (
    statusValue !== undefined &&
    !["草稿", "已确认", "拍摄中", "已完成", "已取消"].includes(statusValue)
  ) {
    return null
  }
  const status = statusValue as
    | "草稿"
    | "已确认"
    | "拍摄中"
    | "已完成"
    | "已取消"
    | undefined
  const title = requestField(request, ["新标题", "新名称"])
  const originalTimezone = requestField(request, ["原始时区", "时区"])
  if (
    [date, dayNumber, title, status, originalTimezone].every(
      (value) => value === undefined,
    )
  ) {
    return null
  }
  return {
    action: "update_shooting_day",
    teamId: scope.teamId,
    projectId: scope.projectId,
    shootingDayId,
    shootingDayTitle,
    shootDate: date ? localDate(date) : undefined,
    dayNumber,
    title,
    status,
    originalTimezone,
  }
}

function callSheetUpdateCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !scope.projectScoped ||
    !/(修改|更新|调整|改|保存).{0,30}(通告表|通告单)|(通告表|通告单).{0,30}(修改|更新|调整|改|保存)/.test(
      request,
    )
  ) {
    return null
  }
  const callSheetId = requestField(request, ["通告表ID", "通告单ID"])
  const callSheetTitle =
    requestField(request, ["目标通告表", "原通告表标题"]) ??
    request.match(/(?:通告表|通告单)\s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim()
  if (!callSheetId && !callSheetTitle) return null

  const statusValue = requestField(request, ["状态"])
  if (statusValue !== undefined && !["草稿", "待确认"].includes(statusValue)) return null
  const command = {
    action: "update_call_sheet" as const,
    teamId: scope.teamId,
    projectId: scope.projectId,
    callSheetId,
    callSheetTitle,
    date: requestField(request, ["新日期", "日期"]),
    day: requestField(request, ["新日序", "日序", "拍摄日"]),
    title: requestField(request, ["新标题", "新名称"]),
    status: statusValue as "草稿" | "待确认" | undefined,
    crewCall: requestField(request, ["集合", "集合时间"]),
    firstShot: requestField(request, ["开拍", "开拍时间"]),
    wrap: requestField(request, ["收工", "预计收工"]),
    weather: requestField(request, ["天气"]),
    sunrise: requestField(request, ["日出"]),
    sunset: requestField(request, ["日落"]),
    basecamp: requestField(request, ["大本营", "基地"]),
    location: requestField(request, ["地点", "场地"]),
    hospital: requestField(request, ["医院", "最近医院"]),
    changeSummary: requestField(request, ["变更说明", "修改说明"]),
  }
  return Object.entries(command).some(
    ([key, value]) =>
      !["action", "teamId", "projectId", "callSheetId", "callSheetTitle"].includes(key) &&
      key !== "changeSummary" &&
      value !== undefined,
  )
    ? command
    : null
}

function calendarCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !/(创建|新增|添加|安排|记录).{0,24}(日程|行程|日历)|(日程|行程|日历).{0,24}(创建|新增|添加|安排|记录)/.test(
      request,
    )
  ) {
    return null
  }

  const moment = calendarMoment(request, scope.now ?? new Date())
  if (!moment) return null

  let title = request
    .replace(/^(请帮我|帮我|请)?\s*/, "")
    .replace(/(创建|新增|添加|安排|记录)(一个|一条|一下)?\s*(日程|行程|日历事项)?/, "")
  for (const token of [
    moment.explicitDate?.[0],
    moment.relativeDate?.[0],
    moment.time?.[0],
  ]) {
    if (token) title = title.replace(token, "")
  }
  title = title
    .replace(/^[\s的]*(日程|行程|日历事项)\s*[：:]?/, "")
    .replace(/(项目|团队)可见/g, "")
    .replace(/(^|\s)(日期|时间)\s*[：:]?/g, " ")
    .replace(/^[\s的在于为：:，,]+|[\s。.,，]+$/g, "")

  return {
    action: "create_calendar_event",
    teamId: scope.teamId,
    projectId: scope.projectScoped ? scope.projectId : undefined,
    title: title || "Agent 新建日程",
    startsAt: moment.startsAt.toISOString(),
    timezone: requestTimeZone(scope),
    allDay: moment.allDay,
    visibility: /项目可见/.test(request)
      ? "project"
      : /团队可见/.test(request)
        ? "team"
        : "private",
  }
}

function calendarUpdateCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !/(修改|更新|调整|改).{0,30}(日程|行程|日历)|(日程|行程|日历).{0,30}(修改|更新|调整|改)/.test(
      request,
    )
  ) {
    return null
  }
  const quotedTitle = request.match(/(?:日程|行程|日历事项)\s*[“"「]([^”"」]+)[”"」]/)
  const plainTitle = request.match(
    /(?:日程|行程|日历事项)\s*[：:]?\s*(.+?)\s*(?:改到|调整到|更新到|时间改为)/,
  )
  const eventTitle = (quotedTitle?.[1] ?? plainTitle?.[1])?.trim()
  const moment = calendarMoment(request, scope.now ?? new Date())
  if (!eventTitle || !moment) return null

  return {
    action: "update_calendar_event",
    teamId: scope.teamId,
    projectId: scope.projectScoped ? scope.projectId : undefined,
    eventTitle,
    startsAt: moment.startsAt.toISOString(),
    timezone: requestTimeZone(scope),
    allDay: moment.allDay,
  }
}

function auditLogCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !/(查看|列出|查询|检索|汇总|有哪些).{0,20}(审计|操作记录|变更记录)|(审计|操作记录|变更记录).{0,20}(查看|列出|查询|检索|汇总|哪些)/.test(
      request,
    )
  ) {
    return null
  }
  const pageSizeMatch = request.match(/(?:最近|前)?\s*(\d{1,3})\s*条/)
  const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : undefined
  if (pageSize !== undefined && (pageSize < 1 || pageSize > 100)) return null
  const teamScoped = /(团队范围|当前团队|团队审计)/.test(request)
  return {
    action: "list_audit_logs",
    teamId: scope.teamId,
    projectId: teamScoped ? undefined : scope.projectScoped ? scope.projectId : undefined,
    scope: teamScoped ? "team" : undefined,
    auditAction: requestField(request, ["动作", "操作类型"]),
    actor: requestField(request, ["操作者", "操作人"]),
    pageSize,
  }
}

function reviewFileCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (
    !scope.projectScoped ||
    /审片(?:分享)?链接/.test(request) ||
    !/(?:创建|新建|生成).{0,20}(?:审片版本|审片文件)|(?:审片版本|审片文件).{0,20}(?:创建|新建|生成)/.test(
      request,
    )
  ) {
    return null
  }
  const assetId = requestField(request, ["素材ID", "资源ID"])
  const name = requestField(request, ["名称", "文件名", "审片名称"])
  const version = requestField(request, ["版本", "版本号"])
  if (!assetId || !name || !version) return null
  return {
    action: "create_review_file",
    teamId: scope.teamId,
    projectId: scope.projectId,
    assetId,
    name,
    version,
    duration: requestField(request, ["时长"]),
  }
}

function personalContactSelector(request: string) {
  return {
    contactId: requestField(request, ["联系人ID", "个人联系人ID"]),
    contactName:
      requestField(request, ["联系人", "个人联系人", "原姓名"]) ??
      request.match(/(?:个人)?联系人[“"「]([^”"」]+)[”"」]/)?.[1]?.trim(),
  }
}

function personalContactShareFields(request: string) {
  const value = requestField(request, ["共享字段", "字段"])
  if (!value) return null
  const aliases: Record<string, ContactField> = {
    姓名: "name",
    name: "name",
    职位: "role",
    角色: "role",
    role: "role",
    公司: "company",
    机构: "company",
    company: "company",
    电话: "phone",
    手机: "phone",
    phone: "phone",
    邮箱: "email",
    邮件: "email",
    email: "email",
  }
  const fields = [
    ...new Set(
      value
        .split(/[、，,\s]+/)
        .map((item) => aliases[item.toLocaleLowerCase()])
        .filter((item): item is ContactField => Boolean(item)),
    ),
  ]
  return fields.length ? fields : null
}

function personalContactCommand(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  if (!/(?:个人联系人|个人通讯录)/.test(request)) return null
  const selector = personalContactSelector(request)
  if (/(?:恢复|还原)/.test(request)) {
    if (!selector.contactId && !selector.contactName) return null
    return { action: "restore_personal_contact", teamId: scope.teamId, ...selector }
  }
  if (/(?:取消共享|撤销共享|停止共享)/.test(request)) {
    if (!selector.contactId && !selector.contactName) return null
    return { action: "unshare_personal_contact", teamId: scope.teamId, ...selector }
  }
  if (/共享/.test(request)) {
    const fields = personalContactShareFields(request)
    if ((!selector.contactId && !selector.contactName) || !fields) return null
    return {
      action: "share_personal_contact",
      teamId: scope.teamId,
      ...selector,
      fields,
      allowProjectLink: !/(?:禁止|不允许|不可).{0,6}项目关联/.test(request),
    }
  }
  if (/(?:删除|移入回收站)/.test(request)) {
    if (!selector.contactId && !selector.contactName) return null
    return { action: "delete_personal_contact", teamId: scope.teamId, ...selector }
  }
  if (/(?:更新|修改|编辑)/.test(request)) {
    if (!selector.contactId && !selector.contactName) return null
    const command = {
      action: "update_personal_contact" as const,
      teamId: scope.teamId,
      ...selector,
      name: requestField(request, ["新姓名"]),
      role: requestField(request, ["职位", "角色"]),
      company: requestField(request, ["公司", "机构"]),
      phone: requestField(request, ["电话", "手机"]),
      email: requestField(request, ["邮箱", "邮件"]),
    }
    return [
      command.name,
      command.role,
      command.company,
      command.phone,
      command.email,
    ].some((value) => value !== undefined)
      ? command
      : null
  }
  if (/(?:创建|新建|添加)/.test(request)) {
    const name = requestField(request, ["姓名", "名称"])
    if (!name) return null
    return {
      action: "create_personal_contact",
      teamId: scope.teamId,
      name,
      role: requestField(request, ["职位", "角色"]),
      company: requestField(request, ["公司", "机构"]),
      phone: requestField(request, ["电话", "手机"]),
      email: requestField(request, ["邮箱", "邮件"]),
    }
  }
  if (/(?:查看|列出|查询|有哪些)/.test(request)) {
    return { action: "list_personal_contacts", teamId: scope.teamId }
  }
  return null
}

export function commandFromAgentRequest(
  request: string,
  scope: AgentRequestScope,
): AgentPreviewBody | null {
  const auditLogs = auditLogCommand(request, scope)
  if (auditLogs) return auditLogs

  const personalContact = personalContactCommand(request, scope)
  if (personalContact) return personalContact

  if (/(?:创建|新建|添加).{0,20}团队联系人/.test(request)) {
    const name = requestField(request, ["姓名", "名称"])
    const projectIds = requestIdList(request, ["项目ID"])
    if (!name || projectIds === null) return null
    return {
      action: "create_team_contact",
      teamId: scope.teamId,
      name,
      role: requestField(request, ["职位", "角色"]),
      company: requestField(request, ["公司", "机构"]),
      phone: requestField(request, ["电话", "手机"]),
      email: requestField(request, ["邮箱", "邮件"]),
      projectIds: projectIds ?? (scope.projectScoped ? [scope.projectId] : undefined),
    }
  }

  if (/(?:创建|新建|添加).{0,20}(?:团队)?供应商/.test(request)) {
    const name = requestField(request, ["名称", "供应商名称"])
    const projectIds = requestIdList(request, ["项目ID"])
    const teamContactIds = requestIdList(request, ["团队联系人ID"])
    const sharedContactIds = requestIdList(request, ["共享联系人ID"])
    if (
      !name ||
      projectIds === null ||
      teamContactIds === null ||
      sharedContactIds === null
    ) {
      return null
    }
    const contactRefs = [
      ...(teamContactIds ?? []).map((contactId) => ({
        contactId,
        source: "team" as const,
      })),
      ...(sharedContactIds ?? []).map((contactId) => ({
        contactId,
        source: "member-shared" as const,
      })),
    ]
    return {
      action: "create_team_supplier",
      teamId: scope.teamId,
      name,
      category: requestField(request, ["类别", "分类"]),
      services: requestField(request, ["服务", "服务内容"]),
      phone: requestField(request, ["电话", "手机"]),
      email: requestField(request, ["邮箱", "邮件"]),
      address: requestField(request, ["地址"]),
      contactRefs: contactRefs.length ? contactRefs : undefined,
      projectIds: projectIds ?? (scope.projectScoped ? [scope.projectId] : undefined),
    }
  }

  if (
    /(?:语义|多模态|画面内容|画面语义)/.test(request) &&
    /(?:搜索|检索|查找)/.test(request) &&
    /(?:资源库|资源|素材|视频|画面)/.test(request)
  ) {
    const query =
      requestField(request, ["查询", "关键词", "搜索词", "检索内容"]) ??
      request.match(/[“"「]([^”"」]+)[”"」]/)?.[1]?.trim() ??
      request
        .match(/(?:搜索|检索|查找)(?:素材|资源|视频|画面)?\s*[：:]?\s*(.+)$/)?.[1]
        ?.trim()
    const limitMatch = request.match(/(?:前|最多|返回)?\s*(\d{1,3})\s*条/)
    const limit = limitMatch ? Number(limitMatch[1]) : undefined
    if (
      !query ||
      query.length > 200 ||
      (limit !== undefined && (limit < 1 || limit > 100))
    ) {
      return null
    }
    return {
      action: "semantic_search_assets",
      teamId: scope.teamId,
      projectId: scope.projectScoped ? scope.projectId : undefined,
      query,
      limit,
    }
  }

  if (
    /(?:查看|列出|查询|搜索|查找|有哪些).{0,20}(?:团队资源|项目资源|资源库|联系人|供应商|素材)|(?:团队资源|项目资源|资源库|联系人|供应商|素材).{0,20}(?:查看|列出|查询|搜索|查找|哪些)/.test(
      request,
    )
  ) {
    return {
      action: "list_team_resources",
      teamId: scope.teamId,
      projectId: scope.projectScoped ? scope.projectId : undefined,
      keyword: requestField(request, ["关键词", "搜索词"]),
    }
  }

  const breakdownUpdate = breakdownUpdateCommand(request, scope)
  if (breakdownUpdate) return breakdownUpdate

  if (
    /(?:确认|接受|通过).{0,20}(?:制片拆解|拆解项|拆解候选)|(?:制片拆解|拆解项|拆解候选).{0,20}(?:确认|接受|通过)/.test(
      request,
    )
  ) {
    const category =
      requestField(request, ["分类", "类别"]) ??
      request.match(/(?:制片拆解|拆解)(?:分类|类别)?\s*[“"「]([^”"」]+)[”"」]/)?.[1]
    if (!scope.projectScoped || !category) return null
    const itemIds = [
      ...new Set(
        (requestField(request, ["拆解项ID", "条目ID"]) ?? "")
          .split(/[、，,\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ]
    return {
      action: "confirm_breakdown",
      teamId: scope.teamId,
      projectId: scope.projectId,
      category: category.trim(),
      itemIds: itemIds.length ? itemIds : undefined,
    }
  }

  if (
    scope.projectScoped &&
    /(?:查看|列出|查询|汇总|展示).{0,20}(?:执行计划|项目排期|拍摄计划|拍摄日)|(?:执行计划|项目排期|拍摄计划|拍摄日).{0,20}(?:查看|列出|查询|汇总|展示)/.test(
      request,
    )
  ) {
    return {
      action: "list_execution_schedule",
      teamId: scope.teamId,
      projectId: scope.projectId,
    }
  }

  const executionStageUpdate = executionStageUpdateCommand(request, scope)
  if (executionStageUpdate) return executionStageUpdate

  const executionStage = executionStageCommand(request, scope)
  if (executionStage) return executionStage

  const shootingDayUpdate = shootingDayUpdateCommand(request, scope)
  if (shootingDayUpdate) return shootingDayUpdate

  const shootingDay = shootingDayCommand(request, scope)
  if (shootingDay) return shootingDay

  const mediaAnalysis = mediaAnalysisCommand(request, scope)
  if (mediaAnalysis) return mediaAnalysis

  const scriptAnalysis = scriptBreakdownAnalysisCommand(request, scope)
  if (scriptAnalysis) return scriptAnalysis

  const scriptVersion = scriptVersionCommand(request, scope)
  if (scriptVersion) return scriptVersion

  const callSheetUpdate = callSheetUpdateCommand(request, scope)
  if (callSheetUpdate) return callSheetUpdate

  const reviewFile = reviewFileCommand(request, scope)
  if (reviewFile) return reviewFile

  if (
    scope.projectScoped &&
    /(?:查看|列出|查询|整理|汇总|对比|对应)/.test(request) &&
    /(?:审片|版本).{0,16}(?:反馈|意见|评论)|(?:反馈|意见|评论).{0,16}(?:审片|版本)/.test(
      request,
    )
  ) {
    const primaryFileId = requestField(request, ["主版本ID", "主文件ID", "审片文件ID"])
    const primaryFileName = requestField(request, [
      "主版本",
      "主文件",
      "审片文件",
      "审片视频",
    ])
    const compareFileId = requestField(request, [
      "对比版本ID",
      "比较版本ID",
      "对比文件ID",
    ])
    const compareFileName = requestField(request, ["对比版本", "比较版本", "对比文件"])
    if ((compareFileId || compareFileName) && !(primaryFileId || primaryFileName))
      return null
    return {
      action: "list_review_feedback",
      teamId: scope.teamId,
      projectId: scope.projectId,
      primaryFileId,
      primaryFileName,
      compareFileId,
      compareFileName,
    }
  }

  if (
    /(修改|更新|调整|改|标记).{0,30}(任务|待办)|(任务|待办).{0,30}(修改|更新|调整|改|标记)/.test(
      request,
    )
  ) {
    return taskUpdateCommand(request, scope)
  }

  if (
    /(?:生成|创建|新建).{0,20}(?:客户)?审片(?:分享)?链接|(?:客户)?审片(?:分享)?链接.{0,20}(?:生成|创建|新建)/.test(
      request,
    )
  ) {
    if (!scope.projectScoped) return null
    return {
      action: "create_review_link",
      teamId: scope.teamId,
      projectId: scope.projectId,
      fileName: request.match(/审片(?:文件|视频)?\s*[“"「]([^”"」]+)[”"」]/)?.[1],
    }
  }

  if (
    /(?:批准|通过|接受).{0,20}(?:审片文件|审片视频|审片版本|视频版本)|(?:审片文件|审片视频|审片版本|视频版本).{0,20}(?:批准|通过|接受)/.test(
      request,
    )
  ) {
    if (!scope.projectScoped) return null
    return {
      action: "approve_review_file",
      teamId: scope.teamId,
      projectId: scope.projectId,
      fileName: request.match(/审片(?:文件|视频|版本)?\s*[“"「]([^”"」]+)[”"」]/)?.[1],
    }
  }

  if (
    /(审片|视频|版本).{0,30}(意见|评论|批注)/.test(request) &&
    /(解决|完成|恢复|重新打开|重开)/.test(request)
  ) {
    const fileName = request.match(/审片(?:文件|视频)?\s*[“"「]([^”"」]+)[”"」]/)?.[1]
    const timecode = request.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?\b/)?.[0]
    return {
      action: "update_review_comment",
      teamId: scope.teamId,
      projectId: scope.projectId,
      fileName,
      timecode,
      state: /(恢复|重新打开|重开)/.test(request) ? "open" : "resolved",
    }
  }
  if (
    /(审片|视频|版本).{0,30}(意见|评论|批注)/.test(request) &&
    /(创建|新增|添加|记录)/.test(request)
  ) {
    const timecode = request.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?\b/)?.[0]
    if (!timecode) return null
    const fileName = request.match(/审片(?:文件|视频)?\s*[“"「]([^”"」]+)[”"」]/)?.[1]
    const text = request
      .slice(request.indexOf(timecode) + timecode.length)
      .replace(/^[\s：:，,、-]+/, "")
      .replace(/[。.]$/, "")
      .trim()
    if (!text) return null
    return {
      action: "create_review_comment",
      teamId: scope.teamId,
      projectId: scope.projectId,
      fileName,
      timecode,
      text,
    }
  }
  if (
    /作品集/.test(request) &&
    /(添加|加入|放入|收录)/.test(request) &&
    /(成片|视频|内容|版本)/.test(request)
  ) {
    const quoted = [...request.matchAll(/[“"「]([^”"」]+)[”"」]/g)].map(
      (match) => match[1],
    )
    const caption = request.match(/(?:说明|文案|描述)\s*[：:]\s*(.+)$/)?.[1]?.trim()
    return {
      action: "add_portfolio_content",
      teamId: scope.teamId,
      fileName: quoted[0],
      portfolioTitle: quoted[1],
      caption,
      featured: /(封面|主视觉|精选|置顶)/.test(request),
    }
  }
  if (
    /(通告表|通告单|通告)/.test(request) &&
    /(发布|正式)/.test(request) &&
    !/(修改|更新|调整|改|保存)/.test(request)
  ) {
    const title = request
      .replace(/^(请帮我|帮我|请)?\s*(正式)?\s*(发布|发出)\s*/, "")
      .replace(/[。.]$/, "")
      .trim()
    return {
      action: "publish_call_sheet",
      teamId: scope.teamId,
      projectId: scope.projectId,
      title: title || undefined,
    }
  }
  if (/(创建|新增|添加).{0,20}(通告表|通告单|通告)/.test(request)) {
    const date = request.match(/\d{1,2}\s*月\s*\d{1,2}\s*日/)?.[0]
    const title = request
      .replace(/^(请帮我|帮我|请)?\s*(创建|新增|添加)(一个|一份|一张)?\s*/, "")
      .replace(date ?? "", "")
      .replace(/^(的)?\s*(通告表|通告单)\s*/, "")
      .replace(/[，,。.]$/, "")
      .trim()
    const today = scope.now ?? new Date()
    return {
      action: "create_call_sheet",
      teamId: scope.teamId,
      projectId: scope.projectId,
      date:
        date?.replace(/\s+/g, " ") ?? `${today.getMonth() + 1} 月 ${today.getDate()} 日`,
      title: title || "Agent 新建通告",
    }
  }
  if (/作品集/.test(request) && /(发布|公开)/.test(request)) {
    return { action: "publish_portfolio", teamId: scope.teamId }
  }
  if (/作品集/.test(request) && /(创建|新建|新增|建立)/.test(request)) {
    const category = request.match(/(?:分类|类别)\s*[：:]\s*([^；;，,]+)/)?.[1]?.trim()
    const year = request.match(/(?:年份)\s*[：:]\s*([^；;，,]+)/)?.[1]?.trim()
    const description = request.match(/(?:简介|描述)\s*[：:]\s*(.+)$/)?.[1]?.trim()
    const title = request
      .replace(
        /^(请帮我|帮我|请)?\s*(创建|新建|新增|建立)(一个|一份)?\s*(团队)?作品集(草稿)?\s*[：:]?\s*/,
        "",
      )
      .split(/[；;]/, 1)[0]
      ?.trim()
    if (!title) return null
    return {
      action: "create_portfolio",
      teamId: scope.teamId,
      title,
      category,
      year,
      description,
    }
  }
  if (
    /(?:修改|更新|编辑|置顶|取消置顶).{0,20}(?:笔记|便签)|(?:笔记|便签).{0,20}(?:修改|更新|编辑|置顶|取消置顶)/.test(
      request,
    )
  ) {
    const noteId = requestField(request, ["笔记ID", "便签ID"])
    const noteTitle =
      requestField(request, ["目标笔记", "目标便签", "原笔记标题", "原便签标题"]) ??
      request.match(/(?:笔记|便签)\s*[“"「]([^”"」]+)[”"」]/)?.[1]?.trim()
    const title = requestField(request, ["新标题"])
    const bodyValue = requestField(request, ["正文", "内容"])
    const body = /^(?:清空|删除)$/.test(bodyValue ?? "") ? "" : bodyValue
    const pinnedValue = requestField(request, ["置顶"])
    const pinned = /取消置顶/.test(request)
      ? false
      : /置顶/.test(request) && pinnedValue === undefined
        ? true
        : /^(?:是|置顶|开启|true)$/i.test(pinnedValue ?? "")
          ? true
          : /^(?:否|取消|关闭|false)$/i.test(pinnedValue ?? "")
            ? false
            : undefined
    if (!noteId && !noteTitle) return null
    if (pinnedValue !== undefined && pinned === undefined) return null
    if ([title, body, pinned].every((value) => value === undefined)) return null
    return {
      action: "update_note",
      teamId: scope.teamId,
      projectId: scope.projectScoped ? scope.projectId : undefined,
      noteId,
      noteTitle,
      title,
      body,
      pinned,
    }
  }
  if (/(创建|新增|添加|记录).{0,20}(笔记|便签)/.test(request)) {
    const content = request
      .replace(
        /^(请帮我|帮我|请)?\s*(创建|新增|添加|记录)(一个|一条)?\s*(项目)?(笔记|便签)\s*[：:]?\s*/,
        "",
      )
      .replace(/[。.]$/, "")
      .trim()
    const [rawTitle, ...rawBody] = content.split(/[：:]/)
    const body = rawBody.join("：").trim()
    return {
      action: "create_note",
      teamId: scope.teamId,
      projectId: scope.projectScoped ? scope.projectId : undefined,
      title: rawTitle?.trim() || (scope.projectScoped ? "Agent 项目笔记" : "Agent 便签"),
      body: body || undefined,
    }
  }

  const calendarUpdate = calendarUpdateCommand(request, scope)
  if (calendarUpdate) return calendarUpdate

  const calendar = calendarCommand(request, scope)
  if (calendar) return calendar

  if (/(创建|新增|添加|转为).{0,20}任务|任务.{0,20}(创建|新增|添加)/.test(request)) {
    const title = request
      .replace(/^(请帮我|帮我|请)?\s*(创建|新增|添加)(一个|一条)?\s*/, "")
      .replace(/[。.]$/, "")
      .trim()
    return {
      action: "create_task",
      teamId: scope.teamId,
      projectId: scope.projectScoped ? scope.projectId : undefined,
      title: title || request,
    }
  }
  if (
    /(查看|列出|查询|汇总|整理|有哪些).{0,20}(任务|优先事项)|(任务|优先事项).{0,20}(查看|列出|查询|汇总|整理|哪些)/.test(
      request,
    )
  ) {
    return {
      action: "list_tasks",
      teamId: scope.teamId,
      projectId: scope.projectScoped ? scope.projectId : undefined,
    }
  }
  return null
}
