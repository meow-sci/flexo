import { createContext, useContext } from 'react';

/**
 * The card key the live section jump asked to flash, published by `DataSection` and read by
 * whichever section body owns cards (design: design-data-engine-modes.md §A7 click-through —
 * "expands the section, scrolls to and flashes the offending card").
 *
 * A context rather than a prop so a section author does not have to thread it through every
 * intermediate list component.
 */
export const FlashedCardContext = createContext<string | undefined>(undefined);

/**
 * The card key the current section jump named, or undefined. Compare against your card's key
 * and add the `row-flash` class when they match.
 */
export function useFlashedCard(): string | undefined {
  return useContext(FlashedCardContext);
}
