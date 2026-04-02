import dayjs from "dayjs-ext";
import { BadRequestError } from "./errors.ts";

export function resolveDateRange(dateKeyword: string | undefined): {
  start: string;
  end: string;
} {
  const now = dayjs();
  let start = now.startOf("day");
  let end = now.endOf("day");

  if (!dateKeyword) {
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  const k = dateKeyword.toLowerCase();

  if (k.includes("today")) {
    // Current day
  } else if (k.includes("yesterday")) {
    start = now.subtract(1, "day").startOf("day");
    end = now.subtract(1, "day").endOf("day");
  } else if (k.includes("week") && k.includes("last")) {
    start = now.subtract(1, "week").startOf("week");
    end = now.subtract(1, "week").endOf("week");
  } else if (k.includes("month") && k.includes("last")) {
    start = now.subtract(1, "month").startOf("month");
    end = now.subtract(1, "month").endOf("month");
  } else if (k.includes("tomorrow")) {
    start = now.add(1, "day").startOf("day");
    end = now.add(1, "day").endOf("day");
  } else if (k.match(/\d{4}-\d{2}-\d{2}/)) {
    const specificDate = dayjs(k);
    if (!specificDate.isValid()) {
      throw new BadRequestError(`Invalid date format: ${dateKeyword}`);
    }
    start = specificDate.startOf("day");
    end = specificDate.endOf("day");
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
