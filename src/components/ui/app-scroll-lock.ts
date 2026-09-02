type ScrollLockSnapshot = {
  overflow: string;
  paddingRight: string;
  target: HTMLElement;
};

let appScrollLockCount = 0;
let appScrollLockSnapshot: ScrollLockSnapshot | null = null;

export function getScrollbarWidth(viewportWidth: number, documentWidth: number) {
  return Math.max(0, viewportWidth - documentWidth);
}

export function getAppScrollContainer() {
  const main = document.getElementById("main-content");
  return main && window.getComputedStyle(main).overflowY !== "visible" ? main : document.body;
}

function getScrollContainerScrollbarWidth(container: HTMLElement) {
  if (window.getComputedStyle(container).scrollbarGutter.includes("stable")) return 0;

  if (container === document.body) {
    return getScrollbarWidth(window.innerWidth, document.documentElement.clientWidth);
  }

  const styles = window.getComputedStyle(container);
  const borderWidth = Number.parseFloat(styles.borderLeftWidth) + Number.parseFloat(styles.borderRightWidth);
  return Math.max(0, container.offsetWidth - container.clientWidth - borderWidth);
}

export function lockAppScroll() {
  if (appScrollLockCount > 0) {
    appScrollLockCount += 1;
    return;
  }

  const target = getAppScrollContainer();
  const scrollbarWidth = getScrollContainerScrollbarWidth(target);
  appScrollLockSnapshot = {
    target,
    overflow: target.style.overflow,
    paddingRight: target.style.paddingRight,
  };

  target.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    const currentPadding = Number.parseFloat(window.getComputedStyle(target).paddingRight);
    target.style.paddingRight = `${(Number.isNaN(currentPadding) ? 0 : currentPadding) + scrollbarWidth}px`;
  }
  appScrollLockCount = 1;
}

export function unlockAppScroll() {
  if (appScrollLockCount === 0) return;
  appScrollLockCount -= 1;
  if (appScrollLockCount > 0 || !appScrollLockSnapshot) return;

  const { overflow, paddingRight, target } = appScrollLockSnapshot;
  target.style.overflow = overflow;
  target.style.paddingRight = paddingRight;
  appScrollLockSnapshot = null;
}
