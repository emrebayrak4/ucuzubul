"use client";

import * as React from "react";

/**
 * Navigation feedback state (progress bar, pressed-link shimmer, route skeleton). A navigation starts on
 * pointerdown/click of a same-origin link (or from code, e.g. filter updates) and ends when the URL changes.
 * Tiny external store, read only by the feedback layer, which renders in its own React root (see nav-progress.tsx).
 */
export interface PressBox {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
  /** Link inside the sticky header → viewport coordinates. */
  fixed: boolean;
}

export interface NavFeedbackState {
  pending: boolean;
  /** Destination pathname (drives which skeleton is shown); null = same-page update (bar only). */
  to: string | null;
  /** performance.now() at start. */
  startedAt: number;
  /** Increments per navigation. */
  id: number;
  press: PressBox | null;
}

const initial: NavFeedbackState = { pending: false, to: null, startedAt: 0, id: 0, press: null };
let state: NavFeedbackState = initial;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startNavFeedback(to: string | null, press: PressBox | null = null): void {
  if (state.pending && state.to === to && (press === null || state.press !== null)) return;
  state = { pending: true, to, startedAt: state.pending ? state.startedAt : performance.now(), id: state.pending ? state.id : state.id + 1, press: press ?? (state.pending ? state.press : null) };
  emit();
}

export function endNavFeedback(): void {
  if (!state.pending) return;
  state = { ...state, pending: false, press: null };
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

export function useNavFeedback(): NavFeedbackState {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => initial);
}
