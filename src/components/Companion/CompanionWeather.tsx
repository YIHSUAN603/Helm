// 甲板天氣圖層：放在寵物下方、不吃任何滑鼠事件。決策在 companion/weather.ts。
//
// 三種海面同時掛著、只切 opacity 交叉淡入淡出：直接改 animation-duration 或
// path 會讓波浪跳一下（同一類問題讓寵物以前換動作時閃現）。浪的高低用外層
// scaleY 調，內層的平移動畫從不重新起播。
import { useEffect, useState } from "react";
import type { Weather } from "../../companion/weather";

/** 一段 SVG 要畫多寬：甲板再寬也蓋得住，再加一個波長給平移用。 */
const SEA_SPAN = 4_000;
const SEA_HEIGHT = 8;

/** 產生 y = mid 上下起伏的波形。sharp = 碎浪（尖頂、短波長）。 */
function wavePath(wavelength: number, amplitude: number, sharp: boolean): string {
  const mid = SEA_HEIGHT / 2;
  let d = `M 0 ${mid}`;
  for (let x = 0; x < SEA_SPAN + wavelength; x += wavelength) {
    const half = wavelength / 2;
    if (sharp) {
      // 尖頂：往上用直線、往下用弧線，看起來像被風吹碎的浪頭。
      d += ` L ${x + half * 0.6} ${mid - amplitude} Q ${x + half} ${mid + amplitude} ${x + wavelength} ${mid}`;
    } else {
      d += ` Q ${x + half / 2} ${mid - amplitude} ${x + half} ${mid} T ${x + wavelength} ${mid}`;
    }
  }
  return d;
}

const SEAS = [
  { sea: "flat", d: `M 0 ${SEA_HEIGHT / 2} H ${SEA_SPAN}`, wavelength: 0 },
  { sea: "swell", d: wavePath(48, 2.4, false), wavelength: 48 },
  { sea: "choppy", d: wavePath(16, 2.2, true), wavelength: 16 },
] as const;

/** 星星位置（甲板寬度的百分比、離頂端 px）：固定，避免每次 render 換位置。 */
const STARS = [
  [6, 6], [17, 13], [29, 5], [41, 11], [55, 4], [66, 14], [78, 7], [91, 12],
] as const;

const SPARKS = [[22, 10], [38, 18], [50, 6], [63, 16], [80, 9]] as const;

export function CompanionWeather({ weather }: { weather: Weather }) {
  // 視窗看不到時暫停動畫：Toolbar 一直都在，背景動畫不該在背後空轉。
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return (
    <div
      className="companion-weather"
      aria-hidden
      data-sky={weather.sky}
      data-sea={weather.sea}
      data-frozen={weather.frozen || undefined}
      data-paused={weather.frozen || hidden || undefined}
      style={{ "--swell": 0.35 + 0.65 * weather.swell } as React.CSSProperties}
    >
      <div className="weather-stars">
        {STARS.map(([x, y], i) => (
          <span key={i} style={{ left: `${x}%`, top: y, animationDelay: `${(i * 0.7) % 3}s` }} />
        ))}
      </div>
      <div className="weather-sun" />

      {SEAS.map(({ sea, d, wavelength }) => (
        <div key={sea} className="weather-sea" data-layer={sea} data-on={weather.sea === sea || undefined}>
          <svg
            width={SEA_SPAN + wavelength}
            height={SEA_HEIGHT}
            style={{ "--wl": `${wavelength}px` } as React.CSSProperties}
          >
            <path d={d} />
          </svg>
        </div>
      ))}

      {weather.fx === "arc" && (
        <svg className="weather-arc" viewBox="0 0 120 40" preserveAspectRatio="xMidYMax meet">
          <path d="M 10 40 A 50 50 0 0 1 110 40" />
          <path d="M 18 40 A 42 42 0 0 1 102 40" />
          <path d="M 26 40 A 34 34 0 0 1 94 40" />
        </svg>
      )}
      {weather.fx === "sparkle" && (
        <div className="weather-sparkle">
          {SPARKS.map(([x, y], i) => (
            <span key={i} style={{ left: `${x}%`, top: y, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}
