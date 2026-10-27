// Companion 的長期進度：計數、解鎖、里程碑、親密度與 companion.json 的格式。
// 純函式（時間由呼叫端注入），node 測試可直接載入；I/O 在 store/companion.ts。
//
// 刻意只增不減：親密度沒有「冷落太久會下降」的懲罰，彩蛋不該讓人有壓力。

export const COMPANION_VERSION = 1;
export const DEFAULT_PET_ID = "seagull";

/** 解鎖門檻：回答幾次 prompt 或完成幾個回合，任一個先到就解鎖。 */
export const UNLOCK_ANSWERED = 30;
export const UNLOCK_DONE = 20;

/** 各等級的親密度下限；index 0 = 1 級。 */
export const LEVEL_THRESHOLDS = [0, 50, 200, 600, 1500] as const;
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/** 點寵物每天最多拿幾分 —— 連點不該是升級捷徑。 */
export const DAILY_CLICK_POINTS = 10;

export const POINTS = {
  click: 1,
  answered: 2,
  done: 1,
  milestone: 10,
} as const;

/** 深夜：當地時間 [0, 5) 點。 */
export function isNightHour(hour: number): boolean {
  return hour >= 0 && hour < 5;
}

export type MilestoneId =
  | "unlock"
  | "answered-100"
  | "answered-500"
  | "answered-1000"
  | "done-100"
  | "done-500"
  | "night-owl"
  | "fleet-4"
  | "cost-10"
  | "cost-100"
  | "level-2"
  | "level-3"
  | "level-4"
  | "level-5";

/** 渲染日誌時的固定順序（也是 normalize 時的白名單）。 */
export const MILESTONE_IDS: readonly MilestoneId[] = [
  "unlock",
  "answered-100",
  "answered-500",
  "answered-1000",
  "done-100",
  "done-500",
  "night-owl",
  "fleet-4",
  "cost-10",
  "cost-100",
  "level-2",
  "level-3",
  "level-4",
  "level-5",
];

export interface CompanionData {
  version: typeof COMPANION_VERSION;
  answered: number;
  done: number;
  agentSessions: number;
  /** 觀察到的累積花費（美元）。只算 Helm 開著時看到的增量。 */
  costUsd: number;
  unlockedAt: number | null;
  enabled: boolean;
  activePetId: string;
  /** 寵物在甲板上的水平位置，0（左）–1（右）。 */
  deckX: number;
  affinity: number;
  clickDay: string | null;
  clickPointsToday: number;
  milestones: { id: MilestoneId; at: number }[];
  /** 每天第一次啟動的小時分布，24 格。 */
  launchHours: number[];
  lastLaunchDay: string | null;
  /** 5 級後可以幫寵物取名；null = 用寵物本身的 displayName。 */
  petName: string | null;
}

export function defaultCompanion(): CompanionData {
  return {
    version: COMPANION_VERSION,
    answered: 0,
    done: 0,
    agentSessions: 0,
    costUsd: 0,
    unlockedAt: null,
    enabled: true,
    activePetId: DEFAULT_PET_ID,
    deckX: 0,
    affinity: 0,
    clickDay: null,
    clickPointsToday: 0,
    milestones: [],
    launchHours: new Array(24).fill(0),
    lastLaunchDay: null,
    petName: null,
  };
}

function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function int(v: unknown): number {
  return Math.floor(count(v));
}

/**
 * 讀回 companion.json。版本不符或不是物件 → 整份重來（同 sessions.json 的規則：
 * 不做遷移）；個別欄位壞掉只把該欄位換回預設值，不讓一個欄位拖垮整份進度。
 */
export function normalizeCompanion(raw: unknown): CompanionData {
  const base = defaultCompanion();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  if (r.version !== COMPANION_VERSION) return base;

  const seen = new Set<MilestoneId>();
  const milestones: CompanionData["milestones"] = [];
  if (Array.isArray(r.milestones)) {
    for (const m of r.milestones) {
      if (!m || typeof m !== "object") continue;
      const { id, at } = m as { id?: unknown; at?: unknown };
      if (!MILESTONE_IDS.includes(id as MilestoneId) || seen.has(id as MilestoneId)) continue;
      seen.add(id as MilestoneId);
      milestones.push({ id: id as MilestoneId, at: count(at) });
    }
  }

  const hours = Array.isArray(r.launchHours) && r.launchHours.length === 24
    ? r.launchHours.map(int)
    : base.launchHours;

  return {
    version: COMPANION_VERSION,
    answered: int(r.answered),
    done: int(r.done),
    agentSessions: int(r.agentSessions),
    costUsd: count(r.costUsd),
    unlockedAt: typeof r.unlockedAt === "number" && r.unlockedAt > 0 ? r.unlockedAt : null,
    enabled: typeof r.enabled === "boolean" ? r.enabled : base.enabled,
    activePetId:
      typeof r.activePetId === "string" && r.activePetId ? r.activePetId : base.activePetId,
    deckX: typeof r.deckX === "number" && r.deckX >= 0 && r.deckX <= 1 ? r.deckX : base.deckX,
    affinity: int(r.affinity),
    clickDay: typeof r.clickDay === "string" ? r.clickDay : null,
    clickPointsToday: int(r.clickPointsToday),
    milestones,
    launchHours: hours,
    lastLaunchDay: typeof r.lastLaunchDay === "string" ? r.lastLaunchDay : null,
    petName: typeof r.petName === "string" && r.petName.trim() ? r.petName.trim() : null,
  };
}

export function isUnlocked(data: CompanionData): boolean {
  return data.unlockedAt !== null;
}

/** 親密度 → 等級（1–5）。 */
export function levelOf(affinity: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (affinity >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

/** 本機日期鍵（YYYY-MM-DD）。用本地時間，「每天」才會跟使用者的一天對齊。 */
export function dayKey(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type Activity =
  | { kind: "answered" }
  | { kind: "done" }
  | { kind: "agentSession" }
  | { kind: "click" }
  | { kind: "cost"; deltaUsd: number }
  | { kind: "fleetBusy"; count: number };

export interface ActivityResult {
  data: CompanionData;
  /** 這次新達成的里程碑（含 unlock），依達成順序。 */
  reached: MilestoneId[];
}

function hasMilestone(data: CompanionData, id: MilestoneId): boolean {
  return data.milestones.some((m) => m.id === id);
}

/** 依目前計數該拿到、但還沒拿到的里程碑。 */
function pendingMilestones(data: CompanionData, activity: Activity, hour: number): MilestoneId[] {
  const out: MilestoneId[] = [];
  const want = (id: MilestoneId, cond: boolean) => {
    if (cond && !hasMilestone(data, id) && !out.includes(id)) out.push(id);
  };
  want("answered-100", data.answered >= 100);
  want("answered-500", data.answered >= 500);
  want("answered-1000", data.answered >= 1000);
  want("done-100", data.done >= 100);
  want("done-500", data.done >= 500);
  want("cost-10", data.costUsd >= 10);
  want("cost-100", data.costUsd >= 100);
  want(
    "night-owl",
    (activity.kind === "answered" || activity.kind === "done") && isNightHour(hour),
  );
  want("fleet-4", activity.kind === "fleetBusy" && activity.count >= 4);
  const level = levelOf(data.affinity);
  for (let l = 2; l <= level; l++) want(`level-${l}` as MilestoneId, true);
  return out;
}

/**
 * 套用一筆活動。解鎖前照樣累積計數與親密度（解鎖本身就靠計數），但除了
 * unlock 之外不發里程碑：解鎖前的成就沒有人看得到，留到解鎖後補發也只會
 * 一次湧出一堆卡片。計數型里程碑在解鎖後下一筆活動時自然補上。
 */
export function applyActivity(
  prev: CompanionData,
  activity: Activity,
  now: number,
): ActivityResult {
  const data: CompanionData = { ...prev, milestones: [...prev.milestones] };
  switch (activity.kind) {
    case "answered":
      data.answered += 1;
      data.affinity += POINTS.answered;
      break;
    case "done":
      data.done += 1;
      data.affinity += POINTS.done;
      break;
    case "agentSession":
      data.agentSessions += 1;
      break;
    case "click": {
      const today = dayKey(now);
      if (data.clickDay !== today) {
        data.clickDay = today;
        data.clickPointsToday = 0;
      }
      if (data.clickPointsToday < DAILY_CLICK_POINTS) {
        data.clickPointsToday += 1;
        data.affinity += POINTS.click;
      }
      break;
    }
    case "cost":
      if (activity.deltaUsd > 0 && Number.isFinite(activity.deltaUsd)) {
        data.costUsd += activity.deltaUsd;
      }
      break;
    case "fleetBusy":
      break;
  }

  const reached: MilestoneId[] = [];
  if (
    data.unlockedAt === null &&
    (data.answered >= UNLOCK_ANSWERED || data.done >= UNLOCK_DONE)
  ) {
    data.unlockedAt = now;
    data.milestones.push({ id: "unlock", at: now });
    data.affinity += POINTS.milestone;
    reached.push("unlock");
  }
  if (data.unlockedAt === null) return { data, reached };

  // 里程碑會加親密度，親密度又可能跨過等級門檻 → 再發一個等級里程碑。
  // 迴圈到穩定為止（等級有上限，必定收斂）。
  const hour = new Date(now).getHours();
  for (;;) {
    const next = pendingMilestones(data, activity, hour);
    if (next.length === 0) break;
    for (const id of next) {
      data.milestones.push({ id, at: now });
      data.affinity += POINTS.milestone;
      reached.push(id);
    }
  }
  return { data, reached };
}

/** 啟動時間分布裡最常見的小時；樣本不足 5 天時沒有「習慣」可言。 */
export function typicalLaunchHour(launchHours: readonly number[]): number | null {
  const total = launchHours.reduce((a, b) => a + b, 0);
  if (total < 5) return null;
  let best = 0;
  for (let h = 1; h < 24; h++) if (launchHours[h] > launchHours[best]) best = h;
  return best;
}

/**
 * 記錄一次啟動：每天只算第一次。earlyBird = 比平常早 2 小時以上
 * （以記錄這次之前的分布判斷，不讓今天的樣本稀釋「平常」）。
 */
export function recordLaunch(
  prev: CompanionData,
  now: number,
): { data: CompanionData; earlyBird: boolean } {
  const today = dayKey(now);
  if (prev.lastLaunchDay === today) return { data: prev, earlyBird: false };
  const hour = new Date(now).getHours();
  const typical = typicalLaunchHour(prev.launchHours);
  const launchHours = [...prev.launchHours];
  launchHours[hour] += 1;
  return {
    data: { ...prev, launchHours, lastLaunchDay: today },
    earlyBird: typical !== null && hour <= typical - 2,
  };
}
