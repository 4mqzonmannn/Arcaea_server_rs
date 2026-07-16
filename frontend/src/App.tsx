import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  Activity,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChartSpline,
  CircleHelp,
  Drama,
  Database,
  DatabaseBackup,
  Eye,
  Gift,
  ImagePlus,
  Images,
  Info,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ListMusic,
  Lock,
  Map as MapIcon,
  Music2,
  Package,
  PackagePlus,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  adminApi,
  type AdminChartTop,
  type AdminActionResult,
  type AdminOperation,
  type AdminScoreRow,
  type AdminSession,
  type AdminUserSummary,
  type AdminUserScores,
  type BackupFile,
  type BundleBuildResult,
  type BundleScanReport,
  type DbTableInfo,
  type DbRowsResponse,
  type BundleSongImportResult,
  type CharacterDef,
  type WorldMapSummary,
  type UserCharacter,
  type BundleSongSummary,
  type DashboardData,
  type ItemPayload,
  type ItemRow,
  type PageData,
  type PresentDeliverPayload,
  type PresentPayload,
  type PurchaseItemPayload,
  type PurchaseItemRow,
  type PurchasePayload,
  type PurchaseRow,
  type RedeemPayload,
  type ScoreDeletePayload,
  type ScoreImages,
  type SongPayload,
  type SongRow,
  type UserPurchasePayload,
  type UserCheckinStatus,
  type UserRow,
  type UserSelectorPayload,
  type UserTicketPayload,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const defaultAppTitle = 'Arcaea Server'
const githubUrl = 'https://github.com/YinMo19/Arcaea_server_rs'

type LoginPosition = 'left' | 'center' | 'right'
type LoginConfig = {
  title: string
  backgroundUrl?: string
  position: LoginPosition
  cardOpacity: number
  surfaceOpacity: number
}

const defaultLoginConfig: LoginConfig = {
  title: defaultAppTitle,
  position: 'center',
  cardOpacity: 1,
  surfaceOpacity: 1,
}

function normalizeLoginPosition(value?: string): LoginPosition {
  return value === 'left' || value === 'right' ? value : 'center'
}

function normalizeLoginCardOpacity(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1
  }

  return Math.min(1, Math.max(0, value))
}

function opacityPercent(value: number): number {
  return Math.round(value * 1000) / 10
}

function loginConfigFromSession(session: AdminSession): LoginConfig {
  const title = session.appTitle?.trim() || defaultAppTitle
  const backgroundUrl = session.loginBackground?.trim() || undefined

  return {
    title,
    backgroundUrl,
    position: normalizeLoginPosition(session.loginPosition),
    cardOpacity: normalizeLoginCardOpacity(session.loginCardOpacity),
    surfaceOpacity: normalizeLoginCardOpacity(session.webSurfaceOpacity),
  }
}

type View =
  | 'dashboard'
  | MaintenanceView
  | 'checkin'
  | 'users'
  | 'playerScores'
  | 'scoreImages'
  | 'chartTop'
  | 'userTicket'
  | 'userPassword'
  | 'userCreate'
  | 'userBan'
  | 'userPurchase'
  | 'scoreDelete'
  | 'presentCreate'
  | 'presentDeliver'
  | 'presentDelete'
  | 'redeemCreate'
  | 'redeemDelete'
  | 'redeemUsers'
  | 'songs'
  | 'items'
  | 'purchases'
  | 'purchaseItems'
  | 'characters'
  | 'bundleManager'
  | 'songlistEdit'
  | 'packlistEdit'
  | 'unlocksEdit'
  | 'worldMapEdit'
  | 'packImageStudio'
  | 'backup'
  | 'dbEditor'
  | 'help'

type MaintenanceView =
  | 'refreshSongFileCache'
  | 'refreshContentBundleCache'
  | 'refreshAllScoreRating'

type MaintenanceOperationConfig = {
  operation: AdminOperation
  title: string
  description: string
  buttonLabel: string
  confirmText?: string
}

const maintenanceOperations: Record<MaintenanceView, MaintenanceOperationConfig> = {
  refreshSongFileCache: {
    operation: 'refresh_song_file_cache',
    title: '更新 Song Hash',
    description:
      '曲ファイルの hash キャッシュを再スキャンします。songs フォルダ内の譜面や音源を直接追加・変更・削除した後に実行してください',
    buttonLabel: '更新 Song Hash',
  },
  refreshContentBundleCache: {
    operation: 'refresh_content_bundle_cache',
    title: '更新 Bundle',
    description:
      'コンテンツバンドルキャッシュを再読み込みします。新しいバンドルを構築した後に実行すると、サーバー再起動なしで新バンドルが配信されるようになります',
    buttonLabel: '更新 Bundle',
  },
  refreshAllScoreRating: {
    operation: 'refresh_all_score_rating',
    title: 'Rating 再計算',
    description:
      '全プレイヤーの全成績の Rating (譜面定数に基づくスコア評価値) を再計算します。譜面定数を変更した後に実行してください。成績数によっては時間がかかります',
    buttonLabel: 'Rating 再計算',
    confirmText: '全成績の Rating を再計算しますか？成績数によっては時間がかかります。',
  },
}

type NavItem = {
  id: View
  label: string
  icon: typeof Activity
}

const navSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '概要',
    items: [{ id: 'dashboard', label: 'ダッシュボード', icon: Activity }],
  },
  {
    label: '検索',
    items: [
      { id: 'users', label: 'プレイヤー', icon: Users },
      { id: 'playerScores', label: 'プレイヤー成績', icon: ChartSpline },
      { id: 'chartTop', label: '楽曲ランキング', icon: Search },
      { id: 'redeemUsers', label: '引換コード使用者', icon: Users },
    ],
  },
  {
    label: 'アカウント',
    items: [
      { id: 'checkin', label: 'チェックイン', icon: Gift },
      { id: 'userCreate', label: 'アカウント登録', icon: UserPlus },
      { id: 'userTicket', label: 'チケット', icon: Pencil },
      { id: 'userPassword', label: 'パスワードリセット', icon: KeyRound },
      { id: 'userBan', label: 'ユーザーBAN', icon: ShieldAlert },
      { id: 'userPurchase', label: '購入権限', icon: ShoppingBag },
      { id: 'characters', label: 'キャラクター', icon: Drama },
    ],
  },
  {
    label: '成績',
    items: [
      { id: 'scoreImages', label: '成績画像', icon: Images },
      { id: 'scoreDelete', label: '成績削除', icon: Trash2 },
    ],
  },
  {
    label: '報酬',
    items: [
      { id: 'presentCreate', label: '報酬追加', icon: Plus },
      { id: 'presentDeliver', label: '報酬配布', icon: PackagePlus },
      { id: 'presentDelete', label: '報酬削除', icon: Trash2 },
    ],
  },
  {
    label: '引換コード',
    items: [
      { id: 'redeemCreate', label: '引換コード追加', icon: Plus },
      { id: 'redeemDelete', label: '引換コード削除', icon: Trash2 },
    ],
  },
  {
    label: 'データテーブル',
    items: [
      { id: 'songs', label: '楽曲', icon: Music2 },
      { id: 'items', label: 'アイテム', icon: Boxes },
      { id: 'purchases', label: '購入項目', icon: ShoppingBag },
      { id: 'purchaseItems', label: '購入アイテム', icon: Link2 },
    ],
  },
  {
    label: 'メンテナンス',
    items: [
      { id: 'refreshSongFileCache', label: '更新 Song Hash', icon: RefreshCcw },
      { id: 'refreshContentBundleCache', label: '更新 Bundle', icon: RefreshCcw },
      { id: 'refreshAllScoreRating', label: 'Rating 再計算', icon: RefreshCcw },
      { id: 'backup', label: 'DB バックアップ', icon: DatabaseBackup },
      { id: 'dbEditor', label: 'DB エディタ', icon: Database },
    ],
  },
  {
    label: 'コンテンツバンドル',
    items: [
      { id: 'bundleManager', label: 'Bundle 管理', icon: PackageSearch },
      { id: 'songlistEdit', label: 'Songlist 編集', icon: ListMusic },
      { id: 'packlistEdit', label: 'Packlist 編集', icon: Package },
      { id: 'unlocksEdit', label: 'Unlocks 編集', icon: Lock },
      { id: 'worldMapEdit', label: 'World マップ作成', icon: MapIcon },
      { id: 'packImageStudio', label: 'パック画像生成', icon: ImagePlus },
    ],
  },
  {
    label: 'その他',
    items: [{ id: 'help', label: 'ヘルプ', icon: CircleHelp }],
  },
]

const userAllowedViews = new Set<View>([
  'checkin',
  'playerScores',
  'scoreImages',
  'chartTop',
  'items',
  'purchases',
])

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type ActionState = {
  kind: 'idle' | 'success' | 'error'
  message: string
}

const emptyAction: ActionState = { kind: 'idle', message: '' }
const defaultTablePageSize = 25
const pageSizeOptions = [10, 25, 50, 100]

const emptySongForm: SongPayload = {
  sid: '',
  name_en: '',
  rating_pst: '-1',
  rating_prs: '-1',
  rating_ftr: '-1',
  rating_byd: '-1',
  rating_etr: '-1',
}

const emptyItemForm: ItemPayload = {
  item_id: '',
  item_type: '',
  is_available: 1,
}

const emptyPurchaseForm: PurchasePayload = {
  purchase_name: '',
  price: '',
  orig_price: '',
  discount_from: '',
  discount_to: '',
  discount_reason: '',
}

const emptyPurchaseItemForm: PurchaseItemPayload = {
  purchase_name: '',
  item_id: '',
  item_type: '',
  amount: '1',
}

type UserSelectorForm = {
  userId: string
  name: string
  userCode: string
}

const emptyUserSelectorForm: UserSelectorForm = {
  userId: '',
  name: '',
  userCode: '',
}

type UserTicketForm = UserSelectorForm & {
  ticket: string
  allUsers: boolean
}

const emptyUserTicketForm: UserTicketForm = {
  ...emptyUserSelectorForm,
  ticket: '',
  allUsers: false,
}

type UserPasswordForm = UserSelectorForm & {
  password: string
}

const emptyUserPasswordForm: UserPasswordForm = {
  ...emptyUserSelectorForm,
  password: '',
}

type UserCreateForm = {
  name: string
  password: string
  email: string
}

const emptyUserCreateForm: UserCreateForm = {
  name: '',
  password: '',
  email: '',
}

type UserPurchaseForm = UserSelectorForm & {
  method: 'unlock' | 'lock'
  allUsers: boolean
  itemTypes: string[]
}

const defaultUserPurchaseItemTypes = ['pack', 'single']

const emptyUserPurchaseForm: UserPurchaseForm = {
  ...emptyUserSelectorForm,
  method: 'unlock',
  allUsers: false,
  itemTypes: defaultUserPurchaseItemTypes,
}

type ScoreDeleteForm = UserSelectorForm & {
  songId: string
  difficulty: string
}

const emptyScoreDeleteForm: ScoreDeleteForm = {
  ...emptyUserSelectorForm,
  songId: '',
  difficulty: '-1',
}

type PresentForm = {
  presentId: string
  expireTs: string
  description: string
  itemId: string
  itemType: string
  amount: string
}

const emptyPresentForm: PresentForm = {
  presentId: '',
  expireTs: '',
  description: '',
  itemId: '',
  itemType: '',
  amount: '1',
}

type PresentDeliverForm = UserSelectorForm & {
  presentId: string
  allUsers: boolean
}

const emptyPresentDeliverForm: PresentDeliverForm = {
  ...emptyUserSelectorForm,
  presentId: '',
  allUsers: false,
}

type RedeemForm = {
  code: string
  randomAmount: string
  redeemType: string
  itemId: string
  itemType: string
  amount: string
}

const emptyRedeemForm: RedeemForm = {
  code: '',
  randomAmount: '',
  redeemType: '0',
  itemId: '',
  itemType: '',
  amount: '1',
}

const purchaseItemTypeOptions = [
  'pack',
  'single',
  'world_song',
  'world_unlock',
  'course_banner',
  'online_banner',
]

function App() {
  const [session, setSession] = useState<AdminSession>()
  const [checkingSession, setCheckingSession] = useState(true)
  const [loginConfig, setLoginConfig] =
    useState<LoginConfig>(defaultLoginConfig)
  const [view, setView] = useState<View>('dashboard')
  const isAdmin = session?.role === 1
  const canEditChartConstants =
    isAdmin ||
    Boolean(session?.permissions?.includes('web_chart_constant_edit'))
  const hasPageBackground = Boolean(loginConfig.backgroundUrl)
  const shellStyle = hasPageBackground
    ? ({
        '--web-surface-bg': `color-mix(in oklab, var(--card) ${opacityPercent(loginConfig.surfaceOpacity)}%, transparent)`,
        '--web-sidebar-bg': `color-mix(in oklab, var(--sidebar) ${opacityPercent(loginConfig.surfaceOpacity)}%, transparent)`,
        '--web-header-bg': `color-mix(in oklab, var(--background) ${opacityPercent(loginConfig.surfaceOpacity)}%, transparent)`,
        '--web-control-bg': `color-mix(in oklab, var(--background) ${opacityPercent(Math.min(1, loginConfig.surfaceOpacity + 0.15))}%, transparent)`,
      } as CSSProperties)
    : undefined
  const allowedViews = useMemo(() => {
    const allowed = new Set(userAllowedViews)
    if (canEditChartConstants) {
      allowed.add('songs')
    }
    return allowed
  }, [canEditChartConstants])
  const visibleNavSections = useMemo(
    () =>
      isAdmin
        ? navSections
        : navSections
            .map((section) => ({
              ...section,
              items: section.items.filter((item) => allowedViews.has(item.id)),
            }))
            .filter((section) => section.items.length > 0),
    [allowedViews, isAdmin],
  )
  const activeView =
    isAdmin || allowedViews.has(view) ? view : 'checkin'

  useEffect(() => {
    adminApi
      .session()
      .then((session) => {
        setLoginConfig(loginConfigFromSession(session))
        setSession(session.loggedIn ? session : undefined)
        if (session.loggedIn && session.role !== 1) {
          setView('checkin')
        }
      })
      .catch(() => setSession(undefined))
      .finally(() => setCheckingSession(false))
  }, [])

  if (checkingSession) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) {
    return (
      <LoginScreen
        config={loginConfig}
        onLoggedIn={(session) => {
          setLoginConfig(loginConfigFromSession(session))
          setSession(session)
          if (session.role !== 1) {
            setView('checkin')
          }
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        'web-shell min-h-svh bg-background text-foreground',
        hasPageBackground && 'web-shell-with-bg relative',
      )}
      style={shellStyle}
    >
      {loginConfig.backgroundUrl && (
        <>
          <div
            className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${JSON.stringify(loginConfig.backgroundUrl)})`,
            }}
          />
          <div className="pointer-events-none fixed inset-0 bg-background/25" />
        </>
      )}
      <aside className="web-shell-sidebar fixed inset-y-0 left-0 z-20 hidden w-64 border-r bg-sidebar px-4 py-5 lg:block">
        <div className="flex items-center gap-3 px-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Database className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Arcaea Admin</div>
            <div className="text-xs text-muted-foreground">Operations</div>
          </div>
        </div>

        <nav className="mt-6 grid max-h-[calc(100svh-7rem)] gap-4 overflow-auto pr-1">
          {visibleNavSections.map((section) => (
            <div key={section.label} className="grid gap-1">
              <div className="px-3 text-xs font-medium text-muted-foreground">
                {section.label}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={cn(
                    'flex h-9 items-center gap-3 rounded-md px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                    activeView === item.id && 'bg-accent text-accent-foreground',
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="relative z-10 lg:pl-64">
        <header className="web-shell-header sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <div>
              <h1 className="text-lg font-semibold">{viewTitle(activeView)}</h1>
              <p className="text-sm text-muted-foreground">
                {viewSubtitle(activeView)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 max-w-48 rounded-md border bg-background px-3 text-sm lg:hidden"
                value={activeView}
                onChange={(event) => setView(event.target.value as View)}
              >
                {visibleNavSections.map((section) => (
                  <optgroup key={section.label} label={section.label}>
                    {section.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  adminApi.logout().finally(() => setSession(undefined))
                }}
              >
                <LogOut />
                ログアウト
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6">
          {isAdmin && activeView === 'dashboard' && <DashboardView />}
          {isAdmin && isMaintenanceView(activeView) && (
            <MaintenanceOperationView config={maintenanceOperations[activeView]} />
          )}
          {isAdmin && activeView === 'users' && <UsersView />}
          {activeView === 'checkin' && <CheckinView />}
          {activeView === 'playerScores' && <PlayerScoresView isAdmin={isAdmin} />}
          {activeView === 'scoreImages' && <ScoreImagesView isAdmin={isAdmin} />}
          {activeView === 'chartTop' && <ChartTopView />}
          {isAdmin && activeView === 'userTicket' && <UserTicketView />}
          {isAdmin && activeView === 'userPassword' && <UserPasswordView />}
          {isAdmin && activeView === 'userCreate' && <UserCreateView />}
          {isAdmin && activeView === 'userBan' && <UserBanView />}
          {isAdmin && activeView === 'userPurchase' && <UserPurchaseView />}
          {isAdmin && activeView === 'scoreDelete' && <ScoreDeleteView />}
          {isAdmin && activeView === 'presentCreate' && <PresentCreateView />}
          {isAdmin && activeView === 'presentDeliver' && <PresentDeliverView />}
          {isAdmin && activeView === 'presentDelete' && <PresentDeleteView />}
          {isAdmin && activeView === 'redeemCreate' && <RedeemCreateView />}
          {isAdmin && activeView === 'redeemDelete' && <RedeemDeleteView />}
          {isAdmin && activeView === 'redeemUsers' && <RedeemUsersView />}
          {activeView === 'songs' && (
            <SongsView
              isAdmin={isAdmin}
              canEditConstants={canEditChartConstants}
            />
          )}
          {activeView === 'items' && <ItemsView isAdmin={isAdmin} />}
          {activeView === 'purchases' && <PurchasesView isAdmin={isAdmin} />}
          {isAdmin && activeView === 'purchaseItems' && <PurchaseItemsView />}
          {isAdmin && activeView === 'characters' && <CharactersView />}
          {isAdmin && activeView === 'bundleManager' && <BundleManagerView />}
          {isAdmin && activeView === 'songlistEdit' && <SonglistEditView />}
          {isAdmin && activeView === 'packlistEdit' && (
            <CatalogEditView kind="packlist" />
          )}
          {isAdmin && activeView === 'unlocksEdit' && (
            <CatalogEditView kind="unlocks" />
          )}
          {isAdmin && activeView === 'worldMapEdit' && <WorldMapEditView />}
          {isAdmin && activeView === 'packImageStudio' && <PackImageStudio />}
          {isAdmin && activeView === 'backup' && <BackupView />}
          {isAdmin && activeView === 'dbEditor' && <DbEditorView />}
          {isAdmin && activeView === 'help' && <HelpView />}
        </main>
      </div>
    </div>
  )
}

function LoginScreen({
  config,
  onLoggedIn,
}: {
  config: LoginConfig
  onLoggedIn: (session: AdminSession) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const session = await adminApi.login(username, password)
      onLoggedIn(session)
    } catch {
      setError('ユーザー名またはパスワードが正しくありません')
    } finally {
      setLoading(false)
    }
  }

  const cardAnchorClass = {
    left: 'lg:absolute lg:left-1/4 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2',
    center: '',
    right:
      'lg:absolute lg:left-3/4 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2',
  }[config.position]
  const shellWidthClass = config.position === 'center' ? 'max-w-md' : 'max-w-none'
  const cardBackgroundOpacity = opacityPercent(config.cardOpacity)

  return (
    <div className="relative min-h-svh overflow-hidden bg-background px-4 py-6 text-foreground sm:px-6">
      {config.backgroundUrl ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${JSON.stringify(config.backgroundUrl)})`,
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-background/25" />
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(15,23,42,0.07),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.85),rgba(226,232,240,0.58))]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.045)_1px,transparent_1px)] bg-[size:40px_40px]" />
        </>
      )}

      <div
        className={cn(
          'relative mx-auto flex min-h-[calc(100svh-3rem)] w-full flex-col',
          shellWidthClass,
        )}
      >
        <div className="relative flex w-full flex-1 items-center justify-center">
          <Card
            className={cn('w-full max-w-md border shadow-lg backdrop-blur', cardAnchorClass)}
            style={{
              backgroundColor: `color-mix(in oklab, var(--card) ${cardBackgroundOpacity}%, transparent)`,
            }}
          >
            <CardHeader className="gap-5 p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                  <KeyRound className="size-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-xl">{config.title}</CardTitle>
                  <CardDescription className="mt-1">Web コンソールへログイン</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <form className="grid gap-4" onSubmit={onSubmit}>
                <label className="grid gap-1.5 text-sm font-medium">
                  Username
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-11 bg-background pl-10"
                      value={username}
                      autoComplete="username"
                      onChange={(event) => setUsername(event.target.value)}
                      required
                    />
                  </div>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Password
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-11 bg-background pl-10"
                      value={password}
                      type="password"
                      autoComplete="current-password"
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                </label>
                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button className="h-11 w-full" type="submit" disabled={loading}>
                  {loading ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  ログイン
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        <footer className="flex justify-center pb-1 pt-5">
          <a
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            <GithubMark className="size-4" />
            By YinMo19
          </a>
        </footer>
      </div>
    </div>
  )
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 1.85C6.35 1.85 1.78 6.42 1.78 12.07c0 4.52 2.93 8.35 7 9.7.51.09.7-.22.7-.49v-1.8c-2.85.62-3.45-1.22-3.45-1.22-.47-1.18-1.14-1.49-1.14-1.49-.93-.64.07-.63.07-.63 1.03.07 1.57 1.06 1.57 1.06.92 1.57 2.4 1.12 2.98.85.09-.66.36-1.12.65-1.37-2.27-.26-4.66-1.14-4.66-5.06 0-1.12.4-2.03 1.05-2.75-.1-.26-.46-1.3.1-2.71 0 0 .86-.27 2.81 1.05.82-.23 1.69-.34 2.56-.35.87.01 1.75.12 2.56.35 1.95-1.32 2.81-1.05 2.81-1.05.56 1.41.2 2.45.1 2.71.66.72 1.05 1.63 1.05 2.75 0 3.93-2.39 4.79-4.67 5.05.37.32.69.94.69 1.9v2.82c0 .27.18.59.7.49a10.23 10.23 0 0 0 7-9.7C22.22 6.42 17.65 1.85 12 1.85Z" />
    </svg>
  )
}

function DashboardView() {
  const [data, setData] = useState<DashboardData>()
  const [state, setState] = useState<LoadState>('loading')

  function load(showLoading = true) {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .dashboard()
      .then((value) => {
        setData(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }

  useEffect(() => {
    adminApi
      .dashboard()
      .then((value) => {
        setData(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  if (!data) {
    return <LoadPanel state={state} onRetry={() => load()} />
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="24時間アクティブ"
          value={data.onlineUsers}
          sub={`${data.onlineGrowth.toFixed(1)}% vs previous day`}
          icon={Users}
        />
        <MetricCard
          label="成績記録"
          value={data.scoreSubmits}
          sub="best_score rows"
          icon={ChartSpline}
        />
        <MetricCard
          label="報酬付与"
          value={data.presentCount}
          sub="user_present rows"
          icon={ShoppingBag}
        />
        <MetricCard
          label="リスクアカウント"
          value={data.alertCount}
          sub="empty password accounts"
          icon={ShieldAlert}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>最近のイベント</CardTitle>
            <CardDescription>ログイン・システムイベント</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => load()}>
            <RefreshCcw />
            更新
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>イベント</TableHead>
                <TableHead>操作者</TableHead>
                <TableHead>時間</TableHead>
                <TableHead>状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentOps.map((op, index) => (
                <TableRow key={`${op.name}-${op.time}-${index}`}>
                  <TableCell className="font-medium">{op.name}</TableCell>
                  <TableCell>{op.operator}</TableCell>
                  <TableCell>{op.time}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{op.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function UsersView() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<UserRow[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [updatingUserId, setUpdatingUserId] = useState<number>()
  const pagination = useServerPagination(rows, defaultTablePageSize)
  const { setMeta } = pagination

  function load(showLoading = true, page = pagination.page, pageSize = pagination.pageSize) {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .users({ q: query, status, page, pageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }

  function search() {
    load(true, 1, pagination.pageSize)
  }

  async function toggleChartEditor(row: UserRow) {
    if (row.isAdmin) {
      return
    }
    const enabled = !row.canEditChartConstants
    const verb = enabled ? '付与' : '取り消し'
    if (!confirm(`${row.name || row.userId} の曲目定数編集権限を${verb}しますか？`)) {
      return
    }

    setUpdatingUserId(row.userId)
    setAction(emptyAction)
    try {
      const result = await adminApi.setChartEditorPermission(row.userId, enabled)
      setAction({ kind: 'success', message: result.message })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setUpdatingUserId(undefined)
    }
  }

  useEffect(() => {
    adminApi
      .users({ page: 1, pageSize: defaultTablePageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [setMeta])

  return (
    <DataPanel
      title="プレイヤー一覧"
      description="アカウント状態・チケット・直近のプレイ記録"
      state={state}
      onSearch={search}
      searchValue={query}
      onSearchChange={setQuery}
      extraControl={
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">すべての状態</option>
          <option value="normal">正常</option>
          <option value="banned">BAN</option>
        </select>
      }
    >
      <ActionMessage action={action} className="mb-3 block" />
      <TableBlock
        pagination={pagination}
        onPageChange={(page) => load(true, page, pagination.pageSize)}
        onPageSizeChange={(pageSize) => load(true, 1, pageSize)}
        emptyText="プレイヤーデータがありません"
        renderTable={(visibleRows) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>User Code</TableHead>
                <TableHead>PTT</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>直近のプレイ</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>曲目定数権限</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="font-mono">{row.userId}</TableCell>
                  <TableCell className="font-medium">{row.name || '-'}</TableCell>
                  <TableCell>{row.userCode || '-'}</TableCell>
                  <TableCell>{(row.ratingPtt / 100).toFixed(2)}</TableCell>
                  <TableCell>{row.ticket}</TableCell>
                  <TableCell>{row.lastPlay}</TableCell>
                  <TableCell>
                    <Badge variant={row.banned ? 'destructive' : 'secondary'}>
                      {row.banned ? 'BAN' : '正常'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={row.canEditChartConstants ? 'secondary' : 'outline'}
                      >
                        {row.canEditChartConstants ? '許可済み' : '未許可'}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={row.isAdmin || updatingUserId === row.userId}
                        onClick={() => toggleChartEditor(row)}
                      >
                        {updatingUserId === row.userId ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <ShieldCheck />
                        )}
                        {row.isAdmin
                          ? '管理者はデフォルトで保有'
                          : row.canEditChartConstants
                            ? '取り消し'
                            : '付与'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      />
    </DataPanel>
  )
}

function MaintenanceOperationView({
  config,
}: {
  config: MaintenanceOperationConfig
}) {
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function runOperation() {
    if (config.confirmText && !confirm(config.confirmText)) {
      return
    }
    setLoading(true)
    setAction(emptyAction)
    try {
      await adminApi.operation(config.operation)
      setAction({ kind: 'success', message: '操作が完了しました' })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title={config.title} description={config.description}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={runOperation}
        >
          {loading ? <LoaderCircle className="animate-spin" /> : <RefreshCcw />}
          {config.buttonLabel}
        </Button>
        <ActionMessage action={action} />
      </div>
    </ActionCard>
  )
}

function BundleManagerView() {
  const [scanState, setScanState] = useState<LoadState>('loading')
  const [scan, setScan] = useState<BundleScanReport>()

  const [appVersion, setAppVersion] = useState('')
  const [bundleVersion, setBundleVersion] = useState('')
  const [acknowledgeErrors, setAcknowledgeErrors] = useState(false)

  const [preview, setPreview] = useState<BundleBuildResult>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewAction, setPreviewAction] = useState<ActionState>(emptyAction)

  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ActionState>(emptyAction)
  const [written, setWritten] = useState<BundleBuildResult>()
  const [cacheLoading, setCacheLoading] = useState(false)
  const [cacheAction, setCacheAction] = useState<ActionState>(emptyAction)

  const loadScan = useCallback((showLoading = true) => {
    if (showLoading) {
      setScanState('loading')
    }
    adminApi
      .bundleManagerScan()
      .then((value) => {
        setScan(value)
        setScanState('ready')
      })
      .catch(() => setScanState('error'))
  }, [])

  useEffect(() => {
    loadScan()
  }, [loadScan])

  const previewHasErrors = (preview?.scanErrorCount ?? scan?.errorCount ?? 0) > 0

  async function runPreview(event: FormEvent) {
    event.preventDefault()
    setPreviewLoading(true)
    setPreviewAction(emptyAction)
    setPreview(undefined)
    setWritten(undefined)
    setAcknowledgeErrors(false)
    try {
      const result = await adminApi.bundleManagerBuild({
        app_version: requireTrimmed(appVersion, 'app_version'),
        bundle_version: bundleVersion.trim() || undefined,
        dry_run: true,
        force: false,
      })
      setPreview(result)
      setPreviewAction({ kind: 'success', message: `プレビュー生成：${describeDiff(result)}` })
    } catch (error) {
      setPreviewAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setPreviewLoading(false)
    }
  }

  async function confirmWrite() {
    if (!preview || (previewHasErrors && !acknowledgeErrors)) {
      return
    }
    if (
      !confirm(
        `新しい bundle バージョン ${preview.versionNumber} を書き込みますか？サーバー上に新しい .cb/.json ファイルが直接作成され、自動的には元に戻せません。`,
      )
    ) {
      return
    }
    setConfirmLoading(true)
    setConfirmAction(emptyAction)
    try {
      const result = await adminApi.bundleManagerBuild({
        app_version: requireTrimmed(appVersion, 'app_version'),
        bundle_version: bundleVersion.trim() || undefined,
        dry_run: false,
        force: acknowledgeErrors,
      })
      setWritten(result)
      setPreview(undefined)
      setConfirmAction({ kind: 'success', message: `書き込み完了：${describeDiff(result)}` })
      loadScan(false)
    } catch (error) {
      setConfirmAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setConfirmLoading(false)
    }
  }

  async function refreshBundleCache() {
    setCacheLoading(true)
    setCacheAction(emptyAction)
    try {
      await adminApi.operation('refresh_content_bundle_cache')
      setCacheAction({
        kind: 'success',
        message: 'キャッシュを更新しました。クライアントは次回起動時に新バンドルをダウンロードします',
      })
    } catch (error) {
      setCacheAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setCacheLoading(false)
    }
  }

  return (
    <div className="grid gap-4">
      <HelpBox>
        <span>
          <b>バンドル更新の流れ</b>: ① 下のスキャン結果を確認 → ② バージョンを入力して「プレビュー」 →
          ③ 内容に問題がなければ「書き込みを確定」 → ④ 書き込み完了後に「Bundle キャッシュを更新」ボタンを押す →
          ⑤ クライアント (ゲームアプリ) を再起動すると新しいバンドルがダウンロードされます。
        </span>
        <span className="text-xs text-muted-foreground">
          プレビューは何も書き込まないので何度でも安全に実行できます。
        </span>
      </HelpBox>
      <ActionCard
        title="整合性スキャン"
        description="曲データの矛盾 (登録されているのにファイルがない等) を自動チェックします。エラーがあるままバンドルを配信するとクライアントが不具合を起こす可能性があります"
      >
        {scanState === 'loading' || scanState === 'error' ? (
          <LoadPanel state={scanState} onRetry={() => loadScan()} />
        ) : (
          scan && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={scan.errorCount > 0 ? 'destructive' : 'secondary'}>
                  {scan.errorCount} エラー
                </Badge>
                <Badge variant="outline">{scan.warnCount} 警告</Badge>
                <Badge variant="outline">{scan.infoCount} 情報</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => loadScan()}
                >
                  <RefreshCcw />
                  再スキャン
                </Button>
              </div>
              <div className="grid max-h-96 gap-1.5 overflow-y-auto rounded-md border p-3 text-sm">
                {scan.findings.map((finding, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Badge
                      className="mt-0.5 shrink-0"
                      variant={
                        finding.severity === 'error'
                          ? 'destructive'
                          : finding.severity === 'warn'
                            ? 'outline'
                            : 'secondary'
                      }
                    >
                      {finding.severity}
                    </Badge>
                    <span className="text-muted-foreground">{finding.message}</span>
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </ActionCard>

      <ActionCard
        title="Bundle 構築"
        description="現在の songs フォルダの内容から、クライアントに配信する新しいバンドルを作成します"
      >
        <form className="grid gap-3" onSubmit={runPreview}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={appVersion}
              onChange={(event) => setAppVersion(event.target.value)}
              placeholder="app_version (必須、例: 6.5.0)"
              required
            />
            <Input
              value={bundleVersion}
              onChange={(event) => setBundleVersion(event.target.value)}
              placeholder="bundle_version (任意、空欄で自動採番)"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="outline" disabled={previewLoading}>
              {previewLoading ? <LoaderCircle className="animate-spin" /> : <Eye />}
              プレビュー
            </Button>
            <ActionMessage action={previewAction} />
          </div>
        </form>

        {preview && (
          <div className="grid gap-3 rounded-md border p-3">
            <div className="text-sm font-medium">プレビュー結果 · {describeDiff(preview)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-muted-foreground">バージョン</dt>
              <dd>
                {preview.previousVersionNumber ?? 'null'} → {preview.versionNumber}
              </dd>
              <dt className="text-muted-foreground">サイズ</dt>
              <dd>{formatBytes(preview.bundleBytes)}</dd>
              <dt className="text-muted-foreground">スキャンエラー</dt>
              <dd>{preview.scanErrorCount}</dd>
              <dt className="text-muted-foreground">スキャン警告</dt>
              <dd>{preview.scanWarnCount}</dd>
            </dl>

            {previewHasErrors && (
              <ToggleLabel
                checked={acknowledgeErrors}
                onChange={setAcknowledgeErrors}
                label={`確認済み: ${preview.scanErrorCount} 件の未解決エラーがありますが、書き込みを続行します`}
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={confirmLoading || (previewHasErrors && !acknowledgeErrors)}
                onClick={confirmWrite}
              >
                {confirmLoading ? <LoaderCircle className="animate-spin" /> : <Save />}
                書き込みを確定
              </Button>
              <ActionMessage action={confirmAction} />
            </div>
          </div>
        )}

        {written && (
          <div className="grid gap-2 rounded-md border border-emerald-600/30 bg-emerald-600/10 px-3 py-2.5 text-sm text-emerald-700">
            <div>
              書き込み完了：{written.writtenFiles?.[0]} と {written.writtenFiles?.[1]}
            </div>
            <div>
              次のステップ: サーバーに新しいバンドルを認識させるため、キャッシュを更新してください。
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={cacheLoading}
                onClick={refreshBundleCache}
              >
                {cacheLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCcw />}
                Bundle キャッシュを更新
              </Button>
              <ActionMessage action={cacheAction} />
            </div>
          </div>
        )}
      </ActionCard>
    </div>
  )
}

function describeDiff(result: BundleBuildResult) {
  return `追加 ${result.addedCount} · 変更 ${result.changedCount} · 不変 ${result.unchangedCount} · 削除 ${result.removedCount}`
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(1)} ${units[index]}`
}

// ---- shared form-editor infrastructure (form <-> raw JSON, round-trip
// preserves every key the form doesn't model) ----

type JsonObject = Record<string, unknown>

/** Read a dotted path (numeric segments index arrays), e.g. "difficulties.0.rating". */
function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/** Immutably set a dotted path, creating intermediate arrays/objects as needed. */
function setPath(root: JsonObject, path: string, value: unknown): JsonObject {
  const keys = path.split('.')
  const clone: JsonObject = Array.isArray(root)
    ? ([...(root as unknown[])] as unknown as JsonObject)
    : { ...root }
  let cur: Record<string, unknown> = clone
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    const child = cur[k]
    const nextIsIndex = /^\d+$/.test(keys[i + 1])
    const childClone: unknown = Array.isArray(child)
      ? [...(child as unknown[])]
      : child && typeof child === 'object'
        ? { ...(child as Record<string, unknown>) }
        : nextIsIndex
          ? []
          : {}
    cur[k] = childClone
    cur = childClone as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
  return clone
}

type SetFn = (path: string, value: unknown) => void

/** Bound text input. */
function TF({
  label,
  obj,
  set,
  path,
  placeholder,
  hint,
}: {
  label: string
  obj: JsonObject
  set: SetFn
  path: string
  placeholder?: string
  hint?: string
}) {
  const raw = getPath(obj, path)
  return (
    <Field label={label} hint={hint}>
      <Input
        value={raw === undefined || raw === null ? '' : String(raw)}
        placeholder={placeholder}
        onChange={(event) => set(path, event.target.value)}
      />
    </Field>
  )
}

/** Bound number input (stores a JS number; blank keeps an empty string). */
function NF({
  label,
  obj,
  set,
  path,
  placeholder,
  hint,
}: {
  label: string
  obj: JsonObject
  set: SetFn
  path: string
  placeholder?: string
  hint?: string
}) {
  const raw = getPath(obj, path)
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        value={raw === undefined || raw === null ? '' : String(raw)}
        placeholder={placeholder}
        onChange={(event) => {
          const v = event.target.value
          set(path, v === '' ? '' : Number.isNaN(Number(v)) ? v : Number(v))
        }}
      />
    </Field>
  )
}

/** Bound boolean toggle. */
function BF({
  label,
  obj,
  set,
  path,
}: {
  label: string
  obj: JsonObject
  set: SetFn
  path: string
}) {
  return (
    <ToggleLabel
      checked={Boolean(getPath(obj, path))}
      onChange={(checked) => set(path, checked)}
      label={label}
    />
  )
}

type FormRenderer = (obj: JsonObject, set: SetFn) => ReactNode

type EditorSession = {
  title: string
  initial: JsonObject
  form: FormRenderer
  save: (obj: JsonObject) => Promise<void>
}

/** Editor panel with a form / raw-JSON toggle over one shared object. */
function EntryEditor({
  session,
  onClose,
}: {
  session: EditorSession
  onClose: () => void
}) {
  const [obj, setObj] = useState<JsonObject>(session.initial)
  const [mode, setMode] = useState<'form' | 'json'>('form')
  const [jsonText, setJsonText] = useState(() => JSON.stringify(session.initial, null, 2))
  const [jsonError, setJsonError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState<ActionState>(emptyAction)

  const set: SetFn = (path, value) => setObj((prev) => setPath(prev, path, value))

  function switchTo(next: 'form' | 'json') {
    if (next === 'json') {
      setJsonText(JSON.stringify(obj, null, 2))
      setJsonError(undefined)
    }
    setMode(next)
  }

  function onJsonChange(text: string) {
    setJsonText(text)
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setObj(parsed as JsonObject)
        setJsonError(undefined)
      } else {
        setJsonError('JSON はオブジェクトである必要があります')
      }
    } catch (error) {
      setJsonError(errorMessage(error))
    }
  }

  async function save() {
    if (mode === 'json' && jsonError) {
      setAction({ kind: 'error', message: `JSON が不正です: ${jsonError}` })
      return
    }
    setSaving(true)
    setAction(emptyAction)
    try {
      await session.save(obj)
      onClose()
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{session.title}</div>
        <div className="inline-flex overflow-hidden rounded-md border text-sm">
          <button
            type="button"
            className={cn('px-3 py-1', mode === 'form' && 'bg-primary text-primary-foreground')}
            onClick={() => switchTo('form')}
          >
            フォーム編集
          </button>
          <button
            type="button"
            className={cn('px-3 py-1', mode === 'json' && 'bg-primary text-primary-foreground')}
            onClick={() => switchTo('json')}
          >
            生 JSON
          </button>
        </div>
      </div>

      {mode === 'form' ? (
        <div className="grid gap-3">{session.form(obj, set)}</div>
      ) : (
        <>
          <textarea
            className="min-h-96 w-full rounded-md border bg-background p-3 font-mono text-xs"
            value={jsonText}
            onChange={(event) => onJsonChange(event.target.value)}
            spellCheck={false}
          />
          {jsonError && <span className="text-xs text-destructive">{jsonError}</span>}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={save}>
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
          保存
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          キャンセル
        </Button>
        <ActionMessage action={action} />
      </div>
    </div>
  )
}

/** Small labeled container for one array-of-objects section with add/remove. */
function ArraySection({
  title,
  obj,
  set,
  path,
  makeItem,
  children,
}: {
  title: string
  obj: JsonObject
  set: SetFn
  path: string
  makeItem: () => JsonObject
  children: (item: JsonObject, index: number) => ReactNode
}) {
  const arr = (getPath(obj, path) as JsonObject[] | undefined) ?? []
  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {title} ({arr.length})
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => set(path, [...arr, makeItem()])}
        >
          <Plus />
          追加
        </Button>
      </div>
      {arr.map((item, index) => (
        <div key={index} className="grid gap-2 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">#{index}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                set(
                  path,
                  arr.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 />
              削除
            </Button>
          </div>
          {children(item, index)}
        </div>
      ))}
    </div>
  )
}

const ratingClassLabels: Record<number, string> = {
  0: 'PST (Past)',
  1: 'PRS (Present)',
  2: 'FTR (Future)',
  3: 'BYD (Beyond)',
  4: 'ETR (Eternal)',
}

function RatingClassSelect({
  obj,
  set,
  path,
}: {
  obj: JsonObject
  set: SetFn
  path: string
}) {
  const value = getPath(obj, path)
  return (
    <Field label="難易度 (ratingClass)">
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={value === undefined ? '' : String(value)}
        onChange={(event) => set(path, Number(event.target.value))}
      >
        {[0, 1, 2, 3, 4].map((rc) => (
          <option key={rc} value={rc}>
            {rc}: {ratingClassLabels[rc]}
          </option>
        ))}
      </select>
    </Field>
  )
}

// ---- per-editor form renderers ----

const songTemplate: JsonObject = {
  id: 'newsong',
  title_localized: { en: 'New Song' },
  artist: '',
  bpm: '120',
  bpm_base: 120,
  set: 'base',
  purchase: '',
  audioPreview: 0,
  audioPreviewEnd: 10000,
  side: 0,
  bg: 'base_light',
  date: 0,
  version: '1.0',
  difficulties: [{ ratingClass: 2, chartDesigner: '', jacketDesigner: '', rating: 8 }],
}

function renderSonglistForm(obj: JsonObject, set: SetFn): ReactNode {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TF label="曲ID (id)" obj={obj} set={set} path="id" placeholder="例: newsong" hint="半角小文字英数字と _" />
        <TF label="曲名 (英)" obj={obj} set={set} path="title_localized.en" />
        <TF label="曲名 (日)" obj={obj} set={set} path="title_localized.ja" hint="空欄可 (英語表示になります)" />
        <TF label="アーティスト" obj={obj} set={set} path="artist" />
        <TF label="BPM (表示用文字列)" obj={obj} set={set} path="bpm" placeholder="例: 178 や 160-200" />
        <NF label="BPM (数値/ソート用)" obj={obj} set={set} path="bpm_base" />
        <TF label="パック (set)" obj={obj} set={set} path="set" hint="packlist の id と対応 (例: base)" />
        <TF label="購入ID (purchase)" obj={obj} set={set} path="purchase" hint="無料なら空欄" />
        <NF label="試聴開始 (ms)" obj={obj} set={set} path="audioPreview" />
        <NF label="試聴終了 (ms)" obj={obj} set={set} path="audioPreviewEnd" />
        <NF label="side (0=光/1=対立/2=幻...)" obj={obj} set={set} path="side" />
        <TF label="背景 (bg)" obj={obj} set={set} path="bg" placeholder="例: base_light" />
        <NF label="日付 (date, UNIX秒)" obj={obj} set={set} path="date" />
        <TF label="バージョン (version)" obj={obj} set={set} path="version" placeholder="例: 1.0" />
      </div>
      <div className="flex flex-wrap gap-2">
        <BF label="remote_dl (ダウンロード配信)" obj={obj} set={set} path="remote_dl" />
        <BF label="world_unlock (World解禁曲)" obj={obj} set={set} path="world_unlock" />
      </div>
      <ArraySection
        title="難易度 (difficulties)"
        obj={obj}
        set={set}
        path="difficulties"
        makeItem={() => ({ ratingClass: 2, chartDesigner: '', jacketDesigner: '', rating: 8 })}
      >
        {(_item, index) => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RatingClassSelect obj={obj} set={set} path={`difficulties.${index}.ratingClass`} />
            <NF label="定数 (rating)" obj={obj} set={set} path={`difficulties.${index}.rating`} hint="実際の数値。-1=未収録" />
            <BF label="+ 表記 (ratingPlus)" obj={obj} set={set} path={`difficulties.${index}.ratingPlus`} />
            <TF label="譜面作者 (chartDesigner)" obj={obj} set={set} path={`difficulties.${index}.chartDesigner`} />
            <TF label="ジャケット作者 (jacketDesigner)" obj={obj} set={set} path={`difficulties.${index}.jacketDesigner`} />
            <TF
              label="表示ラベル (ratingLabel)"
              obj={obj}
              set={set}
              path={`difficulties.${index}.ratingLabel`}
              hint="設定すると定数の代わりにこの文字列を表示 (例: SP2)。ソートは rating の数値のまま"
            />
          </div>
        )}
      </ArraySection>
      <span className="text-xs text-muted-foreground">
        ここに無いフィールド (search_title, category, source_localized 等) は「生 JSON」タブで編集できます。保存時もそのまま保持されます。
      </span>
    </>
  )
}

const packTemplate: JsonObject = {
  id: 'newpack',
  section: 'arcaea',
  plus_character: -1,
  custom_banner: false,
  cutout_pack_image: false,
  name_localized: { en: 'New Pack', ja: '' },
  description_localized: { en: '', ja: '' },
}

function renderPacklistForm(obj: JsonObject, set: SetFn): ReactNode {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TF label="パックID (id)" obj={obj} set={set} path="id" placeholder="例: nijuosei" />
        <TF label="セクション (section)" obj={obj} set={set} path="section" placeholder="例: arcaea" />
        <TF label="名称 (英)" obj={obj} set={set} path="name_localized.en" />
        <TF label="名称 (日)" obj={obj} set={set} path="name_localized.ja" />
        <TF label="説明 (英)" obj={obj} set={set} path="description_localized.en" />
        <TF label="説明 (日)" obj={obj} set={set} path="description_localized.ja" />
        <NF label="plus_character" obj={obj} set={set} path="plus_character" hint="無ければ -1" />
      </div>
      <div className="flex flex-wrap gap-2">
        <BF label="custom_banner" obj={obj} set={set} path="custom_banner" />
        <BF label="cutout_pack_image" obj={obj} set={set} path="cutout_pack_image" />
      </div>
    </>
  )
}

const unlockTemplate: JsonObject = {
  songId: 'songid',
  ratingClass: 2,
  conditions: [{ type: 0, credit: 100 }],
}

const conditionTypeLabels: Record<number, string> = {
  0: '0: 通貨コスト (credit)',
  1: '1: 楽曲クリア (song_id/song_difficulty/grade)',
  2: '2: 楽曲プレイ (song_id/song_difficulty)',
  101: '101: レーティング範囲 (min/max)',
  104: '104: 特殊フラグ',
}

function renderUnlocksForm(obj: JsonObject, set: SetFn): ReactNode {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TF label="曲ID (songId)" obj={obj} set={set} path="songId" />
        <RatingClassSelect obj={obj} set={set} path="ratingClass" />
      </div>
      <ArraySection
        title="解禁条件 (conditions)"
        obj={obj}
        set={set}
        path="conditions"
        makeItem={() => ({ type: 0, credit: 100 })}
      >
        {(item, index) => {
          const type = Number(item.type)
          return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="条件タイプ (type)">
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={String(item.type ?? 0)}
                  onChange={(event) => set(`conditions.${index}.type`, Number(event.target.value))}
                >
                  {Object.entries(conditionTypeLabels).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {type === 0 && (
                <NF label="コスト (credit)" obj={obj} set={set} path={`conditions.${index}.credit`} />
              )}
              {(type === 1 || type === 2) && (
                <>
                  <TF label="条件曲 (song_id)" obj={obj} set={set} path={`conditions.${index}.song_id`} />
                  <NF label="難易度 (song_difficulty)" obj={obj} set={set} path={`conditions.${index}.song_difficulty`} />
                  {type === 1 && (
                    <NF label="グレード (grade)" obj={obj} set={set} path={`conditions.${index}.grade`} hint="0=クリア以上..." />
                  )}
                </>
              )}
              {type === 101 && (
                <>
                  <NF label="min" obj={obj} set={set} path={`conditions.${index}.min`} />
                  <NF label="max" obj={obj} set={set} path={`conditions.${index}.max`} />
                </>
              )}
            </div>
          )
        }}
      </ArraySection>
      <span className="text-xs text-muted-foreground">
        認識できない条件フィールドは「生 JSON」タブで編集でき、保存時も保持されます。
      </span>
    </>
  )
}

const worldMapTemplateObj: JsonObject = {
  map_id: 'newmap',
  is_legacy: false,
  is_beyond: false,
  is_breached: false,
  chapter: 1,
  available_from: -1,
  available_to: 9999999999999,
  is_repeatable: false,
  coordinate: '0,0',
  custom_bg: '',
  stamina_cost: 1,
  character_affinity: [],
  affinity_multiplier: [],
  steps: [
    { map_id: 'newmap', position: 0, capture: 100 },
    { map_id: 'newmap', position: 1, capture: 100, items: [{ type: 'fragment', amount: 30 }] },
  ],
}

function renderWorldMapForm(obj: JsonObject, set: SetFn): ReactNode {
  const mapId = String(obj.map_id ?? '')
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TF label="マップID (map_id)" obj={obj} set={set} path="map_id" hint="ファイル名にもなる。半角小文字英数字と _" />
        <NF label="章 (chapter)" obj={obj} set={set} path="chapter" />
        <NF label="消費スタミナ (stamina_cost)" obj={obj} set={set} path="stamina_cost" />
        <TF label="座標 (coordinate)" obj={obj} set={set} path="coordinate" placeholder="例: -650,-650" />
        <TF label="カスタム背景 (custom_bg)" obj={obj} set={set} path="custom_bg" hint="空欄可" />
        <NF label="公開開始 (available_from)" obj={obj} set={set} path="available_from" hint="-1 で常時" />
        <NF label="公開終了 (available_to)" obj={obj} set={set} path="available_to" />
      </div>
      <div className="flex flex-wrap gap-2">
        <BF label="is_beyond" obj={obj} set={set} path="is_beyond" />
        <BF label="is_legacy" obj={obj} set={set} path="is_legacy" />
        <BF label="is_repeatable (周回可)" obj={obj} set={set} path="is_repeatable" />
      </div>
      <ArraySection
        title="ステップ (steps)"
        obj={obj}
        set={set}
        path="steps"
        makeItem={() => {
          const steps = (getPath(obj, 'steps') as JsonObject[] | undefined) ?? []
          return { map_id: mapId, position: steps.length, capture: 100 }
        }}
      >
        {(_item, index) => (
          <div className="grid gap-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <NF label="位置 (position)" obj={obj} set={set} path={`steps.${index}.position`} />
              <NF label="必要世界力 (capture)" obj={obj} set={set} path={`steps.${index}.capture`} />
            </div>
            <ArraySection
              title="報酬 (items)"
              obj={obj}
              set={set}
              path={`steps.${index}.items`}
              makeItem={() => ({ type: 'fragment', amount: 30 })}
            >
              {(_it, j) => (
                <div className="grid gap-3 sm:grid-cols-3">
                  <TF label="種別 (type)" obj={obj} set={set} path={`steps.${index}.items.${j}.type`} hint="fragment/core/character 等" />
                  <TF label="ID (id)" obj={obj} set={set} path={`steps.${index}.items.${j}.id`} hint="core/character 等で必要" />
                  <NF label="数量 (amount)" obj={obj} set={set} path={`steps.${index}.items.${j}.amount`} />
                </div>
              )}
            </ArraySection>
          </div>
        )}
      </ArraySection>
      <span className="text-xs text-muted-foreground">
        restrict_ids・character_affinity 等の詳細フィールドは「生 JSON」タブで編集でき、保存時も保持されます。
      </span>
    </>
  )
}

// Mirrors the server-side whitelist in service/bundle_manager/import.rs so
// the file list can show which dropped files will actually be imported.
const importableFilePattern =
  /^([0-4]\.aff|(base|3)\.ogg|preview\.ogg|video\.mp4|video_audio\.ogg|video_(720|1080)\.mp4|(1080_)?(base|[0-4])(_256)?\.(jpg|png))$/

const catalogFileNames = ['songlist', 'slst', 'songlist.json', 'slst.json']

async function readDroppedFolder(
  dataTransfer: DataTransfer,
): Promise<{ folderName?: string; files: File[] }> {
  const files: File[] = []
  let folderName: string | undefined

  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      )
      files.push(file)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        )
        if (batch.length === 0) {
          break
        }
        for (const child of batch) {
          await walk(child)
        }
      }
    }
  }

  for (const item of dataTransfer.items) {
    const entry = item.webkitGetAsEntry()
    if (!entry) {
      continue
    }
    if (entry.isDirectory && !folderName) {
      folderName = entry.name
    }
    await walk(entry)
  }
  return { folderName, files }
}

/// Pull a songlist entry out of a dropped folder's own songlist/slst file,
/// or synthesize a skeleton from the chart files present.
async function extractDraftEntry(
  folderName: string | undefined,
  files: File[],
): Promise<Record<string, unknown>> {
  const catalogFile = files.find((f) =>
    catalogFileNames.includes(f.name.toLowerCase()),
  )
  if (catalogFile) {
    const parsed: unknown = JSON.parse(await catalogFile.text())
    const entries: Record<string, unknown>[] = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : Array.isArray((parsed as Record<string, unknown>).songs)
        ? ((parsed as Record<string, unknown>).songs as Record<string, unknown>[])
        : [parsed as Record<string, unknown>]
    const match = entries.find((e) => e.id === folderName)
    const entry = match ?? entries[0]
    if (entry) {
      return entry
    }
  }

  const id = (folderName ?? 'newsong').toLowerCase().replace(/[^a-z0-9_]/g, '')
  const difficulties = files
    .map((f) => /^([0-4])\.aff$/.exec(f.name)?.[1])
    .filter((n): n is string => n !== undefined)
    .sort()
    .map((n) => ({
      ratingClass: Number(n),
      chartDesigner: '',
      jacketDesigner: '',
      rating: 0,
    }))
  return {
    id,
    title_localized: { en: folderName ?? id },
    artist: '',
    bpm: '',
    bpm_base: 0,
    set: 'base',
    purchase: '',
    audioPreview: 0,
    audioPreviewEnd: 10000,
    side: 0,
    bg: 'base_light',
    date: Math.floor(Date.now() / 1000),
    version: '1.0',
    difficulties,
  }
}

/** Thumbnail that falls back to a neutral placeholder when the image 404s
 *  (most songs/packs won't have every jacket variant present). */
function Thumb({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground',
          className,
        )}
      >
        <Music2 className="size-4 opacity-40" />
      </div>
    )
  }
  return (
    <img
      src={src}
      loading="lazy"
      className={cn('object-cover', className)}
      onError={() => setFailed(true)}
    />
  )
}

function songFolderBadge(status: BundleSongSummary['folderStatus']) {
  switch (status) {
    case 'full':
      return <Badge variant="secondary">実データ</Badge>
    case 'preview':
      return <Badge variant="outline">プレビューのみ</Badge>
    case 'both':
      return <Badge variant="secondary">実データ+DL</Badge>
    case 'missing':
      return <Badge variant="destructive">フォルダなし</Badge>
  }
}

function SonglistEditView() {
  const [state, setState] = useState<LoadState>('loading')
  const [songs, setSongs] = useState<BundleSongSummary[]>([])
  const [search, setSearch] = useState('')
  const [problemOnly, setProblemOnly] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<ActionState>(emptyAction)

  const [editor, setEditor] = useState<EditorSession>()
  const [editorLoading, setEditorLoading] = useState(false)

  const [cascadeUnlocks, setCascadeUnlocks] = useState(true)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [dragOver, setDragOver] = useState(false)
  const [importFiles, setImportFiles] = useState<File[]>()
  const [importFolderName, setImportFolderName] = useState<string>()
  const [importEntryText, setImportEntryText] = useState('')
  const [importRemoteDl, setImportRemoteDl] = useState(false)
  const [importOverwrite, setImportOverwrite] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importAction, setImportAction] = useState<ActionState>(emptyAction)
  const [importResult, setImportResult] = useState<BundleSongImportResult>()

  const load = useCallback((showLoading = true) => {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .bundleSongs()
      .then((value) => {
        setSongs(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return songs.filter((song) => {
      if (problemOnly && song.folderStatus !== 'missing') {
        return false
      }
      if (!q) {
        return true
      }
      return (
        song.id.toLowerCase().includes(q) ||
        song.title.toLowerCase().includes(q) ||
        song.set.toLowerCase().includes(q)
      )
    })
  }, [songs, search, problemOnly])

  const missingCount = useMemo(
    () => songs.filter((song) => song.folderStatus === 'missing').length,
    [songs],
  )
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((song) => selected.has(song.id))

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const song of filtered) {
          next.delete(song.id)
        }
      } else {
        for (const song of filtered) {
          next.add(song.id)
        }
      }
      return next
    })
  }

  function makeSongSession(originalId: string | undefined, initial: JsonObject): EditorSession {
    return {
      title: originalId ? `編集: ${originalId}` : '新規エントリ',
      initial,
      form: renderSonglistForm,
      save: async (obj) => {
        const result = await adminApi.bundleSongUpsert(originalId, obj)
        setAction({
          kind: 'success',
          message: `${result.id} を${result.created ? '追加' : '更新'}しました (バックアップ: ${result.backupPath})`,
        })
        load(false)
      },
    }
  }

  async function openEdit(id: string) {
    setEditorLoading(true)
    try {
      const entry = await adminApi.bundleSongGet(id)
      setEditor(makeSongSession(id, entry as JsonObject))
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setEditorLoading(false)
    }
  }

  function openNew() {
    setEditor(makeSongSession(undefined, structuredClone(songTemplate)))
  }

  async function onDropFolder(event: React.DragEvent) {
    event.preventDefault()
    setDragOver(false)
    setImportAction(emptyAction)
    setImportResult(undefined)
    try {
      const { folderName, files } = await readDroppedFolder(event.dataTransfer)
      if (files.length === 0) {
        setImportAction({
          kind: 'error',
          message: 'ファイルが見つかりません。フォルダごとドロップしてください',
        })
        return
      }
      const entry = await extractDraftEntry(folderName, files)
      setImportFiles(files)
      setImportFolderName(folderName)
      setImportRemoteDl(Boolean(entry.remote_dl))
      setImportEntryText(JSON.stringify(entry, null, 2))
    } catch (error) {
      setImportAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  function setImportRemoteDlSynced(checked: boolean) {
    setImportRemoteDl(checked)
    try {
      const entry = JSON.parse(importEntryText) as Record<string, unknown>
      if (checked) {
        entry.remote_dl = true
      } else {
        delete entry.remote_dl
      }
      setImportEntryText(JSON.stringify(entry, null, 2))
    } catch {
      // JSON currently invalid -- the flag will still be wrong until the
      // user fixes the JSON; submit re-reads remote_dl from the JSON itself.
    }
  }

  function cancelImport() {
    setImportFiles(undefined)
    setImportFolderName(undefined)
    setImportEntryText('')
    setImportAction(emptyAction)
    setImportResult(undefined)
  }

  async function submitImport() {
    if (!importFiles) {
      return
    }
    try {
      JSON.parse(importEntryText)
    } catch (error) {
      setImportAction({
        kind: 'error',
        message: `JSON が不正です: ${errorMessage(error)}`,
      })
      return
    }
    setImportLoading(true)
    setImportAction(emptyAction)
    try {
      const uploadable = importFiles.filter((f) =>
        importableFilePattern.test(f.name),
      )
      const result = await adminApi.bundleSongImport(
        importEntryText,
        importOverwrite,
        uploadable,
      )
      setImportResult(result)
      setImportFiles(undefined)
      setImportEntryText('')
      setImportAction({
        kind: 'success',
        message: `${result.id} を${result.created ? '追加' : '更新'}しました (${result.filesWritten.length} ファイル配置)`,
      })
      load(false)
    } catch (error) {
      setImportAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setImportLoading(false)
    }
  }

  async function deleteSelected() {
    const ids = [...selected]
    if (ids.length === 0) {
      return
    }
    if (
      !confirm(
        `選択した ${ids.length} 件のエントリを songlist から削除しますか？` +
          (cascadeUnlocks ? '\n(対応する unlocks エントリも削除されます)' : '') +
          '\n書き込み前に自動バックアップが作成されます。',
      )
    ) {
      return
    }
    setDeleteLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.bundleSongsDelete(ids, cascadeUnlocks)
      const unlocksNote =
        result.removedUnlocks > 0 ? ` / unlocks ${result.removedUnlocks} 件` : ''
      setAction({
        kind: 'success',
        message: `songlist ${result.removedSongs} 件を削除しました${unlocksNote} (バックアップ: ${result.songlistBackupPath})`,
      })
      setSelected(new Set())
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <ActionCard
      title="Songlist 編集"
      description="クライアントに表示される曲の一覧 (songlist) を編集します。書き込みのたびに .backups/ に自動バックアップが作られます"
    >
      <HelpBox>
        <span>
          <b>songlist とは</b>: ゲーム内に表示される全曲の情報 (曲名・難易度・所属パック等) を持つファイルです。
          ここでの変更はまだクライアントに届きません — 変更後は「Bundle 管理」ページでバンドルを作り直して配信してください。
        </span>
        <span className="text-xs">
          フォルダ列の意味 — <b>実データ</b>: 譜面・音源あり (そのまま遊べる) / <b>プレビューのみ</b>:
          ジャケットと試聴音源のみ (remote_dl 曲の正常な状態) / <b>実データ+DL</b>: 両方あり (remote_dl
          曲でダウンロード配信も可能な状態) / <b>フォルダなし</b>: ファイルが存在せず不具合の原因になります。
        </span>
      </HelpBox>
      {state === 'loading' || state === 'error' ? (
        <LoadPanel state={state} onRetry={() => load()} />
      ) : (
        <>
          {importFiles === undefined && (
            <div
              className={cn(
                'flex min-h-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 text-sm text-muted-foreground transition-colors',
                dragOver && 'border-primary bg-primary/5 text-foreground',
              )}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDropFolder}
            >
              <span className="font-medium">曲フォルダをここにドロップしてインポート</span>
              <span className="text-xs">
                フォルダ内に songlist / slst があれば曲情報を自動で読み取ります
              </span>
            </div>
          )}

          {importFiles !== undefined && (
            <div className="grid gap-3 rounded-md border p-3">
              <div className="text-sm font-medium">
                曲のインポート{importFolderName ? `: ${importFolderName}` : ''}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {importFiles.map((file) => {
                  const ok = importableFilePattern.test(file.name)
                  return (
                    <Badge
                      key={file.name}
                      variant={ok ? 'secondary' : 'outline'}
                      className={cn(!ok && 'line-through opacity-60')}
                    >
                      {file.name} ({formatBytes(file.size)})
                    </Badge>
                  )
                })}
              </div>
              <textarea
                className="min-h-72 w-full rounded-md border bg-background p-3 font-mono text-xs"
                value={importEntryText}
                onChange={(event) => setImportEntryText(event.target.value)}
                spellCheck={false}
              />
              <div className="flex flex-wrap items-center gap-2">
                <ToggleLabel
                  checked={importRemoteDl}
                  onChange={setImportRemoteDlSynced}
                  label="remote_dl (dl_ プレビューフォルダ + 配信用フォルダに分割配置)"
                />
                <ToggleLabel
                  checked={importOverwrite}
                  onChange={setImportOverwrite}
                  label="既存フォルダを上書き"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" disabled={importLoading} onClick={submitImport}>
                  {importLoading ? <LoaderCircle className="animate-spin" /> : <PackagePlus />}
                  インポート実行
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={cancelImport}>
                  キャンセル
                </Button>
                <ActionMessage action={importAction} />
              </div>
            </div>
          )}

          {importFiles === undefined && importAction.kind !== 'idle' && (
            <ActionMessage action={importAction} />
          )}

          {importResult && (
            <div className="grid gap-1 rounded-md border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700">
              <div>
                {importResult.id} ({importResult.remoteDl ? 'remote_dl' : 'バンドル同梱'})
                を{importResult.created ? '追加' : '更新'}しました
              </div>
              <div className="font-mono text-xs">
                {importResult.filesWritten.join(' / ')}
              </div>
              {importResult.rejected.length > 0 && (
                <div className="text-xs">
                  除外: {importResult.rejected.join(', ')}
                </div>
              )}
              <div className="text-xs">
                バックアップ: {importResult.songlistBackupPath}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-64"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="id / タイトル / set で検索"
            />
            <ToggleLabel
              checked={problemOnly}
              onChange={setProblemOnly}
              label={`フォルダなしのみ (${missingCount})`}
            />
            <Button type="button" size="sm" variant="outline" onClick={openNew}>
              <Plus />
              新規エントリ
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => load()}>
              <RefreshCcw />
              再読み込み
            </Button>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <span className="text-sm font-medium">{selected.size} 件選択中</span>
              <ToggleLabel
                checked={cascadeUnlocks}
                onChange={setCascadeUnlocks}
                label="対応する unlocks も削除"
              />
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={deleteLoading}
                onClick={deleteSelected}
              >
                {deleteLoading ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                選択したエントリを削除
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                選択解除
              </Button>
            </div>
          )}

          <ActionMessage action={action} />

          {editor && <EntryEditor session={editor} onClose={() => setEditor(undefined)} />}

          <div className="text-xs text-muted-foreground">
            {filtered.length} / {songs.length} 件を表示
          </div>
          <div className="max-h-[36rem] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-0">
                    <input
                      className="size-4 accent-primary"
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                    />
                  </TableHead>
                  <TableHead className="w-0">絵</TableHead>
                  <TableHead>id</TableHead>
                  <TableHead>タイトル</TableHead>
                  <TableHead>set</TableHead>
                  <TableHead>難易度</TableHead>
                  <TableHead>DL</TableHead>
                  <TableHead>フォルダ</TableHead>
                  <TableHead className="w-0 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((song) => (
                  <TableRow key={song.id}>
                    <TableCell>
                      <input
                        className="size-4 accent-primary"
                        type="checkbox"
                        checked={selected.has(song.id)}
                        onChange={() => toggleSelected(song.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Thumb src={adminApi.jacketUrl(song.id)} className="size-10 rounded" />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{song.id}</TableCell>
                    <TableCell>{song.title}</TableCell>
                    <TableCell className="font-mono text-xs">{song.set}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {song.ratingClasses.join('/')}
                    </TableCell>
                    <TableCell>
                      {song.remoteDl && <Badge variant="outline">remote_dl</Badge>}
                    </TableCell>
                    <TableCell>{songFolderBadge(song.folderStatus)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={editorLoading}
                        onClick={() => openEdit(song.id)}
                      >
                        <Pencil />
                        編集
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </ActionCard>
  )
}

function HelpTerm({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 rounded-md border p-3">
      <div className="text-sm font-semibold">{term}</div>
      <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  )
}

function HelpSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="grid gap-1.5 rounded-md border p-3">
      <div className="text-sm font-semibold">{title}</div>
      <ol className="grid list-decimal gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </div>
  )
}

function WorldMapEditView() {
  const [state, setState] = useState<LoadState>('loading')
  const [maps, setMaps] = useState<WorldMapSummary[]>([])
  const [search, setSearch] = useState('')
  const [action, setAction] = useState<ActionState>(emptyAction)

  const [editor, setEditor] = useState<EditorSession>()
  const [editorLoading, setEditorLoading] = useState(false)

  const [dirty, setDirty] = useState(false)
  const [reloadLoading, setReloadLoading] = useState(false)

  const load = useCallback((showLoading = true) => {
    if (showLoading) setState('loading')
    adminApi
      .worldMaps()
      .then((value) => {
        setMaps(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return maps
    return maps.filter((m) => m.mapId.toLowerCase().includes(q))
  }, [maps, search])

  function makeMapSession(isNew: boolean, mapId: string | undefined, initial: JsonObject): EditorSession {
    return {
      title: isNew ? '新規マップ' : `編集: ${mapId}`,
      initial,
      form: renderWorldMapForm,
      save: async (obj) => {
        const id = String(obj.map_id ?? '')
        if (!id) {
          throw new Error('map_id を入力してください')
        }
        const result = await adminApi.worldMapUpsert(id, obj, !isNew)
        setAction({
          kind: 'success',
          message: `${result.mapId} を${result.created ? '作成' : '更新'}しました${result.backupPath ? ` (バックアップ: ${result.backupPath})` : ''}`,
        })
        setDirty(true)
        load(false)
      },
    }
  }

  function openNew() {
    setEditor(makeMapSession(true, undefined, structuredClone(worldMapTemplateObj)))
  }

  async function openEdit(mapId: string) {
    setEditorLoading(true)
    try {
      const entry = await adminApi.worldMapGet(mapId)
      setEditor(makeMapSession(false, mapId, entry as JsonObject))
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setEditorLoading(false)
    }
  }

  async function deleteMap(mapId: string) {
    if (!confirm(`マップ ${mapId} を削除しますか？\n書き込み前に自動バックアップが作成されます。`)) {
      return
    }
    setAction(emptyAction)
    try {
      const result = await adminApi.worldMapDelete(mapId)
      setAction({
        kind: 'success',
        message: `${mapId} を削除しました${result.backupPath ? ` (バックアップ: ${result.backupPath})` : ''}`,
      })
      setDirty(true)
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function reloadCache() {
    setReloadLoading(true)
    try {
      await adminApi.operation('refresh_world_map_cache')
      setAction({
        kind: 'success',
        message: 'World マップキャッシュを更新しました。変更がゲームに反映されます',
      })
      setDirty(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setReloadLoading(false)
    }
  }

  return (
    <ActionCard
      title="World マップ作成"
      description="World モードのマップ (assets/map/*.json) を作成・編集・削除します。書き込みのたびに .backups/ に自動バックアップ"
    >
      <HelpBox>
        <span>
          <b>World マップとは</b>: World モードで進む1つのマップ (ステップ列と各ステップの報酬) の定義です。
          1マップ = 1ファイル (<code>map_id.json</code>) です。
        </span>
        <span className="text-xs">
          主なフィールド — <b>map_id</b>: マップ識別子 (ファイル名にもなる、半角小文字英数字と _) /
          <b>chapter</b>: 章番号 / <b>steps</b>: 各マス。position (0起点)・capture (踏破に必要な世界力) と、
          任意の items (報酬: type=fragment/core/character 等) を並べます / <b>stamina_cost</b>: 消費スタミナ。
        </span>
        <span className="text-xs">
          編集しただけではゲームに反映されません — 保存後に下の
          「World マップキャッシュを更新」を押すとサーバー再起動なしで反映されます。
        </span>
      </HelpBox>

      {dirty && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <span className="text-sm">未反映の変更があります。</span>
          <Button type="button" size="sm" disabled={reloadLoading} onClick={reloadCache}>
            {reloadLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCcw />}
            World マップキャッシュを更新
          </Button>
        </div>
      )}

      {state === 'loading' || state === 'error' ? (
        <LoadPanel state={state} onRetry={() => load()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-64"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="map_id で検索"
            />
            <Button type="button" size="sm" variant="outline" onClick={openNew}>
              <Plus />
              新規マップ作成
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => load()}>
              <RefreshCcw />
              再読み込み
            </Button>
          </div>

          <ActionMessage action={action} />

          {editor && <EntryEditor session={editor} onClose={() => setEditor(undefined)} />}

          <div className="text-xs text-muted-foreground">
            {filtered.length} / {maps.length} マップ
          </div>
          <div className="max-h-[32rem] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>map_id</TableHead>
                  <TableHead>章</TableHead>
                  <TableHead>ステップ</TableHead>
                  <TableHead>種別</TableHead>
                  <TableHead className="w-0 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.mapId}>
                    <TableCell className="font-mono text-xs">{m.mapId}</TableCell>
                    <TableCell>{m.chapter ?? '-'}</TableCell>
                    <TableCell>{m.stepCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {m.isBeyond && <Badge variant="outline">Beyond</Badge>}
                        {m.isLegacy && <Badge variant="outline">Legacy</Badge>}
                        {m.isRepeatable && <Badge variant="secondary">周回可</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={editorLoading}
                          onClick={() => openEdit(m.mapId)}
                        >
                          <Pencil />
                          編集
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMap(m.mapId)}
                        >
                          <Trash2 />
                          削除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </ActionCard>
  )
}

function CharactersView() {
  const [defs, setDefs] = useState<CharacterDef[]>([])
  const [defState, setDefState] = useState<LoadState>('loading')
  const [defSearch, setDefSearch] = useState('')

  const [form, setForm] = useState<UserSelectorForm>(emptyUserSelectorForm)
  const [owned, setOwned] = useState<UserCharacter[]>()
  const [target, setTarget] = useState<{ name: string; userId: number }>()
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)
  const [grantId, setGrantId] = useState('')

  const loadDefs = useCallback(() => {
    setDefState('loading')
    adminApi
      .characters()
      .then((value) => {
        setDefs(value)
        setDefState('ready')
      })
      .catch(() => setDefState('error'))
  }, [])

  useEffect(() => {
    loadDefs()
  }, [loadDefs])

  const defById = useMemo(() => {
    const map = new Map<number, CharacterDef>()
    for (const d of defs) map.set(d.character_id, d)
    return map
  }, [defs])

  const filteredDefs = useMemo(() => {
    const q = defSearch.trim().toLowerCase()
    if (!q) return defs
    return defs.filter(
      (d) =>
        String(d.character_id).includes(q) ||
        (d.name ?? '').toLowerCase().includes(q),
    )
  }, [defs, defSearch])

  async function lookup(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.userCharacters(buildUserSelectorPayload(form))
      setOwned(result.characters)
      setTarget({ name: result.name || String(result.userId), userId: result.userId })
      setAction({
        kind: 'success',
        message: `${result.name || result.userId} は ${result.characters.length} 体所持`,
      })
    } catch (error) {
      setOwned(undefined)
      setTarget(undefined)
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  async function grant() {
    const id = Number(grantId)
    if (!Number.isInteger(id)) {
      setAction({ kind: 'error', message: 'キャラクターIDを選択してください' })
      return
    }
    setLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.grantCharacter(buildUserSelectorPayload(form), id)
      setOwned(result.characters)
      setAction({
        kind: 'success',
        message: `${defById.get(id)?.name ?? id} を付与しました`,
      })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  async function revoke(characterId: number) {
    if (!confirm(`${defById.get(characterId)?.name ?? characterId} を剥奪しますか？`)) {
      return
    }
    setLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.removeCharacter(buildUserSelectorPayload(form), characterId)
      setOwned(result.characters)
      setAction({ kind: 'success', message: '剥奪しました' })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-4">
      <ActionCard
        title="プレイヤーのキャラクター"
        description="プレイヤーを検索して所持キャラクターを確認し、付与・剥奪します"
      >
        <HelpBox>
          <span>
            プレイヤーを特定してからキャラクターを付与/剥奪します。付与は所持済みなら
            レベルや覚醒状態を変えずにスキップします (二重付与しても安全)。
          </span>
        </HelpBox>
        <form className="grid gap-3" onSubmit={lookup}>
          <UserSelectorFields value={form} onChange={(value) => setForm({ ...form, ...value })} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
              所持キャラを確認
            </Button>
            <ActionMessage action={action} />
          </div>
        </form>

        {target && owned && (
          <>
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <Field label="付与するキャラクター">
                <select
                  className="h-9 min-w-64 rounded-md border bg-background px-3 text-sm"
                  value={grantId}
                  onChange={(event) => setGrantId(event.target.value)}
                >
                  <option value="">キャラクターを選択...</option>
                  {defs.map((d) => (
                    <option key={d.character_id} value={d.character_id}>
                      {d.character_id}: {d.name ?? '(no name)'}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="button" size="sm" disabled={loading} onClick={grant}>
                <Plus />
                付与
              </Button>
            </div>

            <div className="text-sm font-medium">
              {target.name} の所持キャラクター ({owned.length})
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>名前</TableHead>
                    <TableHead>Lv</TableHead>
                    <TableHead>覚醒</TableHead>
                    <TableHead className="w-0 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {owned.map((c) => (
                    <TableRow key={c.character_id}>
                      <TableCell className="font-mono text-xs">{c.character_id}</TableCell>
                      <TableCell>{defById.get(c.character_id)?.name ?? '-'}</TableCell>
                      <TableCell>{c.level}</TableCell>
                      <TableCell>{c.is_uncapped ? '済' : '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => revoke(c.character_id)}
                        >
                          <Trash2 />
                          剥奪
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </ActionCard>

      <ActionCard title="キャラクター定義一覧" description="サーバーに登録されている全キャラクター (character テーブル)">
        {defState === 'loading' || defState === 'error' ? (
          <LoadPanel state={defState} onRetry={loadDefs} />
        ) : (
          <>
            <Input
              className="w-64"
              value={defSearch}
              onChange={(event) => setDefSearch(event.target.value)}
              placeholder="ID / 名前で検索"
            />
            <div className="text-xs text-muted-foreground">
              {filteredDefs.length} / {defs.length} 件
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>名前</TableHead>
                    <TableHead>最大Lv</TableHead>
                    <TableHead>スキルID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDefs.map((d) => (
                    <TableRow key={d.character_id}>
                      <TableCell className="font-mono text-xs">{d.character_id}</TableCell>
                      <TableCell>{d.name ?? '-'}</TableCell>
                      <TableCell>{d.max_level ?? '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{d.skill_id ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </ActionCard>
    </div>
  )
}

type CatalogKind = 'packlist' | 'unlocks'

const catalogMeta: Record<
  CatalogKind,
  {
    title: string
    help: string
    template: JsonObject
    form: FormRenderer
    idLabel: string
    identify: (e: Record<string, unknown>) => string
    columns: Array<{ label: string; get: (e: Record<string, unknown>) => string }>
  }
> = {
  packlist: {
    title: 'Packlist 編集',
    help: 'パック (曲の販売単位) の定義です。songlist の各曲の "set" がここの "id" と対応します。パックを新設したり、名称・章立てを変更できます。',
    idLabel: 'id',
    identify: (e) => String(e.id ?? ''),
    template: packTemplate,
    form: renderPacklistForm,
    columns: [
      { label: 'id', get: (e) => String(e.id ?? '') },
      { label: 'section', get: (e) => String(e.section ?? '') },
      {
        label: '名称',
        get: (e) => {
          const n = e.name_localized as Record<string, unknown> | undefined
          return String(n?.ja ?? n?.en ?? '')
        },
      },
    ],
  },
  unlocks: {
    title: 'Unlocks 編集',
    help: '曲の解禁条件です。songId と ratingClass (0=PST/1=PRS/2=FTR/3=BYD) で対象譜面を指定し、conditions に条件 (type 0=通貨/1=クリア/2=プレイ/101=レーティング範囲…) を並べます。識別キーは「songId/ratingClass」です。',
    idLabel: 'songId/ratingClass',
    identify: (e) => `${String(e.songId ?? '')}/${String(e.ratingClass ?? '')}`,
    template: unlockTemplate,
    form: renderUnlocksForm,
    columns: [
      { label: 'songId', get: (e) => String(e.songId ?? '') },
      { label: 'ratingClass', get: (e) => String(e.ratingClass ?? '') },
      {
        label: '条件数',
        get: (e) => String((e.conditions as unknown[] | undefined)?.length ?? 0),
      },
    ],
  },
}

function CatalogEditView({ kind }: { kind: CatalogKind }) {
  const meta = catalogMeta[kind]
  const [state, setState] = useState<LoadState>('loading')
  const [entries, setEntries] = useState<Record<string, unknown>[]>([])
  const [search, setSearch] = useState('')
  const [action, setAction] = useState<ActionState>(emptyAction)

  const [editor, setEditor] = useState<EditorSession>()

  // packlist-only: pending deletion of a pack that still has member songs.
  const [packDelete, setPackDelete] = useState<{ packId: string; songIds: string[] }>()
  const [packAction, setPackAction] = useState<'delete_songs' | 'reassign' | 'none'>('reassign')
  const [reassignTo, setReassignTo] = useState('')
  const [cascadeUnlocks, setCascadeUnlocks] = useState(true)
  const [packBusy, setPackBusy] = useState(false)

  const load = useCallback(
    (showLoading = true) => {
      if (showLoading) {
        setState('loading')
      }
      adminApi
        .catalogList(kind)
        .then((value) => {
          setEntries(value)
          setState('ready')
        })
        .catch(() => setState('error'))
    },
    [kind],
  )

  useEffect(() => {
    load()
    setEditor(undefined)
    setPackDelete(undefined)
    setSearch('')
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => meta.identify(e).toLowerCase().includes(q))
  }, [entries, search, meta])

  function makeSession(originalId: string | undefined, initial: JsonObject): EditorSession {
    return {
      title: originalId ? `編集: ${originalId}` : '新規エントリ',
      initial,
      form: meta.form,
      save: async (obj) => {
        const result = await adminApi.catalogUpsert(kind, originalId, obj)
        setAction({
          kind: 'success',
          message: `${result.id} を${result.created ? '追加' : '更新'}しました (バックアップ: ${result.backupPath})`,
        })
        load(false)
      },
    }
  }

  function openNew() {
    setEditor(makeSession(undefined, structuredClone(meta.template)))
  }

  function openEdit(entry: Record<string, unknown>) {
    setEditor(makeSession(meta.identify(entry), entry as JsonObject))
  }

  async function deleteEntry(entry: Record<string, unknown>) {
    const id = meta.identify(entry)

    // Packlist: a pack still referenced by songs' `set` can't just be removed
    // (dangling set crashes the client). Look up the referencing songs and,
    // if any, open the choice panel instead of deleting immediately.
    if (kind === 'packlist') {
      setAction(emptyAction)
      try {
        const refs = await adminApi.packlistReferences(id)
        if (refs.songIds.length === 0) {
          if (!confirm(`パック ${id} を削除しますか？ (紐づく曲はありません)`)) return
          const result = await adminApi.packlistDelete({ pack_id: id, action: 'none' })
          setAction({
            kind: 'success',
            message: `パック ${id} を削除しました (バックアップ ${result.backups.length} 件)`,
          })
          load(false)
        } else {
          setPackAction('reassign')
          setReassignTo('')
          setCascadeUnlocks(true)
          setPackDelete({ packId: id, songIds: refs.songIds })
        }
      } catch (error) {
        setAction({ kind: 'error', message: errorMessage(error) })
      }
      return
    }

    if (!confirm(`${id} を削除しますか？\n書き込み前に自動バックアップが作成されます。`)) {
      return
    }
    setAction(emptyAction)
    try {
      const result = await adminApi.catalogDelete(kind, [id])
      setAction({
        kind: 'success',
        message: `${result.removed} 件を削除しました (バックアップ: ${result.backupPath})`,
      })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function confirmPackDelete() {
    if (!packDelete) return
    if (packAction === 'reassign' && !reassignTo) {
      setAction({ kind: 'error', message: '付け替え先パックを選択してください' })
      return
    }
    if (
      packAction === 'none' &&
      !confirm(
        `曲を残したままパック ${packDelete.packId} を削除します。\nこの状態のバンドルはクライアントをクラッシュさせます。続行しますか？`,
      )
    ) {
      return
    }
    setPackBusy(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.packlistDelete({
        pack_id: packDelete.packId,
        action: packAction,
        reassign_to: packAction === 'reassign' ? reassignTo : undefined,
        cascade_unlocks: packAction === 'delete_songs' ? cascadeUnlocks : undefined,
      })
      const detail =
        result.action === 'reassign'
          ? `${result.referencingSongCount} 曲を ${result.reassignedTo} へ付け替え`
          : result.action === 'delete_songs'
            ? `${result.deletedSongs} 曲を削除${result.removedUnlocks > 0 ? ` / unlocks ${result.removedUnlocks} 件` : ''}`
            : '曲は据え置き'
      setAction({
        kind: 'success',
        message: `パック ${result.packId} を削除しました (${detail}、バックアップ ${result.backups.length} 件)`,
      })
      setPackDelete(undefined)
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setPackBusy(false)
    }
  }

  return (
    <ActionCard
      title={meta.title}
      description="エントリは元の JSON をそのまま保持したまま編集されます。書き込みのたびに .backups/ に自動バックアップが作られます"
    >
      <HelpBox>
        <span>{meta.help}</span>
        <span className="text-xs">
          ここでの変更はまだクライアントに届きません — 変更後は「Bundle 管理」でバンドルを作り直して配信してください。
        </span>
      </HelpBox>

      {state === 'loading' || state === 'error' ? (
        <LoadPanel state={state} onRetry={() => load()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-64"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`${meta.idLabel} で検索`}
            />
            <Button type="button" size="sm" variant="outline" onClick={openNew}>
              <Plus />
              新規エントリ
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => load()}>
              <RefreshCcw />
              再読み込み
            </Button>
          </div>

          <ActionMessage action={action} />

          {editor && <EntryEditor session={editor} onClose={() => setEditor(undefined)} />}

          {packDelete && (
            <div className="grid gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="text-sm">
                パック <b>{packDelete.packId}</b> には{' '}
                <b>{packDelete.songIds.length} 曲</b>{' '}
                が紐づいています (set = {packDelete.packId})。この曲たちをどう扱うか選択してください。
              </div>
              <div className="max-h-24 overflow-y-auto rounded border bg-background/60 p-2 font-mono text-xs">
                {packDelete.songIds.join(', ')}
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  checked={packAction === 'reassign'}
                  onChange={() => setPackAction('reassign')}
                />
                <span className="grid gap-1.5">
                  <span>別のパックに付け替える (曲は残す)</span>
                  {packAction === 'reassign' && (
                    <select
                      className="h-9 w-64 rounded-md border bg-background px-3 text-sm"
                      value={reassignTo}
                      onChange={(event) => setReassignTo(event.target.value)}
                    >
                      <option value="">付け替え先を選択...</option>
                      <option value="base">base (無料/基本)</option>
                      <option value="single">single (単曲)</option>
                      {entries
                        .map((e) => String(e.id ?? ''))
                        .filter((pid) => pid && pid !== packDelete.packId)
                        .map((pid) => (
                          <option key={pid} value={pid}>
                            {pid}
                          </option>
                        ))}
                    </select>
                  )}
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  checked={packAction === 'delete_songs'}
                  onChange={() => setPackAction('delete_songs')}
                />
                <span className="grid gap-1.5">
                  <span>曲も一緒に songlist から削除する</span>
                  {packAction === 'delete_songs' && (
                    <ToggleLabel
                      checked={cascadeUnlocks}
                      onChange={setCascadeUnlocks}
                      label="対応する unlocks も削除"
                    />
                  )}
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  checked={packAction === 'none'}
                  onChange={() => setPackAction('none')}
                />
                <span className="text-destructive">
                  パックのみ削除し、曲は据え置く (この状態はクライアントをクラッシュさせます)
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={packBusy}
                  onClick={confirmPackDelete}
                >
                  {packBusy ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                  実行
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPackDelete(undefined)}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            {filtered.length} / {entries.length} 件を表示
          </div>
          {kind === 'packlist' && !search.trim() ? (
            <PackTree entries={entries} onEdit={openEdit} onDelete={deleteEntry} />
          ) : (
            <div className="max-h-[32rem] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {meta.columns.map((c) => (
                      <TableHead key={c.label}>{c.label}</TableHead>
                    ))}
                    <TableHead className="w-0 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((entry, index) => (
                    <TableRow key={`${meta.identify(entry)}-${index}`}>
                      {meta.columns.map((c) => (
                        <TableCell key={c.label} className="font-mono text-xs">
                          {c.get(entry)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(entry)}>
                            <Pencil />
                            編集
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteEntry(entry)}
                          >
                            <Trash2 />
                            削除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </ActionCard>
  )
}

/** Pack image + name row used inside the tree. */
function PackRow({
  pack,
  depth,
  onEdit,
  onDelete,
}: {
  pack: Record<string, unknown>
  depth: number
  onEdit: (e: Record<string, unknown>) => void
  onDelete: (e: Record<string, unknown>) => void
}) {
  const id = String(pack.id ?? '')
  const name = pack.name_localized as Record<string, unknown> | undefined
  const label = String(name?.ja ?? name?.en ?? '')
  return (
    <div
      className="flex items-center gap-3 rounded-md border p-2"
      style={{ marginLeft: depth * 24 }}
    >
      <Thumb src={adminApi.packImageUrl(id)} className="h-10 w-16 rounded" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs">{id}</span>
          {Boolean(pack.is_extend_pack) && <Badge variant="secondary">Extend</Badge>}
          {Boolean(pack.pack_parent) && <Badge variant="outline">append</Badge>}
          <span className="text-xs text-muted-foreground">{String(pack.section ?? '')}</span>
        </div>
        <div className="truncate text-sm">{label}</div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(pack)}>
          <Pencil />
          編集
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(pack)}>
          <Trash2 />
          削除
        </Button>
      </div>
    </div>
  )
}

/** Packs rendered as a tree: append/child packs (pack_parent) nested under
 *  their parent. Orphans (parent not present) are shown at the top level. */
function PackTree({
  entries,
  onEdit,
  onDelete,
}: {
  entries: Record<string, unknown>[]
  onEdit: (e: Record<string, unknown>) => void
  onDelete: (e: Record<string, unknown>) => void
}) {
  const byId = new Map(entries.map((p) => [String(p.id ?? ''), p]))
  const childrenOf = new Map<string, Record<string, unknown>[]>()
  const roots: Record<string, unknown>[] = []
  for (const p of entries) {
    const parent = p.pack_parent ? String(p.pack_parent) : ''
    if (parent && byId.has(parent)) {
      const list = childrenOf.get(parent) ?? []
      list.push(p)
      childrenOf.set(parent, list)
    } else {
      roots.push(p)
    }
  }

  const rows: React.ReactElement[] = []
  const render = (pack: Record<string, unknown>, depth: number) => {
    const id = String(pack.id ?? '')
    rows.push(
      <PackRow key={id} pack={pack} depth={depth} onEdit={onEdit} onDelete={onDelete} />,
    )
    for (const child of childrenOf.get(id) ?? []) {
      render(child, depth + 1)
    }
  }
  for (const root of roots) {
    render(root, 0)
  }

  return <div className="grid max-h-[36rem] gap-1.5 overflow-y-auto pr-1">{rows}</div>
}

type LoadedImage = { el: HTMLImageElement; name: string }
type ImgTransform = { scale: number; x: number; y: number }
const defaultTransform: ImgTransform = { scale: 1, x: 0, y: 0 }
const PACK_W = 374
const PACK_H = 750

function drawCover(
  ctx: CanvasRenderingContext2D,
  el: HTMLImageElement,
  W: number,
  H: number,
  t: ImgTransform,
) {
  const base = Math.max(W / el.width, H / el.height)
  const s = base * t.scale
  const dw = el.width * s
  const dh = el.height * s
  const dx = (W - dw) / 2 + t.x * W
  const dy = (H - dh) / 2 + t.y * H
  ctx.drawImage(el, dx, dy, dw, dh)
}

// #rrggbb -> "r,g,b" for building rgba() strings with variable alpha.
function hexToRgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '255,255,255'
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

type PatternKind = 'none' | 'stripes' | 'grid' | 'dots' | 'rays' | 'stars' | 'hex'

// Deterministic pseudo-random so the starfield doesn't flicker between renders.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Arcaea-flavoured decorative overlays, drawn in the given colour/opacity.
function drawPattern(
  ctx: CanvasRenderingContext2D,
  kind: PatternKind,
  W: number,
  H: number,
  color: string,
  opacity: number,
  angleDeg: number,
) {
  if (kind === 'none' || opacity <= 0) return
  const rgb = hexToRgb(color)
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.strokeStyle = `rgba(${rgb},1)`
  ctx.fillStyle = `rgba(${rgb},1)`

  if (kind === 'stripes') {
    ctx.lineWidth = 1
    ctx.translate(W / 2, H / 2)
    ctx.rotate((angleDeg * Math.PI) / 180)
    const span = Math.hypot(W, H)
    for (let x = -span; x < span; x += 12) {
      ctx.beginPath()
      ctx.moveTo(x, -span)
      ctx.lineTo(x, span)
      ctx.stroke()
    }
  } else if (kind === 'grid') {
    ctx.lineWidth = 1
    const step = 26
    for (let x = 0; x <= W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let y = 0; y <= H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
  } else if (kind === 'dots') {
    const step = 22
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill()
      }
    }
  } else if (kind === 'rays') {
    // Light rays fanning from a focal point near the top — very Arcaea.
    const fx = W / 2
    const fy = H * 0.16
    ctx.lineWidth = 1
    const n = 40
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (angleDeg * Math.PI) / 180
      ctx.beginPath()
      ctx.moveTo(fx, fy)
      ctx.lineTo(fx + Math.cos(a) * H * 1.4, fy + Math.sin(a) * H * 1.4)
      ctx.stroke()
    }
  } else if (kind === 'stars') {
    const rnd = mulberry32(1337)
    const count = 90
    for (let i = 0; i < count; i++) {
      const x = rnd() * W
      const y = rnd() * H
      const r = rnd() * 1.6 + 0.3
      ctx.globalAlpha = opacity * (0.4 + rnd() * 0.6)
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
  } else if (kind === 'hex') {
    ctx.lineWidth = 1
    const s = 22
    const h = s * Math.sqrt(3)
    for (let row = 0, y = 0; y < H + h; y += h / 2, row++) {
      const off = row % 2 === 0 ? 0 : s * 1.5
      for (let x = off; x < W + s * 3; x += s * 3) {
        ctx.beginPath()
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6
          const px = x + s * Math.cos(a)
          const py = y + s * Math.sin(a)
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.closePath(); ctx.stroke()
      }
    }
  }
  ctx.restore()
}

type PackPreset = {
  name: string
  swatch: string
  splitAngle?: number
  titleFont?: 'exo' | 'geosans' | 'noto'
  titleWeight?: number
  titleUpper?: boolean
  titleSpacing?: number
  titleColor?: string
  titleGradient?: boolean
  titleGradient2?: string
  titleStroke?: boolean
  titleStrokeColor?: string
  titleGlow?: boolean
  gradientColor?: string
  gradientStrength?: number
  accent?: boolean
  accentColor?: string
  tint?: boolean
  tintColor?: string
  tintStrength?: number
  vignette?: boolean
  vignetteStrength?: number
  topFade?: boolean
  pattern?: PatternKind
  patternColor?: string
  patternOpacity?: number
}

// One-click coherent looks. Each sets a full palette + effect combination.
const PACK_PRESETS: PackPreset[] = [
  {
    name: 'Arcaea (蒼)', swatch: '#3a6ea5',
    titleFont: 'exo', titleWeight: 300, titleUpper: true, titleSpacing: 4,
    titleColor: '#ffffff', titleGradient: false, titleStroke: false, titleGlow: true,
    gradientColor: '#05060a', gradientStrength: 0.72, accent: true, accentColor: '#8fd6ff',
    tint: true, tintColor: '#2f6ea5', tintStrength: 0.22,
    vignette: true, vignetteStrength: 0.32, topFade: true,
    pattern: 'rays', patternColor: '#bfe4ff', patternOpacity: 0.10,
  },
  {
    name: 'Eternal Core', swatch: '#1e6b6b',
    titleFont: 'exo', titleWeight: 300, titleUpper: false, titleSpacing: 3,
    titleColor: '#eafffb', titleGradient: true, titleGradient2: '#57e0c9', titleStroke: false, titleGlow: true,
    gradientColor: '#020806', gradientStrength: 0.78, accent: true, accentColor: '#57e0c9',
    tint: true, tintColor: '#0f5f57', tintStrength: 0.2,
    vignette: true, vignetteStrength: 0.4, topFade: true,
    pattern: 'stars', patternColor: '#a8fff0', patternOpacity: 0.5,
  },
  {
    name: 'Crimson', swatch: '#a5203a',
    titleFont: 'exo', titleWeight: 600, titleUpper: true, titleSpacing: 2,
    titleColor: '#ffffff', titleGradient: false, titleStroke: true, titleStrokeColor: '#4a0311', titleGlow: true,
    gradientColor: '#0a0203', gradientStrength: 0.8, accent: true, accentColor: '#ff5d73',
    tint: true, tintColor: '#9c1e33', tintStrength: 0.26,
    vignette: true, vignetteStrength: 0.45, topFade: true,
    pattern: 'stripes', patternColor: '#ff8fa0', patternOpacity: 0.08,
  },
  {
    name: 'Prism', swatch: '#7a4dd6',
    titleFont: 'exo', titleWeight: 400, titleUpper: true, titleSpacing: 5,
    titleColor: '#e9d9ff', titleGradient: true, titleGradient2: '#5cf0ff', titleStroke: false, titleGlow: true,
    gradientColor: '#06040f', gradientStrength: 0.72, accent: true, accentColor: '#b28cff',
    tint: true, tintColor: '#6a3fd0', tintStrength: 0.24,
    vignette: true, vignetteStrength: 0.36, topFade: true,
    pattern: 'grid', patternColor: '#c9b8ff', patternOpacity: 0.09,
  },
  {
    name: 'Adverse (金)', swatch: '#b8862f',
    titleFont: 'geosans', titleWeight: 400, titleUpper: true, titleSpacing: 3,
    titleColor: '#fff4d6', titleGradient: true, titleGradient2: '#e8b64a', titleStroke: false, titleGlow: true,
    gradientColor: '#0a0702', gradientStrength: 0.76, accent: true, accentColor: '#f0c95a',
    tint: true, tintColor: '#8f6a20', tintStrength: 0.22,
    vignette: true, vignetteStrength: 0.42, topFade: true,
    pattern: 'hex', patternColor: '#ffe6a0', patternOpacity: 0.08,
  },
  {
    name: 'Monochrome', swatch: '#8a8a8a',
    titleFont: 'exo', titleWeight: 300, titleUpper: true, titleSpacing: 6,
    titleColor: '#ffffff', titleGradient: false, titleStroke: false, titleGlow: true,
    gradientColor: '#000000', gradientStrength: 0.68, accent: true, accentColor: '#ffffff',
    tint: false, vignette: true, vignetteStrength: 0.5, topFade: true,
    pattern: 'none', patternOpacity: 0,
  },
]

type DbDraft = {
  mode: 'insert' | 'update'
  pk: Record<string, string | null> // original PK (update) / empty (insert)
  values: Record<string, string | null>
}

function DbEditorView() {
  const [tables, setTables] = useState<DbTableInfo[]>([])
  const [table, setTable] = useState('')
  const [data, setData] = useState<DbRowsResponse>()
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<ActionState>(emptyAction)

  const [page, setPage] = useState(1)
  const [size] = useState(50)
  const [orderBy, setOrderBy] = useState('')
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc')
  const [filterCol, setFilterCol] = useState('')
  const [filterVal, setFilterVal] = useState('')

  const [editEnabled, setEditEnabled] = useState(false)
  const [draft, setDraft] = useState<DbDraft>()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Record<string, string | null>>()

  useEffect(() => {
    adminApi.dbTables().then(setTables).catch((e) => setAction({ kind: 'error', message: errorMessage(e) }))
  }, [])

  const loadRows = useCallback(
    (tbl: string, p: number) => {
      if (!tbl) return
      setLoading(true)
      setDraft(undefined)
      setPendingDelete(undefined)
      adminApi
        .dbRows(tbl, { page: p, size, orderBy: orderBy || undefined, orderDir, filterCol: filterCol || undefined, filterVal: filterVal || undefined })
        .then((d) => {
          setData(d)
          setPage(d.page)
        })
        .catch((e) => setAction({ kind: 'error', message: errorMessage(e) }))
        .finally(() => setLoading(false))
    },
    [size, orderBy, orderDir, filterCol, filterVal],
  )

  function selectTable(tbl: string) {
    setTable(tbl)
    setOrderBy('')
    setFilterCol('')
    setFilterVal('')
    setAction(emptyAction)
    setEditEnabled(false)
    if (tbl) loadRows(tbl, 1)
    else setData(undefined)
  }

  const cols = data?.columns ?? []
  const pkCols = data?.primaryKey ?? []
  const hasPk = pkCols.length > 0
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  function rowToMap(row: (string | null)[]): Record<string, string | null> {
    const m: Record<string, string | null> = {}
    cols.forEach((c, i) => (m[c.name] = row[i]))
    return m
  }

  function startEdit(row: (string | null)[]) {
    const m = rowToMap(row)
    const pk: Record<string, string | null> = {}
    pkCols.forEach((k) => (pk[k] = m[k]))
    setDraft({ mode: 'update', pk, values: { ...m } })
    setConfirming(false)
  }

  function startInsert() {
    const values: Record<string, string | null> = {}
    cols.forEach((c) => (values[c.name] = c.nullable ? null : ''))
    setDraft({ mode: 'insert', pk: {}, values })
    setConfirming(false)
  }

  // fields that will actually be written
  function writtenPayload(d: DbDraft): { pk?: Record<string, string | null>; values: Record<string, string | null> } {
    if (d.mode === 'insert') {
      const values: Record<string, string | null> = {}
      for (const c of cols) {
        if (c.binary) continue
        // skip auto_increment columns left empty
        if (c.extra.includes('auto_increment') && (d.values[c.name] === '' || d.values[c.name] == null)) continue
        values[c.name] = d.values[c.name]
      }
      return { values }
    }
    // update: only non-PK, non-binary columns
    const values: Record<string, string | null> = {}
    for (const c of cols) {
      if (c.binary || c.isPrimaryKey) continue
      values[c.name] = d.values[c.name]
    }
    return { pk: d.pk, values }
  }

  function changedForPreview(d: DbDraft): { col: string; from: string | null; to: string | null }[] {
    if (d.mode === 'insert') return cols.filter((c) => !c.binary).map((c) => ({ col: c.name, from: null, to: d.values[c.name] }))
    return cols
      .filter((c) => !c.binary && !c.isPrimaryKey)
      .map((c) => ({ col: c.name, from: c.name in d.pk ? d.pk[c.name] : null, to: d.values[c.name] }))
      .filter((x) => x.from !== x.to)
  }

  async function commit() {
    if (!draft) return
    setSaving(true)
    setAction(emptyAction)
    try {
      const p = writtenPayload(draft)
      const res = await adminApi.dbRowWrite(table, { op: draft.mode, pk: p.pk, values: p.values, confirm: true })
      setAction({
        kind: 'success',
        message: `${draft.mode === 'insert' ? '追加' : '更新'}しました (${res.rowsAffected}行${res.backupCreated ? ' / 事前バックアップ作成' : ''})`,
      })
      setDraft(undefined)
      loadRows(table, page)
    } catch (e) {
      setAction({ kind: 'error', message: errorMessage(e) })
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  async function doDelete(pk: Record<string, string | null>) {
    setSaving(true)
    setAction(emptyAction)
    try {
      const res = await adminApi.dbRowDelete(table, pk)
      setAction({ kind: 'success', message: `削除しました (${res.rowsAffected}行${res.backupCreated ? ' / 事前バックアップ作成' : ''})` })
      setPendingDelete(undefined)
      loadRows(table, page)
    } catch (e) {
      setAction({ kind: 'error', message: errorMessage(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ActionCard
      title="DB エディタ"
      description="全テーブルを直接閲覧・編集します。書き込みは二段階確認・書込前に自動バックアップ・監査ログ記録付き。"
    >
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
        <b>注意</b>: 生のデータベースを直接操作します。既定は閲覧のみ。編集は下のトグルを有効化してから、変更をプレビュー→確定の二段階で行います。主キーの無いテーブルは編集・削除できません。
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="テーブル">
          <select className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm" value={table}
            onChange={(e) => selectTable(e.target.value)}>
            <option value="">— 選択 —</option>
            {tables.map((t) => (
              <option key={t.name} value={t.name}>{t.name} (~{t.approxRows})</option>
            ))}
          </select>
        </Field>
        {table && (
          <>
            <Field label="絞り込み列">
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterCol}
                onChange={(e) => setFilterCol(e.target.value)}>
                <option value="">—</option>
                {cols.map((c) => (<option key={c.name} value={c.name}>{c.name}</option>))}
              </select>
            </Field>
            <Field label="含む値">
              <Input className="w-40" value={filterVal} onChange={(e) => setFilterVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadRows(table, 1) }} />
            </Field>
            <Field label="並び替え">
              <div className="flex gap-1">
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={orderBy}
                  onChange={(e) => setOrderBy(e.target.value)}>
                  <option value="">既定</option>
                  {cols.map((c) => (<option key={c.name} value={c.name}>{c.name}</option>))}
                </select>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOrderDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>{orderDir === 'asc' ? '▲' : '▼'}</Button>
              </div>
            </Field>
            <Button type="button" size="sm" variant="outline" onClick={() => loadRows(table, 1)}><Search />適用</Button>
            <ToggleLabel checked={editEnabled} onChange={setEditEnabled} label="編集を有効化" />
            {editEnabled && hasPk && (
              <Button type="button" size="sm" onClick={startInsert}><Plus />行を追加</Button>
            )}
          </>
        )}
        <ActionMessage action={action} />
      </div>

      {table && editEnabled && !hasPk && (
        <div className="text-xs text-destructive">このテーブルには主キーがないため、編集・削除はできません(閲覧のみ)。</div>
      )}

      {loading && <div className="text-sm text-muted-foreground">読み込み中…</div>}

      {data && !loading && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/50">
                  {editEnabled && hasPk && <th className="sticky left-0 bg-muted/50 px-2 py-1.5 text-left">操作</th>}
                  {cols.map((c) => (
                    <th key={c.name} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                      {c.isPrimaryKey && <span title="主キー" className="mr-1 text-amber-600">🔑</span>}
                      {c.name}
                      <span className="ml-1 font-normal text-muted-foreground">{c.dataType}{c.binary ? ' (bin)' : ''}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, ri) => {
                  const pk: Record<string, string | null> = {}
                  pkCols.forEach((k) => (pk[k] = rowToMap(row)[k]))
                  return (
                    <tr key={ri} className="border-t hover:bg-muted/30">
                      {editEnabled && hasPk && (
                        <td className="sticky left-0 bg-background px-2 py-1 whitespace-nowrap">
                          <button className="mr-2 text-primary hover:underline" onClick={() => startEdit(row)}>編集</button>
                          <button className="text-destructive hover:underline" onClick={() => setPendingDelete(pk)}>削除</button>
                        </td>
                      )}
                      {row.map((v, ci) => (
                        <td key={ci} className="max-w-72 truncate px-2 py-1 align-top" title={v ?? 'NULL'}>
                          {v === null ? <span className="italic text-muted-foreground">NULL</span> : v === '' ? <span className="text-muted-foreground">″″</span> : v}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {data.rows.length === 0 && (
                  <tr><td className="px-2 py-3 text-muted-foreground" colSpan={cols.length + 1}>該当行なし</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">全 {data.total} 行 / {data.page} / {totalPages} ページ</span>
            <Button type="button" size="sm" variant="ghost" disabled={page <= 1} onClick={() => loadRows(table, page - 1)}>← 前</Button>
            <Button type="button" size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => loadRows(table, page + 1)}>次 →</Button>
          </div>
        </>
      )}

      {/* delete confirm */}
      {pendingDelete && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <div className="mb-2 font-medium text-destructive">この行を削除しますか？（元に戻せません）</div>
          <div className="mb-2 font-mono text-xs">{table} WHERE {Object.entries(pendingDelete).map(([k, v]) => `${k}=${v ?? 'NULL'}`).join(' AND ')}</div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={() => doDelete(pendingDelete)}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Trash2 />}削除を確定
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(undefined)}>キャンセル</Button>
          </div>
        </div>
      )}

      {/* edit / insert form */}
      {draft && (
        <div className="grid gap-3 rounded-md border p-3">
          <div className="text-sm font-medium">{draft.mode === 'insert' ? `${table} に行を追加` : `${table} の行を編集`}</div>
          {!confirming ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {cols.map((c) => {
                  const readOnly = c.binary || (draft.mode === 'update' && c.isPrimaryKey)
                  const val = draft.values[c.name]
                  return (
                    <div key={c.name} className="grid gap-1">
                      <label className="text-xs font-medium">
                        {c.isPrimaryKey && '🔑 '}{c.name}
                        <span className="ml-1 font-normal text-muted-foreground">{c.columnType}{readOnly ? ' (読取専用)' : ''}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          className="flex-1"
                          disabled={readOnly || val === null}
                          value={val ?? ''}
                          placeholder={val === null ? 'NULL' : ''}
                          onChange={(e) => setDraft({ ...draft, values: { ...draft.values, [c.name]: e.target.value } })}
                        />
                        {c.nullable && !readOnly && (
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input type="checkbox" checked={val === null}
                              onChange={(e) => setDraft({ ...draft, values: { ...draft.values, [c.name]: e.target.checked ? null : '' } })} />
                            NULL
                          </label>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={draft.mode === 'update' && changedForPreview(draft).length === 0}>
                  変更をプレビュー
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(undefined)}>キャンセル</Button>
                {draft.mode === 'update' && changedForPreview(draft).length === 0 && <span className="self-center text-xs text-muted-foreground">変更なし</span>}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md border bg-muted/30 p-2 text-xs">
                <div className="mb-1 font-medium">{draft.mode === 'insert' ? '以下の内容で新規行を追加します:' : '以下の変更を書き込みます:'}</div>
                {draft.mode === 'update' && (
                  <div className="mb-1 font-mono">WHERE {Object.entries(draft.pk).map(([k, v]) => `${k}=${v ?? 'NULL'}`).join(' AND ')}</div>
                )}
                <ul className="grid gap-0.5 font-mono">
                  {changedForPreview(draft).map((ch) => (
                    <li key={ch.col}>
                      {ch.col}: {draft.mode === 'update' && <span className="text-muted-foreground">{ch.from ?? 'NULL'} → </span>}
                      <span className="text-primary">{ch.to ?? 'NULL'}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={saving} onClick={commit}>
                  {saving ? <LoaderCircle className="animate-spin" /> : <Save />}書き込みを確定
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>戻る</Button>
              </div>
            </>
          )}
        </div>
      )}
    </ActionCard>
  )
}

function PackImageStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [mode, setMode] = useState<'single' | 'split'>('single')
  const [img1, setImg1] = useState<LoadedImage>()
  const [img2, setImg2] = useState<LoadedImage>()
  const [t1, setT1] = useState<ImgTransform>({ ...defaultTransform })
  const [t2, setT2] = useState<ImgTransform>({ ...defaultTransform })
  const [splitY, setSplitY] = useState(0.5)
  const [splitAngle, setSplitAngle] = useState(-8)
  const [seam, setSeam] = useState(true)

  const [title, setTitle] = useState('Eternal\nCore')
  const [subtitle, setSubtitle] = useState('時を刻んだ無限の中核へ')
  const [titleSize, setTitleSize] = useState(52)
  const [titleSpacing, setTitleSpacing] = useState(3)
  const [titleY, setTitleY] = useState(0.62)
  const [titleColor, setTitleColor] = useState('#ffffff')
  const [titleFont, setTitleFont] = useState<'exo' | 'geosans' | 'noto'>('exo')
  const [titleWeight, setTitleWeight] = useState(300)
  const [titleUpper, setTitleUpper] = useState(true)
  const [fontsReady, setFontsReady] = useState(false)
  const [subSize, setSubSize] = useState(19)
  const [subGap, setSubGap] = useState(30)
  const [gradient, setGradient] = useState(true)
  const [gradientStrength, setGradientStrength] = useState(0.75)
  const [gradientColor, setGradientColor] = useState('#05060a')
  const [accent, setAccent] = useState(true)
  const [accentColor, setAccentColor] = useState('#8fd6ff')

  // colour wash / depth
  const [tint, setTint] = useState(false)
  const [tintColor, setTintColor] = useState('#3a6ea5')
  const [tintStrength, setTintStrength] = useState(0.25)
  const [vignette, setVignette] = useState(true)
  const [vignetteStrength, setVignetteStrength] = useState(0.35)
  const [topFade, setTopFade] = useState(true)

  // decorative pattern overlay
  const [pattern, setPattern] = useState<PatternKind>('none')
  const [patternColor, setPatternColor] = useState('#ffffff')
  const [patternOpacity, setPatternOpacity] = useState(0.12)

  // title styling
  const [titleStroke, setTitleStroke] = useState(false)
  const [titleStrokeColor, setTitleStrokeColor] = useState('#000000')
  const [titleGradient, setTitleGradient] = useState(false)
  const [titleGradient2, setTitleGradient2] = useState('#8fd6ff')
  const [titleGlow, setTitleGlow] = useState(true)

  const [packId, setPackId] = useState('')
  const [alsoSmall, setAlsoSmall] = useState(false)
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState<ActionState>(emptyAction)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = PACK_W
    const H = PACK_H
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#1a1a20'
    ctx.fillRect(0, 0, W, H)

    // background image(s)
    if (mode === 'single') {
      if (img1) drawCover(ctx, img1.el, W, H, t1)
    } else {
      if (img2) drawCover(ctx, img2.el, W, H, t2)
      // clip the region above the diagonal for the top image
      const midY = H * splitY
      const half = Math.tan((splitAngle * Math.PI) / 180) * (W / 2)
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(0, midY - half)
      ctx.lineTo(W, midY + half)
      ctx.lineTo(W, 0)
      ctx.lineTo(0, 0)
      ctx.closePath()
      ctx.clip()
      if (img1) drawCover(ctx, img1.el, W, H, t1)
      ctx.restore()
      if (seam) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, midY - half)
        ctx.lineTo(W, midY + half)
        ctx.stroke()
        ctx.restore()
      }
    }

    // colour wash for cohesion (duotone-ish tint over the photo)
    if (tint) {
      ctx.save()
      ctx.globalCompositeOperation = 'soft-light'
      ctx.globalAlpha = tintStrength
      ctx.fillStyle = tintColor
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }

    // decorative pattern overlay (rays / stars / grid / ...)
    drawPattern(ctx, pattern, W, H, patternColor, patternOpacity, splitAngle)

    // top fade for depth / status-bar legibility
    if (topFade) {
      const gt = ctx.createLinearGradient(0, 0, 0, H * 0.35)
      gt.addColorStop(0, `rgba(${hexToRgb(gradientColor)},0.55)`)
      gt.addColorStop(1, `rgba(${hexToRgb(gradientColor)},0)`)
      ctx.fillStyle = gt
      ctx.fillRect(0, 0, W, H * 0.35)
    }

    // bottom darkening gradient for text legibility (colourable)
    if (gradient) {
      const rgb = hexToRgb(gradientColor)
      const g = ctx.createLinearGradient(0, H * 0.4, 0, H)
      g.addColorStop(0, `rgba(${rgb},0)`)
      g.addColorStop(1, `rgba(${rgb},${gradientStrength})`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }

    // vignette (radial darkening at the edges)
    if (vignette) {
      const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.62)
      rg.addColorStop(0, 'rgba(0,0,0,0)')
      rg.addColorStop(1, `rgba(0,0,0,${vignetteStrength})`)
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, W, H)
    }

    // title (supports multi-line via \n)
    const cx = W / 2
    // Authentic Arcaea typography: Exo is the in-game UI face, Geosans Light
    // is the logo face; both fall back to Noto Sans CJK SC for JP/CJK glyphs.
    const family =
      titleFont === 'geosans'
        ? '"Geosans Light", "Noto Sans CJK SC", sans-serif'
        : titleFont === 'noto'
          ? '"Noto Sans CJK SC", "Exo", sans-serif'
          : '"Exo", "Noto Sans CJK SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `${titleWeight} ${titleSize}px ${family}`
    const withSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    if ('letterSpacing' in ctx) withSpacing.letterSpacing = `${titleSpacing}px`
    const lines = (titleUpper ? title.toUpperCase() : title).split('\n')
    const lineH = titleSize * 1.12
    const baseY = titleY * H
    const lastY = baseY + (lines.length - 1) * lineH

    // optional soft glow halo behind the title
    if (titleGlow) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 16
      ctx.shadowOffsetY = 1
      ctx.fillStyle = 'rgba(0,0,0,0.001)'
      lines.forEach((ln, i) => ctx.fillText(ln, cx, baseY + i * lineH))
      ctx.restore()
    }

    // title fill: solid colour or vertical gradient
    let titleFill: string | CanvasGradient = titleColor
    if (titleGradient) {
      const tg = ctx.createLinearGradient(0, baseY - titleSize, 0, lastY + titleSize * 0.3)
      tg.addColorStop(0, titleColor)
      tg.addColorStop(1, titleGradient2)
      titleFill = tg
    }
    ctx.save()
    if (titleGlow) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 10
    }
    lines.forEach((ln, i) => {
      const y = baseY + i * lineH
      if (titleStroke) {
        ctx.lineJoin = 'round'
        ctx.lineWidth = Math.max(2, titleSize * 0.06)
        ctx.strokeStyle = titleStrokeColor
        ctx.strokeText(ln, cx, y)
      }
      ctx.fillStyle = titleFill
      ctx.fillText(ln, cx, y)
    })
    ctx.restore()

    // subtitle
    if (subtitle) {
      ctx.font = `400 ${subSize}px "Exo", "Noto Sans CJK SC", "Hiragino Sans", sans-serif`
      if ('letterSpacing' in ctx) withSpacing.letterSpacing = '2px'
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 8
      ctx.fillStyle = titleColor
      ctx.fillText(subtitle, cx, lastY + subGap)
      ctx.restore()
    }
    if ('letterSpacing' in ctx) withSpacing.letterSpacing = '0px'

    // accent line under the subtitle (Arcaea-ish seam accent, colourable)
    if (accent) {
      const ly = lastY + subGap + subSize * 0.7
      const lw = W * 0.5
      const rgb = hexToRgb(accentColor)
      const ag = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0)
      ag.addColorStop(0, `rgba(${rgb},0)`)
      ag.addColorStop(0.5, `rgba(${rgb},0.9)`)
      ag.addColorStop(1, `rgba(${rgb},0)`)
      ctx.strokeStyle = ag
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx - lw / 2, ly)
      ctx.lineTo(cx + lw / 2, ly)
      ctx.stroke()
    }
  }, [
    mode, img1, img2, t1, t2, splitY, splitAngle, seam,
    title, subtitle, titleSize, titleSpacing, titleY, titleColor, titleFont,
    titleWeight, titleUpper, subSize, subGap, gradient, gradientStrength, gradientColor,
    accent, accentColor, tint, tintColor, tintStrength, vignette, vignetteStrength, topFade,
    pattern, patternColor, patternOpacity, titleStroke, titleStrokeColor,
    titleGradient, titleGradient2, titleGlow, fontsReady,
  ])

  // Ensure the embedded Arcaea fonts are loaded before the canvas draws text;
  // otherwise the first paint falls back to a system face until they arrive.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (!fonts) { setFontsReady(true); return }
    Promise.all([
      fonts.load('300 52px "Exo"'),
      fonts.load('400 52px "Exo"'),
      fonts.load('500 52px "Exo"'),
      fonts.load('600 52px "Exo"'),
      fonts.load('400 52px "Geosans Light"'),
      fonts.load('400 24px "Noto Sans CJK SC"'),
    ]).then(() => setFontsReady(true)).catch(() => setFontsReady(true))
  }, [])

  useEffect(() => {
    render()
  }, [render])

  function loadImage(file: File | undefined, setter: (v: LoadedImage) => void) {
    if (!file) return
    const el = new Image()
    el.onload = () => setter({ el, name: file.name })
    el.src = URL.createObjectURL(file)
  }

  function exportBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current
      if (!canvas) return reject(new Error('canvas not ready'))
      canvas.toBlob((b: Blob | null) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    })
  }

  async function download() {
    try {
      const blob = await exportBlob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `1080_select_${packId || 'pack'}.png`
      a.click()
      setAction({ kind: 'success', message: `${a.download} をダウンロードしました` })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function saveToPack() {
    if (!/^[a-z0-9_]+$/.test(packId)) {
      setAction({ kind: 'error', message: 'パックID(半角小文字英数字と _)を入力してください' })
      return
    }
    setSaving(true)
    setAction(emptyAction)
    try {
      const blob = await exportBlob()
      const written = await adminApi.packImageSave(packId, blob, alsoSmall)
      setAction({ kind: 'success', message: `保存しました: ${written.join(', ')}` })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  function applyPreset(p: PackPreset) {
    if (p.splitAngle !== undefined) setSplitAngle(p.splitAngle)
    if (p.titleFont !== undefined) setTitleFont(p.titleFont)
    if (p.titleWeight !== undefined) setTitleWeight(p.titleWeight)
    if (p.titleUpper !== undefined) setTitleUpper(p.titleUpper)
    if (p.titleSpacing !== undefined) setTitleSpacing(p.titleSpacing)
    if (p.titleColor !== undefined) setTitleColor(p.titleColor)
    if (p.titleGradient !== undefined) setTitleGradient(p.titleGradient)
    if (p.titleGradient2 !== undefined) setTitleGradient2(p.titleGradient2)
    if (p.titleStroke !== undefined) setTitleStroke(p.titleStroke)
    if (p.titleStrokeColor !== undefined) setTitleStrokeColor(p.titleStrokeColor)
    if (p.titleGlow !== undefined) setTitleGlow(p.titleGlow)
    if (p.gradientColor !== undefined) setGradientColor(p.gradientColor)
    if (p.gradientStrength !== undefined) setGradientStrength(p.gradientStrength)
    if (p.accent !== undefined) setAccent(p.accent)
    if (p.accentColor !== undefined) setAccentColor(p.accentColor)
    if (p.tint !== undefined) setTint(p.tint)
    if (p.tintColor !== undefined) setTintColor(p.tintColor)
    if (p.tintStrength !== undefined) setTintStrength(p.tintStrength)
    if (p.vignette !== undefined) setVignette(p.vignette)
    if (p.vignetteStrength !== undefined) setVignetteStrength(p.vignetteStrength)
    if (p.topFade !== undefined) setTopFade(p.topFade)
    if (p.pattern !== undefined) setPattern(p.pattern)
    if (p.patternColor !== undefined) setPatternColor(p.patternColor)
    if (p.patternOpacity !== undefined) setPatternOpacity(p.patternOpacity)
    setAction({ kind: 'success', message: `プリセット「${p.name}」を適用しました` })
  }

  const transformControls = (
    label: string,
    t: ImgTransform,
    setT: (v: ImgTransform) => void,
  ) => (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <label className="flex items-center gap-2 text-xs">
        ズーム
        <input type="range" min={0.3} max={3} step={0.01} value={t.scale}
          onChange={(e) => setT({ ...t, scale: Number(e.target.value) })} className="flex-1" />
      </label>
      <label className="flex items-center gap-2 text-xs">
        左右
        <input type="range" min={-0.5} max={0.5} step={0.005} value={t.x}
          onChange={(e) => setT({ ...t, x: Number(e.target.value) })} className="flex-1" />
      </label>
      <label className="flex items-center gap-2 text-xs">
        上下
        <input type="range" min={-0.5} max={0.5} step={0.005} value={t.y}
          onChange={(e) => setT({ ...t, y: Number(e.target.value) })} className="flex-1" />
      </label>
      <Button type="button" size="sm" variant="ghost" onClick={() => setT({ ...defaultTransform })}>
        リセット
      </Button>
    </div>
  )

  return (
    <ActionCard
      title="パック画像生成"
      description="背景画像と文字から Arcaea 風のパック選択画像 (374×750) を作成し、ダウンロード / パックに保存します"
    >
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        {/* live preview */}
        <div className="flex flex-col items-center gap-2">
          <canvas
            ref={canvasRef}
            width={PACK_W}
            height={PACK_H}
            className="rounded-md border shadow"
            style={{ width: 250, height: 501 }}
          />
          <span className="text-xs text-muted-foreground">プレビュー (実寸 374×750)</span>
        </div>

        {/* controls */}
        <div className="grid content-start gap-4">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">プリセット (配色 + エフェクト一括適用)</span>
            <div className="flex flex-wrap gap-1.5">
              {PACK_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
                >
                  <span className="inline-block h-3 w-3 rounded-full border" style={{ background: p.swatch }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ToggleLabel checked={mode === 'split'} onChange={(c) => setMode(c ? 'split' : 'single')} label="斜め分割 (2枚合成)" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={mode === 'split' ? '画像 (上)' : '背景画像'}>
              <Input type="file" accept="image/*" onChange={(e) => loadImage(e.target.files?.[0], setImg1)} />
            </Field>
            {mode === 'split' && (
              <Field label="画像 (下)">
                <Input type="file" accept="image/*" onChange={(e) => loadImage(e.target.files?.[0], setImg2)} />
              </Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {img1 && transformControls(mode === 'split' ? '上画像の調整' : '背景の調整', t1, setT1)}
            {mode === 'split' && img2 && transformControls('下画像の調整', t2, setT2)}
          </div>

          {mode === 'split' && (
            <div className="grid gap-1.5 rounded-md border p-2">
              <span className="text-xs font-medium">分割ライン</span>
              <label className="flex items-center gap-2 text-xs">
                高さ
                <input type="range" min={0.2} max={0.8} step={0.005} value={splitY}
                  onChange={(e) => setSplitY(Number(e.target.value))} className="flex-1" />
              </label>
              <label className="flex items-center gap-2 text-xs">
                角度
                <input type="range" min={-30} max={30} step={0.5} value={splitAngle}
                  onChange={(e) => setSplitAngle(Number(e.target.value))} className="flex-1" />
              </label>
              <ToggleLabel checked={seam} onChange={setSeam} label="境界に光の線" />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="タイトル (改行で複数行)">
              <textarea
                className="min-h-16 w-full rounded-md border bg-background p-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="サブタイトル">
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="フォント">
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={titleFont}
                onChange={(e) => setTitleFont(e.target.value as 'exo' | 'geosans' | 'noto')}>
                <option value="exo">Exo (Arcaea UI)</option>
                <option value="geosans">Geosans Light (ロゴ風)</option>
                <option value="noto">Noto Sans CJK (日本語)</option>
              </select>
            </Field>
            <Field label="太さ">
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={titleWeight}
                onChange={(e) => setTitleWeight(Number(e.target.value))}>
                <option value={300}>Light</option>
                <option value={400}>Regular</option>
                <option value={500}>Medium</option>
                <option value={600}>SemiBold</option>
              </select>
            </Field>
            <Field label="文字色">
              <Input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs">タイトルサイズ
              <input type="range" min={24} max={84} step={1} value={titleSize}
                onChange={(e) => setTitleSize(Number(e.target.value))} className="flex-1" /></label>
            <label className="flex items-center gap-2 text-xs">字間
              <input type="range" min={0} max={16} step={0.5} value={titleSpacing}
                onChange={(e) => setTitleSpacing(Number(e.target.value))} className="flex-1" /></label>
            <label className="flex items-center gap-2 text-xs">縦位置
              <input type="range" min={0.2} max={0.9} step={0.005} value={titleY}
                onChange={(e) => setTitleY(Number(e.target.value))} className="flex-1" /></label>
            <label className="flex items-center gap-2 text-xs">サブサイズ
              <input type="range" min={12} max={32} step={1} value={subSize}
                onChange={(e) => setSubSize(Number(e.target.value))} className="flex-1" /></label>
            <label className="flex items-center gap-2 text-xs">サブ間隔
              <input type="range" min={10} max={70} step={1} value={subGap}
                onChange={(e) => setSubGap(Number(e.target.value))} className="flex-1" /></label>
            <label className="flex items-center gap-2 text-xs">暗さ
              <input type="range" min={0} max={1} step={0.02} value={gradientStrength}
                onChange={(e) => setGradientStrength(Number(e.target.value))} className="flex-1" /></label>
          </div>

          {/* title styling */}
          <div className="grid gap-2 rounded-md border p-3">
            <span className="text-xs font-medium">タイトル装飾</span>
            <div className="flex flex-wrap gap-2">
              <ToggleLabel checked={titleUpper} onChange={setTitleUpper} label="大文字化" />
              <ToggleLabel checked={titleGlow} onChange={setTitleGlow} label="グロー(影)" />
              <ToggleLabel checked={titleStroke} onChange={setTitleStroke} label="縁取り" />
              <ToggleLabel checked={titleGradient} onChange={setTitleGradient} label="グラデ文字" />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {titleStroke && (
                <label className="flex items-center gap-1">縁色
                  <Input type="color" className="h-7 w-10 p-0.5" value={titleStrokeColor}
                    onChange={(e) => setTitleStrokeColor(e.target.value)} /></label>
              )}
              {titleGradient && (
                <label className="flex items-center gap-1">グラデ下端色
                  <Input type="color" className="h-7 w-10 p-0.5" value={titleGradient2}
                    onChange={(e) => setTitleGradient2(e.target.value)} /></label>
              )}
            </div>
          </div>

          {/* colours */}
          <div className="grid gap-2 rounded-md border p-3">
            <span className="text-xs font-medium">配色</span>
            <div className="flex flex-wrap gap-2">
              <ToggleLabel checked={gradient} onChange={setGradient} label="下部グラデ" />
              <ToggleLabel checked={topFade} onChange={setTopFade} label="上部フェード" />
              <ToggleLabel checked={accent} onChange={setAccent} label="アクセント線" />
              <ToggleLabel checked={vignette} onChange={setVignette} label="周辺減光" />
              <ToggleLabel checked={tint} onChange={setTint} label="色被せ" />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">グラデ色
                <Input type="color" className="h-7 w-10 p-0.5" value={gradientColor}
                  onChange={(e) => setGradientColor(e.target.value)} /></label>
              <label className="flex items-center gap-1">アクセント色
                <Input type="color" className="h-7 w-10 p-0.5" value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)} /></label>
              {tint && (
                <>
                  <label className="flex items-center gap-1">色被せ
                    <Input type="color" className="h-7 w-10 p-0.5" value={tintColor}
                      onChange={(e) => setTintColor(e.target.value)} /></label>
                  <label className="flex flex-1 items-center gap-1 min-w-32">強さ
                    <input type="range" min={0} max={0.7} step={0.02} value={tintStrength}
                      onChange={(e) => setTintStrength(Number(e.target.value))} className="flex-1" /></label>
                </>
              )}
              {vignette && (
                <label className="flex flex-1 items-center gap-1 min-w-32">減光量
                  <input type="range" min={0} max={0.8} step={0.02} value={vignetteStrength}
                    onChange={(e) => setVignetteStrength(Number(e.target.value))} className="flex-1" /></label>
              )}
            </div>
          </div>

          {/* decorative pattern */}
          <div className="grid gap-2 rounded-md border p-3">
            <span className="text-xs font-medium">模様 (エフェクト)</span>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">種類
                <select className="h-8 rounded-md border bg-background px-2" value={pattern}
                  onChange={(e) => setPattern(e.target.value as PatternKind)}>
                  <option value="none">なし</option>
                  <option value="rays">光線 (rays)</option>
                  <option value="stars">星屑 (stars)</option>
                  <option value="stripes">斜線 (stripes)</option>
                  <option value="grid">格子 (grid)</option>
                  <option value="dots">ドット (dots)</option>
                  <option value="hex">六角 (hex)</option>
                </select>
              </label>
              {pattern !== 'none' && (
                <>
                  <label className="flex items-center gap-1">色
                    <Input type="color" className="h-7 w-10 p-0.5" value={patternColor}
                      onChange={(e) => setPatternColor(e.target.value)} /></label>
                  <label className="flex flex-1 items-center gap-1 min-w-32">濃さ
                    <input type="range" min={0} max={0.6} step={0.01} value={patternOpacity}
                      onChange={(e) => setPatternOpacity(Number(e.target.value))} className="flex-1" /></label>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="パックID (保存先)" hint="songs/pack/1080_select_<id>.png に保存">
                <Input className="w-52" value={packId} placeholder="例: mypack"
                  onChange={(e) => setPackId(e.target.value)} />
              </Field>
              <ToggleLabel checked={alsoSmall} onChange={setAlsoSmall} label="small版も同時保存" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={download}>
                <Save />
                ダウンロード
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={saveToPack}>
                {saving ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
                パックに保存
              </Button>
              <ActionMessage action={action} />
            </div>
          </div>
        </div>
      </div>
    </ActionCard>
  )
}

function BackupView() {
  const [state, setState] = useState<LoadState>('loading')
  const [files, setFiles] = useState<BackupFile[]>([])
  const [running, setRunning] = useState(false)
  const [action, setAction] = useState<ActionState>(emptyAction)

  const load = useCallback((showLoading = true) => {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .backupList()
      .then((value) => {
        setFiles(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function runBackup() {
    setRunning(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.backupRun()
      const prunedNote =
        result.pruned.length > 0 ? ` / 古い ${result.pruned.length} 件を自動削除` : ''
      setAction({
        kind: 'success',
        message: `${result.name} を作成しました (${formatBytes(result.sizeBytes)})${prunedNote}`,
      })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <ActionCard
      title="DB バックアップ"
      description="データベース全体のスナップショット (.sql) を作成・保存します"
    >
      <HelpBox>
        <span>
          <b>バックアップとは</b>: 現在のデータベースの中身をまるごと 1 ファイルに保存したものです。
          プレイヤーのアカウント・成績・購入状況などをまとめて復元できる「復元ポイント」になります。
        </span>
        <span className="text-xs">
          自動バックアップは 1 日 1 回サーバー側で作成されます (最新 14 件を保持)。
          重要な変更 (曲の一括削除・DB 操作など) の前には、下のボタンで手動バックアップを取ることをおすすめします。
        </span>
      </HelpBox>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={running} onClick={runBackup}>
          {running ? <LoaderCircle className="animate-spin" /> : <DatabaseBackup />}
          今すぐバックアップを作成
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => load()}>
          <RefreshCcw />
          一覧を更新
        </Button>
        <ActionMessage action={action} />
      </div>

      {state === 'loading' || state === 'error' ? (
        <LoadPanel state={state} onRetry={() => load()} />
      ) : files.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          まだバックアップがありません。上のボタンで作成できます。
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ファイル名</TableHead>
                <TableHead>作成日時</TableHead>
                <TableHead className="text-right">サイズ</TableHead>
                <TableHead className="w-0 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.name}>
                  <TableCell className="font-mono text-xs">{file.name}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(file.createdUnix * 1000).toLocaleString('ja-JP')}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatBytes(file.sizeBytes)}
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-sm hover:bg-accent"
                      href={adminApi.backupDownloadUrl(file.name)}
                      download
                    >
                      <Save className="size-3.5" />
                      ダウンロード
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ActionCard>
  )
}

function HelpView() {
  return (
    <div className="grid gap-4">
      <ActionCard
        title="用語集"
        description="この管理画面とゲームサーバーで使われる用語の説明"
      >
        <div className="grid gap-2 lg:grid-cols-2">
          <HelpTerm term="記憶源点 (memory / チケット)">
            ゲーム内通貨です。プレイヤーはこれを使ってパックや単曲を購入します。
            「チケット」ページで残高の確認・変更ができます。
          </HelpTerm>
          <HelpTerm term="報酬 (プレゼント)">
            プレイヤーがゲーム内の受け取り画面で受領できる配布物です。先に「報酬追加」で定義を作り、
            「報酬配布」で対象プレイヤーに届けます。
          </HelpTerm>
          <HelpTerm term="引換コード">
            プレイヤーが自分でゲーム内に入力してアイテムを受け取るコードです。
            配布と違いプレイヤー側の入力操作が必要です。
          </HelpTerm>
          <HelpTerm term="コンテンツバンドル (Bundle)">
            クライアント (ゲームアプリ) が起動時にダウンロードする曲データ一式です。
            songs フォルダの内容から「Bundle 管理」ページで構築します。
          </HelpTerm>
          <HelpTerm term="songlist">
            ゲーム内に表示される全曲の情報 (曲名・難易度・所属パック等) を持つファイルです。
            バンドルに含まれてクライアントに配信されます。
          </HelpTerm>
          <HelpTerm term="remote_dl">
            曲の配信方式のひとつ。バンドルにはジャケットと試聴音源だけを入れ、譜面と音源本体は
            プレイヤーが曲を選んだときに個別ダウンロードさせる方式です。バンドルのサイズを抑えられます。
          </HelpTerm>
          <HelpTerm term="B30 / R10 / Rating">
            B30 はベスト成績上位30件、R10 は最近の高成績10件。両者の平均からプレイヤーの
            Rating (実力値) が計算されます。譜面定数を変更したら「Rating 再計算」を実行してください。
          </HelpTerm>
          <HelpTerm term="スキャンの エラー / 警告 / 情報">
            エラー = クライアントの不具合につながる矛盾 (要修正)。警告 = 意図的ならば問題ない状態 (要確認)。
            情報 = 件数などの参考情報 (対応不要)。
          </HelpTerm>
        </div>
      </ActionCard>

      <ActionCard title="よくある操作の手順" description="迷ったらここに書いてある順番のとおりに操作してください">
        <div className="grid gap-2 lg:grid-cols-2">
          <HelpSteps
            title="曲を追加して配信する"
            steps={[
              '「Songlist 編集」を開き、曲フォルダ (譜面 .aff、音源 base.ogg、ジャケット入り) をドロップゾーンにドロップする',
              '自動生成された曲情報 (JSON) を確認し、必要なら曲名などを直す',
              'ダウンロード配信にしたい場合は「remote_dl」をオンにする',
              '「インポート実行」を押す',
              '「Bundle 管理」でスキャン結果を確認し、プレビュー → 書き込みを確定',
              '「Bundle キャッシュを更新」を押し、クライアントを再起動して新バンドルを受信させる',
            ]}
          />
          <HelpSteps
            title="バンドルだけ作り直す"
            steps={[
              '「Bundle 管理」を開く (スキャンが自動実行されます)',
              'エラーが出ていたら内容を確認して直す (「Songlist 編集」で該当曲を修正・削除)',
              'アプリバージョンを入力して「プレビュー」',
              '差分 (追加/変更/削除の件数) が想定どおりか確認して「書き込みを確定」',
              '「Bundle キャッシュを更新」を押す',
            ]}
          />
          <HelpSteps
            title="プレイヤー全員にアイテムを配る"
            steps={[
              '「報酬追加」で報酬IDを決めてアイテムと数量を設定して作成',
              '「報酬配布」で同じ報酬IDを入力し「全ユーザー」をオンにして配布',
              'プレイヤーはゲーム内の受け取り画面から受領できます',
            ]}
          />
          <HelpSteps
            title="パスワードを忘れたプレイヤーを助ける"
            steps={[
              '「パスワードリセット」を開く',
              'ユーザーID・プレイヤー名・フレンドコードのいずれかで対象を指定',
              '新しいパスワードを入力してリセットし、プレイヤーに伝える',
            ]}
          />
        </div>
      </ActionCard>
    </div>
  )
}

function CheckinView() {
  const [data, setData] = useState<UserCheckinStatus>()
  const [state, setState] = useState<LoadState>('loading')
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  const load = useCallback((showLoading = true) => {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .checkinStatus()
      .then((value) => {
        setData(value)
        setState('ready')
      })
      .catch((error) => {
        setState('error')
        setAction({ kind: 'error', message: errorMessage(error) })
      })
  }, [])

  useEffect(() => {
    let ignore = false
    adminApi
      .checkinStatus()
      .then((value) => {
        if (ignore) {
          return
        }
        setData(value)
        setState('ready')
      })
      .catch((error) => {
        if (ignore) {
          return
        }
        setState('error')
        setAction({ kind: 'error', message: errorMessage(error) })
      })

    return () => {
      ignore = true
    }
  }, [])

  async function claim() {
    setLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.claimCheckin()
      setData(result)
      setState('ready')
      const rewardText = result.reward ? `+${result.reward}` : ''
      setAction({
        kind: 'success',
        message: result.claimed
          ? `チェックイン成功 ${rewardText}`
          : `本日は既にチェックイン済み ${rewardText}`,
      })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="毎日チェックイン" description="1日1回チケットを受け取れます">
      {state === 'error' ? (
        <LoadPanel state={state} onRetry={() => load(true)} />
      ) : state === 'loading' && !data ? (
        <LoadPanel state={state} onRetry={() => load(true)} />
      ) : data ? (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">プレイヤー</div>
              <div className="mt-1 font-medium">{data.user.name || '-'}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {data.user.userId}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">現在のチケット</div>
              <div className="mt-1 font-mono text-2xl font-semibold">
                {data.currentTicket.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">{data.today}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-2xl font-semibold">
                  {data.reward ? `+${data.reward}` : '200-500'}
                </span>
                <Badge variant={data.checkedInToday ? 'secondary' : 'outline'}>
                  {data.checkedInToday ? 'チェックイン済み' : '未チェックイン'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={loading || data.checkedInToday}
              onClick={claim}
            >
              {loading ? <LoaderCircle className="animate-spin" /> : <Gift />}
              {data.checkedInToday ? 'チェックイン済み' : 'チェックイン'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading || state === 'loading'}
              onClick={() => load(true)}
            >
              {state === 'loading' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCcw />
              )}
              更新
            </Button>
            <ActionMessage action={action} />
          </div>
        </div>
      ) : null}
    </ActionCard>
  )
}

function ActionCard({
  title,
  description,
  children,
  className,
  contentClassName,
}: {
  title: string
  description: string
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={cn('flex flex-col gap-4', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  )
}

function PlayerScoresView({ isAdmin }: { isAdmin: boolean }) {
  const [form, setForm] = useState({ ...emptyUserSelectorForm })
  const [scores, setScores] = useState<AdminUserScores>()
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)
  const best30Average = scores?.b30.length
    ? scores.stats.best30Sum / scores.b30.length
    : 0
  const recent10Average = scores?.r10.length
    ? scores.stats.recent10Sum / scores.r10.length
    : 0

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.userScores({
        ...(isAdmin ? buildUserSelectorPayload(form) : {}),
      })
      setScores(result)
      setAction({
        kind: 'success',
        message: `${result.user.name || result.user.userId} · B30 ${result.b30.length} · R10 ${result.r10.length}`,
      })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard
      title="プレイヤー成績"
      description="プレイヤーの B30 (ベスト30) / R10 (最近10件) 成績を表示します"
      className="flex min-h-[calc(100svh-6.5rem)] flex-col"
      contentClassName="min-h-0 flex-1"
    >
      <form className="grid gap-3" onSubmit={onSubmit}>
        {isAdmin && (
          <UserSelectorFields
            value={form}
            onChange={(value) => setForm({ ...form, ...value })}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
            検索
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
      {scores && (
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {scores.user.name || '-'} · {scores.user.userId} ·{' '}
              {scores.user.userCode || '-'}
            </span>
            <Badge variant="secondary">PTT {scores.stats.potential.toFixed(4)}</Badge>
            <Badge variant="outline">B30 Avg {best30Average.toFixed(4)}</Badge>
            <Badge variant="outline">R10 Avg {recent10Average.toFixed(4)}</Badge>
          </div>
          <div className="grid min-h-0 gap-3 xl:grid-cols-2">
            <ScoreSection title="B30" scores={scores.b30} />
            <ScoreSection title="R10" scores={scores.r10} />
          </div>
        </div>
      )}
    </ActionCard>
  )
}

function ScoreImagesView({ isAdmin }: { isAdmin: boolean }) {
  const [form, setForm] = useState({ ...emptyUserSelectorForm })
  const [result, setResult] = useState<ScoreImages>()
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const value = await adminApi.scoreImages({
        ...(isAdmin ? buildUserSelectorPayload(form) : {}),
      })
      setResult(value)
      setAction({
        kind: 'success',
        message: `${value.user.name || value.user.userId} · ${value.images.length} 枚`,
      })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard
      title="成績画像"
      description="B30 / AP30 / Sex30 を生成"
      className="flex min-h-[calc(100svh-6.5rem)] flex-col"
      contentClassName="min-h-0 flex-1"
    >
      <form className="grid gap-3" onSubmit={onSubmit}>
        {isAdmin && (
          <UserSelectorFields
            value={form}
            onChange={(value) => setForm({ ...form, ...value })}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Images />}
            生成
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>

      {result && (
        <div className="grid min-h-0 flex-1 gap-4">
          <div className="text-sm font-medium">
            {result.user.name || '-'} · {result.user.userId} ·{' '}
            {result.user.userCode || '-'}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {result.images.map((image) => (
              <div
                key={image.mode}
                className="grid min-w-0 gap-2 rounded-md border bg-card p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{image.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {image.entryCount} 件
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={image.url} download={`${image.mode}.png`}>
                      ダウンロード
                    </a>
                  </Button>
                </div>
                <img
                  className="w-full rounded border bg-muted"
                  src={image.url}
                  alt={image.title}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </ActionCard>
  )
}

function ChartTopView() {
  const [form, setForm] = useState({ sid: '', difficulty: '2', limit: '50' })
  const [chartTop, setChartTop] = useState<AdminChartTop>()
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const sid = requireTrimmed(form.sid, 'song_id')
      const result = await adminApi.chartTop({
        sid,
        difficulty: parseDifficulty(form.difficulty, 2),
        limit: parseOptionalPositiveInt(form.limit, 'limit'),
      })
      setChartTop(result)
      setAction({
        kind: 'success',
        message: `${result.songId} · ${difficultyLabel(result.difficulty)} · ${result.scores.length} 件`,
      })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard
      title="楽曲ランキング"
      description="指定した曲・難易度のサーバー内ランキングを表示します"
      className="flex min-h-[calc(100svh-6.5rem)] flex-col"
      contentClassName="min-h-0 flex-1"
    >
      <form className="grid gap-3" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_120px]">
          <Input
            value={form.sid}
            onChange={(event) => setForm({ ...form, sid: event.target.value })}
            placeholder="song_id / name"
            required
          />
          <DifficultySelect
            value={form.difficulty}
            onChange={(difficulty) => setForm({ ...form, difficulty })}
          />
          <Input
            value={form.limit}
            onChange={(event) => setForm({ ...form, limit: event.target.value })}
            placeholder="limit"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
            検索
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
      {chartTop && (
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <div className="text-sm font-medium">
            {chartTop.nameEn || chartTop.songId} · {chartTop.songId} ·{' '}
            {difficultyLabel(chartTop.difficulty)}
          </div>
          <ScoreResultsTable scores={chartTop.scores} showUser />
        </div>
      )}
    </ActionCard>
  )
}

function UserTicketView() {
  const [form, setForm] = useState<UserTicketForm>(emptyUserTicketForm)
  const [userSearch, setUserSearch] = useState('')
  const [searchRows, setSearchRows] = useState<UserRow[]>([])
  const [searchState, setSearchState] = useState<LoadState>('idle')
  const [selectedUser, setSelectedUser] = useState<UserRow>()
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)
  const ticketPreview = useMemo(
    () => previewUserTicketInput(form.ticket, selectedUser?.ticket),
    [form.ticket, selectedUser?.ticket],
  )

  function selectUser(row: UserRow) {
    setSelectedUser(row)
    setForm((current) => ({
      ...current,
      allUsers: false,
      userId: String(row.userId),
      name: row.name,
      userCode: row.userCode,
    }))
  }

  async function searchUsers() {
    setAction(emptyAction)
    setSearchState('loading')
    try {
      const q = requireTrimmed(userSearch, '検索内容')
      const result = await adminApi.users({
        q,
        page: 1,
        pageSize: 10,
      })
      setSearchRows(result.rows)
      setSearchState('ready')
      if (result.rows.length === 1) {
        selectUser(result.rows[0])
      } else {
        setSelectedUser(undefined)
      }
    } catch (error) {
      setSearchState('error')
      setSearchRows([])
      setSelectedUser(undefined)
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const ticket = parseUserTicketInput(
        form.ticket,
        form.allUsers ? undefined : selectedUser?.ticket,
      )
      const payload: UserTicketPayload = {
        ...(form.allUsers ? {} : buildUserSelectorPayload(form)),
        ticket,
        all_users: form.allUsers,
      }
      const result = await adminApi.updateUserTicket(payload)
      if (!form.allUsers && selectedUser) {
        const nextUser = { ...selectedUser, ticket }
        setSelectedUser(nextUser)
        setSearchRows((rows) =>
          rows.map((row) => (row.userId === nextUser.userId ? nextUser : row)),
        )
        setForm((current) => ({ ...current, ticket: String(ticket) }))
      }
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="チケット" description="プレイヤーの所持チケット (記憶源点 = ゲーム内通貨) を確認・変更します">
      <div className="grid gap-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={userSearch}
              disabled={form.allUsers}
              onChange={(event) => setUserSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  searchUsers()
                }
              }}
              placeholder="user_id / name / user_code で検索"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={form.allUsers || searchState === 'loading'}
            onClick={searchUsers}
          >
            {searchState === 'loading' ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Search />
            )}
            検索
          </Button>
        </div>

        {searchState === 'loading' && (
          <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        )}

        {searchState === 'ready' && searchRows.length === 0 && (
          <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            該当するプレイヤーがいません
          </div>
        )}

        {searchState === 'ready' && searchRows.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <Table className="min-w-[720px] table-fixed">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[20%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>名前</TableHead>
                  <TableHead>User Code</TableHead>
                  <TableHead>現在のチケット</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchRows.map((row) => {
                  const selected = selectedUser?.userId === row.userId
                  return (
                    <TableRow
                      key={row.userId}
                      data-state={selected ? 'selected' : undefined}
                    >
                      <TableCell className="font-mono">{row.userId}</TableCell>
                      <TableCell className="font-medium">{row.name || '-'}</TableCell>
                      <TableCell className="font-mono">{row.userCode || '-'}</TableCell>
                      <TableCell className="font-mono">{row.ticket}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={selected ? 'secondary' : 'outline'}
                          onClick={() => selectUser(row)}
                        >
                          {selected ? '選択済み' : '選択'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {selectedUser && (
          <div className="grid gap-3 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">ID</div>
              <div className="font-mono">{selectedUser.userId}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">名前</div>
              <div className="font-medium">{selectedUser.name || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">User Code</div>
              <div className="font-mono">{selectedUser.userCode || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">現在のチケット</div>
              <div className="font-mono text-base font-semibold">
                {selectedUser.ticket}
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="grid gap-3" onSubmit={onSubmit}>
        <ToggleLabel
          checked={form.allUsers}
          onChange={(checked) => {
            if (checked) {
              setSelectedUser(undefined)
            }
            setForm({ ...form, allUsers: checked })
          }}
          label="全ユーザー"
        />
        <UserSelectorFields
          value={form}
          disabled={form.allUsers}
          onChange={(value) => {
            setSelectedUser(undefined)
            setForm({ ...form, ...value })
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-32"
            value={form.ticket}
            onChange={(event) => setForm({ ...form, ticket: event.target.value })}
            placeholder={selectedUser ? '目標値 / +増分' : 'ticket'}
            required
          />
          {ticketPreview !== undefined && (
            <Badge variant="secondary">更新後 {ticketPreview}</Badge>
          )}
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Pencil />}
            更新
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function UserPasswordView() {
  const [form, setForm] = useState<UserPasswordForm>(emptyUserPasswordForm)
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.resetUserPassword({
        ...buildUserSelectorPayload(form),
        password: form.password,
      })
      setForm(emptyUserPasswordForm)
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="パスワードリセット" description="プレイヤーのログインパスワードを新しい値に設定します。パスワードを忘れたプレイヤーの救済に使います">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <UserSelectorFields
          value={form}
          onChange={(value) => setForm({ ...form, ...value })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Field label="新しいパスワード">
            <Input
              className="w-56"
              value={form.password}
              type="password"
              autoComplete="new-password"
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
          </Field>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
            リセット
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function UserCreateView() {
  const [form, setForm] = useState<UserCreateForm>(emptyUserCreateForm)
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.createUser({
        name: form.name.trim(),
        password: form.password,
        email: form.email.trim(),
      })
      setForm(emptyUserCreateForm)
      setAction({
        kind: 'success',
        message: `登録成功 · user_id=${result.userId} · user_code=${result.userCode}`,
      })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="アカウント登録" description="新しいプレイヤーアカウントを管理者権限で直接作成します">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="プレイヤー名" hint="ゲーム内で表示される名前">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="例: player1"
              required
            />
          </Field>
          <Field label="パスワード" hint="ログインに使用します">
            <Input
              value={form.password}
              type="password"
              autoComplete="new-password"
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
          </Field>
          <Field label="メールアドレス">
            <Input
              value={form.email}
              type="email"
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="例: player@example.com"
              required
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
            登録
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function UserBanView() {
  const [form, setForm] = useState<UserSelectorForm>(emptyUserSelectorForm)
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      const payload = buildUserSelectorPayload(form)
      if (!confirm('このユーザーをBANしますか？')) {
        return
      }
      setLoading(true)
      const result = await adminApi.banUser(payload)
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="ユーザーBAN" description="指定したプレイヤーをBAN (ログイン禁止) します。取り消しはデータベース操作が必要なため慎重に">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <UserSelectorFields
          value={form}
          onChange={(value) => setForm({ ...form, ...value })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="destructive" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <ShieldAlert />}
            BAN
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function UserPurchaseView() {
  const [form, setForm] = useState<UserPurchaseForm>(emptyUserPurchaseForm)
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      if (form.itemTypes.length <= 0) {
        throw new Error('item type を1つ以上選択してください')
      }
      const payload: UserPurchasePayload = {
        ...(form.allUsers ? {} : buildUserSelectorPayload(form)),
        method: form.method,
        all_users: form.allUsers,
        item_types: form.itemTypes,
      }
      const verb = form.method === 'unlock' ? 'ロック解除' : 'ロック'
      if (!confirm(`${form.allUsers ? '全ユーザー' : 'このユーザー'}の購入内容を${verb}しますか？`)) {
        return
      }
      setLoading(true)
      const result = await adminApi.updateUserPurchase(payload)
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="購入権限" description="プレイヤーの購入済みコンテンツ (パック・単曲) を解錠/施錠します。「全ユーザー」で全員に一括適用もできます">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={form.method}
            onChange={(event) =>
              setForm({ ...form, method: event.target.value as 'unlock' | 'lock' })
            }
          >
            <option value="unlock">ロック解除 (コンテンツを購入済みにする)</option>
            <option value="lock">ロック (購入を取り消す)</option>
          </select>
          <ToggleLabel
            checked={form.allUsers}
            onChange={(checked) => setForm({ ...form, allUsers: checked })}
            label="全ユーザー"
          />
        </div>
        <UserSelectorFields
          value={form}
          disabled={form.allUsers}
          onChange={(value) => setForm({ ...form, ...value })}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {purchaseItemTypeOptions.map((itemType) => (
            <ToggleLabel
              key={itemType}
              checked={form.itemTypes.includes(itemType)}
              onChange={(checked) =>
                setForm({
                  ...form,
                  itemTypes: checked
                    ? [...form.itemTypes, itemType]
                    : form.itemTypes.filter((value) => value !== itemType),
                })
              }
              label={itemType}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <ShoppingBag />}
            適用
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function ScoreDeleteView() {
  const [form, setForm] = useState<ScoreDeleteForm>(emptyScoreDeleteForm)
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      const payload = buildScoreDeletePayload(form)
      if (!confirm('一致する成績を削除しますか？')) {
        return
      }
      setLoading(true)
      const result = await adminApi.deleteScores(payload)
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="成績削除" description="条件に一致する成績記録を削除します。削除した成績は元に戻せません">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <UserSelectorFields
          value={form}
          onChange={(value) => setForm({ ...form, ...value })}
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <Field label="曲ID (任意)" hint="指定するとこの曲の成績だけを削除します">
            <Input
              value={form.songId}
              onChange={(event) => setForm({ ...form, songId: event.target.value })}
              placeholder="例: sayonarahatsukoi"
            />
          </Field>
          <Field label="難易度">
            <DifficultySelect
              value={form.difficulty}
              includeAll
              onChange={(difficulty) => setForm({ ...form, difficulty })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="destructive" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            成績削除
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function PresentCreateView() {
  const [form, setForm] = useState<PresentForm>(emptyPresentForm)
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const payload: PresentPayload = {
        present_id: requireTrimmed(form.presentId, 'present_id'),
        expire_ts: requireTrimmed(form.expireTs, 'expire_ts'),
        description: form.description.trim(),
        item_id: requireTrimmed(form.itemId, 'item_id'),
        item_type: requireTrimmed(form.itemType, 'type'),
        amount: form.amount,
      }
      const result = await adminApi.createPresent(payload)
      setForm(emptyPresentForm)
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="報酬追加" description="報酬 (プレゼント) の定義を作成します。作成しただけでは配布されません — 配布は「報酬配布」から行います">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="報酬ID" hint="この報酬を識別する好きな半角英数字 (例: welcome2026)">
            <Input
              value={form.presentId}
              onChange={(event) => setForm({ ...form, presentId: event.target.value })}
              placeholder="例: welcome2026"
              required
            />
          </Field>
          <Field label="有効期限" hint="この日時を過ぎると受け取れなくなります">
            <Input
              type="datetime-local"
              value={form.expireTs}
              onChange={(event) => setForm({ ...form, expireTs: event.target.value })}
              required
            />
          </Field>
          <Field label="説明文" hint="ゲーム内の受け取り画面に表示されます">
            <Input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="例: ようこそ！"
            />
          </Field>
          <Field label="アイテムID" hint="memory の場合は「memory」、パックならパックID等">
            <Input
              value={form.itemId}
              onChange={(event) => setForm({ ...form, itemId: event.target.value })}
              placeholder="例: memory"
              required
            />
          </Field>
          <Field label="アイテム種別">
            <ItemTypeSelect
              value={form.itemType}
              onChange={(itemType) => setForm({ ...form, itemType })}
              required
            />
          </Field>
          <Field label="数量" hint="memory なら付与する記憶源点の量">
            <Input
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="例: 100"
              required
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Plus />}
            報酬追加
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function PresentDeliverView() {
  const [form, setForm] = useState<PresentDeliverForm>(emptyPresentDeliverForm)
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      const payload: PresentDeliverPayload = {
        ...(form.allUsers ? {} : buildUserSelectorPayload(form)),
        present_id: requireTrimmed(form.presentId, 'present_id'),
        all_users: form.allUsers,
      }
      if (!confirm(`報酬 ${payload.present_id} を配布しますか？`)) {
        return
      }
      setLoading(true)
      const result = await adminApi.deliverPresent(payload)
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="報酬配布" description="作成済みの報酬を指定プレイヤー (または全員) に配布します。プレイヤーはゲーム内の受け取り画面で受領できます">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <ToggleLabel
          checked={form.allUsers}
          onChange={(checked) => setForm({ ...form, allUsers: checked })}
          label="全ユーザー"
        />
        <Field label="報酬ID" hint="「報酬追加」で作成した報酬IDを入力します">
          <Input
            value={form.presentId}
            onChange={(event) => setForm({ ...form, presentId: event.target.value })}
            placeholder="例: welcome2026"
            required
          />
        </Field>
        <UserSelectorFields
          value={form}
          disabled={form.allUsers}
          onChange={(value) => setForm({ ...form, ...value })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <PackagePlus />}
            配布
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function PresentDeleteView() {
  const [presentId, setPresentId] = useState('')
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      const value = requireTrimmed(presentId, 'present_id')
      if (!confirm(`報酬 ${value} を削除しますか？`)) {
        return
      }
      setLoading(true)
      const result = await adminApi.deletePresent(value)
      setPresentId('')
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="報酬削除" description="報酬の定義を削除します">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
        <Field label="報酬ID">
          <Input
            value={presentId}
            onChange={(event) => setPresentId(event.target.value)}
            placeholder="例: welcome2026"
            required
          />
        </Field>
        <Button type="submit" size="sm" variant="destructive" disabled={loading}>
          {loading ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
          報酬削除
        </Button>
      </form>
      <ActionMessage action={action} />
    </ActionCard>
  )
}

function RedeemCreateView() {
  const [form, setForm] = useState<RedeemForm>(emptyRedeemForm)
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const payload: RedeemPayload = {
        code: form.code.trim() || undefined,
        random_amount: parseOptionalPositiveInt(form.randomAmount, 'random_amount'),
        redeem_type: parseRequiredInt(form.redeemType, 'redeem_type'),
        item_id: requireTrimmed(form.itemId, 'item_id'),
        item_type: requireTrimmed(form.itemType, 'type'),
        amount: form.amount,
      }
      const result = await adminApi.createRedeem(payload)
      setForm(emptyRedeemForm)
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="引換コード追加" description="プレイヤーがゲーム内で入力してアイテムを受け取れる引換コードを作成します">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="コード" hint="空欄にするとランダムなコードを自動生成します">
            <Input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder="例: ARCAEA2026 (空欄で自動生成)"
            />
          </Field>
          <Field label="自動生成する個数" hint="コードを空欄にした場合に生成する個数">
            <Input
              value={form.randomAmount}
              onChange={(event) => setForm({ ...form, randomAmount: event.target.value })}
              placeholder="例: 10"
            />
          </Field>
          <Field label="使用制限">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={form.redeemType}
              onChange={(event) => setForm({ ...form, redeemType: event.target.value })}
            >
              <option value="0">全体で1回 (先着1名のみ)</option>
              <option value="1">ユーザーごとに1回</option>
            </select>
          </Field>
          <Field label="アイテムID" hint="memory の場合は「memory」、パックならパックID等">
            <Input
              value={form.itemId}
              onChange={(event) => setForm({ ...form, itemId: event.target.value })}
              placeholder="例: memory"
              required
            />
          </Field>
          <Field label="アイテム種別">
            <ItemTypeSelect
              value={form.itemType}
              onChange={(itemType) => setForm({ ...form, itemType })}
              required
            />
          </Field>
          <Field label="数量">
            <Input
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="例: 100"
              required
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Plus />}
            引換コード追加
          </Button>
          <ActionMessage action={action} />
        </div>
      </form>
    </ActionCard>
  )
}

function RedeemDeleteView() {
  const [code, setCode] = useState('')
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      const value = requireTrimmed(code, 'code')
      if (!confirm(`引換コード ${value} を削除しますか？`)) {
        return
      }
      setLoading(true)
      const result = await adminApi.deleteRedeem(value)
      setCode('')
      setAction({ kind: 'success', message: formatActionResult(result) })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="引換コード削除" description="引換コードを削除します。削除後はそのコードは使用できなくなります">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
        <Field label="引換コード">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="例: ARCAEA2026"
            required
          />
        </Field>
        <Button type="submit" size="sm" variant="destructive" disabled={loading}>
          {loading ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
          削除
        </Button>
      </form>
      <ActionMessage action={action} />
    </ActionCard>
  )
}

function RedeemUsersView() {
  const [code, setCode] = useState('')
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [action, setAction] = useState<ActionState>(emptyAction)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setAction(emptyAction)
    try {
      const result = await adminApi.redeemUsers(requireTrimmed(code, 'code'))
      setUsers(result.users)
      setAction({
        kind: 'success',
        message: `${result.code} · ${result.users.length} 人のユーザー`,
      })
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ActionCard title="引換コード使用者" description="指定した引換コードを誰が使用したかを確認します">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
        <Field label="引換コード">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="例: ARCAEA2026"
            required
          />
        </Field>
        <Button type="submit" size="sm" variant="outline" disabled={loading}>
          {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
          検索
        </Button>
      </form>
      <ActionMessage action={action} />
      {users.length > 0 && (
        <div className="max-h-64 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>User Code</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell className="font-mono">{user.userId}</TableCell>
                  <TableCell>{user.name || '-'}</TableCell>
                  <TableCell>{user.userCode || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ActionCard>
  )
}

function DifficultySelect({
  value,
  onChange,
  includeAll = false,
}: {
  value: string
  onChange: (value: string) => void
  includeAll?: boolean
}) {
  return (
    <select
      className="h-9 rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {includeAll && <option value="-1">すべての難易度</option>}
      <option value="0">PST</option>
      <option value="1">PRS</option>
      <option value="2">FTR</option>
      <option value="3">BYD</option>
      <option value="4">ETR</option>
    </select>
  )
}

function SongsView({
  isAdmin,
  canEditConstants,
}: {
  isAdmin: boolean
  canEditConstants: boolean
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<SongRow[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [createForm, setCreateForm] = useState<SongPayload>(emptySongForm)
  const [editForm, setEditForm] = useState<SongPayload>(emptySongForm)
  const [editingSid, setEditingSid] = useState('')
  const [action, setAction] = useState<ActionState>(emptyAction)
  const pagination = useServerPagination(rows, defaultTablePageSize)
  const { setMeta } = pagination

  function load(showLoading = true, page = pagination.page, pageSize = pagination.pageSize) {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .songs({ q: query, page, pageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }

  function search() {
    load(true, 1, pagination.pageSize)
  }

  function edit(row: SongRow) {
    setEditingSid(row.songId)
    setAction(emptyAction)
    setEditForm({
      sid: row.songId,
      name_en: row.nameEn,
      rating_pst: row.ratingPst,
      rating_prs: row.ratingPrs,
      rating_ftr: row.ratingFtr,
      rating_byd: row.ratingByd,
      rating_etr: row.ratingEtr,
    })
  }

  function resetEdit(clearAction = true) {
    setEditingSid('')
    setEditForm(emptySongForm)
    if (clearAction) {
      setAction(emptyAction)
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      await adminApi.createSong(createForm)
      setCreateForm(emptySongForm)
      setAction({ kind: 'success', message: '楽曲を追加しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingSid) {
      return
    }
    setAction(emptyAction)
    try {
      if (isAdmin) {
        await adminApi.updateSong(editingSid, editForm)
      } else {
        await adminApi.updateChartConstants(editingSid, editForm)
      }
      resetEdit(false)
      setAction({ kind: 'success', message: '楽曲を更新しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function remove(row: SongRow) {
    if (!confirm(`楽曲 ${row.songId} を削除しますか？`)) {
      return
    }
    setAction(emptyAction)
    try {
      await adminApi.deleteSong(row.songId)
      setAction({ kind: 'success', message: '楽曲を削除しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  useEffect(() => {
    adminApi
      .songs({ page: 1, pageSize: defaultTablePageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [setMeta])

  return (
    <DataPanel
      title="楽曲表"
      description="曲名と譜面定数"
      state={state}
      onSearch={search}
      searchValue={query}
      onSearchChange={setQuery}
    >
      {isAdmin && (
        <form className="mb-5 grid gap-3 rounded-md border p-3" onSubmit={submitCreate}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">楽曲を追加</div>
          </div>
          <div className="grid gap-3 lg:grid-cols-8">
            <Input
              value={createForm.sid}
              onChange={(event) => setCreateForm({ ...createForm, sid: event.target.value })}
              placeholder="song_id"
              required
            />
            <Input
              className="lg:col-span-2"
              value={createForm.name_en}
              onChange={(event) => setCreateForm({ ...createForm, name_en: event.target.value })}
              placeholder="name_en"
              required
            />
            {(['rating_pst', 'rating_prs', 'rating_ftr', 'rating_byd', 'rating_etr'] as const).map((field) => (
              <Input
                key={field}
                value={createForm[field]}
                onChange={(event) => setCreateForm({ ...createForm, [field]: event.target.value })}
                placeholder={field.replace('rating_', '').toUpperCase()}
                required
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">
              <Plus />
              楽曲を追加
            </Button>
          </div>
        </form>
      )}
      {canEditConstants && (
        <ActionMessage action={action} className="mb-3 block" />
      )}
      <TableBlock
        pagination={pagination}
        onPageChange={(page) => load(true, page, pagination.pageSize)}
        onPageSizeChange={(pageSize) => load(true, 1, pageSize)}
        emptyText="楽曲データがありません"
        renderTable={(visibleRows) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Song ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>PST</TableHead>
                <TableHead>PRS</TableHead>
                <TableHead>FTR</TableHead>
                <TableHead>BYD</TableHead>
                <TableHead>ETR</TableHead>
                {canEditConstants && (
                  <TableHead className="w-0 text-right">操作</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <Fragment key={row.songId}>
                  {canEditConstants && editingSid === row.songId && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={8} className="p-3">
                        <form className="grid gap-3 rounded-md border bg-background p-3" onSubmit={submitEdit}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">編集: 楽曲 {editingSid}</div>
                            <Button type="button" size="sm" variant="ghost" onClick={() => resetEdit()}>
                              <X />
                              キャンセル
                            </Button>
                          </div>
                          <div className="grid gap-3 lg:grid-cols-8">
                            <Input value={editForm.sid} disabled placeholder="song_id" />
                            <Input
                              className="lg:col-span-2"
                              value={editForm.name_en}
                              onChange={(event) => setEditForm({ ...editForm, name_en: event.target.value })}
                              placeholder="name_en"
                              disabled={!isAdmin}
                              required
                            />
                            {(['rating_pst', 'rating_prs', 'rating_ftr', 'rating_byd', 'rating_etr'] as const).map((field) => (
                              <Input
                                key={field}
                                value={editForm[field]}
                                onChange={(event) => setEditForm({ ...editForm, [field]: event.target.value })}
                                placeholder={field.replace('rating_', '').toUpperCase()}
                                required
                              />
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="submit" size="sm">
                              <Pencil />
                              変更を保存
                            </Button>
                          </div>
                        </form>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow data-state={editingSid === row.songId ? 'selected' : undefined}>
                    <TableCell className="font-mono">{row.songId}</TableCell>
                    <TableCell className="font-medium">{row.nameEn || '-'}</TableCell>
                    <TableCell>{row.ratingPst}</TableCell>
                    <TableCell>{row.ratingPrs}</TableCell>
                    <TableCell>{row.ratingFtr}</TableCell>
                    <TableCell>{row.ratingByd}</TableCell>
                    <TableCell>{row.ratingEtr}</TableCell>
                    {canEditConstants && (
                      <TableCell className="w-0 whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => edit(row)}>
                            <Pencil />
                            編集
                          </Button>
                          {isAdmin && (
                            <Button type="button" size="sm" variant="destructive" onClick={() => remove(row)}>
                              <Trash2 />
                              削除
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      />
    </DataPanel>
  )
}

function ItemsView({ isAdmin }: { isAdmin: boolean }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<ItemRow[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [createForm, setCreateForm] = useState<ItemPayload>(emptyItemForm)
  const [editForm, setEditForm] = useState<ItemPayload>(emptyItemForm)
  const [editingKey, setEditingKey] = useState('')
  const [action, setAction] = useState<ActionState>(emptyAction)
  const pagination = useServerPagination(rows, defaultTablePageSize)
  const { setMeta } = pagination

  function load(showLoading = true, page = pagination.page, pageSize = pagination.pageSize) {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .items({ q: query, page, pageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }

  function search() {
    load(true, 1, pagination.pageSize)
  }

  function edit(row: ItemRow) {
    setEditingKey(`${row.itemId}:${row.itemType}`)
    setAction(emptyAction)
    setEditForm({
      item_id: row.itemId,
      item_type: row.itemType,
      is_available: row.isAvailable,
    })
  }

  function resetEdit(clearAction = true) {
    setEditingKey('')
    setEditForm(emptyItemForm)
    if (clearAction) {
      setAction(emptyAction)
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      await adminApi.createItem(createForm)
      setCreateForm(emptyItemForm)
      setAction({ kind: 'success', message: 'アイテムを追加しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingKey) {
      return
    }
    setAction(emptyAction)
    try {
      await adminApi.updateItem(editForm)
      resetEdit(false)
      setAction({ kind: 'success', message: 'アイテムを更新しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function remove(row: ItemRow) {
    if (!confirm(`アイテム ${row.itemId}:${row.itemType} を削除しますか？`)) {
      return
    }
    setAction(emptyAction)
    try {
      await adminApi.deleteItem(row.itemId, row.itemType)
      setAction({ kind: 'success', message: 'アイテムを削除しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  useEffect(() => {
    adminApi
      .items({ page: 1, pageSize: defaultTablePageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [setMeta])

  return (
    <DataPanel
      title="アイテム表"
      description="アイテム種別と有効状態"
      state={state}
      onSearch={search}
      searchValue={query}
      onSearchChange={setQuery}
    >
      {isAdmin && (
        <form className="mb-5 grid gap-3 rounded-md border p-3" onSubmit={submitCreate}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">アイテムを追加</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
            <Input
              value={createForm.item_id}
              onChange={(event) => setCreateForm({ ...createForm, item_id: event.target.value })}
              placeholder="item_id"
              required
            />
            <Input
              value={createForm.item_type}
              onChange={(event) => setCreateForm({ ...createForm, item_type: event.target.value })}
              placeholder="type"
              required
            />
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={createForm.is_available ?? 0}
              onChange={(event) =>
                setCreateForm({ ...createForm, is_available: Number(event.target.value) })
              }
            >
              <option value={1}>有効</option>
              <option value={0}>無効</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">
              <Plus />
              アイテムを追加
            </Button>
          </div>
        </form>
      )}
      {isAdmin && <ActionMessage action={action} className="mb-3 block" />}
      <TableBlock
        pagination={pagination}
        onPageChange={(page) => load(true, page, pagination.pageSize)}
        onPageSizeChange={(pageSize) => load(true, 1, pageSize)}
        emptyText="アイテムデータがありません"
        renderTable={(visibleRows) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>有効</TableHead>
                {isAdmin && <TableHead className="w-0 text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const key = `${row.itemId}:${row.itemType}`
                return (
                  <Fragment key={key}>
                    {isAdmin && editingKey === key && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={4} className="p-3">
                          <form className="grid gap-3 rounded-md border bg-background p-3" onSubmit={submitEdit}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">編集: アイテム {editingKey}</div>
                              <Button type="button" size="sm" variant="ghost" onClick={() => resetEdit()}>
                                <X />
                                キャンセル
                              </Button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
                              <Input value={editForm.item_id} disabled placeholder="item_id" />
                              <Input value={editForm.item_type} disabled placeholder="type" />
                              <select
                                className="h-9 rounded-md border bg-background px-3 text-sm"
                                value={editForm.is_available ?? 0}
                                onChange={(event) =>
                                  setEditForm({ ...editForm, is_available: Number(event.target.value) })
                                }
                              >
                                <option value={1}>有効</option>
                                <option value={0}>無効</option>
                              </select>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button type="submit" size="sm">
                                <Pencil />
                                変更を保存
                              </Button>
                            </div>
                          </form>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow data-state={editingKey === key ? 'selected' : undefined}>
                      <TableCell className="font-mono">{row.itemId}</TableCell>
                      <TableCell>{row.itemType}</TableCell>
                      <TableCell>
                        <Badge variant={row.isAvailable ? 'secondary' : 'outline'}>
                          {row.isAvailable ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="w-0 whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => edit(row)}>
                              <Pencil />
                              編集
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => remove(row)}>
                              <Trash2 />
                              削除
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        )}
      />
    </DataPanel>
  )
}

function PurchasesView({ isAdmin }: { isAdmin: boolean }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<PurchaseRow[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [createForm, setCreateForm] = useState<PurchasePayload>(emptyPurchaseForm)
  const [editForm, setEditForm] = useState<PurchasePayload>(emptyPurchaseForm)
  const [editingPurchase, setEditingPurchase] = useState('')
  const [action, setAction] = useState<ActionState>(emptyAction)
  const pagination = useServerPagination(rows, defaultTablePageSize)
  const { setMeta } = pagination

  function load(showLoading = true, page = pagination.page, pageSize = pagination.pageSize) {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .purchases({ pq: query, page, pageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }

  function search() {
    load(true, 1, pagination.pageSize)
  }

  function editPurchase(row: PurchaseRow) {
    setEditingPurchase(row.purchaseName)
    setAction(emptyAction)
    setEditForm({
      purchase_name: row.purchaseName,
      price: row.price,
      orig_price: row.origPrice,
      discount_from: row.discountFrom,
      discount_to: row.discountTo,
      discount_reason: row.discountReason,
    })
  }

  function resetEdit(clearAction = true) {
    setEditingPurchase('')
    setEditForm(emptyPurchaseForm)
    if (clearAction) {
      setAction(emptyAction)
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      await adminApi.createPurchase(createForm)
      setCreateForm(emptyPurchaseForm)
      setAction({ kind: 'success', message: '購入項目を追加しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingPurchase) {
      return
    }
    setAction(emptyAction)
    try {
      await adminApi.updatePurchase(editingPurchase, editForm)
      resetEdit(false)
      setAction({ kind: 'success', message: '購入項目を更新しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function removePurchase(row: PurchaseRow) {
    if (!confirm(`購入項目 ${row.purchaseName} を削除しますか？`)) {
      return
    }
    setAction(emptyAction)
    try {
      await adminApi.deletePurchase(row.purchaseName)
      setAction({ kind: 'success', message: '購入項目を削除しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  useEffect(() => {
    adminApi
      .purchases({ page: 1, pageSize: defaultTablePageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [setMeta])

  return (
    <DataPanel
      title="購入設定"
      description="購入項目・価格・割引の設定"
      state={state}
      onSearch={search}
      searchValue={query}
      onSearchChange={setQuery}
    >
      <div className="grid gap-5">
        {isAdmin && (
          <form className="grid gap-3 rounded-md border p-3" onSubmit={submitCreate}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">購入項目を追加</div>
            </div>
            <div className="grid gap-3 xl:grid-cols-6">
              <Input
                value={createForm.purchase_name}
                onChange={(event) =>
                  setCreateForm({ ...createForm, purchase_name: event.target.value })
                }
                placeholder="purchase_name"
                required
              />
              <Input
                value={createForm.price}
                onChange={(event) =>
                  setCreateForm({ ...createForm, price: event.target.value })
                }
                placeholder="price"
              />
              <Input
                value={createForm.orig_price}
                onChange={(event) =>
                  setCreateForm({ ...createForm, orig_price: event.target.value })
                }
                placeholder="orig_price"
              />
              <Input
                type="datetime-local"
                value={createForm.discount_from}
                onChange={(event) =>
                  setCreateForm({ ...createForm, discount_from: event.target.value })
                }
              />
              <Input
                type="datetime-local"
                value={createForm.discount_to}
                onChange={(event) =>
                  setCreateForm({ ...createForm, discount_to: event.target.value })
                }
              />
              <Input
                value={createForm.discount_reason}
                onChange={(event) =>
                  setCreateForm({ ...createForm, discount_reason: event.target.value })
                }
                placeholder="discount_reason"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm">
                <Plus />
                購入項目を追加
              </Button>
            </div>
          </form>
        )}
        {isAdmin && <ActionMessage action={action} />}

        <TableBlock
          pagination={pagination}
          onPageChange={(page) => load(true, page, pagination.pageSize)}
          onPageSizeChange={(pageSize) => load(true, 1, pageSize)}
          emptyText="購入項目データがありません"
          renderTable={(visibleRows) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Orig</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Items</TableHead>
                  {isAdmin && <TableHead className="w-0 text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <Fragment key={row.purchaseName}>
                    {isAdmin && editingPurchase === row.purchaseName && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={6} className="p-3">
                          <form className="grid gap-3 rounded-md border bg-background p-3" onSubmit={submitEdit}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">編集: 購入項目 {editingPurchase}</div>
                              <Button type="button" size="sm" variant="ghost" onClick={() => resetEdit()}>
                                <X />
                                キャンセル
                              </Button>
                            </div>
                            <div className="grid gap-3 xl:grid-cols-6">
                              <Input value={editForm.purchase_name} disabled placeholder="purchase_name" />
                              <Input
                                value={editForm.price}
                                onChange={(event) => setEditForm({ ...editForm, price: event.target.value })}
                                placeholder="price"
                              />
                              <Input
                                value={editForm.orig_price}
                                onChange={(event) => setEditForm({ ...editForm, orig_price: event.target.value })}
                                placeholder="orig_price"
                              />
                              <Input
                                type="datetime-local"
                                value={editForm.discount_from}
                                onChange={(event) => setEditForm({ ...editForm, discount_from: event.target.value })}
                              />
                              <Input
                                type="datetime-local"
                                value={editForm.discount_to}
                                onChange={(event) => setEditForm({ ...editForm, discount_to: event.target.value })}
                              />
                              <Input
                                value={editForm.discount_reason}
                                onChange={(event) => setEditForm({ ...editForm, discount_reason: event.target.value })}
                                placeholder="discount_reason"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button type="submit" size="sm">
                                <Pencil />
                                変更を保存
                              </Button>
                            </div>
                          </form>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow data-state={editingPurchase === row.purchaseName ? 'selected' : undefined}>
                      <TableCell className="font-mono">{row.purchaseName}</TableCell>
                      <TableCell>{row.price || '-'}</TableCell>
                      <TableCell>{row.origPrice || '-'}</TableCell>
                      <TableCell className="min-w-52">
                        {row.discountFrom || '-'} / {row.discountTo || '-'}
                      </TableCell>
                      <TableCell className="max-w-xl truncate" title={row.itemSummary}>
                        {row.itemSummary}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="w-0 whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => editPurchase(row)}>
                              <Pencil />
                              編集
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => removePurchase(row)}>
                              <Trash2 />
                              削除
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        />
      </div>
    </DataPanel>
  )
}

function PurchaseItemsView() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<PurchaseItemRow[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [createForm, setCreateForm] =
    useState<PurchaseItemPayload>(emptyPurchaseItemForm)
  const [editForm, setEditForm] =
    useState<PurchaseItemPayload>(emptyPurchaseItemForm)
  const [editingPurchaseItem, setEditingPurchaseItem] = useState('')
  const [action, setAction] = useState<ActionState>(emptyAction)
  const pagination = useServerPagination(rows, defaultTablePageSize)
  const { setMeta } = pagination

  function load(showLoading = true, page = pagination.page, pageSize = pagination.pageSize) {
    if (showLoading) {
      setState('loading')
    }
    adminApi
      .purchaseItems({ iq: query, page, pageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }

  function search() {
    load(true, 1, pagination.pageSize)
  }

  function editPurchaseItem(row: PurchaseItemRow) {
    setEditingPurchaseItem(`${row.purchaseName}:${row.itemId}:${row.itemType}`)
    setAction(emptyAction)
    setEditForm({
      purchase_name: row.purchaseName,
      item_id: row.itemId,
      item_type: row.itemType,
      amount: row.amount,
    })
  }

  function resetEdit(clearAction = true) {
    setEditingPurchaseItem('')
    setEditForm(emptyPurchaseItemForm)
    if (clearAction) {
      setAction(emptyAction)
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    setAction(emptyAction)
    try {
      await adminApi.createPurchaseItem(createForm)
      setCreateForm(emptyPurchaseItemForm)
      setAction({ kind: 'success', message: '購入アイテムを追加しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault()
    if (!editingPurchaseItem) {
      return
    }
    setAction(emptyAction)
    try {
      await adminApi.updatePurchaseItem(editForm)
      resetEdit(false)
      setAction({ kind: 'success', message: '購入アイテムを更新しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  async function removePurchaseItem(row: PurchaseItemRow) {
    if (!confirm(`購入アイテム ${row.purchaseName}:${row.itemId}:${row.itemType} を削除しますか？`)) {
      return
    }
    setAction(emptyAction)
    try {
      await adminApi.deletePurchaseItem(row.purchaseName, row.itemId, row.itemType)
      setAction({ kind: 'success', message: '購入アイテムを削除しました' })
      load(false)
    } catch (error) {
      setAction({ kind: 'error', message: errorMessage(error) })
    }
  }

  useEffect(() => {
    adminApi
      .purchaseItems({ page: 1, pageSize: defaultTablePageSize })
      .then((value) => {
        setRows(value.rows)
        setMeta(value)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [setMeta])

  return (
    <DataPanel
      title="購入アイテム"
      description="購入項目とアイテムの関連付け"
      state={state}
      onSearch={search}
      searchValue={query}
      onSearchChange={setQuery}
    >
      <div className="grid gap-5">
        <form className="grid gap-3 rounded-md border p-3" onSubmit={submitCreate}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">購入アイテムを追加</div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_120px]">
            <Input
              value={createForm.purchase_name}
              onChange={(event) =>
                setCreateForm({
                  ...createForm,
                  purchase_name: event.target.value,
                })
              }
              placeholder="purchase_name"
              required
            />
            <Input
              value={createForm.item_id}
              onChange={(event) =>
                setCreateForm({ ...createForm, item_id: event.target.value })
              }
              placeholder="item_id"
              required
            />
            <Input
              value={createForm.item_type}
              onChange={(event) =>
                setCreateForm({ ...createForm, item_type: event.target.value })
              }
              placeholder="type"
              required
            />
            <Input
              value={createForm.amount}
              onChange={(event) =>
                setCreateForm({ ...createForm, amount: event.target.value })
              }
              placeholder="amount"
              required
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">
              <PackagePlus />
              購入アイテムを追加
            </Button>
          </div>
        </form>
        <ActionMessage action={action} />

        <TableBlock
          pagination={pagination}
          onPageChange={(page) => load(true, page, pagination.pageSize)}
          onPageSizeChange={(pageSize) => load(true, 1, pageSize)}
          emptyText="購入アイテムデータがありません"
          renderTable={(visibleRows) => (
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="w-0 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const key = `${row.purchaseName}:${row.itemId}:${row.itemType}`
                return (
                  <Fragment key={key}>
                    {editingPurchaseItem === key && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={5} className="p-3">
                          <form className="grid gap-3 rounded-md border bg-background p-3" onSubmit={submitEdit}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">編集: 購入アイテム {editingPurchaseItem}</div>
                              <Button type="button" size="sm" variant="ghost" onClick={() => resetEdit()}>
                                <X />
                                キャンセル
                              </Button>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_120px]">
                              <Input value={editForm.purchase_name} disabled placeholder="purchase_name" />
                              <Input value={editForm.item_id} disabled placeholder="item_id" />
                              <Input value={editForm.item_type} disabled placeholder="type" />
                              <Input
                                value={editForm.amount}
                                onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })}
                                placeholder="amount"
                                required
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button type="submit" size="sm">
                                <Pencil />
                                変更を保存
                              </Button>
                            </div>
                          </form>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow data-state={editingPurchaseItem === key ? 'selected' : undefined}>
                      <TableCell className="font-mono">{row.purchaseName}</TableCell>
                      <TableCell>{row.itemId}</TableCell>
                      <TableCell>{row.itemType}</TableCell>
                      <TableCell>{row.amount}</TableCell>
                      <TableCell className="w-0 whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => editPurchaseItem(row)}>
                            <Pencil />
                            編集
                          </Button>
                          <Button type="button" size="sm" variant="destructive" onClick={() => removePurchaseItem(row)}>
                            <Trash2 />
                            削除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
          )}
        />
      </div>
    </DataPanel>
  )
}

function DataPanel({
  title,
  description,
  state,
  searchValue,
  onSearchChange,
  onSearch,
  extraControl,
  children,
}: {
  title: string
  description: string
  state: LoadState
  searchValue: string
  onSearchChange: (value: string) => void
  onSearch: () => void
  extraControl?: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-full pl-9 sm:w-72"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onSearch()
                  }
                }}
                placeholder="検索"
              />
            </div>
            {extraControl}
            <Button type="button" variant="outline" onClick={onSearch}>
              {state === 'loading' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCcw />
              )}
              更新
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {state === 'error' ? (
          <LoadPanel state={state} onRetry={onSearch} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

type PaginationState<T> = {
  page: number
  pageCount: number
  pageSize: number
  rows: T[]
  total: number
  start: number
  end: number
  canPrevious: boolean
  canNext: boolean
  setMeta: (data: PageData<T>) => void
}

function useServerPagination<T>(rows: T[], initialPageSize = 25): PaginationState<T> {
  const [page, setPageState] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialPageSize)
  const [total, setTotal] = useState(0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min((page - 1) * pageSize + rows.length, total)

  const setMeta = useCallback((data: PageData<T>) => {
    setPageState(data.page)
    setPageSizeState(data.pageSize)
    setTotal(data.total)
  }, [])

  return {
    page,
    pageCount,
    pageSize,
    rows,
    total,
    start,
    end,
    canPrevious: page > 1,
    canNext: page < pageCount,
    setMeta,
  }
}

function TableBlock<T>({
  pagination,
  onPageChange,
  onPageSizeChange,
  emptyText,
  renderTable,
}: {
  pagination: PaginationState<T>
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  emptyText: string
  renderTable: (rows: T[]) => ReactNode
}) {
  if (pagination.total === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {renderTable(pagination.rows)}
      <PaginationControls
        pagination={pagination}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  )
}

function UserSelectorFields({
  value,
  onChange,
  disabled = false,
}: {
  value: UserSelectorForm
  onChange: (value: Partial<UserSelectorForm>) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <div className="grid gap-3 lg:grid-cols-3">
        <Field label="ユーザーID (数字)">
          <Input
            value={value.userId}
            disabled={disabled}
            onChange={(event) => onChange({ userId: event.target.value })}
            placeholder="例: 2000001"
          />
        </Field>
        <Field label="プレイヤー名">
          <Input
            value={value.name}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="例: player1"
          />
        </Field>
        <Field label="フレンドコード (9桁)">
          <Input
            value={value.userCode}
            disabled={disabled}
            onChange={(event) => onChange({ userCode: event.target.value })}
            placeholder="例: 123456789"
          />
        </Field>
      </div>
      {!disabled && (
        <span className="text-xs text-muted-foreground">
          いずれか1つを入力すれば対象プレイヤーを特定できます
        </span>
      )}
    </div>
  )
}

/** All item `type` values present in the item table, with plain-language labels. */
const itemTypeOptions: Array<{ value: string; label: string }> = [
  { value: 'memory', label: 'memory (記憶源点 = ゲーム内通貨)' },
  { value: 'fragment', label: 'fragment (フラグメント)' },
  { value: 'character', label: 'character (キャラクター)' },
  { value: 'core', label: 'core (コア)' },
  { value: 'pack', label: 'pack (楽曲パック)' },
  { value: 'single', label: 'single (単曲)' },
  { value: 'world_song', label: 'world_song (World解禁曲)' },
  { value: 'world_unlock', label: 'world_unlock (World解禁要素)' },
  { value: 'course_banner', label: 'course_banner (コースバナー)' },
  { value: 'online_banner', label: 'online_banner (オンラインバナー)' },
  { value: 'pick_ticket', label: 'pick_ticket (ピックチケット)' },
  { value: 'anni5tix', label: 'anni5tix (5周年チケット)' },
]

function ItemTypeSelect({
  value,
  onChange,
  required = false,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <select
      className="h-9 rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
    >
      <option value="">アイテム種別を選択...</option>
      {itemTypeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/** Labeled form field: novice-friendly replacement for placeholder-only inputs. */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="grid content-start gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

/** Informational callout shown at the top of a view to explain what it does. */
function HelpBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-sky-600/30 bg-sky-500/10 px-3 py-2.5 text-sm leading-relaxed">
      <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
      <div className="grid gap-1 [&_b]:font-semibold">{children}</div>
    </div>
  )
}

function ToggleLabel({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
      <input
        className="size-4 accent-primary"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

function ScoreSection({
  title,
  scores,
}: {
  title: string
  scores: AdminScoreRow[]
}) {
  const totalRating = scores.reduce((sum, score) => sum + score.rating, 0)

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="font-mono text-xs text-muted-foreground">
          {scores.length} · {totalRating.toFixed(4)}
        </div>
      </div>
      <ScoreResultsTable scores={scores} />
    </div>
  )
}

function ScoreResultsTable({
  scores,
  showUser = false,
}: {
  scores: AdminScoreRow[]
  showUser?: boolean
}) {
  if (scores.length === 0) {
    return (
      <div className="flex h-full min-h-28 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        成績なし
      </div>
    )
  }

  return (
    <div className="min-h-0 overflow-x-hidden overflow-y-auto rounded-md border">
      <Table
        className={cn(
          'table-fixed leading-tight',
          showUser ? 'min-w-[820px] text-[11px]' : 'w-full text-xs',
        )}
      >
        <colgroup>
          {showUser && <col className="w-[14%]" />}
          <col className={showUser ? 'w-[19%]' : 'w-[24%]'} />
          <col className={showUser ? 'w-[7%]' : 'w-[8%]'} />
          <col className={showUser ? 'w-[12%]' : 'w-[15%]'} />
          <col className={showUser ? 'w-[14%]' : 'w-[18%]'} />
          <col className={showUser ? 'w-[7%]' : 'w-[8%]'} />
          <col className={showUser ? 'w-[10%]' : 'w-[13%]'} />
          <col className={showUser ? 'w-[17%]' : 'w-[14%]'} />
        </colgroup>
        <TableHeader>
          <TableRow>
            {showUser && <TableHead className="px-1.5">User</TableHead>}
            <TableHead className="px-1.5">Song</TableHead>
            <TableHead className="px-1.5">Diff</TableHead>
            <TableHead className="px-1.5">Score</TableHead>
            <TableHead className="px-1.5">BP/LP/F/L</TableHead>
            <TableHead className="px-1.5">Clear</TableHead>
            <TableHead className="px-1.5">Rating</TableHead>
            <TableHead className="px-1.5">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((score) => (
            <TableRow
              key={`${score.userId}:${score.songId}:${score.difficulty}:${score.timePlayed}`}
            >
              {showUser && (
                <TableCell className="px-1.5 py-2">
                  <div className="font-medium">{score.name || '-'}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {score.userId}
                  </div>
              </TableCell>
              )}
              <TableCell className="min-w-0 px-1.5 py-2 font-mono">
                <span className="score-song-id" title={score.songId}>
                  {score.songId}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap px-1.5 py-2">
                {difficultyLabel(score.difficulty)}
              </TableCell>
              <TableCell className="whitespace-nowrap px-1.5 py-2 font-mono">
                {score.score.toLocaleString()}
              </TableCell>
              <TableCell className="whitespace-nowrap px-1.5 py-2 font-mono">
                {score.shinyPerfectCount}/
                {Math.max(score.perfectCount - score.shinyPerfectCount, 0)}/
                {score.nearCount}/{score.missCount}
              </TableCell>
              <TableCell className="whitespace-nowrap px-1.5 py-2">
                {score.clearType}/{score.bestClearType}
              </TableCell>
              <TableCell className="whitespace-nowrap px-1.5 py-2 font-mono">
                {score.rating.toFixed(4)}
              </TableCell>
              <TableCell className="break-all px-1.5 py-2 font-mono">
                {score.timePlayed}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function PaginationControls<T>({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: PaginationState<T>
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  return (
    <div className="flex flex-col gap-3 border-t pt-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <div>
        表示 {pagination.start}-{pagination.end} / {pagination.total}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
          value={pagination.pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} / ページ
            </option>
          ))}
        </select>
        <div className="text-foreground">
          {pagination.page} / {pagination.pageCount} ページ
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!pagination.canPrevious}
            onClick={() => onPageChange(1)}
            title="最初のページ"
          >
            <ChevronsLeft />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!pagination.canPrevious}
            onClick={() => onPageChange(pagination.page - 1)}
            title="前のページ"
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!pagination.canNext}
            onClick={() => onPageChange(pagination.page + 1)}
            title="次のページ"
          >
            <ChevronRight />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!pagination.canNext}
            onClick={() => onPageChange(pagination.pageCount)}
            title="最後のページ"
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}

function LoadPanel({
  state,
  onRetry,
}: {
  state: LoadState
  onRetry: () => void
}) {
  if (state === 'error') {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-md border border-dashed text-sm text-muted-foreground">
        データの読み込みに失敗しました
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          再試行
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-44 items-center justify-center rounded-md border border-dashed text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin" />
    </div>
  )
}

function ActionMessage({
  action,
  className,
}: {
  action: ActionState
  className?: string
}) {
  if (action.kind === 'idle') {
    return null
  }

  return (
    <span
      className={cn(
        'text-sm',
        action.kind === 'success' ? 'text-emerald-700' : 'text-destructive',
        className,
      )}
    >
      {action.message}
    </span>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作に失敗しました'
}

function buildUserSelectorPayload(form: UserSelectorForm): UserSelectorPayload {
  const payload: UserSelectorPayload = {}
  const userId = form.userId.trim()
  if (userId) {
    payload.user_id = parseRequiredInt(userId, 'user_id')
  }
  const name = form.name.trim()
  if (name) {
    payload.name = name
  }
  const userCode = form.userCode.trim()
  if (userCode) {
    payload.user_code = userCode
  }
  if (!payload.user_id && !payload.name && !payload.user_code) {
    throw new Error('user_id、name、user_code のいずれかが必要です')
  }
  return payload
}

function requireTrimmed(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} を入力してください`)
  }
  return trimmed
}

function buildScoreDeletePayload(form: ScoreDeleteForm): ScoreDeletePayload {
  const payload: ScoreDeletePayload = {}
  const selector = buildUserSelectorPayloadAllowEmpty(form)
  Object.assign(payload, selector)
  const songId = form.songId.trim()
  if (songId) {
    payload.song_id = songId
  }
  if (form.difficulty !== '-1') {
    payload.difficulty = parseDifficulty(form.difficulty, -1)
  }
  if (!payload.user_id && !payload.name && !payload.user_code && !payload.song_id && payload.difficulty === undefined) {
    throw new Error('削除条件を1つ以上指定してください')
  }
  return payload
}

function buildUserSelectorPayloadAllowEmpty(
  form: UserSelectorForm,
): UserSelectorPayload {
  const payload: UserSelectorPayload = {}
  const userId = form.userId.trim()
  if (userId) {
    payload.user_id = parseRequiredInt(userId, 'user_id')
  }
  const name = form.name.trim()
  if (name) {
    payload.name = name
  }
  const userCode = form.userCode.trim()
  if (userCode) {
    payload.user_code = userCode
  }
  return payload
}

function parseRequiredInt(value: string, label: string) {
  const parsed = Number.parseInt(value.trim(), 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} は整数で入力してください`)
  }
  return parsed
}

function parseUserTicketInput(value: string, currentTicket?: number) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('ticket を入力してください')
  }
  if (trimmed.startsWith('+')) {
    if (currentTicket === undefined) {
      throw new Error('+増分を使うには先にプレイヤーを選択してください')
    }
    const deltaText = trimmed.slice(1).trim()
    if (!/^\d+$/.test(deltaText)) {
      throw new Error('ticket の増分は整数で入力してください')
    }
    return currentTicket + Number.parseInt(deltaText, 10)
  }
  return parseRequiredInt(trimmed, 'ticket')
}

function previewUserTicketInput(value: string, currentTicket?: number) {
  if (currentTicket === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed.startsWith('+')) {
    return undefined
  }
  const deltaText = trimmed.slice(1).trim()
  if (!/^\d+$/.test(deltaText)) {
    return undefined
  }
  return currentTicket + Number.parseInt(deltaText, 10)
}

function parseOptionalPositiveInt(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const parsed = parseRequiredInt(trimmed, label)
  if (parsed <= 0) {
    throw new Error(`${label} は0より大きい値にしてください`)
  }
  return parsed
}

function parseDifficulty(value: string, fallback: number) {
  const parsed = Number.parseInt(value.trim(), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(4, Math.max(0, parsed))
}

function difficultyLabel(difficulty: number) {
  return ['PST', 'PRS', 'FTR', 'BYD', 'ETR'][difficulty] ?? String(difficulty)
}

function formatActionResult(result: AdminActionResult) {
  return `${result.message} · ${result.affectedRows} 行`
}

function isMaintenanceView(view: View): view is MaintenanceView {
  return view in maintenanceOperations
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: number
  sub: string
  icon: typeof Activity
}) {
  const formatted = useMemo(() => value.toLocaleString(), [value])

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{formatted}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

function viewTitle(view: View) {
  if (isMaintenanceView(view)) {
    return maintenanceOperations[view].title
  }

  switch (view) {
    case 'dashboard':
      return 'ダッシュボード'
    case 'checkin':
      return '毎日チェックイン'
    case 'playerScores':
      return 'プレイヤー成績'
    case 'scoreImages':
      return '成績画像'
    case 'chartTop':
      return '楽曲ランキング'
    case 'userTicket':
      return 'チケット'
    case 'userPassword':
      return 'パスワードリセット'
    case 'userCreate':
      return 'アカウント登録'
    case 'userBan':
      return 'ユーザーBAN'
    case 'userPurchase':
      return '購入権限'
    case 'scoreDelete':
      return '成績削除'
    case 'presentCreate':
      return '報酬追加'
    case 'presentDeliver':
      return '報酬配布'
    case 'presentDelete':
      return '報酬削除'
    case 'redeemCreate':
      return '引換コード追加'
    case 'redeemDelete':
      return '引換コード削除'
    case 'redeemUsers':
      return '引換コード使用者'
    case 'users':
      return 'プレイヤー管理'
    case 'songs':
      return '楽曲表'
    case 'items':
      return 'アイテム表'
    case 'purchases':
      return '購入項目'
    case 'purchaseItems':
      return '購入アイテム設定'
    case 'characters':
      return 'キャラクター'
    case 'bundleManager':
      return 'Bundle 管理'
    case 'songlistEdit':
      return 'Songlist 編集'
    case 'packlistEdit':
      return 'Packlist 編集'
    case 'unlocksEdit':
      return 'Unlocks 編集'
    case 'worldMapEdit':
      return 'World マップ作成'
    case 'packImageStudio':
      return 'パック画像生成'
    case 'backup':
      return 'DB バックアップ'
    case 'dbEditor':
      return 'DB エディタ'
    case 'help':
      return 'ヘルプ'
  }
}

function viewSubtitle(view: View) {
  if (isMaintenanceView(view)) {
    return maintenanceOperations[view].description
  }

  switch (view) {
    case 'dashboard':
      return 'サービス状態と運用データ'
    case 'checkin':
      return '毎日チケットを受け取る'
    case 'playerScores':
      return 'プレイヤー単体の成績記録を検索'
    case 'scoreImages':
      return 'B30 / AP30 / Sex30 成績画像を生成'
    case 'chartTop':
      return '楽曲の指定難易度ランキングを検索'
    case 'userTicket':
      return 'プレイヤーのチケットを更新'
    case 'userPassword':
      return 'プレイヤーのログインパスワードをリセット'
    case 'userCreate':
      return '新しいプレイヤーアカウントを作成'
    case 'userBan':
      return '指定したプレイヤーアカウントをBAN'
    case 'userPurchase':
      return 'プレイヤーの購入権限を調整'
    case 'scoreDelete':
      return '条件を指定して成績記録を削除'
    case 'presentCreate':
      return '報酬定義を新規作成'
    case 'presentDeliver':
      return '既存の報酬をプレイヤーに配布'
    case 'presentDelete':
      return '報酬定義を削除'
    case 'redeemCreate':
      return '引換コードを作成'
    case 'redeemDelete':
      return '引換コード削除'
    case 'redeemUsers':
      return '引換コードの使用者を検索'
    case 'users':
      return 'アカウント状態・チケット・直近のプレイ記録'
    case 'songs':
      return '曲名と譜面定数'
    case 'items':
      return 'アイテム種別と有効状態'
    case 'purchases':
      return '購入項目・価格・割引の設定'
    case 'purchaseItems':
      return '購入項目とアイテムの関連付け'
    case 'characters':
      return 'キャラクター定義の確認とプレイヤーへの付与・剥奪'
    case 'bundleManager':
      return '整合性スキャンとコンテンツバンドル構築'
    case 'songlistEdit':
      return 'songlist エントリの閲覧・編集・削除(自動バックアップ付き)'
    case 'packlistEdit':
      return 'パック定義の閲覧・編集・削除(自動バックアップ付き)'
    case 'unlocksEdit':
      return '曲の解禁条件の閲覧・編集・削除(自動バックアップ付き)'
    case 'worldMapEdit':
      return 'World モードのマップ (assets/map) の作成・編集・削除'
    case 'packImageStudio':
      return 'パック選択画像 (374×750) を画像・文字から生成'
    case 'backup':
      return 'データベースのバックアップ作成・一覧・ダウンロード'
    case 'dbEditor':
      return '全テーブルの閲覧・直接編集 (二段階確認・書込前自動バックアップ・監査ログ)'
    case 'help':
      return '用語集とよくある操作の手順'
  }
}

export default App
