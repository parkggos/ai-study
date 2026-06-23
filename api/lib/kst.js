function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function getKstParts(dateInput = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(toDate(dateInput));

  const pick = (type) => parts.find((part) => part.type === type)?.value || "00";
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

function formatKstDateTime(dateInput = new Date()) {
  const { year, month, day, hour, minute, second } = getKstParts(dateInput);
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatKstIso(dateInput = new Date()) {
  const { year, month, day, hour, minute, second } = getKstParts(dateInput);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`;
}

function normalizeKstDbValue(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return value.replace("T", " ").replace(/\+.*$/, "").replace(/\.\d+$/, "").slice(0, 19);
  }
  return formatKstDateTime(value);
}

module.exports = { formatKstDateTime, formatKstIso, normalizeKstDbValue };
