import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { commandFromAgentRequest } from "./agent-request.ts"

const scope = {
  teamId: "north",
  projectId: "winter-coffee",
  projectScoped: true,
  now: new Date(2026, 7, 30, 10),
  timeZone: "Asia/Shanghai",
}

describe("commandFromAgentRequest", () => {
  it("manages personal contacts and field sharing", () => {
    assert.deepEqual(commandFromAgentRequest("查看个人通讯录", scope), {
      action: "list_personal_contacts",
      teamId: "north",
    })
    assert.deepEqual(
      commandFromAgentRequest(
        "创建个人联系人；姓名：顾遥；职位：执行制片；电话：13800000000",
        scope,
      ),
      {
        action: "create_personal_contact",
        teamId: "north",
        name: "顾遥",
        role: "执行制片",
        company: undefined,
        phone: "13800000000",
        email: undefined,
      },
    )
    assert.deepEqual(
      commandFromAgentRequest(
        "修改个人联系人“顾遥”；公司：北岸制片；邮箱：guyao@example.com",
        scope,
      ),
      {
        action: "update_personal_contact",
        teamId: "north",
        contactId: undefined,
        contactName: "顾遥",
        name: undefined,
        role: undefined,
        company: "北岸制片",
        phone: undefined,
        email: "guyao@example.com",
      },
    )
    assert.deepEqual(
      commandFromAgentRequest(
        "共享个人联系人“顾遥”；共享字段：姓名、职位、电话；不允许项目关联",
        scope,
      ),
      {
        action: "share_personal_contact",
        teamId: "north",
        contactId: undefined,
        contactName: "顾遥",
        fields: ["name", "role", "phone"],
        allowProjectLink: false,
      },
    )
    assert.deepEqual(commandFromAgentRequest("撤销共享个人联系人“顾遥”", scope), {
      action: "unshare_personal_contact",
      teamId: "north",
      contactId: undefined,
      contactName: "顾遥",
    })
    assert.deepEqual(commandFromAgentRequest("删除个人联系人“顾遥”", scope), {
      action: "delete_personal_contact",
      teamId: "north",
      contactId: undefined,
      contactName: "顾遥",
    })
    assert.deepEqual(commandFromAgentRequest("恢复个人联系人“顾遥”", scope), {
      action: "restore_personal_contact",
      teamId: "north",
      contactId: undefined,
      contactName: "顾遥",
    })
  })

  it("queries filtered team audit logs", () => {
    const command = commandFromAgentRequest(
      "查询当前团队审计记录；动作：call-sheet；操作者：繁星；最近 10 条",
      scope,
    )

    assert.deepEqual(command, {
      action: "list_audit_logs",
      teamId: "north",
      projectId: undefined,
      scope: "team",
      auditAction: "call-sheet",
      actor: "繁星",
      pageSize: 10,
    })
  })

  it("lists and compares project review feedback", () => {
    assert.deepEqual(commandFromAgentRequest("查看当前项目的审片反馈", scope), {
      action: "list_review_feedback",
      teamId: "north",
      projectId: "winter-coffee",
      primaryFileId: undefined,
      primaryFileName: undefined,
      compareFileId: undefined,
      compareFileName: undefined,
    })
    assert.deepEqual(
      commandFromAgentRequest(
        "整理审片反馈；主版本：主片 v12；对比版本：主片 v11",
        scope,
      ),
      {
        action: "list_review_feedback",
        teamId: "north",
        projectId: "winter-coffee",
        primaryFileId: undefined,
        primaryFileName: "主片 v12",
        compareFileId: undefined,
        compareFileName: "主片 v11",
      },
    )
  })

  it("defaults an audit query to the current project", () => {
    assert.deepEqual(commandFromAgentRequest("查看最近 5 条操作记录", scope), {
      action: "list_audit_logs",
      teamId: "north",
      projectId: "winter-coffee",
      scope: undefined,
      auditAction: undefined,
      actor: undefined,
      pageSize: 5,
    })
    assert.equal(commandFromAgentRequest("查看最近 101 条操作记录", scope), null)
  })

  it("updates one project breakdown item", () => {
    const command = commandFromAgentRequest(
      "修改制片拆解；拆解项ID：br3；准备要求：完成做旧并补拍连续性照片；负责部门：美术组",
      scope,
    )

    assert.deepEqual(command, {
      action: "update_breakdown",
      teamId: "north",
      projectId: "winter-coffee",
      itemId: "br3",
      itemName: undefined,
      item: undefined,
      requirementType: undefined,
      specification: undefined,
      quantity: undefined,
      preparation: "完成做旧并补拍连续性照片",
      department: "美术组",
      state: undefined,
      supplierIds: undefined,
      responsibleAccountId: undefined,
      taskIds: undefined,
      contactRefs: undefined,
      shootingDayIds: undefined,
      callSheetIds: undefined,
    })
  })

  it("updates and clears breakdown production relations", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "更新制片拆解；拆解项ID：br6；供应商ID：supplier-rain-fx；负责人账号ID：account-fanxing；关联任务ID：task-rain、task-safety；团队联系人ID：team-contact-rain-fx；共享联系人ID：personal-contact-linqiao；拍摄日ID：shoot-day-05；通告单ID：sd-05",
        scope,
      ),
      {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        itemId: "br6",
        itemName: undefined,
        item: undefined,
        requirementType: undefined,
        specification: undefined,
        quantity: undefined,
        preparation: undefined,
        department: undefined,
        state: undefined,
        supplierIds: ["supplier-rain-fx"],
        responsibleAccountId: "account-fanxing",
        taskIds: ["task-rain", "task-safety"],
        contactRefs: [
          { contactId: "team-contact-rain-fx", source: "team" },
          { contactId: "personal-contact-linqiao", source: "member-shared" },
        ],
        shootingDayIds: ["shoot-day-05"],
        callSheetIds: ["sd-05"],
      },
    )

    assert.deepEqual(
      commandFromAgentRequest(
        "更新制片拆解；拆解项ID：br6；供应商ID：清空；负责人ID：取消；任务ID：无；团队联系人ID：清空；拍摄日ID：清空；通告表ID：清空",
        scope,
      ),
      {
        action: "update_breakdown",
        teamId: "north",
        projectId: "winter-coffee",
        itemId: "br6",
        itemName: undefined,
        item: undefined,
        requirementType: undefined,
        specification: undefined,
        quantity: undefined,
        preparation: undefined,
        department: undefined,
        state: undefined,
        supplierIds: [],
        responsibleAccountId: null,
        taskIds: [],
        contactRefs: [],
        shootingDayIds: [],
        callSheetIds: [],
      },
    )
  })

  it("rejects a breakdown update without a target or changed field", () => {
    assert.equal(commandFromAgentRequest("修改制片拆解；准备要求：完成做旧", scope), null)
    assert.equal(commandFromAgentRequest("修改制片拆解；拆解项ID：br3", scope), null)
  })

  it("confirms one project breakdown category", () => {
    const command = commandFromAgentRequest(
      "确认制片拆解；分类：道具；拆解项ID：prop-raincoat、prop-suitcase",
      scope,
    )

    assert.deepEqual(command, {
      action: "confirm_breakdown",
      teamId: "north",
      projectId: "winter-coffee",
      category: "道具",
      itemIds: ["prop-raincoat", "prop-suitcase"],
    })
  })

  it("creates a project calendar event from an explicit date and time", () => {
    const command = commandFromAgentRequest(
      "添加日程：8 月 31 日下午 3 点 项目日程复盘，项目可见",
      scope,
    )

    assert.deepEqual(command, {
      action: "create_calendar_event",
      teamId: "north",
      projectId: "winter-coffee",
      title: "项目日程复盘",
      startsAt: new Date(2026, 7, 31, 15).toISOString(),
      timezone: "Asia/Shanghai",
      allDay: false,
      visibility: "project",
    })
  })

  it("creates an all-day private event from a relative date", () => {
    const command = commandFromAgentRequest("请帮我创建日程 明天 场地确认", {
      ...scope,
      projectScoped: false,
    })

    assert.deepEqual(command, {
      action: "create_calendar_event",
      teamId: "north",
      projectId: undefined,
      title: "场地确认",
      startsAt: new Date(2026, 7, 31).toISOString(),
      timezone: "Asia/Shanghai",
      allDay: true,
      visibility: "private",
    })
  })

  it("updates a selected project calendar event to a new time", () => {
    const command = commandFromAgentRequest(
      "把日程“P1 Agent 日程验收”改到 9 月 1 日下午 4 点",
      scope,
    )

    assert.deepEqual(command, {
      action: "update_calendar_event",
      teamId: "north",
      projectId: "winter-coffee",
      eventTitle: "P1 Agent 日程验收",
      startsAt: new Date(2026, 8, 1, 16).toISOString(),
      timezone: "Asia/Shanghai",
      allDay: false,
    })
  })

  it("creates a timecoded review comment for a named video", () => {
    const command = commandFromAgentRequest(
      "为审片文件“主片 v11”添加意见 00:07.120：开场站台空镜再留 8 帧",
      scope,
    )

    assert.deepEqual(command, {
      action: "create_review_comment",
      teamId: "north",
      projectId: "winter-coffee",
      fileName: "主片 v11",
      timecode: "00:07.120",
      text: "开场站台空镜再留 8 帧",
    })
  })

  it("creates a review version from a ready project asset", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "创建审片版本；素材ID：asset-ready-1；名称：车站夜戏主片；版本：v14；时长：00:30",
        scope,
      ),
      {
        action: "create_review_file",
        teamId: "north",
        projectId: "winter-coffee",
        assetId: "asset-ready-1",
        name: "车站夜戏主片",
        version: "v14",
        duration: "00:30",
      },
    )
  })

  it("does not create a review version without a source asset", () => {
    assert.equal(
      commandFromAgentRequest("创建审片版本；名称：车站夜戏主片；版本：v14", scope),
      null,
    )
  })

  it("creates a customer review link for a named video", () => {
    assert.deepEqual(
      commandFromAgentRequest("为审片文件“主片 v11”生成客户审片链接", scope),
      {
        action: "create_review_link",
        teamId: "north",
        projectId: "winter-coffee",
        fileName: "主片 v11",
      },
    )
  })

  it("approves a named review video", () => {
    assert.deepEqual(commandFromAgentRequest("批准审片文件“主片 v11”", scope), {
      action: "approve_review_file",
      teamId: "north",
      projectId: "winter-coffee",
      fileName: "主片 v11",
    })
  })

  it("lists the current project execution schedule and shooting days", () => {
    assert.deepEqual(commandFromAgentRequest("查看项目执行计划和拍摄日", scope), {
      action: "list_execution_schedule",
      teamId: "north",
      projectId: "winter-coffee",
    })
    assert.equal(
      commandFromAgentRequest("查看项目执行计划", { ...scope, projectScoped: false }),
      null,
    )
  })

  it("creates a project execution stage with stable resource identities", () => {
    const command = commandFromAgentRequest(
      "创建执行计划：车站夜戏；开始：9 月 2 日下午 4:30；结束：9 月 3 日凌晨 2:00；负责人：顾遥；场地：北站；设备：雨车、ARRI Alexa 35；备注：夜戏与人工雨",
      scope,
    )

    assert.deepEqual(command, {
      action: "create_execution_stage",
      teamId: "north",
      projectId: "winter-coffee",
      name: "车站夜戏",
      startsAt: new Date(2026, 8, 2, 16, 30).toISOString(),
      endsAt: new Date(2026, 8, 3, 2).toISOString(),
      originalTimezone: "Asia/Shanghai",
      progress: 0,
      owner: "顾遥",
      state: "未开始",
      note: "夜戏与人工雨",
      resources: [
        { id: "北站", type: "location", name: "北站" },
        { id: "雨车", type: "equipment", name: "雨车" },
        { id: "arri-alexa-35", type: "equipment", name: "ARRI Alexa 35" },
      ],
    })
  })

  it("updates selected execution stage fields without inventing the rest", () => {
    const command = commandFromAgentRequest(
      "更新执行计划“车站补拍”；新名称：车站夜戏；开始：9 月 2 日下午 5:00；结束：9 月 3 日凌晨 1:00；进度：65%；负责人：周弥；状态：进行中；场地：北站；设备：雨车；备注：转入夜戏",
      scope,
    )

    assert.deepEqual(command, {
      action: "update_execution_stage",
      teamId: "north",
      projectId: "winter-coffee",
      stageId: undefined,
      stageName: "车站补拍",
      name: "车站夜戏",
      startsAt: new Date(2026, 8, 2, 17).toISOString(),
      endsAt: new Date(2026, 8, 3, 1).toISOString(),
      originalTimezone: "Asia/Shanghai",
      progress: 65,
      owner: "周弥",
      state: "进行中",
      note: "转入夜戏",
      resources: [
        { id: "北站", type: "location", name: "北站" },
        { id: "雨车", type: "equipment", name: "雨车" },
      ],
    })
  })

  it("creates a project shooting day from explicit production fields", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "创建拍摄日；日期：2026 年 9 月 5 日；日序：92；标题：P1 Agent 拍摄日",
        scope,
      ),
      {
        action: "create_shooting_day",
        teamId: "north",
        projectId: "winter-coffee",
        shootDate: "2026-09-05",
        dayNumber: 92,
        title: "P1 Agent 拍摄日",
        originalTimezone: "Asia/Shanghai",
      },
    )
  })

  it("updates only explicit fields on a named shooting day", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "更新拍摄日“P1 Agent 拍摄日”；新日期：2026 年 9 月 6 日；状态：已确认",
        scope,
      ),
      {
        action: "update_shooting_day",
        teamId: "north",
        projectId: "winter-coffee",
        shootingDayId: undefined,
        shootingDayTitle: "P1 Agent 拍摄日",
        shootDate: "2026-09-06",
        dayNumber: undefined,
        title: undefined,
        status: "已确认",
        originalTimezone: undefined,
      },
    )
  })

  it("creates a script version with multiline production content", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "创建脚本版本；文档：冬夜咖啡_拍摄稿；版本说明：夜戏节奏稿；正文：12. 外景 · 旧站台 · 夜\n顾遥：这一次；不会再错过。",
        scope,
      ),
      {
        action: "create_script_version",
        teamId: "north",
        projectId: "winter-coffee",
        documentId: undefined,
        documentTitle: "冬夜咖啡_拍摄稿",
        content: "12. 外景 · 旧站台 · 夜\n顾遥：这一次；不会再错过。",
        meta: "夜戏节奏稿",
      },
    )
  })

  it("updates the current script document by ID without inventing version data", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "更新脚本正文；文档ID：winter-coffee-shooting-script；正文：新的协作正文",
        scope,
      ),
      {
        action: "update_script_version",
        teamId: "north",
        projectId: "winter-coffee",
        documentId: "winter-coffee-shooting-script",
        documentTitle: undefined,
        content: "新的协作正文",
      },
    )
    assert.equal(commandFromAgentRequest("创建脚本版本；版本说明：缺正文", scope), null)
    assert.equal(
      commandFromAgentRequest("更新脚本正文；正文：只读团队", {
        ...scope,
        projectScoped: false,
      }),
      null,
    )
  })

  it("creates a script breakdown analysis for an explicit frozen version", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "分析脚本文档“冬夜咖啡_拍摄稿”生成制片拆解；版本ID：v7",
        scope,
      ),
      {
        action: "create_script_breakdown_analysis",
        teamId: "north",
        projectId: "winter-coffee",
        documentId: undefined,
        documentTitle: "冬夜咖啡_拍摄稿",
        versionId: "v7",
      },
    )
    assert.equal(
      commandFromAgentRequest("分析脚本生成制片拆解", {
        ...scope,
        projectScoped: false,
      }),
      null,
    )
  })

  it("starts media analysis for a named video in team or project scope", () => {
    assert.deepEqual(
      commandFromAgentRequest("分析素材“冬夜咖啡_主片_v11.mp4”的镜头", scope),
      {
        action: "create_media_analysis",
        teamId: "north",
        projectId: "winter-coffee",
        assetId: undefined,
        assetName: "冬夜咖啡_主片_v11.mp4",
      },
    )
    assert.deepEqual(
      commandFromAgentRequest("对“团队样片.mp4”做镜头分析", {
        ...scope,
        projectScoped: false,
      }),
      {
        action: "create_media_analysis",
        teamId: "north",
        projectId: undefined,
        assetId: undefined,
        assetName: "团队样片.mp4",
      },
    )
    assert.equal(commandFromAgentRequest("分析一个视频", scope), null)
  })

  it("lists team resources with an optional keyword", () => {
    assert.deepEqual(commandFromAgentRequest("查询项目资源；关键词：灯光", scope), {
      action: "list_team_resources",
      teamId: "north",
      projectId: "winter-coffee",
      keyword: "灯光",
    })
    assert.deepEqual(
      commandFromAgentRequest("团队有哪些联系人和供应商", {
        ...scope,
        projectScoped: false,
      }),
      {
        action: "list_team_resources",
        teamId: "north",
        projectId: undefined,
        keyword: undefined,
      },
    )
  })

  it("creates a scoped semantic asset search command", () => {
    assert.deepEqual(
      commandFromAgentRequest("在资源库语义搜索“雨夜车站”，返回 8 条", scope),
      {
        action: "semantic_search_assets",
        teamId: "north",
        projectId: "winter-coffee",
        query: "雨夜车站",
        limit: 8,
      },
    )
    assert.equal(
      commandFromAgentRequest("在资源库语义搜索“雨夜车站”，返回 101 条", scope),
      null,
    )
  })

  it("creates team contacts and suppliers in the current project scope", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "创建团队联系人；姓名：顾遥；职位：执行制片；公司：北岸影像；电话：13800000000",
        scope,
      ),
      {
        action: "create_team_contact",
        teamId: "north",
        name: "顾遥",
        role: "执行制片",
        company: "北岸影像",
        phone: "13800000000",
        email: undefined,
        projectIds: ["winter-coffee"],
      },
    )
    assert.deepEqual(
      commandFromAgentRequest(
        "创建团队供应商；名称：星河灯光；类别：灯光器材；服务：现场灯光；团队联系人ID：contact-1",
        scope,
      ),
      {
        action: "create_team_supplier",
        teamId: "north",
        name: "星河灯光",
        category: "灯光器材",
        services: "现场灯光",
        phone: undefined,
        email: undefined,
        address: undefined,
        contactRefs: [{ contactId: "contact-1", source: "team" }],
        projectIds: ["winter-coffee"],
      },
    )
    assert.equal(commandFromAgentRequest("创建团队联系人；职位：制片", scope), null)
  })

  it("updates the selected call sheet without inventing professional fields", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "更新通告表“车站补拍通告”；新标题：车站夜戏通告；集合：16:00；开拍：17:30；地点：旧北站；状态：待确认；变更说明：调整现场时间",
        scope,
      ),
      {
        action: "update_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        callSheetId: undefined,
        callSheetTitle: "车站补拍通告",
        date: undefined,
        day: undefined,
        title: "车站夜戏通告",
        status: "待确认",
        crewCall: "16:00",
        firstShot: "17:30",
        wrap: undefined,
        weather: undefined,
        sunrise: undefined,
        sunset: undefined,
        basecamp: undefined,
        location: "旧北站",
        hospital: undefined,
        changeSummary: "调整现场时间",
      },
    )
  })

  it("uses an explicit call sheet ID and rejects empty or invalid updates", () => {
    assert.deepEqual(
      commandFromAgentRequest("修改通告表；通告表ID：call-sheet-1；收工：23:30", scope),
      {
        action: "update_call_sheet",
        teamId: "north",
        projectId: "winter-coffee",
        callSheetId: "call-sheet-1",
        callSheetTitle: undefined,
        date: undefined,
        day: undefined,
        title: undefined,
        status: undefined,
        crewCall: undefined,
        firstShot: undefined,
        wrap: "23:30",
        weather: undefined,
        sunrise: undefined,
        sunset: undefined,
        basecamp: undefined,
        location: undefined,
        hospital: undefined,
        changeSummary: undefined,
      },
    )
    assert.equal(commandFromAgentRequest("更新通告表“车站补拍通告”", scope), null)
    assert.equal(
      commandFromAgentRequest("更新通告表“车站补拍通告”；状态：已发布", scope),
      null,
    )
  })

  it("updates selected task fields without inventing the rest", () => {
    const command = commandFromAgentRequest(
      "更新任务“发布车站夜戏通告”；状态：进行中；截止日期：9 月 2 日",
      scope,
    )

    assert.deepEqual(command, {
      action: "update_task",
      teamId: "north",
      projectId: "winter-coffee",
      taskId: undefined,
      taskTitle: "发布车站夜戏通告",
      title: undefined,
      dueDate: "2026-09-02",
      status: "进行中",
      target: undefined,
    })
  })

  it("updates and pins a selected note", () => {
    assert.deepEqual(
      commandFromAgentRequest(
        "更新项目笔记“Agent 笔记”；新标题：车站雨效提醒；正文：准备三套防水方案；置顶：是",
        scope,
      ),
      {
        action: "update_note",
        teamId: "north",
        projectId: "winter-coffee",
        noteId: undefined,
        noteTitle: "Agent 笔记",
        title: "车站雨效提醒",
        body: "准备三套防水方案",
        pinned: true,
      },
    )
    assert.deepEqual(commandFromAgentRequest("取消置顶便签“Agent 便签”", scope), {
      action: "update_note",
      teamId: "north",
      projectId: "winter-coffee",
      noteId: undefined,
      noteTitle: "Agent 便签",
      title: undefined,
      body: undefined,
      pinned: false,
    })
    assert.equal(commandFromAgentRequest("更新笔记“Agent 笔记”", scope), null)
  })

  it("resolves a timecoded review comment for a named video", () => {
    const command = commandFromAgentRequest(
      "将审片文件“主片 v11” 00:07.120 的意见标记为已解决",
      scope,
    )

    assert.deepEqual(command, {
      action: "update_review_comment",
      teamId: "north",
      projectId: "winter-coffee",
      fileName: "主片 v11",
      timecode: "00:07.120",
      state: "resolved",
    })
  })

  it("creates a team-visible portfolio draft", () => {
    const command = commandFromAgentRequest(
      "创建作品集草稿：冬夜咖啡幕后制作；分类：幕后纪录；年份：2026；简介：车站夜戏制作过程",
      scope,
    )

    assert.deepEqual(command, {
      action: "create_portfolio",
      teamId: "north",
      title: "冬夜咖啡幕后制作",
      category: "幕后纪录",
      year: "2026",
      description: "车站夜戏制作过程",
    })
  })

  it("adds one approved video to a portfolio", () => {
    const command = commandFromAgentRequest(
      "将成片“冬夜咖啡 · 主片 v11”加入作品集“冬夜咖啡”，说明：车站夜戏最终版本，并设为封面",
      scope,
    )

    assert.deepEqual(command, {
      action: "add_portfolio_content",
      teamId: "north",
      fileName: "冬夜咖啡 · 主片 v11",
      portfolioTitle: "冬夜咖啡",
      caption: "车站夜戏最终版本，并设为封面",
      featured: true,
    })
  })

  it("only lists tasks when the user actually asks for tasks", () => {
    assert.equal(commandFromAgentRequest("帮我写一段宣传文案", scope), null)
    assert.equal(commandFromAgentRequest("添加日程 2 月 30 日 9:00 测试", scope), null)
    assert.equal(commandFromAgentRequest("修改日程“无日期”", scope), null)
    assert.equal(commandFromAgentRequest("更新执行计划“车站补拍”", scope), null)
    assert.equal(commandFromAgentRequest("创建拍摄日；日期：2 月 30 日", scope), null)
    assert.equal(commandFromAgentRequest("更新拍摄日“车站补拍”", scope), null)
    assert.equal(commandFromAgentRequest("更新通告表“车站补拍通告”", scope), null)
    assert.equal(commandFromAgentRequest("更新任务“发布通告”", scope), null)
    assert.equal(
      commandFromAgentRequest("更新执行计划“车站补拍”；进度：101%", scope),
      null,
    )
    assert.equal(
      commandFromAgentRequest("更新执行计划“车站补拍”；状态：等待中", scope),
      null,
    )
    assert.equal(commandFromAgentRequest("添加审片意见：没有时间码", scope), null)
    assert.equal(commandFromAgentRequest("确认制片拆解", scope), null)
    assert.equal(commandFromAgentRequest("查看当前任务", scope)?.action, "list_tasks")
  })
})
