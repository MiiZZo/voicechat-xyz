import { twMerge } from 'tailwind-merge';

/** Concatenates conditional className args AND deduplicates conflicting
 *  Tailwind utilities (e.g. when a caller passes `rounded-full` to a
 *  primitive whose base classes already include `rounded-md`, twMerge keeps
 *  only the caller's value). Without this, both rules end up in the DOM
 *  and CSS-cascade order decides — fragile and Tailwind-version-dependent. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
