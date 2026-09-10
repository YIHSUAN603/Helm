import { FitAddon } from "@xterm/addon-fit";
import { canFit } from "./fitGuard";

/** 所有 fit 路徑（含延遲回呼）都以執行當下的容器尺寸為準。 */
export class VisibleFitAddon extends FitAddon {
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    super();
    this.container = container;
  }

  override fit(): void {
    if (!canFit({ width: this.container.clientWidth, height: this.container.clientHeight })) {
      return;
    }
    super.fit();
  }
}
