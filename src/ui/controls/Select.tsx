import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import SelectMenu from "@/ui/controls/select/SelectMenu";
import {
  createSelectKeyHandler,
  findFirstEnabledIndex
} from "@/ui/controls/select/selectKeyboard";
import { buildMenuStyle, type MenuStyle } from "@/ui/controls/select/selectPosition";

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

const cx = (...values: Array<string | undefined>) =>
  values.filter(Boolean).join(" ");

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

  const handleOptionSelect = useCallback(
    (nextValue: string, isDisabled?: boolean) => {
      if (isDisabled) {
        return;
      }
      if (nextValue !== value) {
        onChange(nextValue);
      }
      closeMenu();
      triggerRef.current?.focus();
    },
    [closeMenu, onChange, value]
  );

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

  const handleKeyDown = useMemo(
    () =>
      createSelectKeyHandler({
        disabled,
        isOpen,
        options,
        highlightedIndex,
        openMenu,
        closeMenu,
        onSelect: handleOptionSelect,
        setHighlightedIndex
      }),
    [
      closeMenu,
      disabled,
      handleOptionSelect,
      highlightedIndex,
      isOpen,
      openMenu,
      options
    ]
  );

  const menu = isOpen && menuStyle ? (
    <SelectMenu
      menuStyle={menuStyle}
      options={options}
      value={value}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
      menuRef={menuRef}
      customInputRef={customInputRef}
      customInput={customInput}
      isCustomEditing={isCustomEditing}
      onOptionSelect={handleOptionSelect}
      onHighlightIndex={setHighlightedIndex}
      onCustomActivate={handleCustomActivate}
      onCustomCommit={commitCustomValue}
      onCloseMenu={closeMenu}
    />
  ) : null;

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
