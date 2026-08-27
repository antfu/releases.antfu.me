export interface ReleaseInfo {
  id: string
  type: string
  repo: string
  title: string
  sha?: string
  commit: string
  created_at: number
  version: string
  isOrg: boolean
  payload?: any
}
