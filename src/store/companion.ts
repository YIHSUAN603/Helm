// Companion store：長期進度（companion.json）+ 執行期的反應、泡泡與里程碑卡片。
// 判斷全在 src/companion/ 的純函式；這裡只負責時間、隨機數與 I/O。
//
// 寫檔走 subscribe + debounce（同 sessionSnapshot.ts）：計數在 agent 狀態轉移時
// 更新，絕不在 setter 裡同步寫檔。讀檔失敗（含瀏覽器 dev 沒有 Tauri）時停用
// 寫入，免得用一份空進度蓋掉好的檔案。
import { create } from "zustand";
import { readAppFile, writeAppFile } from "../ipc/appStore";
import { listPets, readPetSprite, type PetInfo } from "../ipc/pets";
import {
  applyActivity,
  defaultCompanion,
  isNightHour,
  isUnlocked,
  levelOf,
  normalizeCompanion,
  recordLaunch,
  DEFAULT_PET_ID,
  type Activity,
  type CompanionData,
  type MilestoneId,
} from "../companion/progress";
import {
  FLEE_MS,
  canSpeak,
  registerClick,
  type Reaction,
} from "../companion/behavior";
import { pickLine, type LineContext } from "../companion/lines";
import { animCycleMs, PET_SHEET, sheetRows, type PetAnim } from "../companion/petAnimation";

export const COMPANION_FILE = "companion.json";

/** 內建寵物：隨前端打包，不能刪除。 */
export const BUILTIN_PETS: readonly (PetInfo & { src: string })[] = [
  {
    id: DEFAULT_PET_ID,
    displayName: "Seagull",
    description: "",
    src: "/pets/seagull/spritesheet.webp",
  },
];

const BUBBLE_MS = 4_000;
const CARD_MS = 5_000;
/** 進場 / 退場要跑多久（甲板寬度內跑完）。 */
export const TRAVEL_MS = 1_200;

export interface Bubble {
  key: string;
  vars: Record<string, string | number>;
  until: number;
}

interface CompanionState {
  /** null = 還沒讀完 companion.json。 */
  data: CompanionData | null;
  persistable: boolean;
  reaction: Reaction | null;
  awayUntil: number | null;
  /** 倒地中的 session（error / interrupted），點一下或恢復忙碌才起來。 */
  knockedOut: readonly string[];
  bubble: Bubble | null;
  card: { id: MilestoneId; until: number } | null;
  pets: PetInfo[];
  /** 目前寵物的 sprite sheet URL；null = 還在讀或讀不到（退回內建）。 */
  spriteUrl: string | null;
  /** sheet 有幾列：9 = Codex 標準格式，11 = 多兩列轉頭方向的擴充版。 */
  spriteRows: number;

  load: () => Promise<void>;
  activity: (act: Activity) => void;
  react: (anim: PetAnim, opts?: { cycles?: number; motion?: Reaction["motion"]; ms?: number }) => void;
  say: (ctx: LineContext, solicited: boolean) => void;
  click: (activeId: string | null) => void;
  knockOut: (sessionId: string) => void;
  revive: (sessionId: string) => void;
  setEnabled: (enabled: boolean) => void;
  setActivePet: (id: string) => void;
  setDeckX: (x: number) => void;
  setPetName: (name: string) => void;
  refreshPets: () => Promise<void>;
  dismissBubble: () => void;
}

// 執行期的小狀態：不需要觸發重繪，放 module 變數。
let clickTimes: number[] = [];
let lastLineKey: string | null = null;
let lastUnsolicitedAt: number | null = null;
let bedtimeNagDay: string | null = null;

/** 寵物看得到嗎（解鎖且開著）。看不到時反應與泡泡都不必排。 */
export function companionVisible(data: CompanionData | null): data is CompanionData {
  return !!data && isUnlocked(data) && data.enabled;
}

export const useCompanionStore = create<CompanionState>((set, get) => ({
  data: null,
  persistable: false,
  reaction: null,
  awayUntil: null,
  knockedOut: [],
  bubble: null,
  card: null,
  pets: [],
  spriteUrl: null,
  spriteRows: PET_SHEET.rows,

  load: async () => {
    const res = await readAppFile(COMPANION_FILE);
    let data = defaultCompanion();
    if (res.ok && res.text) {
      try {
        data = normalizeCompanion(JSON.parse(res.text));
      } catch {
        // 壞檔：從預設值開始，但仍可寫回（壞檔本來就救不回來）。
      }
    }
    const launch = recordLaunch(data, Date.now());
    set({ data: launch.data, persistable: res.ok });
    void get().refreshPets();
    if (!companionVisible(launch.data)) return;
    // 熟了之後會跑進來迎接你；平常只在比平常早來時說一句。
    if (levelOf(launch.data.affinity) >= 4) {
      get().react("running-left", { motion: "enter", ms: TRAVEL_MS });
      get().say("greeting", false);
    } else if (launch.earlyBird) {
      get().say("earlyBird", false);
    }
  },

  activity: (act) => {
    const prev = get().data;
    if (!prev) return;
    const now = Date.now();
    const { data, reached } = applyActivity(prev, act, now);
    set({ data });
    if (reached.length === 0 || !data.enabled) return;
    if (reached.includes("unlock")) {
      // 第一次登場：從右側跑進來、揮手、自我介紹。
      set({ reaction: { anim: "running-left", motion: "enter", until: now + TRAVEL_MS } });
      setTimeout(() => {
        get().react("waving", { cycles: 3 });
        get().say("unlock", true);
      }, TRAVEL_MS);
    } else {
      get().react("jumping", { cycles: 2 });
    }
    set({ card: { id: reached[reached.length - 1], until: now + CARD_MS } });
  },

  react: (anim, opts = {}) => {
    if (!companionVisible(get().data)) return;
    const ms = opts.ms ?? animCycleMs(anim) * (opts.cycles ?? 1);
    set({ reaction: { anim, motion: opts.motion, until: Date.now() + ms } });
  },

  say: (ctx, solicited) => {
    const data = get().data;
    if (!companionVisible(data)) return;
    const now = Date.now();
    if (!canSpeak(lastUnsolicitedAt, now, solicited)) return;
    const key = pickLine(
      ctx,
      { level: levelOf(data.affinity), hour: new Date(now).getHours() },
      lastLineKey,
      Math.random,
    );
    if (!key) return;
    lastLineKey = key;
    if (!solicited) lastUnsolicitedAt = now;
    const pet = [...BUILTIN_PETS, ...get().pets].find((p) => p.id === data.activePetId);
    set({
      bubble: {
        key,
        vars: {
          answered: data.answered,
          done: data.done,
          name: data.petName ?? pet?.displayName ?? "",
        },
        until: now + BUBBLE_MS,
      },
    });
  },

  click: (activeId) => {
    const now = Date.now();
    const r = registerClick(clickTimes, now);
    clickTimes = r.times;
    get().activity({ kind: "click" });
    if (r.outcome === "flee") {
      get().say("flee", true);
      set({
        reaction: { anim: "running-left", motion: "exit", until: now + TRAVEL_MS },
        awayUntil: now + TRAVEL_MS + FLEE_MS,
      });
      return;
    }
    if (r.outcome === "annoyed") {
      get().react("jumping", { cycles: 2 });
      get().say("annoyed", true);
      return;
    }
    if (activeId && get().knockedOut.includes(activeId)) {
      get().revive(activeId);
      get().react("jumping");
      get().say("getUp", true);
      return;
    }
    const hour = new Date(now).getHours();
    const today = new Date(now).toDateString();
    if (hour >= 3 && isNightHour(hour) && bedtimeNagDay !== today) {
      bedtimeNagDay = today;
      get().react("waving", { cycles: 2 });
      get().say("bedtime", true);
      return;
    }
    get().react("waving", { cycles: 2 });
    get().say("click", true);
  },

  knockOut: (sessionId) => {
    if (get().knockedOut.includes(sessionId)) return;
    set({ knockedOut: [...get().knockedOut, sessionId] });
  },

  revive: (sessionId) => {
    if (!get().knockedOut.includes(sessionId)) return;
    set({ knockedOut: get().knockedOut.filter((id) => id !== sessionId) });
  },

  setEnabled: (enabled) => {
    const data = get().data;
    if (!data || data.enabled === enabled) return;
    set({ data: { ...data, enabled }, reaction: null, bubble: null, card: null });
  },

  setActivePet: (id) => {
    const data = get().data;
    if (!data || data.activePetId === id) return;
    set({ data: { ...data, activePetId: id } });
    void loadSprite(id);
  },

  setDeckX: (x) => {
    const data = get().data;
    if (!data) return;
    set({ data: { ...data, deckX: Math.max(0, Math.min(1, x)) } });
  },

  setPetName: (name) => {
    const data = get().data;
    if (!data) return;
    set({ data: { ...data, petName: name.trim() || null } });
  },

  refreshPets: async () => {
    const pets = await listPets();
    set({ pets });
    const data = get().data;
    if (!data) return;
    // 正在用的寵物被刪了 → 退回預設海鷗。
    const exists =
      BUILTIN_PETS.some((p) => p.id === data.activePetId) ||
      pets.some((p) => p.id === data.activePetId);
    if (!exists) set({ data: { ...data, activePetId: DEFAULT_PET_ID } });
    void loadSprite(get().data!.activePetId);
  },

  dismissBubble: () => set({ bubble: null }),
}));

/** 讀圖片的實際高度判斷列數；讀不到或尺寸不合法時當成標準的 9 列。 */
function measureRows(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(sheetRows(img.naturalHeight) ?? PET_SHEET.rows);
    img.onerror = () => resolve(PET_SHEET.rows);
    img.src = url;
  });
}

/** 讀目前寵物的 sprite sheet；內建的直接用打包路徑，匯入的由 Rust 轉 data URL。 */
async function loadSprite(id: string): Promise<void> {
  const builtin = BUILTIN_PETS.find((p) => p.id === id);
  let url = builtin?.src ?? BUILTIN_PETS[0].src;
  if (!builtin) {
    try {
      url = await readPetSprite(id);
    } catch {
      // 檔案不見了：退回內建海鷗。
    }
  }
  const rows = await measureRows(url);
  // 讀圖期間使用者可能又換了寵物：只套用最新那一隻的結果。
  if (useCompanionStore.getState().data?.activePetId !== id) return;
  useCompanionStore.setState({ spriteUrl: url, spriteRows: rows });
}

let writeTimer: ReturnType<typeof setTimeout> | undefined;

/** 進度變了就 debounce 寫檔。只看 data 的參照：執行期反應不觸發寫入。 */
export function startCompanionPersistence(): void {
  useCompanionStore.subscribe((s, prev) => {
    if (!s.persistable || !s.data || s.data === prev.data) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      const data = useCompanionStore.getState().data;
      if (data) void writeAppFile(COMPANION_FILE, JSON.stringify(data));
    }, 800);
  });
}

/** 關閉前立刻寫一次（給 App 的 close flush 用）。 */
export function flushCompanion(): Promise<boolean> | undefined {
  const { data, persistable } = useCompanionStore.getState();
  clearTimeout(writeTimer);
  if (!persistable || !data) return undefined;
  return writeAppFile(COMPANION_FILE, JSON.stringify(data));
}
