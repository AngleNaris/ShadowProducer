import type { TeamDataExport } from "@shadowproducer/contracts"
import { AppError } from "./script-service"

export interface DataExportRepository {
  createTeamDataExport(actorId: string, teamId: string): Promise<TeamDataExport | null>
}

export class DataExportService {
  constructor(private readonly repository: DataExportRepository) {}

  async createTeamDataExport(actorId: string, teamId: string) {
    const snapshot = await this.repository.createTeamDataExport(actorId, teamId)
    if (!snapshot) {
      throw new AppError("TEAM_ACCESS_DENIED", "无权导出当前团队数据", 403)
    }
    return snapshot
  }
}
