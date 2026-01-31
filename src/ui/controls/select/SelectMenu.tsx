import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { SelectCustomInput, SelectOption } from "@/ui/controls/Select";
import type { MenuStyle } from "@/ui/controls/select/selectPosition";

type SelectMenuProps = {
  menuStyle: MenuStyle;
  options: SelectOption[];
  value: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  menuRef: RefObject<HTMLDivElement>;
  customInputRef: RefObject<HTMLInputElement>;
  customInput?: SelectCustomInput;
  isCustomEditing: boolean;
  onOptionSelect: (value: string, isDisabled?: boolean) => void;
  onHighlightIndex: (index: number) => void;
  onCustomActivate: () => void;
  onCustomCommit: () => void;
  onCloseMenu: () => void;
};

// Renders the dropdown menu + optional custom input row for Select.
const SelectMenu = ({
  menuStyle,
  options,
  value,
  ariaLabel,
  ariaLabelledBy,
  menuRef,
  customInputRef,
  customInput,
  isCustomEditing,
  onOptionSelect,
  onHighlightIndex,
  onCustomActivate,
  onCustomCommit,
  onCloseMenu
}: SelectMenuProps) => {
  return createPortal(
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
          onClick={() => onOptionSelect(option.value, option.disabled)}
          onMouseEnter={() => onHighlightIndex(index)}
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
              onClick={onCustomActivate}
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
                    onCustomCommit();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onCloseMenu();
                  }
                }}
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget as Node | null;
                  if (nextTarget && menuRef.current?.contains(nextTarget)) {
                    return;
                  }
                  onCustomCommit();
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
  );
};

export default SelectMenu;
