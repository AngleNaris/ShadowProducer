import type { TeamSupplier, TeamSupplierImportItem } from "@shadowproducer/contracts"

import { csvCell, readCsv } from "./contact-csv.ts"

const headers = ["供应商名称", "类别", "服务范围", "电话", "邮箱", "地址"] as const
const aliases = new Map<string, keyof TeamSupplierImportItem>([
  ["供应商名称", "name"],
  ["供应商", "name"],
  ["名称", "name"],
  ["name", "name"],
  ["类别", "category"],
  ["category", "category"],
  ["type", "category"],
  ["服务范围", "services"],
  ["服务", "services"],
  ["services", "services"],
  ["电话", "phone"],
  ["phone", "phone"],
  ["邮箱", "email"],
  ["email", "email"],
  ["地址", "address"],
  ["address", "address"],
])
const limits: Record<keyof TeamSupplierImportItem, number> = {
  name: 300,
  category: 120,
  services: 1_000,
  phone: 100,
  email: 320,
  address: 500,
}
const labels: Record<keyof TeamSupplierImportItem, string> = {
  name: "供应商名称",
  category: "类别",
  services: "服务范围",
  phone: "电话",
  email: "邮箱",
  address: "地址",
}

export class SupplierCsvError extends Error {}

export function parseTeamSupplierCsv(source: string): TeamSupplierImportItem[] {
  const rows = readCsv(source.replace(/^\uFEFF/, "")).filter((row) =>
    row.some((cell) => cell.trim()),
  )
  if (rows.length < 2) throw new SupplierCsvError("CSV 至少需要表头和一条供应商记录")
  const fields = rows[0].map((header) => {
    const field = aliases.get(header.trim().toLowerCase().replace(/\s+/g, ""))
    if (!field) throw new SupplierCsvError(`不支持的表头：${header || "空表头"}`)
    return field
  })
  if (new Set(fields).size !== fields.length)
    throw new SupplierCsvError("CSV 包含重复字段表头")
  if (!fields.includes("name")) throw new SupplierCsvError("CSV 缺少“供应商名称”字段")
  const dataRows = rows.slice(1)
  if (dataRows.length > 500) throw new SupplierCsvError("单次最多导入 500 条供应商")
  const seen = new Set<string>()
  return dataRows.map((row, index) => {
    const line = index + 2
    if (row.length !== fields.length) {
      throw new SupplierCsvError(`第 ${line} 行的列数与表头不一致`)
    }
    const item: TeamSupplierImportItem = { name: "" }
    fields.forEach((field, column) => {
      const value = row[column].trim()
      if (value.length > limits[field]) {
        throw new SupplierCsvError(`第 ${line} 行“${labels[field]}”内容过长`)
      }
      item[field] = value
    })
    if (!item.name) throw new SupplierCsvError(`第 ${line} 行供应商名称不能为空`)
    const key = JSON.stringify(fields.map((field) => item[field] ?? ""))
    if (seen.has(key))
      throw new SupplierCsvError(`第 ${line} 行与文件内其他供应商完全重复`)
    seen.add(key)
    return item
  })
}

export function exportTeamSuppliersCsv(suppliers: TeamSupplier[]) {
  const rows = suppliers.map((supplier) => [
    supplier.name,
    supplier.category,
    supplier.services,
    supplier.phone,
    supplier.email,
    supplier.address,
  ])
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`
}
