import type { TeamContact, TeamContactImportItem } from "@shadowproducer/contracts"

const headers = ["姓名", "职务/类型", "公司", "电话", "邮箱"] as const
const headerAliases = new Map<string, keyof TeamContactImportItem>([
  ["姓名", "name"],
  ["联系人", "name"],
  ["name", "name"],
  ["职务/类型", "role"],
  ["职业/类型", "role"],
  ["职务", "role"],
  ["类型", "role"],
  ["role", "role"],
  ["type", "role"],
  ["title", "role"],
  ["公司", "company"],
  ["机构", "company"],
  ["company", "company"],
  ["organization", "company"],
  ["电话", "phone"],
  ["手机", "phone"],
  ["phone", "phone"],
  ["mobile", "phone"],
  ["邮箱", "email"],
  ["电子邮箱", "email"],
  ["email", "email"],
])
const maxLengths: Record<keyof TeamContactImportItem, number> = {
  name: 200,
  role: 200,
  company: 300,
  phone: 100,
  email: 320,
}

export class ContactCsvError extends Error {}

export function parseTeamContactCsv(source: string): TeamContactImportItem[] {
  const rows = readCsv(source.replace(/^\uFEFF/, "")).filter((row) =>
    row.some((cell) => cell.trim()),
  )
  if (rows.length < 2) throw new ContactCsvError("CSV 至少需要表头和一条联系人记录")

  const fields = rows[0].map((header) => {
    const normalized = header.trim().toLowerCase().replace(/\s+/g, "")
    const field = headerAliases.get(normalized)
    if (!field) throw new ContactCsvError(`不支持的表头：${header || "空表头"}`)
    return field
  })
  if (new Set(fields).size !== fields.length) {
    throw new ContactCsvError("CSV 包含重复字段表头")
  }
  if (!fields.includes("name")) throw new ContactCsvError("CSV 缺少“姓名”字段")

  const dataRows = rows.slice(1)
  if (dataRows.length > 500) throw new ContactCsvError("单次最多导入 500 条联系人")
  const seen = new Set<string>()
  return dataRows.map((row, index) => {
    const line = index + 2
    if (row.length !== fields.length) {
      throw new ContactCsvError(`第 ${line} 行的列数与表头不一致`)
    }
    const item: TeamContactImportItem = { name: "" }
    fields.forEach((field, column) => {
      const value = row[column].trim()
      if (value.length > maxLengths[field]) {
        throw new ContactCsvError(`第 ${line} 行“${headersForField[field]}”内容过长`)
      }
      item[field] = value
    })
    if (!item.name) throw new ContactCsvError(`第 ${line} 行联系人姓名不能为空`)
    const key = JSON.stringify([
      item.name,
      item.role ?? "",
      item.company ?? "",
      item.phone ?? "",
      item.email ?? "",
    ])
    if (seen.has(key))
      throw new ContactCsvError(`第 ${line} 行与文件内其他联系人完全重复`)
    seen.add(key)
    return item
  })
}

export function exportTeamContactsCsv(contacts: TeamContact[]) {
  const rows = contacts
    .filter((contact) => contact.source === "team")
    .map((contact) => [
      contact.name ?? "",
      contact.role ?? "",
      contact.company ?? "",
      contact.phone ?? "",
      contact.email ?? "",
    ])
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`
}

const headersForField: Record<keyof TeamContactImportItem, string> = {
  name: "姓名",
  role: "职务/类型",
  company: "公司",
  phone: "电话",
  email: "邮箱",
}

export function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function readCsv(source: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let quoteClosed = false

  const pushField = () => {
    row.push(field)
    field = ""
    quoteClosed = false
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character !== '"') {
        field += character
      } else if (source[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = false
        quoteClosed = true
      }
      continue
    }
    if (quoteClosed && character !== "," && character !== "\r" && character !== "\n") {
      if (character === " " || character === "\t") continue
      throw new ContactCsvError("引号结束后只能出现分隔符或换行")
    }
    if (character === '"') {
      if (field) throw new ContactCsvError("字段中的双引号必须使用成对引号转义")
      quoted = true
    } else if (character === ",") {
      pushField()
    } else if (character === "\r" || character === "\n") {
      pushRow()
      if (character === "\r" && source[index + 1] === "\n") index += 1
    } else {
      field += character
    }
  }
  if (quoted) throw new ContactCsvError("CSV 中存在未闭合的引号")
  if (field || row.length || quoteClosed) pushRow()
  return rows
}
