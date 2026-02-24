import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Activity, DayLog, DemoData, DemoRsvp, RsvpStatus, SessionDoc } from "../types";
import { formatDateYmd, formatTimeNoLeadingZero, formatWeekdayJa, weekdayTone } from "../utils/date";

type LogPageProps = {
  data: DemoData;
  updateDayLog: (date: string, updater: (prev: DayLog) => DayLog) => void;
  updateSessionRsvps: (date: string, sessionOrder: number, rsvps: DemoRsvp[]) => void;
  updateDemoDictionaries: (next: Partial<DemoData["demoDictionaries"]>) => void;
};

type SortedActivityEntry = {
  activity: Activity;
  index: number;
};
type SongMasterItem = { id: string; name: string };

type WeatherValue = "" | "晴れ" | "くもり" | "雨" | "雪" | "その他";

const weatherOptions: ReadonlyArray<{
  value: Exclude<WeatherValue, "">;
  label: string;
  toneClass: string;
  emoji: string;
}> = [
    { value: "晴れ", label: "晴れ", toneClass: "sunny", emoji: "☀️" },
    { value: "くもり", label: "くもり", toneClass: "cloudy", emoji: "☁️" },
    { value: "雨", label: "雨", toneClass: "rainy", emoji: "☔" },
    { value: "雪", label: "雪", toneClass: "snowy", emoji: "❄️" },
    { value: "その他", label: "その他", toneClass: "other", emoji: "🌤️" },
  ];
const activitySuggestions = ["筋トレ", "腹式呼吸", "基礎練習", "個人練習", "合奏", "休憩"] as const;
const songMaster: SongMasterItem[] = [
  { id: "song_001", name: "威風堂々" },
  { id: "song_002", name: "春の猟犬" },
  { id: "song_003", name: "宝島" },
  { id: "song_004", name: "アルメニアン・ダンス" },
  { id: "song_005", name: "マーチ「ブルー・スプリング」" },
];
const MAX_ACTIVITY_SONGS = 10;

const uniq = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const sortedActivityEntries = (items: Activity[]): SortedActivityEntry[] =>
  items
    .map((activity, index) => ({ activity, index }))
    .sort((a, b) => {
      if (a.activity.startTime < b.activity.startTime) return -1;
      if (a.activity.startTime > b.activity.startTime) return 1;
      return a.index - b.index;
    });

const formatActivitySongSummary = (activity: Activity): string => {
  const ids = activity.songIds ?? [];
  if (ids.length === 0) return "";
  const names = ids
    .map((id) => songMaster.find((song) => song.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} ＋他${names.length - 1}曲`;
};

const formatActivityBody = (activity: Activity): string => {
  const type = activity.type;
  const details = [activity.title?.trim() ?? "", formatActivitySongSummary(activity)].filter(Boolean);
  if (details.length === 0) return type;
  return `${type}（${details.join(" / ")}）`;
};

const collectHistoryNames = (
  dayLogs: DemoData["dayLogs"],
  field: "actualInstructors" | "actualSeniors",
): string[] => {
  const names = Object.values(dayLogs).flatMap((dayLog) => dayLog[field] ?? []);
  return uniq(names.map((name) => name.trim()).filter(Boolean));
};

const filterSuggestions = (candidates: string[], draft: string): string[] => {
  const keyword = draft.trim().toLowerCase();
  if (!keyword) return candidates;
  return candidates.filter((name) => name.toLowerCase().includes(keyword));
};

const recentSongIdsFromLogs = (dayLogs: DemoData["dayLogs"]): string[] => {
  const sortedDates = Object.keys(dayLogs).sort((a, b) => b.localeCompare(a));
  const seen = new Set<string>();
  const result: string[] = [];
  sortedDates.forEach((date) => {
    const activities = dayLogs[date]?.activities ?? [];
    for (let i = activities.length - 1; i >= 0; i -= 1) {
      const ids = activities[i].songIds ?? [];
      for (let j = ids.length - 1; j >= 0; j -= 1) {
        const id = ids[j];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
      }
    }
  });
  return result;
};

type SuggestOption<T> = {
  key: string;
  label: string;
  value: T;
};

type InlineSuggestAddProps<T> = {
  selectedLabels: string[];
  onRemove: (index: number) => void;
  inputPlaceholder: string;
  getSuggestions: (draft: string) => SuggestOption<T>[];
  onSelectSuggestion: (value: T) => void;
  onCommitDraft: (draft: string) => boolean;
};

function InlineSuggestAdd<T>({
  selectedLabels,
  onRemove,
  inputPlaceholder,
  getSuggestions,
  onSelectSuggestion,
  onCommitDraft,
}: InlineSuggestAddProps<T>) {
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [pinnedClose, setPinnedClose] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAdding) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!anchorRef.current) return;
      if (anchorRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isAdding]);

  const suggestions = useMemo(() => getSuggestions(draft), [getSuggestions, draft]);
  const closeEditor = () => {
    setDraft("");
    setIsAdding(false);
    setIsOpen(false);
    setPinnedClose(false);
  };

  return (
    <>
      <ul className="name-list">
        {selectedLabels.map((label, index) => (
          <li key={`${label}-${index}`} className="name-list-row">
            <span>{label}</span>
            <button
              type="button"
              className="name-remove"
              onClick={() => onRemove(index)}
              aria-label="項目を削除"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {isAdding ? (
        <div className="inline-add-box">
          <div className="suggestion-anchor" ref={anchorRef}>
            <div className="input-with-toggle">
              <input
                className={isOpen ? "suggest-open" : ""}
                value={draft}
                placeholder={inputPlaceholder}
                onFocus={() => {
                  if (!pinnedClose) setIsOpen(true);
                }}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (onCommitDraft(draft)) closeEditor();
                }}
              />
              <button
                type="button"
                className="suggest-toggle"
                aria-label="候補を開閉"
                onClick={() => {
                  setIsOpen((prev) => {
                    const next = !prev;
                    setPinnedClose(!next);
                    return next;
                  });
                }}
              >
                {isOpen ? "▲" : "▼"}
              </button>
            </div>
            {isOpen && suggestions.length > 0 && (
              <div className="suggestion-dropdown" role="listbox">
                {suggestions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className="suggestion-option"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => {
                      onSelectSuggestion(option.value);
                      closeEditor();
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="inline-add-actions">
            <button type="button" className="button button-small ghost-button" onClick={closeEditor}>
              キャンセル
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                if (onCommitDraft(draft)) closeEditor();
              }}
            >
              追加
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button button-small ghost-button"
          onClick={() => {
            setIsAdding(true);
            setIsOpen(true);
            setPinnedClose(false);
          }}
        >
          ＋追加
        </button>
      )}
    </>
  );
}

type SongInlineSuggestAddProps = {
  selectedSongIds: string[];
  songMaster: SongMasterItem[];
  recentSongSuggestions: SongMasterItem[];
  onRemove: (index: number) => void;
  onAddSongId: (songId: string) => void;
  maxSongs: number;
};

function SongInlineSuggestAdd({
  selectedSongIds,
  songMaster,
  recentSongSuggestions,
  onRemove,
  onAddSongId,
  maxSongs,
}: SongInlineSuggestAddProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [pinnedClose, setPinnedClose] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAdding) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!anchorRef.current) return;
      if (anchorRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isAdding]);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
  }, []);

  const selectedLabels = useMemo(
    () => selectedSongIds.map((id) => songMaster.find((song) => song.id === id)?.name ?? id),
    [selectedSongIds, songMaster],
  );

  const suggestions = useMemo(() => {
    if (selectedSongIds.length >= maxSongs) return [];
    const keyword = draft.trim().toLowerCase();
    const base = keyword
      ? songMaster.filter((song) => song.name.toLowerCase().includes(keyword))
      : recentSongSuggestions;
    return base.slice(0, 10);
  }, [selectedSongIds.length, maxSongs, draft, songMaster, recentSongSuggestions]);

  const closeEditor = () => {
    setDraft("");
    setIsAdding(false);
    setIsOpen(false);
    setPinnedClose(false);
    setToastMessage("");
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 2000);
  };

  const addSelectedSong = (songId: string): boolean => {
    if (selectedSongIds.length >= maxSongs) {
      showToast("曲は最大10件までです");
      return false;
    }
    if (selectedSongIds.includes(songId)) {
      showToast("追加済みです");
      return false;
    }
    onAddSongId(songId);
    setToastMessage("");
    return true;
  };

  const commitDraft = (): boolean => {
    const keyword = draft.trim();
    if (!keyword) {
      showToast("曲名を入力してください");
      return false;
    }
    const exact = songMaster.find((song) => song.name.trim() === keyword);
    if (!exact) {
      showToast("曲が見つかりません");
      return false;
    }
    if (!addSelectedSong(exact.id)) return false;
    return true;
  };

  return (
    <>
      <ul className="name-list">
        {selectedLabels.map((label, index) => (
          <li key={`${label}-${index}`} className="name-list-row">
            <span>{label}</span>
            <button type="button" className="name-remove" onClick={() => onRemove(index)} aria-label="曲を削除">
              ×
            </button>
          </li>
        ))}
      </ul>
      {isAdding ? (
        <div className="inline-add-box">
          <div className="suggestion-anchor" ref={anchorRef}>
            <div className="input-with-toggle">
              <input
                className={isOpen ? "suggest-open" : ""}
                value={draft}
                placeholder="曲名を入力"
                onFocus={() => {
                  if (!pinnedClose) setIsOpen(true);
                }}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (toastMessage) setToastMessage("");
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (commitDraft()) closeEditor();
                }}
              />
              <button
                type="button"
                className="suggest-toggle"
                aria-label="候補を開閉"
                onClick={() => {
                  setIsOpen((prev) => {
                    const next = !prev;
                    setPinnedClose(!next);
                    return next;
                  });
                }}
              >
                {isOpen ? "▲" : "▼"}
              </button>
            </div>
            {toastMessage && <div className="inline-toast">{toastMessage}</div>}
            {isOpen && suggestions.length > 0 && (
              <div className="suggestion-dropdown" role="listbox">
                {suggestions.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    className="suggestion-option"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => {
                      if (addSelectedSong(song.id)) closeEditor();
                    }}
                  >
                    {song.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="inline-add-actions">
            <button type="button" className="button button-small ghost-button" onClick={closeEditor}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button button-small ghost-button"
          onClick={() => {
            setIsAdding(true);
            setIsOpen(true);
            setPinnedClose(false);
          }}
        >
          ＋追加
        </button>
      )}
    </>
  );
}

const countRsvps = (session: SessionDoc) => {
  const list = session.demoRsvps ?? [];
  return {
    yes: list.filter((item) => item.status === "yes").length,
    maybe: list.filter((item) => item.status === "maybe").length,
    no: list.filter((item) => item.status === "no").length,
  };
};
const sortRsvps = (items: DemoRsvp[], data: DemoData): DemoRsvp[] =>
  [...items].sort((a, b) => {
    const ma = data.members[a.uid];
    const mb = data.members[b.uid];
    if (ma && mb) {
      if (ma.grade !== mb.grade) return mb.grade - ma.grade;
      if (ma.instrumentOrder !== mb.instrumentOrder) return ma.instrumentOrder - mb.instrumentOrder;
      return ma.kana.localeCompare(mb.kana, "ja");
    }
    if (ma && !mb) return -1;
    if (!ma && mb) return 1;
    return a.displayName.localeCompare(b.displayName, "ja");
  });

const emptyActivity = (): Activity => ({
  startTime: "09:00",
  type: "",
  title: "",
  songIds: [],
});

const pad2 = (value: number): string => value.toString().padStart(2, "0");

const nearestFiveMinuteTime = (): string => {
  const now = new Date();
  const base = new Date(now);
  base.setSeconds(0, 0);
  const roundedMinutes = Math.round(now.getMinutes() / 5) * 5;
  base.setMinutes(roundedMinutes);
  return `${pad2(base.getHours())}:${pad2(base.getMinutes())}`;
};

const splitTime = (time: string): { hour: string; minute: string } => {
  const [hour = "00", minute = "00"] = time.split(":");
  return { hour, minute };
};

const hourOptions = Array.from({ length: 24 }, (_, hour) => pad2(hour));
const minuteOptions = Array.from({ length: 12 }, (_, index) => pad2(index * 5));

const weatherToneClass = (weather: string): string => {
  const option = weatherOptions.find((item) => item.value === weather);
  return option?.toneClass ?? "none";
};

const normalizeWeather = (weather?: string): WeatherValue => {
  if (!weather) return "";
  if (weather === "あめ") return "雨";
  if (weather === "ゆき") return "雪";
  return weatherOptions.some((option) => option.value === weather) ? (weather as WeatherValue) : "";
};

const weatherLabel = (weather: string): string => {
  const option = weatherOptions.find((item) => item.value === weather);
  return option ? option.label : "";
};

const weatherEmoji = (weather: string): string => {
  const option = weatherOptions.find((item) => item.value === weather);
  return option?.emoji ?? "🌤️";
};

const toFamilyName = (fullName: string): string => {
  const normalized = fullName.trim();
  if (!normalized) return "";
  if (normalized.includes(" ")) return normalized.split(" ")[0];
  if (normalized.includes("　")) return normalized.split("　")[0];
  return normalized;
};

const DEMO_STAMP_USER = {
  uid: "demo_writer",
  name: "渋谷",
};
const MAIN_INSTRUCTOR_NAME = "井野先生";

export function LogPage({
  data,
  updateDayLog,
  updateSessionRsvps,
  updateDemoDictionaries,
}: LogPageProps) {
  const { date = "" } = useParams();
  const day = data.scheduleDays[date];
  const sessions = useMemo(
    () => [...(day?.sessions ?? [])].sort((a, b) => a.order - b.order),
    [day],
  );

  const log = data.dayLogs[date] ?? {
    notes: "",
    weather: "",
    activities: [],
    actualInstructors: [],
    actualSeniors: [],
    mainInstructorAttendance: {},
    dutyStamps: {},
  };

  const plannedInstructors = useMemo(
    () =>
      uniq(
        day?.plannedInstructors ??
        (day?.sessions ?? []).flatMap((session) => session.plannedInstructors ?? []),
      ),
    [day],
  );
  const plannedSeniors = useMemo(
    () =>
      uniq(
        day?.plannedSeniors ?? (day?.sessions ?? []).flatMap((session) => session.plannedSeniors ?? []),
      ),
    [day],
  );

  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [editingActivityIndex, setEditingActivityIndex] = useState<number | null>(null);
  const [activityDraft, setActivityDraft] = useState<Activity>(emptyActivity);
  const [refModal, setRefModal] = useState<"mainInstructor" | "instructors" | "seniors" | null>(null);
  const [selectedRsvpSession, setSelectedRsvpSession] = useState<SessionDoc | null>(null);
  const [rsvpDraft, setRsvpDraft] = useState<Record<string, RsvpStatus | "">>({});
  const [rsvpError, setRsvpError] = useState("");
  const [isWeatherMenuOpen, setIsWeatherMenuOpen] = useState(false);
  const weatherMenuRef = useRef<HTMLDivElement>(null);
  const [isActivityTypeSuggestOpen, setIsActivityTypeSuggestOpen] = useState(false);
  const [activityTypeSuggestPinnedClose, setActivityTypeSuggestPinnedClose] = useState(false);
  const activityTypeSuggestRef = useRef<HTMLDivElement>(null);
  const activityTypeInputRef = useRef<HTMLInputElement>(null);
  const [activityTypeError, setActivityTypeError] = useState("");
  const [stampMessage, setStampMessage] = useState("");
  const [animatingStampOrder, setAnimatingStampOrder] = useState<number | null>(null);
  const [isSaveNoticeOpen, setIsSaveNoticeOpen] = useState(false);
  const [pendingDeleteActivityIndex, setPendingDeleteActivityIndex] = useState<number | null>(null);
  const [pendingStampSession, setPendingStampSession] = useState<{ sessionOrder: number; fromName: string } | null>(null);

  useEffect(() => {
    if (!stampMessage) return;
    const timer = window.setTimeout(() => setStampMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [stampMessage]);

  const onSaveDemo = () => {
    const nextInstructors = log.actualInstructors.map((name) => name.trim()).filter(Boolean);
    const nextSeniors = log.actualSeniors.map((name) => name.trim()).filter(Boolean);
    updateDemoDictionaries({
      instructors: nextInstructors,
      seniors: nextSeniors,
    });
    setIsSaveNoticeOpen(true);
  };

  const dayStartTime = sessions[0]?.startTime ?? "--:--";
  const dayEndTime = sessions[sessions.length - 1]?.endTime ?? "--:--";
  const dutySlots = sessions.map((session, index) => {
    const name = session.assigneeNameSnapshot?.trim() || "";
    const seed = `${name}-${index}`
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rotate = ((seed % 5) - 2).toString();
    return { name, familyName: toFamilyName(name), rotate };
  });

  const locationRows = sessions.filter((session) => Boolean(session.location));
  const weatherValue = normalizeWeather(log.weather);
  const selectedWeatherTone = weatherToneClass(weatherValue);
  const mainInstructorPlanByOrder = useMemo(() => {
    const entries = sessions.map((session) => [
      session.order,
      Boolean((session.plannedInstructors ?? []).includes(MAIN_INSTRUCTOR_NAME)),
    ]);
    return Object.fromEntries(entries) as Record<number, boolean>;
  }, [sessions]);
  const refModalItems =
    refModal === "mainInstructor"
      ? sessions.map((session) => {
          const planned = mainInstructorPlanByOrder[session.order] ? "◯" : "×";
          return `${formatTimeNoLeadingZero(session.startTime)}〜${formatTimeNoLeadingZero(session.endTime)}　${planned}`;
        })
      : refModal === "instructors"
        ? plannedInstructors
        : plannedSeniors;
  const refModalTitle =
    refModal === "mainInstructor"
      ? "講師予定（井野先生）"
      : refModal === "instructors"
        ? "外部講師予定"
        : "先輩予定";

  const activityEntries = useMemo(() => sortedActivityEntries(log.activities), [log.activities]);
  const instructorHistoryCandidates = useMemo(
    () => collectHistoryNames(data.dayLogs, "actualInstructors"),
    [data.dayLogs],
  );
  const seniorHistoryCandidates = useMemo(
    () => collectHistoryNames(data.dayLogs, "actualSeniors"),
    [data.dayLogs],
  );
  const instructorSuggestions = useMemo(() => {
    const plannedPriority = plannedInstructors.filter((name) => !log.actualInstructors.includes(name));
    const history = instructorHistoryCandidates.filter(
      (name) => !plannedPriority.includes(name) && !log.actualInstructors.includes(name),
    );
    return [...plannedPriority, ...history];
  }, [plannedInstructors, instructorHistoryCandidates, log.actualInstructors]);
  const seniorSuggestions = useMemo(() => {
    const plannedPriority = plannedSeniors.filter((name) => !log.actualSeniors.includes(name));
    const history = seniorHistoryCandidates.filter(
      (name) => !plannedPriority.includes(name) && !log.actualSeniors.includes(name),
    );
    return [...plannedPriority, ...history];
  }, [plannedSeniors, seniorHistoryCandidates, log.actualSeniors]);
  const filteredActivityTypeSuggestions = useMemo(
    () => filterSuggestions([...activitySuggestions], activityDraft.type),
    [activityDraft.type],
  );
  const recentSongIds = useMemo(() => recentSongIdsFromLogs(data.dayLogs), [data.dayLogs]);
  const recentSongSuggestions = useMemo(
    () =>
      recentSongIds
        .map((id) => songMaster.find((song) => song.id === id))
        .filter((song): song is SongMasterItem => Boolean(song))
        .slice(0, 10),
    [recentSongIds],
  );
  const sortedSelectedRsvps = useMemo(
    () => (selectedRsvpSession ? sortRsvps(selectedRsvpSession.demoRsvps ?? [], data) : []),
    [selectedRsvpSession, data],
  );
  const rsvpCounts = selectedRsvpSession
    ? {
      yes: sortedSelectedRsvps.filter((rsvp) => rsvpDraft[rsvp.uid] === "yes").length,
      maybe: sortedSelectedRsvps.filter((rsvp) => rsvpDraft[rsvp.uid] === "maybe").length,
      no: sortedSelectedRsvps.filter((rsvp) => rsvpDraft[rsvp.uid] === "no").length,
    }
    : null;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!weatherMenuRef.current) return;
      if (weatherMenuRef.current.contains(event.target as Node)) return;
      setIsWeatherMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (activityTypeSuggestRef.current && !activityTypeSuggestRef.current.contains(target)) {
        setIsActivityTypeSuggestOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsActivityTypeSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const openCreateActivityModal = () => {
    setEditingActivityIndex(null);
    setActivityDraft({
      startTime: nearestFiveMinuteTime(),
      type: "",
      title: "",
      songIds: [],
    });
    setIsActivityModalOpen(true);
    setIsActivityTypeSuggestOpen(false);
    setActivityTypeSuggestPinnedClose(false);
    setActivityTypeError("");
  };

  const openEditActivityModal = (entry: SortedActivityEntry) => {
    setEditingActivityIndex(entry.index);
    setActivityDraft({
      startTime: entry.activity.startTime,
      type: entry.activity.type,
      title: entry.activity.title ?? "",
      songIds: entry.activity.songIds ?? [],
    });
    setIsActivityModalOpen(true);
    setIsActivityTypeSuggestOpen(false);
    setActivityTypeSuggestPinnedClose(false);
    setActivityTypeError("");
  };

  const closeActivityModal = () => {
    setIsActivityModalOpen(false);
    setEditingActivityIndex(null);
    setActivityDraft(emptyActivity());
    setIsActivityTypeSuggestOpen(false);
    setActivityTypeSuggestPinnedClose(false);
    setActivityTypeError("");
  };

  const onSaveActivity = () => {
    const nextType = activityDraft.type.trim();
    if (!nextType) {
      setActivityTypeError("種別は必須です");
      activityTypeInputRef.current?.focus();
      setIsActivityTypeSuggestOpen(true);
      return;
    }
    if (!activityDraft.startTime) return;

    const nextActivity: Activity = {
      startTime: activityDraft.startTime,
      type: nextType,
      title: activityDraft.title?.trim() || "",
      songIds: activityDraft.songIds?.length ? activityDraft.songIds : [],
    };

    updateDayLog(date, (prev) => {
      if (editingActivityIndex === null) {
        return {
          ...prev,
          activities: [...prev.activities, nextActivity],
        };
      }

      return {
        ...prev,
        activities: prev.activities.map((item, index) =>
          index === editingActivityIndex ? nextActivity : item,
        ),
      };
    });

    setActivityTypeError("");
    closeActivityModal();
  };

  const onDeleteActivity = (targetIndex: number) => {
    setPendingDeleteActivityIndex(targetIndex);
  };

  const confirmDeleteActivity = () => {
    if (pendingDeleteActivityIndex === null) return;
    updateDayLog(date, (prev) => ({
      ...prev,
      activities: prev.activities.filter((_, index) => index !== pendingDeleteActivityIndex),
    }));
    setPendingDeleteActivityIndex(null);
  };

  const removeSongAt = (index: number) => {
    setActivityDraft((prev) => ({
      ...prev,
      songIds: (prev.songIds ?? []).filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const addSongId = (songId: string) => {
    setActivityDraft((prev) => {
      const current = prev.songIds ?? [];
      if (current.length >= MAX_ACTIVITY_SONGS) return prev;
      if (current.includes(songId)) return prev;
      return { ...prev, songIds: [...current, songId] };
    });
  };

  const addArrayItem = (field: "actualInstructors" | "actualSeniors", value: string) => {
    const nextValue = value.trim();
    if (!nextValue) return;
    updateDayLog(date, (prev) => ({
      ...prev,
      [field]: [...(prev[field] ?? []), nextValue],
    }));
  };

  const removeArrayItem = (field: "actualInstructors" | "actualSeniors", index: number) => {
    updateDayLog(date, (prev) => ({
      ...prev,
      [field]: (prev[field] ?? []).filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const toggleMainInstructorAttendance = (sessionOrder: number) => {
    const key = String(sessionOrder);
    updateDayLog(date, (prev) => ({
      ...prev,
      mainInstructorAttendance: {
        ...(prev.mainInstructorAttendance ?? {}),
        [key]: !(prev.mainInstructorAttendance?.[key] ?? false),
      },
    }));
  };

  const openRsvpModal = (session: SessionDoc) => {
    setSelectedRsvpSession(session);
    const nextDraft: Record<string, RsvpStatus | ""> = {};
    (session.demoRsvps ?? []).forEach((rsvp) => {
      nextDraft[rsvp.uid] = rsvp.status === "unknown" ? "" : rsvp.status;
    });
    setRsvpDraft(nextDraft);
    setRsvpError("");
  };

  const closeRsvpModal = () => {
    setSelectedRsvpSession(null);
    setRsvpDraft({});
    setRsvpError("");
  };

  const toggleRsvp = (uid: string, status: "yes" | "maybe" | "no") => {
    setRsvpDraft((prev) => ({
      ...prev,
      [uid]: prev[uid] === status ? "" : status,
    }));
  };

  const onSaveRsvps = () => {
    if (!selectedRsvpSession) return;
    const hasUnselected = sortedSelectedRsvps.some((rsvp) => !rsvpDraft[rsvp.uid]);
    if (hasUnselected) {
      setRsvpError("未選択のメンバーがいます");
      return;
    }
    const nextRsvps = (selectedRsvpSession.demoRsvps ?? []).map((rsvp) => ({
      ...rsvp,
      status: (rsvpDraft[rsvp.uid] as RsvpStatus) ?? "unknown",
    }));
    updateSessionRsvps(date, selectedRsvpSession.order, nextRsvps);
    closeRsvpModal();
  };

  const applyDutyStamp = (sessionOrder: number) => {
    const key = String(sessionOrder);
    updateDayLog(date, (prev) => ({
      ...prev,
      dutyStamps: {
        ...(prev.dutyStamps ?? {}),
        [key]: {
          stampedByUid: DEMO_STAMP_USER.uid,
          stampedByName: DEMO_STAMP_USER.name,
          stampedAt: new Date().toISOString(),
        },
      },
    }));

    setStampMessage("捺印しました");
    setAnimatingStampOrder(sessionOrder);
    window.setTimeout(() => {
      setAnimatingStampOrder((prev) => (prev === sessionOrder ? null : prev));
    }, 260);
  };

  const onStampDuty = (sessionOrder: number, plannedName: string) => {
    if (!plannedName) return;
    const key = String(sessionOrder);
    const current = log.dutyStamps?.[key];

    if (current?.stampedByUid === DEMO_STAMP_USER.uid) {
      setStampMessage("捺印済みです");
      return;
    }

    const needsConfirm = Boolean(current) || plannedName !== DEMO_STAMP_USER.name;
    if (needsConfirm) {
      const fromName = current?.stampedByName ?? plannedName;
      setPendingStampSession({ sessionOrder, fromName });
      return;
    }
    applyDutyStamp(sessionOrder);
  };

  return (
    <section className="card log-page">
      <div className="log-toolbar">
        <Link to="/today" className="button button-small">
          今日へ戻る
        </Link>
        <button type="button" className="button button-small" onClick={onSaveDemo}>
          保存（デモ）
        </button>
      </div>

      <div className="log-date-block">
        <div className="log-date-main">
          <h1 className="date-hero date-hero-inline">
            <span className="date-main">{formatDateYmd(date)}</span>
            <span className={`date-weekday ${weekdayTone(date)}`}>（{formatWeekdayJa(date)}）</span>
          </h1>
          <p className="log-time-range log-time-range-inline">
            {formatTimeNoLeadingZero(dayStartTime)}〜{formatTimeNoLeadingZero(dayEndTime)}
          </p>
        </div>
        <div className="log-weather">
          <span className="log-weather-label">天候</span>
          <div className="weather-select-wrap" ref={weatherMenuRef}>
            <button
              type="button"
              className={`weather-select-button ${selectedWeatherTone}`}
              onClick={() => setIsWeatherMenuOpen((prev) => !prev)}
            >
              <span className="weather-emoji">{weatherEmoji(weatherValue)}</span>
              <span className="weather-select-label">
                {weatherLabel(weatherValue) || "天候を選択"}
              </span>
              <span className="weather-caret">{isWeatherMenuOpen ? "▴" : "▾"}</span>
            </button>
            {isWeatherMenuOpen && (
              <div className="weather-select-menu">
                <button
                  type="button"
                  className="weather-option none"
                  onClick={() => {
                    updateDayLog(date, (prev) => ({ ...prev, weather: "" }));
                    setIsWeatherMenuOpen(false);
                  }}
                >
                  <span className="weather-emoji">◯</span>
                  <span>未選択</span>
                </button>
                {weatherOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`weather-option ${option.toneClass}`}
                    onClick={() => {
                      updateDayLog(date, (prev) => ({ ...prev, weather: option.value }));
                      setIsWeatherMenuOpen(false);
                    }}
                  >
                    <span className="weather-emoji">{option.emoji}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="log-two-cols">
        <div className="log-panel">
          <div className="section-header">
            <h2>活動場所</h2>
          </div>
          {locationRows.length === 0 ? (
            <p className="muted">なし</p>
          ) : (
            <ul className="attendance-list">
              {locationRows.map((session, index) => (
                <li key={`${session.order}-${index}`} className="attendance-row">
                  <span className="attendance-time">
                    {formatTimeNoLeadingZero(session.startTime)}〜
                    {formatTimeNoLeadingZero(session.endTime)}
                  </span>
                  <span className="attendance-value">{session.location}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="log-panel">
          <div className="section-header">
            <h2>出欠一覧</h2>
          </div>
          <div className="attendance-list">
            {sessions.map((session, index) => {
              const counts = countRsvps(session);
              return (
                <div key={`${session.order}-${index}`} className="attendance-row">
                  <span className="attendance-time">
                    {formatTimeNoLeadingZero(session.startTime)}〜
                    {formatTimeNoLeadingZero(session.endTime)}
                  </span>
                  <button type="button" className="attendance-trigger" onClick={() => openRsvpModal(session)}>
                    <span className="count-yes">◯{counts.yes}</span>
                    <span className="count-maybe">△{counts.maybe}</span>
                    <span className="count-no">×{counts.no}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="log-three-cols">
        <div className="log-panel">
          <div className="ref-panel">
            <div className="section-header">
              <h2>講師（井野先生）</h2>
              <button
                type="button"
                className="button button-small ghost-button section-action"
                onClick={() => setRefModal("mainInstructor")}
              >
                予定を見る
              </button>
            </div>
          </div>
          <div className="panel-body">
            <ul className="main-instructor-list">
              {sessions.map((session) => {
                const key = String(session.order);
                const checked = Boolean(log.mainInstructorAttendance?.[key]);
                return (
                  <li key={session.order} className="main-instructor-row">
                    <span className="main-instructor-time">
                      {formatTimeNoLeadingZero(session.startTime)}〜
                      {formatTimeNoLeadingZero(session.endTime)}
                    </span>
                    <span className="main-instructor-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMainInstructorAttendance(session.order)}
                        aria-label={`講師在席実績 ${formatTimeNoLeadingZero(session.startTime)}〜${formatTimeNoLeadingZero(session.endTime)}`}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="log-panel">
          <div className="ref-panel">
            <div className="section-header">
              <h2>外部講師</h2>
              {plannedInstructors.length > 0 && (
                <button
                  type="button"
                  className="button button-small ghost-button section-action"
                  onClick={() => setRefModal("instructors")}
                >
                  予定を見る
                </button>
              )}
            </div>
          </div>
          <div className="panel-body">
            <InlineSuggestAdd<string>
              selectedLabels={log.actualInstructors}
              onRemove={(index) => removeArrayItem("actualInstructors", index)}
              inputPlaceholder="名前を入力"
              getSuggestions={(draft) =>
                filterSuggestions(instructorSuggestions, draft)
                  .slice(0, 10)
                  .map((name) => ({ key: name, label: name, value: name }))
              }
              onSelectSuggestion={(name) => addArrayItem("actualInstructors", name)}
              onCommitDraft={(draft) => {
                const value = draft.trim();
                if (!value) return false;
                addArrayItem("actualInstructors", value);
                return true;
              }}
            />
          </div>
        </div>
        <div className="log-panel">
          <div className="ref-panel">
            <div className="section-header">
              <h2>先輩</h2>
              {plannedSeniors.length > 0 && (
                <button
                  type="button"
                  className="button button-small ghost-button section-action"
                  onClick={() => setRefModal("seniors")}
                >
                  予定を見る
                </button>
              )}
            </div>
          </div>
          <div className="panel-body">
            <InlineSuggestAdd<string>
              selectedLabels={log.actualSeniors}
              onRemove={(index) => removeArrayItem("actualSeniors", index)}
              inputPlaceholder="名前を入力"
              getSuggestions={(draft) =>
                filterSuggestions(seniorSuggestions, draft)
                  .slice(0, 10)
                  .map((name) => ({ key: name, label: name, value: name }))
              }
              onSelectSuggestion={(name) => addArrayItem("actualSeniors", name)}
              onCommitDraft={(draft) => {
                const value = draft.trim();
                if (!value) return false;
                addArrayItem("actualSeniors", value);
                return true;
              }}
            />
          </div>
        </div>
      </div>

      <div className="log-panel">
        <div className="section-header">
          <h2>活動記録</h2>
        </div>
        {activityEntries.length === 0 ? (
          <p className="muted">まだ記録がありません</p>
        ) : (
          <ul className="activity-list">
            {activityEntries.map((entry) => (
              <li key={`${entry.activity.startTime}-${entry.index}`} className="activity-list-item">
                <button
                  type="button"
                  className="activity-row-button"
                  onClick={() => openEditActivityModal(entry)}
                >
                  <span className="activity-log-row">
                    <span className="activity-log-time">
                      {formatTimeNoLeadingZero(entry.activity.startTime)}～
                    </span>
                    <span>{formatActivityBody(entry.activity)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="activity-delete-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteActivity(entry.index);
                  }}
                  aria-label="活動記録を削除"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="button button-small ghost-button" onClick={openCreateActivityModal}>
          ＋追加
        </button>
      </div>

      <div className="log-panel">
        <div className="section-header">
          <h2>備考</h2>
        </div>
        <div className="panel-body">
          <textarea
            value={log.notes}
            onChange={(e) => updateDayLog(date, (prev) => ({ ...prev, notes: e.target.value }))}
          />
        </div>
      </div>

      <div className="log-panel">
        <div className="section-header">
          <h2>当番</h2>
        </div>
        <div className="duty-section">
          <div className="duty-connected-scroll">
            <div className="duty-connected-wrap">
              {dutySlots.map((slot, index) => {
                const order = sessions[index]?.order ?? index + 1;
                const stamp = log.dutyStamps?.[String(order)];
                const isStamped = Boolean(stamp);
                const stampDisplayName = isStamped
                  ? toFamilyName(stamp?.stampedByName ?? "")
                  : slot.familyName;
                return (
                  <div key={`${slot.name}-${index}`} className="duty-connected-cell">
                    {slot.name ? (
                      <button
                        type="button"
                        className={`duty-stamp-circle duty-stamp-button ${
                          isStamped ? "stamped" : "unstamped"
                        }`}
                        style={{ transform: `rotate(${slot.rotate}deg)` }}
                        onClick={() => onStampDuty(order, slot.name)}
                        title={
                          stamp
                            ? `捺印者: ${stamp.stampedByName} / ${new Date(stamp.stampedAt).toLocaleString("ja-JP")}`
                            : "未捺印"
                        }
                        >
                        <span className={`duty-stamp-text ${animatingStampOrder === order ? "stamp-pop" : ""}`}>
                          {stampDisplayName}
                        </span>
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {stampMessage && <p className="duty-stamp-note">{stampMessage}</p>}
        </div>
      </div>

      {isSaveNoticeOpen && (
        <div className="modal-backdrop" onClick={() => setIsSaveNoticeOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setIsSaveNoticeOpen(false)} aria-label="閉じる">
              ×
            </button>
            <p className="modal-context">保存しました（デモ）</p>
            <div className="modal-actions">
              <button type="button" className="button button-small" onClick={() => setIsSaveNoticeOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteActivityIndex !== null && (
        <div className="modal-backdrop" onClick={() => setPendingDeleteActivityIndex(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setPendingDeleteActivityIndex(null)}
              aria-label="閉じる"
            >
              ×
            </button>
            <p className="modal-context">この活動記録を削除しますか？</p>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPendingDeleteActivityIndex(null)}
              >
                やめる
              </button>
              <button type="button" className="button button-small" onClick={confirmDeleteActivity}>
                実行する
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingStampSession && (
        <div className="modal-backdrop" onClick={() => setPendingStampSession(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setPendingStampSession(null)} aria-label="閉じる">
              ×
            </button>
            <p className="modal-context">
              当番者を「{pendingStampSession.fromName}」から「{DEMO_STAMP_USER.name}」に変更して捺印します。よろしいですか？
            </p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setPendingStampSession(null)}>
                やめる
              </button>
              <button
                type="button"
                className="button button-small"
                onClick={() => {
                  applyDutyStamp(pendingStampSession.sessionOrder);
                  setPendingStampSession(null);
                }}
              >
                実行する
              </button>
            </div>
          </div>
        </div>
      )}

      {refModal && (
        <div className="modal-backdrop" onClick={() => setRefModal(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setRefModal(null)} aria-label="閉じる">
              ×
            </button>
            <p className="modal-context">{refModalTitle}</p>
            <p className="planned-modal-list">{refModalItems.join("\n")}</p>
          </div>
        </div>
      )}

      {isActivityModalOpen && (
        <div className="modal-backdrop" onClick={closeActivityModal}>
          <div className="modal-panel activity-modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeActivityModal} aria-label="閉じる">
              ×
            </button>
            <p className="modal-context">活動記録 {editingActivityIndex === null ? "追加" : "編集"}</p>
            <div className="activity-modal-body">
              <div className="activity-modal-form">
                <label>
                開始時刻
                <div className="time-select-row">
                  <select
                    className="time-select"
                    value={splitTime(activityDraft.startTime).hour}
                    onChange={(e) => {
                      const minute = splitTime(activityDraft.startTime).minute;
                      setActivityDraft((prev) => ({
                        ...prev,
                        startTime: `${e.target.value}:${minute}`,
                      }));
                    }}
                  >
                    {hourOptions.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                  <span className="time-separator">:</span>
                  <select
                    className="time-select"
                    value={splitTime(activityDraft.startTime).minute}
                    onChange={(e) => {
                      const hour = splitTime(activityDraft.startTime).hour;
                      setActivityDraft((prev) => ({
                        ...prev,
                        startTime: `${hour}:${e.target.value}`,
                      }));
                    }}
                  >
                    {minuteOptions.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                <span className="field-label-row">
                  <span>種別</span>
                  {activityTypeError && <span className="field-error-inline">{activityTypeError}</span>}
                </span>
                <div className="suggestion-anchor" ref={activityTypeSuggestRef}>
                  <div className="input-with-toggle">
                    <input
                      ref={activityTypeInputRef}
                      className={isActivityTypeSuggestOpen ? "suggest-open" : ""}
                      value={activityDraft.type}
                      placeholder="種別を入力"
                      onFocus={() => {
                        if (!activityTypeSuggestPinnedClose) {
                          setIsActivityTypeSuggestOpen(true);
                        }
                      }}
                      onChange={(e) =>
                        {
                          setActivityDraft((prev) => ({
                            ...prev,
                            type: e.target.value,
                          }));
                          if (activityTypeError) setActivityTypeError("");
                        }
                      }
                      required
                    />
                    <button
                      type="button"
                      className="suggest-toggle"
                      aria-label="候補を開閉"
                      onClick={() => {
                        setIsActivityTypeSuggestOpen((prev) => {
                          const next = !prev;
                          setActivityTypeSuggestPinnedClose(!next);
                          return next;
                        });
                      }}
                    >
                      {isActivityTypeSuggestOpen ? "▲" : "▼"}
                    </button>
                  </div>
                  {isActivityTypeSuggestOpen && (
                    <div className="suggestion-dropdown" role="listbox">
                      {filteredActivityTypeSuggestions.length > 0 ? (
                        filteredActivityTypeSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="suggestion-option"
                            onClick={() => {
                              setActivityDraft((prev) => ({ ...prev, type: suggestion }));
                              if (activityTypeError) setActivityTypeError("");
                              setIsActivityTypeSuggestOpen(false);
                            }}
                          >
                            {suggestion}
                          </button>
                        ))
                      ) : (
                        <div className="suggestion-empty">候補がありません</div>
                      )}
                    </div>
                  )}
                </div>
              </label>
              <label>
                補足（任意）
                <input
                  value={activityDraft.title ?? ""}
                  placeholder="内容メモ（例：全体確認、テンポ合わせ など）"
                  onChange={(e) =>
                    setActivityDraft((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                />
              </label>
              <div className="activity-field">
                <div className="activity-field-label">曲名（任意）</div>
                <div className="song-link-box">
                  <SongInlineSuggestAdd
                    selectedSongIds={activityDraft.songIds ?? []}
                    songMaster={songMaster}
                    recentSongSuggestions={recentSongSuggestions}
                    onRemove={removeSongAt}
                    onAddSongId={addSongId}
                    maxSongs={MAX_ACTIVITY_SONGS}
                  />
                </div>
              </div>
            </div>
              <div className="modal-actions">
                <button type="button" className="button button-small ghost-button" onClick={closeActivityModal}>
                  キャンセル
                </button>
                <button type="button" className="button button-small" onClick={onSaveActivity}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedRsvpSession && (
        <div className="modal-backdrop" onClick={closeRsvpModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeRsvpModal} aria-label="閉じる">
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}）{" "}
              {formatTimeNoLeadingZero(selectedRsvpSession.startTime)}–
              {formatTimeNoLeadingZero(selectedRsvpSession.endTime)}
            </p>
            {rsvpCounts && (
              <p className="modal-summary">
                出欠：<span className="count-yes">◯{rsvpCounts.yes}</span>{" "}
                <span className="count-maybe">△{rsvpCounts.maybe}</span>{" "}
                <span className="count-no">×{rsvpCounts.no}</span>
              </p>
            )}
            <div className="rsvp-table">
              {sortedSelectedRsvps.map((rsvp) => (
                <div key={rsvp.uid} className="rsvp-row">
                  <span>{rsvp.displayName}</span>
                  <div className="rsvp-toggle-group">
                    <button
                      type="button"
                      className={`rsvp-toggle yes ${rsvpDraft[rsvp.uid] === "yes" ? "active" : ""}`}
                      onClick={() => toggleRsvp(rsvp.uid, "yes")}
                    >
                      ◯
                    </button>
                    <button
                      type="button"
                      className={`rsvp-toggle maybe ${rsvpDraft[rsvp.uid] === "maybe" ? "active" : ""}`}
                      onClick={() => toggleRsvp(rsvp.uid, "maybe")}
                    >
                      △
                    </button>
                    <button
                      type="button"
                      className={`rsvp-toggle no ${rsvpDraft[rsvp.uid] === "no" ? "active" : ""}`}
                      onClick={() => toggleRsvp(rsvp.uid, "no")}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {rsvpError && <p className="modal-error">{rsvpError}</p>}
            <div className="modal-actions">
              <button type="button" className="button button-small ghost-button" onClick={closeRsvpModal}>
                キャンセル
              </button>
              <button type="button" className="button button-small" onClick={onSaveRsvps}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
