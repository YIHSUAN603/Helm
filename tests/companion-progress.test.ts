// Companion 進度測試：解鎖、里程碑、親密度、companion.json 驗證、啟動習慣。
// Run: node --experimental-strip-types tests/companion-progress.test.ts
import assert from "node:assert";
import {
  DAILY_CLICK_POINTS,
  UNLOCK_ANSWERED,
  UNLOCK_DONE,
  applyActivity,
  dayKey,
  defaultCompanion,
  isUnlocked,
  levelOf,
  normalizeCompanion,
  recordLaunch,
  typicalLaunchHour,
  type Activity,
  type CompanionData,
} from "../src/companion/progress.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

// 本地時間：測試與實作都用本地時區，深夜判斷才一致
const NOON = new Date(2026, 9, 27, 12, 0).getTime();
const NIGHT = new Date(2026, 9, 27, 2, 0).getTime();

function repeat(data: CompanionData, act: Activity, n: number, now = NOON) {
  const reached: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = applyActivity(data, act, now);
    data = r.data;
    reached.push(...r.reached);
  }
  return { data, reached };
}

// 解鎖：回答 30 次或完成 20 次，任一個先到
{
  const a = repeat(defaultCompanion(), { kind: "answered" }, UNLOCK_ANSWERED - 1);
  check("29 次還沒解鎖", !isUnlocked(a.data) && a.reached.length === 0);
  const b = applyActivity(a.data, { kind: "answered" }, NOON);
  check("第 30 次解鎖", isUnlocked(b.data) && b.reached[0] === "unlock");
  check("解鎖時間", b.data.unlockedAt === NOON);
  const d = repeat(defaultCompanion(), { kind: "done" }, UNLOCK_DONE);
  check("完成 20 次也解鎖", isUnlocked(d.data));
  const again = applyActivity(b.data, { kind: "answered" }, NOON);
  check("不會重複解鎖", !again.reached.includes("unlock") && again.data.unlockedAt === NOON);
}

// 解鎖前不發里程碑（unlock 除外）
{
  const r = repeat(defaultCompanion(), { kind: "answered" }, 5, NIGHT);
  check("解鎖前深夜不給 night-owl", !r.reached.includes("night-owl"));
  const fleet = applyActivity(defaultCompanion(), { kind: "fleetBusy", count: 5 }, NOON);
  check("解鎖前 fleet-4 不給", fleet.reached.length === 0);
  check("解鎖前仍累積親密度", r.data.affinity === 10);
}

// 解鎖後的里程碑
{
  let data = repeat(defaultCompanion(), { kind: "answered" }, UNLOCK_ANSWERED).data;
  const night = applyActivity(data, { kind: "answered" }, NIGHT);
  check("深夜回答 → night-owl", night.reached.includes("night-owl"));
  check("night-owl 只給一次", !applyActivity(night.data, { kind: "done" }, NIGHT).reached.includes("night-owl"));
  const fleet = applyActivity(data, { kind: "fleetBusy", count: 4 }, NOON);
  check("4 個 agent 同時忙 → fleet-4", fleet.reached.includes("fleet-4"));
  check("3 個不給", !applyActivity(data, { kind: "fleetBusy", count: 3 }, NOON).reached.includes("fleet-4"));
  const r = repeat(data, { kind: "answered" }, 100 - UNLOCK_ANSWERED);
  check("回答 100 次", r.reached.includes("answered-100"));
  data = applyActivity(data, { kind: "cost", deltaUsd: 9.5 }, NOON).data;
  const cost = applyActivity(data, { kind: "cost", deltaUsd: 0.6 }, NOON);
  check("累積花費 $10", cost.reached.includes("cost-10"));
  check("負的花費增量被忽略", applyActivity(data, { kind: "cost", deltaUsd: -5 }, NOON).data.costUsd === data.costUsd);
}

// 親密度與等級
{
  check("0 → 1 級", levelOf(0) === 1);
  check("49 → 1 級", levelOf(49) === 1);
  check("50 → 2 級", levelOf(50) === 2);
  check("1500 → 5 級", levelOf(1500) === 5);
  check("超過上限仍 5 級", levelOf(99999) === 5);
  // 解鎖時親密度已有 60（30 次 × 2）→ 同時補發 level-2
  const r = repeat(defaultCompanion(), { kind: "answered" }, UNLOCK_ANSWERED);
  check("解鎖當下補發等級里程碑", r.reached.join() === "unlock,level-2");
  check("里程碑加分", r.data.affinity === 60 + 10 + 10);
}

// 點擊每天最多 10 分，隔天重算
{
  const r = repeat(defaultCompanion(), { kind: "click" }, 15);
  check("一天最多 10 分", r.data.affinity === DAILY_CLICK_POINTS);
  const tomorrow = applyActivity(r.data, { kind: "click" }, NOON + 24 * 3600_000);
  check("隔天重新計分", tomorrow.data.affinity === DAILY_CLICK_POINTS + 1);
  check("不改到原物件", r.data.affinity === DAILY_CLICK_POINTS);
}

// normalizeCompanion
{
  check("非物件 → 預設", normalizeCompanion(null).answered === 0);
  check("版本不符 → 預設", normalizeCompanion({ version: 99, answered: 5 }).answered === 0);
  const n = normalizeCompanion({
    version: 1,
    answered: 12.7,
    done: -3,
    deckX: 4,
    enabled: "yes",
    activePetId: "",
    milestones: [
      { id: "unlock", at: 5 },
      { id: "unlock", at: 6 },
      { id: "hacked", at: 1 },
      null,
    ],
    launchHours: [1, 2],
    petName: "  阿嘎 ",
  });
  check("小數取整", n.answered === 12);
  check("負數歸零", n.done === 0);
  check("deckX 超出範圍 → 預設", n.deckX === 0);
  check("enabled 型別錯 → 預設", n.enabled === true);
  check("空的 petId → 預設", n.activePetId === "seagull");
  check("里程碑去重與白名單", n.milestones.length === 1 && n.milestones[0].at === 5);
  check("launchHours 長度不對 → 預設", n.launchHours.length === 24);
  check("名字去空白", n.petName === "阿嘎");
  const round = normalizeCompanion(JSON.parse(JSON.stringify(repeat(defaultCompanion(), { kind: "done" }, 25).data)));
  check("序列化來回不失真", round.done === 25 && isUnlocked(round));
}

// 啟動習慣
{
  check("日期鍵", dayKey(NOON) === "2026-10-27");
  check("樣本不足沒有習慣", typicalLaunchHour(new Array(24).fill(0)) === null);
  const hours = new Array(24).fill(0);
  hours[10] = 5;
  hours[9] = 1;
  check("最常見的小時", typicalLaunchHour(hours) === 10);
  const base = { ...defaultCompanion(), launchHours: hours };
  const early = recordLaunch(base, new Date(2026, 9, 27, 7, 30).getTime());
  check("早 2 小時以上 → earlyBird", early.earlyBird);
  check("記錄這次啟動", early.data.launchHours[7] === 1 && early.data.lastLaunchDay === "2026-10-27");
  const second = recordLaunch(early.data, new Date(2026, 9, 27, 7, 45).getTime());
  check("同一天第二次不算", !second.earlyBird && second.data === early.data);
  check("平常時間不算早", !recordLaunch(base, new Date(2026, 9, 28, 9, 0).getTime()).earlyBird);
}

console.log(`companion-progress: ${passed} checks passed`);
