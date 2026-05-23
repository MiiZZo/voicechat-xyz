import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/cn';
import bratokAvatar from '../../assets/avatars/bratok.webp';

/** Maps a (display) name to a custom avatar image URL, or null if no custom one. */
const CUSTOM_AVATARS: Record<string, string> = {
  bratok: bratokAvatar,
};

export function customAvatar(name: string): string | null {
  return CUSTOM_AVATARS[name.trim().toLowerCase()] ?? null;
}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full object-cover', className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      // No default text color — vo-avatar-N classes set it (color matches
      // mockup .tile-avatar: dark var(--bg) on light pearl gradient bg).
      // If no vo-avatar-N is passed, text inherits from parent.
      'flex h-full w-full items-center justify-center rounded-full bg-bg-muted font-medium',
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

/** Velvet Onyx: deterministic neutral-zinc gradient per name. 7 hue-shifted
 *  variants all stay in the cool/neutral range (no warm primary colors) so the
 *  chat reads as one calm surface. Defined as CSS classes in index.css. */
export function avatarColor(name: string): string {
  const palette = [
    'vo-avatar-1', 'vo-avatar-2', 'vo-avatar-3', 'vo-avatar-4',
    'vo-avatar-5', 'vo-avatar-6', 'vo-avatar-7',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length]!;
}

export { Avatar, AvatarImage, AvatarFallback };
