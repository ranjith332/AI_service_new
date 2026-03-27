import { DateTime } from "luxon";

export type TimePreset = "today" | "yesterday" | "this_week" | "this_month" | "all_time" | "latest" | "custom";

export interface TimeRange {
  preset: TimePreset;
  start?: string | null;
  end?: string | null;
}

export function resolveTimeRange(range: TimeRange, timeZone: string): { start: string | null; end: string | null } {
  const now = DateTime.now().setZone(timeZone);

  switch (range.preset) {
    case "today":
      return {
        start: now.startOf("day").toUTC().toISO(),
        end: now.endOf("day").plus({ milliseconds: 1 }).toUTC().toISO()
      };
    case "yesterday": {
      const yesterday = now.minus({ days: 1 });
      return {
        start: yesterday.startOf("day").toUTC().toISO(),
        end: yesterday.endOf("day").plus({ milliseconds: 1 }).toUTC().toISO()
      };
    }
    case "this_week":
      return {
        start: now.startOf("week").toUTC().toISO(),
        end: now.endOf("week").plus({ milliseconds: 1 }).toUTC().toISO()
      };
    case "this_month":
      return {
        start: now.startOf("month").toUTC().toISO(),
        end: now.endOf("month").plus({ milliseconds: 1 }).toUTC().toISO()
      };
    case "custom":
      return {
        start: range.start ?? null,
        end: range.end ?? null
      };
    case "latest":
    case "all_time":
    default:
      return {
        start: null,
        end: null
      };
  }
}
