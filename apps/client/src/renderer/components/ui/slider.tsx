import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/cn';

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/[0.06]">
      <SliderPrimitive.Range className="absolute h-full bg-[linear-gradient(90deg,hsl(240_6%_60%),hsl(240_6%_92%))]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        // Velvet Onyx: pearl-gradient knob with halo
        'block h-4 w-4 rounded-full border border-white/40 transition-transform',
        'bg-[linear-gradient(180deg,hsl(240_6%_98%),hsl(240_6%_80%))]',
        'shadow-[0_2px_12px_-2px_hsla(240,12%,80%,0.4),0_0_0_1px_hsla(240,6%,50%,0.3)]',
        'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
