import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      // Velvet Onyx: gradient track + pearl halo on active state
      'peer inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full border transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=unchecked]:bg-[linear-gradient(180deg,hsl(240_4%_14%),hsl(240_4%_10%))] data-[state=unchecked]:border-white/10',
      'data-[state=checked]:bg-[linear-gradient(180deg,hsl(240_6%_92%),hsl(240_6%_70%))] data-[state=checked]:border-transparent',
      'data-[state=checked]:shadow-[0_2px_12px_-2px_hsla(240,12%,80%,0.4)]',
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full ring-0 transition-transform',
        'data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0.5',
        'data-[state=unchecked]:bg-[linear-gradient(180deg,hsl(240_4%_60%),hsl(240_4%_38%))]',
        'data-[state=checked]:bg-[linear-gradient(180deg,hsl(240_6%_8%),hsl(240_8%_4%))]',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
