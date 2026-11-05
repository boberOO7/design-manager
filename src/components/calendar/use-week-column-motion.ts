"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import type { TimedWeekLayoutSegment } from "@/lib/calendar";

type Columns = ReadonlyMap<string, Pick<TimedWeekLayoutSegment, "column" | "columnCount">>;
type Position = { left: number; width: number };
type Frame = { element: HTMLElement; target: Position; animation?: Animation };
const position = (column: number, count: number): Position => ({ left: column / count * 100, width: 100 / count });
const styles = ({ left, width }: Position) => ({ left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)` });

/** Rebase the whole group together; independent CSS transitions shorten reversals differently. */
export function useWeekColumnMotion(container: RefObject<HTMLDivElement | null>, segments: TimedWeekLayoutSegment[], columns: Columns | null, editingKey: string | null) {
  const frames = useRef(new Map<string, Frame>());
  useLayoutEffect(() => {
    const elements = new Map(Array.from(container.current?.querySelectorAll<HTMLElement>("[data-week-segment]") ?? [], (element) => [element.dataset.weekSegment, element]));
    // Read every interrupted animation before cancelling any of them.
    const next = segments.filter((segment) => segment.itemId !== editingKey).flatMap((segment) => {
      const element = elements.get(segment.segmentId);
      if (!element) return [];
      const placement = columns?.get(segment.segmentId) ?? segment;
      const target = position(placement.column, placement.columnCount);
      const previous = frames.current.get(segment.segmentId);
      const parentWidth = element.parentElement?.clientWidth ?? 0;
      let from = previous?.target ?? target;
      if (previous?.animation?.playState === "running") {
        const computed = getComputedStyle(element);
        if (parentWidth) from = { left: (parseFloat(computed.left) - 2) / parentWidth * 100, width: (parseFloat(computed.width) + 4) / parentWidth * 100 };
      }
      return [{ segment, element, from, target, parentWidth }];
    });
    const instantDays = new Set<string>();
    for (let i = 0; i < next.length; i++) for (let j = i + 1; j < next.length; j++) {
      const a = next[i], b = next[j];
      if (a.segment.date !== b.segment.date || a.segment.endMinute <= b.segment.startMinute || b.segment.endMinute <= a.segment.startMinute) continue;
      const before = a.from.left < b.from.left;
      const after = a.target.left < b.target.left;
      const left = before ? a.from : b.from, right = before ? b.from : a.from;
      // A lane swap has no collision-free horizontal path; apply that topology change atomically.
      if (before !== after || left.left + left.width > right.left + (a.parentWidth ? 4 / a.parentWidth * 100 : 0)) instantDays.add(a.segment.date);
    }
    for (const frame of frames.current.values()) frame.animation?.cancel();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startTime = document.timeline.currentTime;
    frames.current = new Map(next.map(({ segment, element, from, target }) => {
      const frame: Frame = { element, target };
      if (!reduced && !instantDays.has(segment.date) && (Math.abs(from.left - target.left) > 0.001 || Math.abs(from.width - target.width) > 0.001)) {
        frame.animation = element.animate([styles(from), styles(target)], { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" });
        frame.animation.startTime = startTime;
      }
      return [segment.segmentId, frame];
    }));
  }, [container, segments, columns, editingKey]);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => { for (const frame of frames.current.values()) frame.animation?.cancel(); };
    const motionChanged = () => { if (media.matches) finish(); };
    media.addEventListener("change", motionChanged);
    return () => { media.removeEventListener("change", motionChanged); finish(); frames.current.clear(); };
  }, []);
}
