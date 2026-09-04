export type TeamDataExport = {
  format: "shadowproducer-business-data"
  version: 1
  generatedAt: string
  scope: {
    teamId: string
    teamName: string
    projectIds: string[]
  }
  manifest: {
    sections: { name: string; count: number }[]
    exclusions: string[]
  }
  data: Record<string, unknown[]>
}
