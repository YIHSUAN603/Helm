// Toolbar 上的 Companion 甲板：佔住原本 tb-spacer 的空白，寵物在裡面活動。
// 解鎖前或關掉時就是一個普通的 spacer —— 彩蛋在被發現之前不留任何痕跡。
//
// 只用滑鼠互動：寵物不可 focus、不攔任何按鍵（鍵盤四層架構完全不動）。泡泡、
// 里程碑卡片與右鍵選單用 portal 掛到 .app：Toolbar 有 container-type（會建立
// stacking context），留在裡面會被下方的 pane 蓋住。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../../store/sessions";
import { isBusyState } from "../../store/notificationRouter";
import {
  BUILTIN_PETS,
  companionVisible,
  useCompanionStore,
} from "../../store/companion";
import { lastUserInputAt } from "../../store/companionWatch";
import { useUiStore } from "../../store/ui";
import { activateNextInFleetState } from "../../commands/actions";
import {
  WAIT_NUDGE_MS,
  WAIT_SETTLE_MS,
  isUserIdle,
  pickBehavior,
} from "../../companion/behavior";
import {
  LOOK_AT_YOU,
  PET_ANIMS,
  PET_SHEET,
  lookAngle,
  lookCell,
  spriteGeometry,
} from "../../companion/petAnimation";
import {
  frameColumn,
  initialPetMotion,
  stepPetMotion,
  type PetMotionInput,
  type PetMotionState,
} from "../../companion/petMotion";
import { isNightHour, levelOf, MAX_LEVEL } from "../../companion/progress";
import { useT } from "../../i18n";
import "./CompanionDeck.css";

const PET_HEIGHT = 30;
/** 按下後移動超過這個距離才算拖曳，否則是點擊。 */
const DRAG_THRESHOLD_PX = 4;
/** 沒有別的期限時，多久重新評估一次時間型規則（閒置、深夜）。 */
const IDLE_TICK_MS = 5_000;
/** 游標離寵物多近時牠會轉頭看（px）。 */
const LOOK_RADIUS = 320;
/** 一幀最多推進多久：分頁切走再回來時不會一步跨過整個甲板。 */
const MAX_STEP_MS = 100;

export function CompanionDeck() {
  const data = useCompanionStore((s) => s.data);
  if (!companionVisible(data)) return <div className="tb-spacer" />;
  return <Deck />;
}

function Deck() {
  const t = useT();
  const data = useCompanionStore((s) => s.data)!;
  const reaction = useCompanionStore((s) => s.reaction);
  const awayUntil = useCompanionStore((s) => s.awayUntil);
  const knockedOut = useCompanionStore((s) => s.knockedOut);
  const bubble = useCompanionStore((s) => s.bubble);
  const card = useCompanionStore((s) => s.card);
  const spriteUrl = useCompanionStore((s) => s.spriteUrl);
  const spriteRows = useCompanionStore((s) => s.spriteRows);
  const pets = useCompanionStore((s) => s.pets);

  const fleet = useSessionStore(
    useShallow((s) => {
      const active = s.sessions.find((x) => x.id === s.activeId);
      let waitingSince: number | null = null;
      for (const x of s.sessions) {
        if (x.agentState !== "waiting") continue;
        const since = x.stateSince ?? 0;
        if (waitingSince === null || since < waitingSince) waitingSince = since;
      }
      return {
        activeId: s.activeId,
        activeState: active?.agentState,
        activeStalled: Boolean(active?.stalled && isBusyState(active.agentState)),
        busyCount: s.sessions.filter((x) => isBusyState(x.agentState)).length,
        waitingSince,
      };
    }),
  );

  const [now, setNow] = useState(() => Date.now());
  const behavior = pickBehavior({
    now,
    waitingSince: fleet.waitingSince,
    reaction,
    awayUntil,
    knockedOut: fleet.activeId !== null && knockedOut.includes(fleet.activeId),
    activeState: fleet.activeState,
    activeStalled: fleet.activeStalled,
    busyCount: fleet.busyCount,
    userIdle: isUserIdle(lastUserInputAt(), now),
    night: isNightHour(new Date(now).getHours()),
  });

  // 時鐘跟著事件走：store 一變就換新的 now，否則用的是上一次 tick 的時間，
  // 反應的期限會被多算好幾秒。
  useEffect(() => {
    const bump = () => setNow(Date.now());
    const offCompanion = useCompanionStore.subscribe(bump);
    const offSessions = useSessionStore.subscribe((s, p) => {
      if (s.sessions !== p.sessions || s.activeId !== p.activeId) bump();
    });
    return () => {
      offCompanion();
      offSessions();
    };
  }, []);

  // 下一個會改變行為的時間點到了就重算；沒有的話定期看一下閒置與深夜。
  useEffect(() => {
    const deadlines = [
      reaction?.until,
      awayUntil ?? undefined,
      bubble?.until,
      card?.until,
      fleet.waitingSince !== null ? fleet.waitingSince + WAIT_NUDGE_MS : undefined,
      fleet.waitingSince !== null ? fleet.waitingSince + WAIT_SETTLE_MS : undefined,
    ].filter((d): d is number => d !== undefined && d > now);
    const next = Math.min(now + IDLE_TICK_MS, ...deadlines);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(16, next - now));
    return () => clearTimeout(timer);
  }, [now, reaction, awayUntil, bubble, card, fleet.waitingSince]);

  // 狀態帶出來的台詞（還在等你、好安靜、zzz）：換了才說，頻率由 store 限制。
  useEffect(() => {
    if (behavior.line) useCompanionStore.getState().say(behavior.line, false);
  }, [behavior.line]);

  const deckRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; active: boolean } | null>(null);
  // pointerup 先於 click：拖曳結束的那一下 click 不該再算成點牠。
  const swallowClick = useRef(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // 尺寸與列無關，用哪段動畫量都一樣。
  const geo = useMemo(() => spriteGeometry("idle", PET_HEIGHT, spriteRows), [spriteRows]);

  // 轉頭看游標：只在閒著（idle / review 原地）時，而且 sheet 有轉頭那兩列。
  // 忙碌、等批准、反應中都不轉頭 —— 那些動畫本身就是在告訴你事情。
  const canLook =
    spriteRows >= PET_SHEET.lookRows &&
    dragX === null &&
    (behavior.motion === "stay" || behavior.motion === "here") &&
    (behavior.anim === "idle" || behavior.anim === "review");
  const [look, setLook] = useState<number | null>(null);
  useEffect(() => {
    if (!canLook) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const update = () => {
      frame = 0;
      const rect = petRef.current?.getBoundingClientRect();
      if (!last || !rect) return;
      const { clientX: px, clientY: py } = last;
      const inside = px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom;
      const dx = px - (rect.left + rect.width / 2);
      const dy = py - (rect.top + rect.height / 2);
      // 停在牠身上 = 正面看著你；在附近 = 轉向游標；太遠就不理你。
      const angle = inside ? LOOK_AT_YOU : Math.hypot(dx, dy) <= LOOK_RADIUS ? lookAngle(dx, dy) : null;
      const cell = angle === null ? null : lookCell(angle);
      setLook(cell ? cell.row * PET_SHEET.cols + cell.col : null);
    };
    // passive、不攔事件：只是看著游標，terminal 照常收到一切。
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  }, [canLook]);
  const lookIdx = canLook ? look : null;
  const sheet = spriteUrl ?? BUILTIN_PETS[0].src;

  // 逐幀運動：位置與影格都由 rAF 迴圈從當下狀態往前推，直接寫進 DOM（不經
  // React 重繪）。元素從不因換動作而重新掛載 —— 那正是以前會閃現的原因。
  const hovered = useRef(false);
  const motionInput = useRef<Omit<PetMotionInput, "paused" | "reduced"> & { lookIdx: number | null }>(null);
  const motion = useRef<PetMotionState | null>(null);
  const paint = useCallback(() => {
    const wrap = wrapRef.current;
    const pet = petRef.current;
    const s = motion.current;
    const li = motionInput.current?.lookIdx ?? null;
    if (!wrap || !pet || !s) return;
    const { cellWidth, cellHeight } = geo;
    // 轉頭只在已經站定（不是走回停留點的途中）時生效。
    const looking = li !== null && (s.anim === "idle" || s.anim === "review");
    const col = looking ? li % PET_SHEET.cols : frameColumn(s);
    const row = looking ? Math.floor(li / PET_SHEET.cols) : PET_ANIMS[s.anim].row;
    wrap.style.left = `calc((100% - ${cellWidth}px) * ${s.x})`;
    wrap.style.opacity = String(s.opacity);
    wrap.style.visibility = s.motion === "hidden" ? "hidden" : "";
    pet.style.backgroundPosition = `${-col * cellWidth}px ${-row * cellHeight}px`;
  }, [geo]);
  // 每次 render 把最新的行為交給迴圈；第一次順便定出起點並先畫一格，免得
  // 第一個 rAF 之前看到牠站在甲板左緣。
  useLayoutEffect(() => {
    motionInput.current = { behavior, home: data.deckX, dragX, lookIdx };
    motion.current ??= initialPetMotion(data.deckX, behavior);
    paint();
  });
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(MAX_STEP_MS, Math.max(0, t - last));
      last = t;
      if (motion.current && motionInput.current) {
        motion.current = stepPetMotion(
          motion.current,
          { ...motionInput.current, paused: hovered.current, reduced: reduced?.matches ?? false },
          dt,
        );
        paint();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paint]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { startX: e.clientX, active: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const deck = deckRef.current;
    if (!d || !deck) return;
    if (!d.active) {
      if (Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      petRef.current?.setPointerCapture(e.pointerId);
    }
    const rect = deck.getBoundingClientRect();
    const span = Math.max(1, rect.width - geo.cellWidth);
    setDragX(Math.max(0, Math.min(1, (e.clientX - rect.left - geo.cellWidth / 2) / span)));
  };
  const onPointerUp = () => {
    if (drag.current?.active && dragX !== null) {
      swallowClick.current = true;
      useCompanionStore.getState().setDeckX(dragX);
      useCompanionStore.getState().react("idle");
    }
    drag.current = null;
    setDragX(null);
  };
  const onClick = () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    // 有人在等批准時，點牠就是「帶我去」—— 這時不算互動。
    if (fleet.waitingSince !== null) {
      activateNextInFleetState("waiting");
      return;
    }
    useCompanionStore.getState().click(fleet.activeId);
  };
  const openLogbook = () => {
    closeMenu();
    useUiStore.getState().openSettingsTab("companion");
  };

  const allPets = useMemo(() => [...BUILTIN_PETS, ...pets], [pets]);
  const petName =
    data.petName ?? allPets.find((p) => p.id === data.activePetId)?.displayName ?? "";

  const showBubble = !!bubble && bubble.until > now;
  const showCard = !!card && card.until > now && !showBubble;

  const style = {
    "--cw": `${geo.cellWidth}px`,
    "--ch": `${geo.cellHeight}px`,
    "--sw": `${geo.sheetWidth}px`,
    "--sh": `${geo.sheetHeight}px`,
    "--sheet": `url("${sheet}")`,
  } as React.CSSProperties;

  // 跑走期間元素仍掛著（只是看不見）：回來時才能從退場的位置接著走進來。
  const hidden = behavior.motion === "hidden";
  return (
    <div className="tb-spacer companion-deck" ref={deckRef} style={style}>
      <div
        ref={wrapRef}
        className="companion-pet-wrap"
        data-dragging={dragX !== null || undefined}
        aria-hidden={hidden || undefined}
      >
        <div
          ref={petRef}
          className="companion-pet"
          role="img"
          aria-label={t("companion.ariaLabel", { name: petName })}
          title={petName}
          onPointerEnter={() => (hovered.current = true)}
          onPointerLeave={() => (hovered.current = false)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onClick}
          onDoubleClick={openLogbook}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        />
      </div>

      {showBubble && !hidden && (
        <Floating anchor={petRef} className="companion-bubble">
          {t(bubble.key, bubble.vars)}
        </Floating>
      )}
      {showCard && !hidden && (
        <Floating anchor={petRef} className="companion-card">
          <span aria-hidden>🏅</span> {t(`companion.milestone.${card.id}`)}
        </Floating>
      )}
      {menu && (
        <CompanionMenu
          at={menu}
          pets={allPets}
          activePetId={data.activePetId}
          canRename={levelOf(data.affinity) >= MAX_LEVEL}
          onClose={closeMenu}
          onLogbook={openLogbook}
        />
      )}
    </div>
  );
}

/**
 * portal 掛在 .app 底下而不是 body：主題的 CSS 變數（--sidebar-bg 等）定義在
 * .app 上，掛到 body 會讀不到、背景變透明。
 */
function portalRoot(): Element {
  return document.querySelector(".app") ?? document.body;
}

/**
 * 掛在 .app 的浮動框，出現時量一次寵物的位置貼在牠下方。只量一次：不追著
 * pace 動畫跑，免得每一幀都重算版面。
 */
function Floating({
  anchor,
  className,
  children,
}: {
  anchor: React.RefObject<HTMLDivElement | null>;
  className: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const rect = anchor.current?.getBoundingClientRect();
    if (!el || !rect) return;
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.bottom + 6}px`;
  }, [anchor]);
  return createPortal(
    <div ref={ref} className={className}>
      {children}
    </div>,
    portalRoot(),
  );
}

function CompanionMenu({
  at,
  pets,
  activePetId,
  canRename,
  onClose,
  onLogbook,
}: {
  at: { x: number; y: number };
  pets: readonly { id: string; displayName: string }[];
  activePetId: string;
  canRename: boolean;
  onClose: () => void;
  onLogbook: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  // 點外面、失焦、Esc 都關掉。Esc 不 preventDefault：選單是滑鼠開的，鍵盤事件
  // 照常流向原本的目標（通常是 terminal）。
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const store = useCompanionStore.getState();
  return createPortal(
    <div className="companion-menu" ref={ref} style={{ left: at.x, top: at.y }} role="menu">
      {pets.length > 1 && (
        <>
          <div className="companion-menu-label">{t("companion.menu.switchPet")}</div>
          {pets.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={p.id === activePetId}
              tabIndex={-1}
              onClick={() => {
                store.setActivePet(p.id);
                onClose();
              }}
            >
              {p.id === activePetId ? "● " : "○ "}
              {p.displayName}
            </button>
          ))}
          <div className="companion-menu-sep" />
        </>
      )}
      {canRename && (
        <button role="menuitem" tabIndex={-1} onClick={onLogbook}>
          {t("companion.menu.rename")}
        </button>
      )}
      <button role="menuitem" tabIndex={-1} onClick={onLogbook}>
        {t("companion.menu.logbook")}
      </button>
      <button
        role="menuitem"
        tabIndex={-1}
        onClick={() => {
          store.setEnabled(false);
          onClose();
        }}
      >
        {t("companion.menu.sleep")}
      </button>
    </div>,
    portalRoot(),
  );
}
