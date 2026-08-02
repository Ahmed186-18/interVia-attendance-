"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { ChevronDownIcon, CheckIcon } from "@/components/icons";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export default function SelectField({
  value,
  onChange,
  options,
  placeholder = "اختر...",
  className = "",
  required = false,
}: SelectFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((o) => o.value === value);

  const close = useCallback(() => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [close]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlighted) {
        highlighted.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(value ? options.findIndex((o) => o.value === value) : 0);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (highlightedIndex >= 0) {
          onChange(options[highlightedIndex].value);
          close();
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`
          w-full px-4 py-3 rounded-xl border bg-white text-right
          flex items-center justify-between gap-2
          transition-all duration-200 cursor-pointer
          focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/10
          hover:border-navy-200
          ${isOpen ? "border-teal ring-2 ring-teal/10" : "border-tint-200"}
          ${selectedOption ? "text-navy" : "text-muted/60"}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-required={required}
      >
        <span className="truncate text-sm">{selectedOption?.label || placeholder}</span>
        <ChevronDownIcon
          size={16}
          className={`text-muted flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1.5 w-full bg-white border border-tint-200 rounded-xl shadow-soft-md max-h-60 overflow-y-auto animate-scale-in"
        >
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted text-center">لا توجد خيارات</div>
          ) : (
            options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer
                    transition-colors duration-100
                    ${isHighlighted ? "bg-tint" : ""}
                    ${isSelected ? "text-teal font-semibold" : "text-navy"}
                    ${index === 0 ? "rounded-t-xl" : ""}
                    ${index === options.length - 1 ? "rounded-b-xl" : ""}
                  `}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <CheckIcon size={14} className="text-teal flex-shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
