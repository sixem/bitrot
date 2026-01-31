// Keyboard navigation helpers for the custom select control.
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import type { SelectOption } from "@/ui/controls/Select";

export const findEnabledIndex = (
  options: SelectOption[],
  start: number,
  delta: number
) => {
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

export const findFirstEnabledIndex = (options: SelectOption[]) =>
  options.findIndex((option) => !option.disabled);

export const findLastEnabledIndex = (options: SelectOption[]) => {
  for (let i = options.length - 1; i >= 0; i -= 1) {
    if (!options[i].disabled) {
      return i;
    }
  }
  return -1;
};

type KeyHandlerArgs = {
  disabled?: boolean;
  isOpen: boolean;
  options: SelectOption[];
  highlightedIndex: number | null;
  openMenu: () => void;
  closeMenu: () => void;
  onSelect: (value: string, isDisabled?: boolean) => void;
  setHighlightedIndex: Dispatch<SetStateAction<number | null>>;
};

export const createSelectKeyHandler = ({
  disabled,
  isOpen,
  options,
  highlightedIndex,
  openMenu,
  closeMenu,
  onSelect,
  setHighlightedIndex
}: KeyHandlerArgs) => {
  return (event: KeyboardEvent<HTMLButtonElement>) => {
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
          onSelect(option.value, option.disabled);
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
};
