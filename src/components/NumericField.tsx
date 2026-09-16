import { useLayoutEffect, useRef, type ChangeEvent, type ReactNode } from "react";
import { TextField, InputAdornment, type TextFieldProps } from "@mui/material";
import { groupThousands } from "../utils/format";
import { DEFAULT_CURRENCY } from "../constants";

type NumericFieldProps = Omit<TextFieldProps, "value" | "onChange" | "type"> & {
  /** Raw value: digits with at most one dot and no grouping separators. */
  value: string;
  /** Called with the raw (separator-free) value. */
  onChange: (raw: string) => void;
  /** Currency whose locale decides the grouping (INR → lakh/crore, USD → thousands). */
  currency?: string;
  /** Max fraction digits to keep; omit for unlimited. */
  maxDecimals?: number;
  /** Adornment (e.g. a currency code or "%"). */
  adornment?: ReactNode;
  adornmentPos?: "start" | "end";
};

/** Keep only digits and a single decimal point, trimming the fraction to `maxDecimals`. */
function toRaw(input: string, maxDecimals?: number): string {
  let s = input.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    let frac = s.slice(dot + 1).replace(/\./g, "");
    if (maxDecimals != null) frac = frac.slice(0, maxDecimals);
    s = s.slice(0, dot + 1) + frac;
  }
  return s;
}

/** Group the integer part for display; the fraction (and a trailing dot) is shown verbatim. */
function toDisplay(raw: string, currency?: string): string {
  if (raw === "") return "";
  const dot = raw.indexOf(".");
  const intPart = dot === -1 ? raw : raw.slice(0, dot);
  const grouped = intPart === "" ? "" : groupThousands(intPart, currency);
  return dot === -1 ? grouped : `${grouped}.${raw.slice(dot + 1)}`;
}

/**
 * A currency/number text input that groups digits live as you type (e.g. "111111" → "1,11,111")
 * while handing the parent the raw, separator-free string. A text input is used (not
 * type="number") because number inputs cannot render grouping separators; the caret is preserved
 * across reformatting by counting value characters, not raw offsets.
 */
export default function NumericField({
  value, onChange, currency = DEFAULT_CURRENCY, maxDecimals,
  adornment, adornmentPos = "start", InputProps, ...rest
}: NumericFieldProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const caretValueChars = useRef<number | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const selStart = el.selectionStart ?? el.value.length;
    // How many value chars (digits/dot) sit left of the caret — stable across reformatting.
    caretValueChars.current = el.value.slice(0, selStart).replace(/[^0-9.]/g, "").length;
    onChange(toRaw(el.value, maxDecimals));
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caretValueChars.current == null) return;
    const target = caretValueChars.current;
    caretValueChars.current = null;
    const text = el.value;
    let count = 0, pos = 0;
    while (pos < text.length && count < target) {
      if (/[0-9.]/.test(text[pos])) count++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  });

  const adornmentProps = adornment != null
    ? (adornmentPos === "start"
      ? { startAdornment: <InputAdornment position="start">{adornment}</InputAdornment> }
      : { endAdornment: <InputAdornment position="end">{adornment}</InputAdornment> })
    : {};

  return (
    <TextField
      {...rest}
      value={toDisplay(value, currency)}
      onChange={handleChange}
      type="text"
      inputMode="decimal"
      inputRef={ref}
      InputProps={{ ...adornmentProps, ...InputProps }}
    />
  );
}
