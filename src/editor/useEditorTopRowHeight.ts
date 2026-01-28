import { type RefObject, useLayoutEffect } from "react";

// Computes a safe top-row height so the bottom info cards stay in view.
type EditorLayoutRefs = {
  shellRef: RefObject<HTMLElement>;
  headerRef: RefObject<HTMLElement>;
  layoutRef: RefObject<HTMLElement>;
  railRef: RefObject<HTMLElement>;
  infoRef: RefObject<HTMLElement>;
};

const parsePx = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readGap = (style: CSSStyleDeclaration) => {
  const rowGap = parsePx(style.rowGap);
  if (rowGap > 0) {
    return rowGap;
  }
  return parsePx(style.gap);
};

export const useEditorTopRowHeight = ({
  shellRef,
  headerRef,
  layoutRef,
  railRef,
  infoRef
}: EditorLayoutRefs) => {
  useLayoutEffect(() => {
    const shellEl = shellRef.current;
    const headerEl = headerRef.current;
    const layoutEl = layoutRef.current;
    const railEl = railRef.current;
    const infoEl = infoRef.current;

    if (!shellEl || !headerEl || !layoutEl || !railEl || !infoEl) {
      return;
    }

    let frameId = 0;

    const measure = () => {
      frameId = 0;

      const shellStyle = window.getComputedStyle(shellEl);
      const layoutStyle = window.getComputedStyle(layoutEl);
      const shellPaddingTop = parsePx(shellStyle.paddingTop);
      const shellPaddingBottom = parsePx(shellStyle.paddingBottom);
      const layoutRowGap = readGap(layoutStyle);

      const shellRect = shellEl.getBoundingClientRect();
      const shellTopOffset = Math.max(0, shellRect.top);
      const viewportHeight = window.innerHeight;
      const usableHeight = viewportHeight - shellTopOffset;

      const infoHeight = infoEl.getBoundingClientRect().height;
      const railHeight = railEl.getBoundingClientRect().height;

      const availableTopRow =
        usableHeight -
        shellPaddingTop -
        shellPaddingBottom -
        infoHeight -
        layoutRowGap;

      // Never let the preview be shorter than the rail; overflow the info row instead.
      const topRowHeight = Math.max(railHeight, availableTopRow, 0);

      layoutEl.style.setProperty(
        "--editor-top-row-height",
        `${Math.round(topRowHeight)}px`
      );
      layoutEl.style.setProperty(
        "--editor-rail-height",
        `${Math.round(railHeight)}px`
      );
    };

    const scheduleMeasure = () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(measure);
    };

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(shellEl);
    observer.observe(headerEl);
    observer.observe(railEl);
    observer.observe(infoEl);

    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [shellRef, headerRef, layoutRef, railRef, infoRef]);
};

export default useEditorTopRowHeight;
