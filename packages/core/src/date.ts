// Date formatting helpers. The output format is:
//   line 1:  "21 May 2026"   (day month year, no ordinal)
//   line 2:  "Monday"        (full weekday name)
// And a filename slug like "21 may 2026 monday".

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** Parse "YYYY-MM-DD" or fall through if it's already a Date. Returns local-tz Date. */
export function parseDate(input: string | Date | undefined): Date {
  if (input instanceof Date) return input;
  if (!input) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) throw new Error(`Invalid date "${input}", expected YYYY-MM-DD`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Construct as local midnight so the weekday matches the user's tz.
  const dt = new Date(y, mo - 1, d);
  // Guard against rollover (e.g. month=13 silently becoming Jan next year).
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    throw new Error(`Invalid date "${input}" (month/day out of range)`);
  }
  return dt;
}

export interface FormattedDate {
  /** Line shown above the day. e.g. "21 May 2026" */
  dateLine: string;
  /** Line shown below. e.g. "Monday" */
  dayLine: string;
  /** Filename-safe slug. e.g. "21 may 2026 monday" */
  filenameSlug: string;
}

export function formatDate(d: Date): FormattedDate {
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const weekday = DAYS[d.getDay()];
  return {
    dateLine: `${day} ${month} ${year}`,
    dayLine: weekday,
    filenameSlug: `${day} ${month.toLowerCase()} ${year} ${weekday.toLowerCase()}`,
  };
}
