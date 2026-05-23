import * as React from 'react';
import { cn } from '@/lib/cn';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // Velvet Onyx: glass surface with pearl focus ring + soft inset highlight.
        // Values lifted from mockup .chat-input / .input — hsl-based opacity reads
        // slightly warmer/zinc-tinted than plain white/X.
        'flex h-10 w-full rounded-md border border-[hsla(240,8%,90%,0.08)] px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-all',
        'bg-[hsla(240,8%,70%,0.06)] backdrop-blur-[20px] backdrop-saturate-[1.4]',
        'shadow-[inset_0_1px_0_hsla(0,0%,100%,0.04),0_4px_14px_-8px_rgba(0,0,0,0.4)]',
        'hover:border-[hsla(240,8%,90%,0.14)]',
        // Suppress the default browser focus outline AND its UA box-shadow for
        // mouse-driven focus (focus-visible alone leaves the UA ring on click).
        'focus:outline-none focus-visible:outline-none',
        'focus-visible:border-[hsla(240,10%,92%,0.25)] focus-visible:bg-[hsla(240,8%,70%,0.08)]',
        'focus-visible:shadow-[0_0_0_3px_hsla(240,10%,80%,0.10),inset_0_1px_0_rgba(255,255,255,0.06),0_6px_20px_-8px_hsla(240,12%,80%,0.18)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
