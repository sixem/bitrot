import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type SelectCustomInput = {
  valueKey: string;
  label: string;
  displayLabel?: string;
  value: string;
  placeholder?: string;
  unit?: string;
  onValueChange: (value: string) => void;
  onCommit: (value: string) => void;
};

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  customInput?: SelectCustomInput;
  customInputActive?: boolean;
};

type MenuStyle = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const MENU_MAX_HEIGHT = 240;
const MENU_MIN_HEIGHT = 120;
const MENU_GUTTER = 8;
const MENU_GAP = 6;

const cx = (...values: Array<string | undefined>) =>
  values.filter(Boolean).join(" ");

const findEnabledIndex = (options: SelectOption[], start: number, delta: number) => {
  if (options.length === 0) {
    return null;
  }
  let index = start;
  for (let i = 0; i < options.length; i += 1) {
    index = (index + delta + options.length) % options.length;
    if (!options[index].disabled) {
      return index;
    }
  }
  return null;
};

const findFirstEnabledIndex = (options: SelectOption[]) =>
  options.findIndex((option) => !option.disabled);

const findLastEnabledIndex = (options: SelectOption[]) => {
  for (let i = options.length - 1; i >= 0; i -= 1) {
    if (!options[i].disabled) {
      return i;
    }
  }
  return -1;
};

const buildMenuStyle = (triggerRect: DOMRect): MenuStyle => {
  const availableBelow = Math.max(
    0,
    window.innerHeight - triggerRect.bottom - MENU_GAP - MENU_GUTTER
  );
  const availableAbove = Math.max(0, triggerRect.top - MENU_GAP - MENU_GUTTER);
  const openUpwards = availableBelow < MENU_MIN_HEIGHT && availableAbove > availableBelow;
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

// Reusable custom select that mirrors native behavior with a styled listbox.
const Select = ({
  value,
  options,
  onChange,
  className,
  disabled,
  ariaLabel,
  ariaLabelledBy,
  customInput,
  customInputActive
}: SelectProps) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [isCustomEditing, setIsCustomEditing] = useState(false);

  const selectedOption = useMemo(
    () =>
      options.find((option) => option.value === value) ??
      (customInput && value === customInput.valueKey
        ? {
            value: customInput.valueKey,
            label: customInput.displayLabel ?? customInput.label
          }
        : options[0]) ??
      { value, label: value ?? "--" },
    [customInput, options, value]
  );

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) {
      return;
    }
    setIsOpen(true);
  }, [disabled]);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }
    setMenuStyle(buildMenuStyle(triggerRef.current.getBoundingClientRect()));
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    updateMenuPosition();
    const isEventInside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))) {
        return true;
      }
      const path = event.composedPath?.() ?? [];
      return (
        path.includes(triggerRef.current as EventTarget) ||
        path.includes(menuRef.current as EventTarget)
      );
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isEventInside(event)) {
        return;
      }
      closeMenu();
    };
    const handleScroll = (event: Event) => {
      if (isEventInside(event)) {
        return;
      }
      closeMenu();
    };
    const handleResize = () => closeMenu();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [closeMenu, isOpen, updateMenuPosition]);

  useEffect(() => {
    if (disabled && isOpen) {
      closeMenu();
    }
  }, [closeMenu, disabled, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const selectedIndex =
      options.findIndex((option) => option.value === value && !option.disabled) ??
      -1;
    const nextIndex =
      selectedIndex >= 0 ? selectedIndex : findFirstEnabledIndex(options);
    setHighlightedIndex(nextIndex >= 0 ? nextIndex : null);
  }, [isOpen, options, value]);

  useEffect(() => {
    if (!isOpen || highlightedIndex === null) {
      return;
    }
    const node = menuRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${highlightedIndex}"]`
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsCustomEditing(false);
      return;
    }
    if (customInputActive) {
      setIsCustomEditing(true);
    }
  }, [customInputActive, isOpen]);

  useEffect(() => {
    if (!isOpen || !isCustomEditing) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      customInputRef.current?.focus();
      customInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [isCustomEditing, isOpen]);

  const handleTriggerClick = () => {
    if (disabled) {
      return;
    }
    setIsOpen((prev) => !prev);
  };

  const handleOptionSelect = (nextValue: string, isDisabled?: boolean) => {
    if (isDisabled) {
      return;
    }
    if (nextValue !== value) {
      onChange(nextValue);
    }
    closeMenu();
    triggerRef.current?.focus();
  };

  const handleCustomActivate = () => {
    if (!customInput) {
      return;
    }
    if (customInput.valueKey !== value) {
      onChange(customInput.valueKey);
    }
    setHighlightedIndex(null);
    setIsCustomEditing(true);
  };

  const commitCustomValue = () => {
    if (!customInput) {
      return;
    }
    customInput.onCommit(customInput.value);
    closeMenu();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!isOpen) {
          openMenu();
          return;
        }
        setHighlightedIndex((prev) => {
          const start = prev ?? -1;
          return findEnabledIndex(options, start, 1);
        });
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (!isOpen) {
          openMenu();
          return;
        }
        setHighlightedIndex((prev) => {
          const start = prev ?? options.length;
          return findEnabledIndex(options, start, -1);
        });
        return;
      }
      case "Home": {
        event.preventDefault();
        setHighlightedIndex(findFirstEnabledIndex(options));
        if (!isOpen) {
          openMenu();
        }
        return;
      }
      case "End": {
        event.preventDefault();
        setHighlightedIndex(findLastEnabledIndex(options));
        if (!isOpen) {
          openMenu();
        }
        return;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (!isOpen) {
          openMenu();
          return;
        }
        if (highlightedIndex === null) {
          closeMenu();
          return;
        }
        const option = options[highlightedIndex];
        if (option) {
          handleOptionSelect(option.value, option.disabled);
        }
        return;
      }
      case "Escape": {
        if (isOpen) {
          event.preventDefault();
          closeMenu();
        }
        return;
      }
      default:
        break;
    }
  };

  const menu = isOpen && menuStyle
    ? createPortal(
        <div
          className="ui-select-menu scrollable"
          style={{
            top: `${menuStyle.top}px`,
            left: `${menuStyle.left}px`,
            width: `${menuStyle.width}px`,
            maxHeight: `${menuStyle.maxHeight}px`
          }}
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          ref={menuRef}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              className="ui-select-option"
              role="option"
              aria-selected={option.value === value}
              data-selected={option.value === value}
              data-disabled={option.disabled}
              data-option-index={index}
              disabled={option.disabled}
              onClick={() => handleOptionSelect(option.value, option.disabled)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {option.label}
            </button>
          ))}
          {customInput && (
            <div className="ui-select-custom" data-active={isCustomEditing}>
              {!isCustomEditing ? (
                <button
                  type="button"
                  className="ui-select-option ui-select-custom-toggle"
                  onClick={handleCustomActivate}
                >
                  <span className="ui-select-custom-label">{customInput.label}</span>
                  {customInput.value ? (
                    <span className="ui-select-custom-value">
                      {customInput.value}
                      {customInput.unit ? ` ${customInput.unit}` : ""}
                    </span>
                  ) : null}
                </button>
              ) : (
                <div className="ui-select-custom-input">
                  <input
                    ref={customInputRef}
                    className="ui-select-custom-field"
                    type="number"
                    inputMode="numeric"
                    value={customInput.value}
                    placeholder={customInput.placeholder}
                    onChange={(event) => customInput.onValueChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitCustomValue();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        closeMenu();
                      }
                    }}
                    onBlur={(event) => {
                      const nextTarget = event.relatedTarget as Node | null;
                      if (nextTarget && menuRef.current?.contains(nextTarget)) {
                        return;
                      }
                      commitCustomValue();
                    }}
                  />
                  {customInput.unit ? (
                    <span className="ui-select-custom-unit">{customInput.unit}</span>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="ui-select" data-open={isOpen} data-disabled={disabled}>
      <button
        ref={triggerRef}
        type="button"
        className={cx("ui-select-trigger", className)}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
      >
        <span className="ui-select-value">
          {selectedOption?.label ?? value ?? "--"}
        </span>
      </button>
      {menu}
    </div>
  );
};

export default Select;
