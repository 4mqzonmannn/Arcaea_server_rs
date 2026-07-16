export type ApiEnvelope<T> = {
  success: boolean
  value?: T
  error_code?: number
  message?: string
  extra?: Record<string, unknown>
}

export type AdminSession = {
  loggedIn: boolean
  role: number
  permissions: string[]
  appTitle?: string
  loginBackground?: string
  loginPosition?: string
  loginCardOpacity?: number
  webSurfaceOpacity?: number
  user?: AdminUserSummary
}

export type DashboardData = {
  onlineUsers: number
  onlineGrowth: number
  scoreSubmits: number
  scoreErrorRate: number
  presentCount: number
  alertCount: number
  recentOps: RecentOp[]
}

export type PageData<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export type PageParams = {
  page: number
  pageSize: number
}

export type RecentOp = {
  name: string
  operator: string
  time: string
  status: string
}

export type UserRow = {
  userId: number
  name: string
  userCode: string
  ratingPtt: number
  ticket: number
  lastPlay: string
  banned: boolean
  isAdmin: boolean
  canEditChartConstants: boolean
}

export type SongRow = {
  songId: string
  nameEn: string
  ratingPst: string
  ratingPrs: string
  ratingFtr: string
  ratingByd: string
  ratingEtr: string
}

export type SongPayload = {
  sid: string
  name_en: string
  rating_pst: string
  rating_prs: string
  rating_ftr: string
  rating_byd: string
  rating_etr: string
}

export type ChartConstantsPayload = Pick<
  SongPayload,
  'rating_pst' | 'rating_prs' | 'rating_ftr' | 'rating_byd' | 'rating_etr'
>

export type ItemRow = {
  itemId: string
  itemType: string
  isAvailable: number
}

export type ItemPayload = {
  item_id: string
  item_type: string
  is_available?: number
}

export type PurchaseRow = {
  purchaseName: string
  price: string
  origPrice: string
  discountFrom: string
  discountTo: string
  discountReason: string
  itemSummary: string
}

export type PurchasePayload = {
  purchase_name: string
  price?: string
  orig_price?: string
  discount_from?: string
  discount_to?: string
  discount_reason?: string
}

export type PurchaseItemRow = {
  purchaseName: string
  itemId: string
  itemType: string
  amount: string
}

export type PurchaseItemPayload = {
  purchase_name: string
  item_id: string
  item_type: string
  amount?: string
}

export type AdminUserSummary = {
  userId: number
  name: string
  userCode: string
}

export type AdminScoreRow = {
  userId: number
  name?: string
  songId: string
  difficulty: number
  score: number
  shinyPerfectCount: number
  perfectCount: number
  nearCount: number
  missCount: number
  clearType: number
  bestClearType: number
  rating: number
  timePlayed: string
}

export type AdminUserScoreStats = {
  best30Sum: number
  recent10Sum: number
  potential: number
}

export type AdminUserScores = {
  user: AdminUserSummary
  stats: AdminUserScoreStats
  b30: AdminScoreRow[]
  r10: AdminScoreRow[]
}

export type ScoreImage = {
  mode: string
  title: string
  entryCount: number
  url: string
}

export type ScoreImages = {
  user: AdminUserSummary
  images: ScoreImage[]
}

export type AdminChartTop = {
  songId: string
  nameEn: string
  difficulty: number
  scores: AdminScoreRow[]
}

export type AdminActionResult = {
  message: string
  affectedRows: number
}

export type AdminRedeemUsers = {
  code: string
  users: AdminUserSummary[]
}

export type UserCheckinStatus = {
  user: AdminUserSummary
  today: string
  checkedInToday: boolean
  claimed: boolean
  reward?: number
  currentTicket: number
}

export type UserSelectorPayload = {
  user_id?: number
  name?: string
  user_code?: string
}

export type UserTicketPayload = UserSelectorPayload & {
  ticket: number
  all_users?: boolean
}

export type UserPasswordPayload = UserSelectorPayload & {
  password: string
}

export type UserCreatePayload = {
  name: string
  password: string
  email: string
}

export type UserPurchasePayload = UserSelectorPayload & {
  method: 'unlock' | 'lock'
  all_users?: boolean
  item_types?: string[]
}

export type ScoreDeletePayload = UserSelectorPayload & {
  song_id?: string
  difficulty?: number
}

export type PresentPayload = {
  present_id: string
  expire_ts?: string
  description?: string
  item_id: string
  item_type: string
  amount?: string
}

export type PresentDeliverPayload = UserSelectorPayload & {
  present_id: string
  all_users?: boolean
}

export type RedeemPayload = {
  code?: string
  random_amount?: number
  redeem_type: number
  item_id: string
  item_type: string
  amount?: string
}

export type AdminOperation =
  | 'refresh_song_file_cache'
  | 'refresh_content_bundle_cache'
  | 'refresh_all_score_rating'
  | 'refresh_world_map_cache'

export type BundleFindingSeverity = 'error' | 'warn' | 'info'

export type BundleFinding = {
  severity: BundleFindingSeverity
  message: string
}

export type BundleScanReport = {
  findings: BundleFinding[]
  errorCount: number
  warnCount: number
  infoCount: number
}

export type BundleBuildPayload = {
  app_version: string
  bundle_version?: string
  dry_run: boolean
  force: boolean
}

export type BundleBuildResult = {
  versionNumber: string
  previousVersionNumber?: string
  addedCount: number
  changedCount: number
  unchangedCount: number
  removedCount: number
  bundleBytes: number
  dryRun: boolean
  writtenFiles?: [string, string]
  scanErrorCount: number
  scanWarnCount: number
}

export type SongFolderStatus = 'full' | 'preview' | 'both' | 'missing'

export type BundleSongSummary = {
  id: string
  title: string
  set: string
  remoteDl: boolean
  folderStatus: SongFolderStatus
  ratingClasses: number[]
}

export type BundleSongUpsertResult = {
  id: string
  created: boolean
  backupPath: string
}

export type BundleSongDeleteResult = {
  removedSongs: number
  removedUnlocks: number
  notFound: string[]
  songlistBackupPath: string
  unlocksBackupPath?: string
}

export type BundleSongImportResult = {
  id: string
  created: boolean
  remoteDl: boolean
  filesWritten: string[]
  rejected: string[]
  songlistBackupPath: string
}

export type WorldMapSummary = {
  mapId: string
  chapter?: number
  stepCount: number
  isBeyond: boolean
  isLegacy: boolean
  isRepeatable: boolean
}

export type CharacterDef = {
  character_id: number
  name?: string
  max_level?: number
  skill_id?: string
  char_type?: number
  is_uncapped?: number
}

export type UserCharacter = {
  user_id: number
  character_id: number
  level: number
  exp: number
  is_uncapped: number
  is_uncapped_override: number
  skill_flag: number
}

export type UserCharactersResponse = {
  userId: number
  name: string
  userCode: string
  characters: UserCharacter[]
}

export type BackupFile = {
  name: string
  sizeBytes: number
  createdUnix: number
}

export type BackupRunResult = {
  name: string
  sizeBytes: number
  pruned: string[]
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  const data = (await response.json()) as ApiEnvelope<T>
  if (!response.ok || !data.success) {
    throw new Error(data.message ?? `Request failed: ${data.error_code ?? response.status}`)
  }

  return data.value as T
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  }
  const value = search.toString()
  return value ? `?${value}` : ''
}

export type DbTableInfo = { name: string; approxRows: number }
export type DbColumnInfo = {
  name: string
  dataType: string
  columnType: string
  nullable: boolean
  isPrimaryKey: boolean
  extra: string
  binary: boolean
}
export type DbRowsResponse = {
  columns: DbColumnInfo[]
  primaryKey: string[]
  rows: (string | null)[][]
  total: number
  page: number
  size: number
}
export type DbWriteResult = { rowsAffected: number; backupCreated: boolean }
export type DbRowValues = Record<string, string | null>

export const adminApi = {
  session: () => request<AdminSession>('/web/api/session'),
  login: (username: string, password: string) =>
    request<AdminSession>('/web/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request<void>('/web/api/logout', {
      method: 'POST',
    }),
  dashboard: () => request<DashboardData>('/web/api/dashboard'),
  checkinStatus: () => request<UserCheckinStatus>('/web/api/checkin'),
  claimCheckin: () =>
    request<UserCheckinStatus>('/web/api/checkin', {
      method: 'POST',
    }),
  operation: (operation: AdminOperation) =>
    request<void>(`/web/api/operations/${operation}`, {
      method: 'POST',
    }),
  users: (params: PageParams & { q?: string; status?: string }) =>
    request<PageData<UserRow>>(
      `/web/api/users${query({
        q: params.q,
        status: params.status,
        page: params.page,
        page_size: params.pageSize,
      })}`,
    ),
  setChartEditorPermission: (userId: number, enabled: boolean) =>
    request<AdminActionResult>(
      `/web/api/users/${userId}/chart-constant-permission`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      },
    ),
  songs: (params: PageParams & { q?: string }) =>
    request<PageData<SongRow>>(
      `/web/api/songs${query({
        q: params.q,
        page: params.page,
        page_size: params.pageSize,
      })}`,
    ),
  createSong: (payload: SongPayload) =>
    request<void>('/web/api/songs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSong: (sid: string, payload: SongPayload) =>
    request<void>(`/web/api/songs/${encodeURIComponent(sid)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateChartConstants: (sid: string, payload: ChartConstantsPayload) =>
    request<void>(`/web/api/songs/${encodeURIComponent(sid)}/constants`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSong: (sid: string) =>
    request<void>('/web/api/songs', {
      method: 'DELETE',
      body: JSON.stringify({ sid }),
    }),
  items: (params: PageParams & { q?: string }) =>
    request<PageData<ItemRow>>(
      `/web/api/items${query({
        q: params.q,
        page: params.page,
        page_size: params.pageSize,
      })}`,
    ),
  createItem: (payload: ItemPayload) =>
    request<void>('/web/api/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateItem: (payload: ItemPayload) =>
    request<void>('/web/api/items', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteItem: (item_id: string, item_type: string) =>
    request<void>('/web/api/items', {
      method: 'DELETE',
      body: JSON.stringify({ item_id, item_type }),
    }),
  purchases: (params: PageParams & { pq?: string }) =>
    request<PageData<PurchaseRow>>(
      `/web/api/purchases${query({
        pq: params.pq,
        page: params.page,
        page_size: params.pageSize,
      })}`,
    ),
  createPurchase: (payload: PurchasePayload) =>
    request<void>('/web/api/purchases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePurchase: (purchaseName: string, payload: PurchasePayload) =>
    request<void>(`/web/api/purchases/${encodeURIComponent(purchaseName)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deletePurchase: (purchase_name: string) =>
    request<void>('/web/api/purchases', {
      method: 'DELETE',
      body: JSON.stringify({ purchase_name }),
    }),
  purchaseItems: (params: PageParams & { iq?: string }) =>
    request<PageData<PurchaseItemRow>>(
      `/web/api/purchase-items${query({
        iq: params.iq,
        page: params.page,
        page_size: params.pageSize,
      })}`,
    ),
  createPurchaseItem: (payload: PurchaseItemPayload) =>
    request<void>('/web/api/purchase-items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePurchaseItem: (payload: PurchaseItemPayload) =>
    request<void>('/web/api/purchase-items', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deletePurchaseItem: (
    purchase_name: string,
    item_id: string,
    item_type: string,
  ) =>
    request<void>('/web/api/purchase-items', {
      method: 'DELETE',
      body: JSON.stringify({ purchase_name, item_id, item_type }),
    }),
  userScores: (params: UserSelectorPayload) =>
    request<AdminUserScores>(
      `/web/api/user-scores${query({
        user_id: params.user_id,
        name: params.name,
        user_code: params.user_code,
      })}`,
    ),
  scoreImages: (params: UserSelectorPayload) =>
    request<ScoreImages>(
      `/web/api/score-images${query({
        user_id: params.user_id,
        name: params.name,
        user_code: params.user_code,
      })}`,
    ),
  chartTop: (params: { sid: string; difficulty: number; limit?: number }) =>
    request<AdminChartTop>(
      `/web/api/chart-top${query({
        sid: params.sid,
        difficulty: params.difficulty,
        limit: params.limit,
      })}`,
    ),
  updateUserTicket: (payload: UserTicketPayload) =>
    request<AdminActionResult>('/web/api/admin-actions/user-ticket', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetUserPassword: (payload: UserPasswordPayload) =>
    request<AdminActionResult>('/web/api/admin-actions/user-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createUser: (payload: UserCreatePayload) =>
    request<AdminUserSummary>('/web/api/admin-actions/user-create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  banUser: (payload: UserSelectorPayload) =>
    request<AdminActionResult>('/web/api/admin-actions/user-ban', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateUserPurchase: (payload: UserPurchasePayload) =>
    request<AdminActionResult>('/web/api/admin-actions/user-purchase', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteScores: (payload: ScoreDeletePayload) =>
    request<AdminActionResult>('/web/api/admin-actions/scores/delete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  redeemUsers: (code: string) =>
    request<AdminRedeemUsers>(
      `/web/api/redeem-users${query({
        code,
      })}`,
    ),
  createPresent: (payload: PresentPayload) =>
    request<AdminActionResult>('/web/api/admin-actions/presents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deletePresent: (present_id: string) =>
    request<AdminActionResult>('/web/api/admin-actions/presents', {
      method: 'DELETE',
      body: JSON.stringify({ present_id }),
    }),
  deliverPresent: (payload: PresentDeliverPayload) =>
    request<AdminActionResult>('/web/api/admin-actions/presents/deliver', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createRedeem: (payload: RedeemPayload) =>
    request<AdminActionResult>('/web/api/admin-actions/redeems', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteRedeem: (code: string) =>
    request<AdminActionResult>('/web/api/admin-actions/redeems', {
      method: 'DELETE',
      body: JSON.stringify({ code }),
    }),
  bundleManagerScan: () =>
    request<BundleScanReport>('/web/api/bundle-manager/scan', {
      method: 'POST',
    }),
  bundleManagerBuild: (payload: BundleBuildPayload) =>
    request<BundleBuildResult>('/web/api/bundle-manager/build', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  bundleSongs: () =>
    request<BundleSongSummary[]>('/web/api/bundle-manager/songs'),
  bundleSongGet: (id: string) =>
    request<Record<string, unknown>>(
      `/web/api/bundle-manager/song${query({ id })}`,
    ),
  bundleSongUpsert: (originalId: string | undefined, entry: unknown) =>
    request<BundleSongUpsertResult>('/web/api/bundle-manager/song', {
      method: 'POST',
      body: JSON.stringify({ original_id: originalId, entry }),
    }),
  bundleSongsDelete: (ids: string[], cascadeUnlocks: boolean) =>
    request<BundleSongDeleteResult>('/web/api/bundle-manager/songs', {
      method: 'DELETE',
      body: JSON.stringify({ ids, cascade_unlocks: cascadeUnlocks }),
    }),
  // multipart: bypasses request() because Content-Type must be set by the
  // browser (with the multipart boundary), not forced to application/json.
  bundleSongImport: async (
    entry: string,
    overwrite: boolean,
    files: File[],
  ): Promise<BundleSongImportResult> => {
    const form = new FormData()
    form.append('entry', entry)
    form.append('overwrite', String(overwrite))
    for (const file of files) {
      form.append('files', file, file.name)
    }
    const response = await fetch('/web/api/bundle-manager/import', {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    const data = (await response.json()) as ApiEnvelope<BundleSongImportResult>
    if (!response.ok || !data.success) {
      throw new Error(
        data.message ?? `Request failed: ${data.error_code ?? response.status}`,
      )
    }
    return data.value as BundleSongImportResult
  },
  catalogList: (kind: 'packlist' | 'unlocks') =>
    request<Record<string, unknown>[]>(`/web/api/bundle-manager/catalog/${kind}`),
  catalogGet: (kind: 'packlist' | 'unlocks', id: string) =>
    request<Record<string, unknown>>(
      `/web/api/bundle-manager/catalog/${kind}/entry${query({ id })}`,
    ),
  catalogUpsert: (
    kind: 'packlist' | 'unlocks',
    originalId: string | undefined,
    entry: unknown,
  ) =>
    request<{ id: string; created: boolean; backupPath: string }>(
      `/web/api/bundle-manager/catalog/${kind}`,
      { method: 'POST', body: JSON.stringify({ original_id: originalId, entry }) },
    ),
  catalogDelete: (kind: 'packlist' | 'unlocks', ids: string[]) =>
    request<{ removed: number; notFound: string[]; backupPath: string }>(
      `/web/api/bundle-manager/catalog/${kind}`,
      { method: 'DELETE', body: JSON.stringify({ ids }) },
    ),
  // Image URLs the browser <img> loads directly (cookie-authenticated).
  jacketUrl: (songId: string) =>
    `/web/api/asset/jacket${query({ song: songId })}`,
  packImageUrl: (packId: string) => `/web/api/asset/pack${query({ id: packId })}`,
  // multipart PNG upload for the pack-image studio
  packImageSave: async (
    id: string,
    png: Blob,
    alsoSmall: boolean,
  ): Promise<string[]> => {
    const form = new FormData()
    form.append('id', id)
    form.append('also_small', String(alsoSmall))
    form.append('file', png, `1080_select_${id}.png`)
    const response = await fetch('/web/api/pack-image', {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    const data = (await response.json()) as ApiEnvelope<string[]>
    if (!response.ok || !data.success) {
      throw new Error(
        data.message ?? `Request failed: ${data.error_code ?? response.status}`,
      )
    }
    return data.value as string[]
  },
  packlistReferences: (id: string) =>
    request<{ packId: string; songIds: string[] }>(
      `/web/api/bundle-manager/packlist/references${query({ id })}`,
    ),
  packlistDelete: (payload: {
    pack_id: string
    action: 'none' | 'delete_songs' | 'reassign'
    reassign_to?: string
    cascade_unlocks?: boolean
  }) =>
    request<{
      packId: string
      action: string
      referencingSongCount: number
      reassignedTo?: string
      deletedSongs: number
      removedUnlocks: number
      backups: string[]
    }>('/web/api/bundle-manager/packlist/delete', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  worldMaps: () => request<WorldMapSummary[]>('/web/api/world-maps'),
  worldMapGet: (id: string) =>
    request<Record<string, unknown>>(`/web/api/world-maps/entry${query({ id })}`),
  worldMapUpsert: (mapId: string, entry: unknown, overwrite: boolean) =>
    request<{ mapId: string; created: boolean; backupPath?: string }>(
      '/web/api/world-maps',
      { method: 'POST', body: JSON.stringify({ map_id: mapId, entry, overwrite }) },
    ),
  worldMapDelete: (mapId: string) =>
    request<{ mapId: string; backupPath?: string }>('/web/api/world-maps', {
      method: 'DELETE',
      body: JSON.stringify({ map_id: mapId }),
    }),
  characters: () => request<CharacterDef[]>('/web/api/characters'),
  userCharacters: (selector: UserSelectorPayload) =>
    request<UserCharactersResponse>(
      `/web/api/user-characters${query(selector as Record<string, string | number | undefined>)}`,
    ),
  grantCharacter: (selector: UserSelectorPayload, characterId: number) =>
    request<UserCharactersResponse>('/web/api/admin-actions/grant-character', {
      method: 'POST',
      body: JSON.stringify({ ...selector, character_id: characterId }),
    }),
  removeCharacter: (selector: UserSelectorPayload, characterId: number) =>
    request<UserCharactersResponse>('/web/api/admin-actions/user-character', {
      method: 'DELETE',
      body: JSON.stringify({ ...selector, character_id: characterId }),
    }),
  backupRun: () =>
    request<BackupRunResult>('/web/api/backup/run', { method: 'POST' }),
  backupList: () => request<BackupFile[]>('/web/api/backup/list'),
  // The browser navigates to this URL directly (cookie auth) to download.
  backupDownloadUrl: (name: string) =>
    `/web/api/backup/download?name=${encodeURIComponent(name)}`,
  // Generic DB editor
  dbTables: () => request<DbTableInfo[]>('/web/api/db/tables'),
  dbRows: (
    table: string,
    opts: { page?: number; size?: number; orderBy?: string; orderDir?: string; filterCol?: string; filterVal?: string } = {},
  ) =>
    request<DbRowsResponse>(
      `/web/api/db/table/${encodeURIComponent(table)}/rows${query({
        page: opts.page,
        size: opts.size,
        order_by: opts.orderBy,
        order_dir: opts.orderDir,
        filter_col: opts.filterCol,
        filter_val: opts.filterVal,
      })}`,
    ),
  dbRowWrite: (
    table: string,
    payload: { op: 'insert' | 'update'; pk?: DbRowValues; values: DbRowValues; confirm: boolean },
  ) =>
    request<DbWriteResult>(`/web/api/db/table/${encodeURIComponent(table)}/row`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  dbRowDelete: (table: string, pk: DbRowValues) =>
    request<DbWriteResult>(`/web/api/db/table/${encodeURIComponent(table)}/delete`, {
      method: 'POST',
      body: JSON.stringify({ pk, confirm: true }),
    }),
}
