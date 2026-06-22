const STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

const STEM_ELEMENT = {
  갑: "목", 을: "목", 병: "화", 정: "화", 무: "토", 기: "토", 경: "금", 신: "금", 임: "수", 계: "수",
};

const BRANCH_ELEMENT = {
  자: "수", 축: "토", 인: "목", 묘: "목", 진: "토", 사: "화", 오: "화", 미: "토", 신: "금", 유: "금", 술: "토", 해: "수",
};

const SOLAR_TERMS = [
  { month: 1, day: 6, index: 11 },
  { month: 2, day: 4, index: 0 },
  { month: 3, day: 6, index: 1 },
  { month: 4, day: 5, index: 2 },
  { month: 5, day: 6, index: 3 },
  { month: 6, day: 6, index: 4 },
  { month: 7, day: 7, index: 5 },
  { month: 8, day: 8, index: 6 },
  { month: 9, day:  8, index: 7 },
  { month: 10, day: 8, index: 8 },
  { month: 11, day: 7, index: 9 },
  { month: 12, day: 7, index: 10 },
];

function mod(n, m) {
  return ((n % m) + m) % m;
}

function parseBirthDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  if (year < 1900 || year > new Date().getFullYear()) return null;
  return { year, month, day, date };
}

function isBeforeSolarBoundary(year, month, day, termMonth, termDay) {
  if (month < termMonth) return true;
  if (month > termMonth) return false;
  return day < termDay;
}

function getSolarMonthIndex(year, month, day) {
  let index = 10;
  for (const term of SOLAR_TERMS) {
    if (month > term.month || (month === term.month && day >= term.day)) {
      index = term.index;
    }
  }
  return index;
}

function getYearPillar(year, month, day) {
  let sajuYear = year;
  if (isBeforeSolarBoundary(year, month, day, 2, 4)) {
    sajuYear -= 1;
  }
  const stem = STEMS[mod(sajuYear - 4, 10)];
  const branch = BRANCHES[mod(sajuYear - 4, 12)];
  return { stem, branch, sajuYear, label: `${stem}${branch}` };
}

function getMonthStemIndex(yearStem) {
  const table = {
    갑: 2, 기: 2,
    을: 4, 경: 4,
    병: 6, 신: 6,
    정: 8, 임: 8,
    무: 0, 계: 0,
  };
  return table[yearStem];
}

function getMonthPillar(yearStem, solarMonthIndex) {
  const monthBranch = BRANCHES[mod(solarMonthIndex + 2, 12)];
  const monthStem = STEMS[mod(getMonthStemIndex(yearStem) + solarMonthIndex, 10)];
  return { stem: monthStem, branch: monthBranch, label: `${monthStem}${monthBranch}` };
}

function getDayPillar(date) {
  const ref = new Date(1984, 1, 2);
  const diffDays = Math.floor((date - ref) / 86400000);
  const idx = mod(diffDays, 60);
  const stem = STEMS[idx % 10];
  const branch = BRANCHES[idx % 12];
  return { stem, branch, label: `${stem}${branch}` };
}

function countElements(pillars) {
  const counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  pillars.forEach(({ stem, branch }) => {
    counts[STEM_ELEMENT[stem]] += 1;
    counts[BRANCH_ELEMENT[branch]] += 1;
  });
  return counts;
}

function buildSajuProfile({ gender, birthDate }) {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) {
    throw new Error("생년월일 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해 주세요.");
  }
  if (gender !== "male" && gender !== "female") {
    throw new Error("성별은 male 또는 female 이어야 합니다.");
  }

  const year = getYearPillar(parsed.year, parsed.month, parsed.day);
  const solarMonthIndex = getSolarMonthIndex(parsed.year, parsed.month, parsed.day);
  const month = getMonthPillar(year.stem, solarMonthIndex);
  const day = getDayPillar(parsed.date);
  const pillars = [
    { name: "년주", ...year },
    { name: "월주", ...month },
    { name: "일주", ...day },
  ];
  const elements = countElements(pillars);
  const lacking = Object.entries(elements)
    .filter(([, count]) => count === 0)
    .map(([name]) => name);
  const strong = Object.entries(elements)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count >= 3)
    .map(([name]) => name);

  return {
    gender: gender === "male" ? "남성" : "여성",
    genderCode: gender,
    birthDate,
    pillars: {
      year: year.label,
      month: month.label,
      day: day.label,
    },
    dayMaster: {
      stem: day.stem,
      element: STEM_ELEMENT[day.stem],
    },
    elements,
    lacking,
    strong,
    daewoonDirection: gender === "male" ? "顺行(순행)" : "逆行(역행)",
    note: "시주(태어난 시각)는 미입력 상태이며, 절기 기준의 근사 계산입니다.",
  };
}

module.exports = {
  buildSajuProfile,
};
