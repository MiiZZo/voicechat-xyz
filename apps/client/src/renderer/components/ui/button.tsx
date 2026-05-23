import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Velvet Onyx: default = pearl gradient with inset highlight + halo glow.
        default:
          'bg-[linear-gradient(180deg,hsl(240_6%_98%)_0%,hsl(240_6%_84%)_100%)] text-bg ' +
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_24px_-10px_hsla(240,12%,80%,0.35)] ' +
          'hover:bg-[linear-gradient(180deg,hsl(240_6%_100%)_0%,hsl(240_6%_88%)_100%)] ' +
          'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_12px_32px_-10px_hsla(240,12%,80%,0.4)]',
        // Accent — alias for default (kept for back-compat in places using variant="accent").
        accent:
          'bg-[linear-gradient(180deg,hsl(240_6%_98%)_0%,hsl(240_6%_84%)_100%)] text-bg ' +
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_24px_-10px_hsla(240,12%,80%,0.35)] ' +
          'hover:bg-[linear-gradient(180deg,hsl(240_6%_100%)_0%,hsl(240_6%_88%)_100%)]',
        destructive:
          'bg-[linear-gradient(180deg,hsl(346_77%_49%)_0%,hsl(346_70%_36%)_100%)] text-fg ' +
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_20px_-8px_hsla(346,77%,49%,0.5)] ' +
          'hover:bg-[linear-gradient(180deg,hsl(346_80%_54%)_0%,hsl(346_70%_40%)_100%)]',
        // Velvet Onyx outline = mockup .mset-btn — gradient bg + hairline-strong border
        outline:
          'border border-white/10 text-fg ' +
          'bg-[linear-gradient(180deg,hsl(240_4%_14%)_0%,hsl(240_4%_10%)_100%)] ' +
          'hover:border-white/[0.14] ' +
          'hover:bg-[linear-gradient(180deg,hsl(240_4%_18%)_0%,hsl(240_4%_12%)_100%)]',
        // Secondary — glass surface with subtle border.
        secondary:
          'border border-white/10 bg-white/[0.05] text-fg backdrop-blur ' +
          'hover:bg-white/[0.10] hover:border-white/20',
        // Tool — for the floating dock. NO backdrop blur (dock provides its own),
        // dark inner gradient, hover lifts to lighter zinc.
        tool:
          'border border-transparent text-fg-muted ' +
          'bg-[linear-gradient(180deg,hsla(240,6%,22%,0.5)_0%,hsla(240,6%,10%,0.5)_100%)] ' +
          // No hover border — a 1px white border on a rounded-full circle
          // against a dark dock reads as a "thin white line at the bottom"
          // due to anti-aliasing on the curve. Brighter bg + brighter icon
          // alone are enough hover feedback.
          'hover:text-fg ' +
          'hover:bg-[linear-gradient(180deg,hsla(240,10%,28%,0.6)_0%,hsla(240,8%,14%,0.6)_100%)]',
        ghost:
          'text-fg-muted hover:bg-white/[0.06] hover:text-fg',
        link: 'text-fg underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-6',
        icon: 'h-9 w-9',
        'icon-lg': 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
