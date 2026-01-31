// Menu placement helpers for the custom select control.

export type MenuStyle = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const MENU_MAX_HEIGHT = 240;
const MENU_MIN_HEIGHT = 120;
const MENU_GUTTER = 8;
const MENU_GAP = 6;

export const buildMenuStyle = (triggerRect: DOMRect): MenuStyle => {
  const availableBelow = Math.max(
    0,
    window.innerHeight - triggerRect.bottom - MENU_GAP - MENU_GUTTER
  );
  const availableAbove = Math.max(0, triggerRect.top - MENU_GAP - MENU_GUTTER);
  const openUpwards =
    availableBelow < MENU_MIN_HEIGHT && availableAbove > availableBelow;
  const width = triggerRect.width;
  const left = Math.min(
    Math.max(MENU_GUTTER, triggerRect.left),
    window.innerWidth - width - MENU_GUTTER
  );

  if (openUpwards) {
    const maxHeight = Math.min(MENU_MAX_HEIGHT, availableAbove);
    return {
      width,
      left,
      maxHeight,
      top: triggerRect.top - MENU_GAP - maxHeight
    };
  }

  const maxHeight = Math.min(MENU_MAX_HEIGHT, availableBelow);
  return {
    width,
    left,
    maxHeight,
    top: triggerRect.bottom + MENU_GAP
  };
};
