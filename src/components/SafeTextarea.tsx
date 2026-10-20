import { forwardRef, useEffect, useRef, useState, type TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & { value: string; onValueChange: (v: string) => void };

/**
 * A text box that is safe for phone keyboards' voice typing and predictive text. Those keyboards edit a "composing" stretch of text again and again; if the
 * page rewrites the box's value while that happens, words come out doubled ("whatwhatwhat"). This box keeps its own copy of the text while the keyboard is
 * composing, tells the page only when the keyboard is done (and when the box loses focus), and takes the page's value back only when it really changed.
 */
const SafeTextarea = forwardRef<HTMLTextAreaElement, Props>(function SafeTextarea({ value, onValueChange, onBlur, ...rest }, ref) {
  const [local, setLocal] = useState(value);
  const composing = useRef(false);
  const last = useRef(value);
  useEffect(() => { if (!composing.current && value !== last.current) { last.current = value; setLocal(value); } }, [value]);
  const push = (v: string) => { last.current = v; onValueChange(v); };
  return (
    <textarea
      {...rest}
      ref={ref}
      value={local}
      onChange={(e) => { const v = e.target.value; setLocal(v); if (!composing.current) push(v); }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => { composing.current = false; const v = e.currentTarget.value; setLocal(v); push(v); }}
      onBlur={(e) => { if (composing.current) { composing.current = false; } if (e.currentTarget.value !== last.current) push(e.currentTarget.value); onBlur?.(e); }}
    />
  );
});

export default SafeTextarea;
