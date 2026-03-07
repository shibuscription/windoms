import { useMemo, useState } from "react";

type MemberType = "child" | "parent" | "teacher";
type MemberRole = "officer" | "member";
type MemberStatus = "active";
type MemberTab = "all" | MemberType;

type DemoMember = {
  id: string;
  name: string;
  kana?: string;
  type: MemberType;
  role: MemberRole;
  status: MemberStatus;
  enrollmentYear?: number;
  part?: string;
  parentIds?: string[];
  childIds?: string[];
};

const memberItems: DemoMember[] = [
  {
    id: "child-1",
    name: "瀬古 芽生",
    kana: "せこ めい",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2024,
    part: "フルート",
    parentIds: ["parent-1", "parent-2"],
  },
  {
    id: "child-2",
    name: "中村 凌大",
    kana: "なかむら りお",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2024,
    part: "クラリネット",
    parentIds: ["parent-3"],
  },
  {
    id: "child-3",
    name: "今井 卯多",
    kana: "いまい うた",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2024,
    part: "アルトサックス",
    parentIds: ["parent-4"],
  },
  {
    id: "child-4",
    name: "水野 結衣",
    kana: "みずの ゆい",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2024,
    part: "テナーサックス",
    parentIds: ["parent-5", "parent-6"],
  },
  {
    id: "child-5",
    name: "渋谷 釉奈",
    kana: "しぶや ゆうな",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2024,
    part: "トランペット",
    parentIds: ["parent-7", "parent-8"],
  },
  {
    id: "child-6",
    name: "熊澤 春登",
    kana: "くまざわ はると",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2024,
    part: "トロンボーン",
    parentIds: ["parent-9"],
  },
  {
    id: "child-7",
    name: "青木 すみれ",
    kana: "あおき すみれ",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2025,
    part: "アルトサックス",
    parentIds: ["parent-10", "parent-11"],
  },
  {
    id: "child-8",
    name: "大滝 杏奈",
    kana: "おおたき あんな",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2025,
    part: "フルート",
    parentIds: ["parent-12"],
  },
  {
    id: "child-9",
    name: "加藤 瑳姫",
    kana: "かとう さき",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2025,
    part: "パーカッション",
    parentIds: ["parent-13", "parent-14"],
  },
  { id: "parent-1", name: "瀬古（父）", type: "parent", role: "member", status: "active", childIds: ["child-1"] },
  { id: "parent-2", name: "瀬古（母）", type: "parent", role: "member", status: "active", childIds: ["child-1"] },
  { id: "parent-3", name: "中村（母）", type: "parent", role: "member", status: "active", childIds: ["child-2"] },
  { id: "parent-4", name: "今井（母）", type: "parent", role: "member", status: "active", childIds: ["child-3"] },
  { id: "parent-5", name: "水野（父）", type: "parent", role: "member", status: "active", childIds: ["child-4"] },
  { id: "parent-6", name: "水野（母）", type: "parent", role: "member", status: "active", childIds: ["child-4"] },
  { id: "parent-7", name: "渋谷（父）", type: "parent", role: "member", status: "active", childIds: ["child-5"] },
  { id: "parent-8", name: "渋谷（母）", type: "parent", role: "member", status: "active", childIds: ["child-5"] },
  { id: "parent-9", name: "熊澤（母）", type: "parent", role: "member", status: "active", childIds: ["child-6"] },
  { id: "parent-10", name: "青木（父）", type: "parent", role: "member", status: "active", childIds: ["child-7"] },
  { id: "parent-11", name: "青木（母）", type: "parent", role: "member", status: "active", childIds: ["child-7"] },
  { id: "parent-12", name: "大滝（父）", type: "parent", role: "member", status: "active", childIds: ["child-8"] },
  { id: "parent-13", name: "加藤（父）", type: "parent", role: "member", status: "active", childIds: ["child-9"] },
  { id: "parent-14", name: "加藤（母）", type: "parent", role: "member", status: "active", childIds: ["child-9"] },
  { id: "teacher-1", name: "井野 勝彦", type: "teacher", role: "member", status: "active" },
];

const tabItems: Array<{ id: MemberTab; label: string }> = [
  { id: "all", label: "すべて" },
  { id: "child", label: "部員" },
  { id: "parent", label: "保護者" },
  { id: "teacher", label: "先生" },
];

const typeLabel: Record<MemberType, string> = {
  child: "部員",
  parent: "保護者",
  teacher: "先生",
};

const typeIcon: Record<MemberType, string> = {
  child: "🎵",
  parent: "👪",
  teacher: "🧑‍🏫",
};

const relationTitle = (member: DemoMember) => (member.type === "child" ? "保護者" : "子ども");

const relatedCount = (member: DemoMember) =>
  member.type === "child" ? member.parentIds?.length ?? 0 : member.childIds?.length ?? 0;

const relationIds = (member: DemoMember) =>
  member.type === "child" ? member.parentIds ?? [] : member.childIds ?? [];

const currentSchoolYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month <= 3 ? year - 1 : year;
};

const childGradeLabel = (member: DemoMember): string | null => {
  if (member.type !== "child" || !member.enrollmentYear) return null;
  const grade = currentSchoolYear() - member.enrollmentYear + 1;
  return grade > 0 ? `中${grade}` : null;
};

const childMetaLabel = (member: DemoMember): string | null => {
  if (member.type !== "child") return null;
  const grade = childGradeLabel(member);
  if (grade && member.part) return `${grade} | ${member.part}`;
  if (grade) return grade;
  return member.part ?? null;
};

export function MembersPage() {
  const [activeTab, setActiveTab] = useState<MemberTab>("all");
  const [relationModalTargetId, setRelationModalTargetId] = useState<string | null>(null);
  const [detailModalTargetId, setDetailModalTargetId] = useState<string | null>(null);

  const visibleMembers = useMemo(
    () => memberItems.filter((item) => activeTab === "all" || item.type === activeTab),
    [activeTab]
  );
  const relationTarget = relationModalTargetId
    ? memberItems.find((item) => item.id === relationModalTargetId) ?? null
    : null;
  const detailTarget = detailModalTargetId
    ? memberItems.find((item) => item.id === detailModalTargetId) ?? null
    : null;
  const relatedMembers = relationTarget
    ? relationIds(relationTarget)
        .map((id) => memberItems.find((item) => item.id === id))
        .filter((item): item is DemoMember => Boolean(item))
    : [];

  const openRelations = (member: DemoMember) => {
    if (member.type === "teacher") return;
    setRelationModalTargetId(member.id);
  };

  const relationLink = (member: DemoMember) => {
    if (member.type === "teacher") return null;
    return (
      <button type="button" className="member-relation-link" onClick={() => openRelations(member)}>
        {relationTitle(member)}: {relatedCount(member)}
      </button>
    );
  };

  const childMeta = (member: DemoMember) => {
    const label = childMetaLabel(member);
    if (!label) return null;
    return <span className="member-child-meta">{label}</span>;
  };

  const childKana = (member: DemoMember) => {
    if (member.type !== "child" || !member.kana?.trim()) return null;
    return <span className="member-kana">{member.kana}</span>;
  };

  return (
    <section className="card members-page">
      <h1>メンバー</h1>

      <div className="members-tabs" role="tablist" aria-label="メンバー種別">
        {tabItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`members-tab ${activeTab === item.id ? "active" : ""}`}
            onClick={() => setActiveTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="members-list">
        {visibleMembers.map((member) => (
          <article key={member.id} className="member-card">
            <div className="member-main">
              <span className="member-icon" aria-hidden="true">
                {typeIcon[member.type]}
              </span>
              <div className="member-meta">
                <strong className="member-name">{member.name}</strong>
                {childKana(member)}
                <span className="member-type">{typeLabel[member.type]}</span>
                {childMeta(member)}
              </div>
              <span className="member-card-spacer" />
            </div>
            {relationLink(member)}
          </article>
        ))}
      </div>

      {relationTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる" title="閉じる"
              onClick={() => setRelationModalTargetId(null)}
            >
              ×
            </button>
            <h3>{relationTitle(relationTarget)}</h3>
            <div className="members-list">
              {relatedMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="member-card member-card-button"
                  onClick={() => setDetailModalTargetId(member.id)}
                >
                  <div className="member-main">
                    <span className="member-icon" aria-hidden="true">
                      {typeIcon[member.type]}
                    </span>
                    <div className="member-meta">
                      <strong className="member-name">{member.name}</strong>
                      {childKana(member)}
                      <span className="member-type">{typeLabel[member.type]}</span>
                      {childMeta(member)}
                    </div>
                    <span className="member-card-spacer" />
                  </div>
                </button>
              ))}
              {relatedMembers.length === 0 && <p className="muted">紐づきはありません</p>}
            </div>
          </section>
        </div>
      )}

      {detailTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる" title="閉じる"
              onClick={() => setDetailModalTargetId(null)}
            >
              ×
            </button>
            <h3>{detailTarget.name}</h3>
            {childKana(detailTarget)}
            <p className="modal-summary">種別: {typeLabel[detailTarget.type]}</p>
            {detailTarget.type === "child" && childMetaLabel(detailTarget) && (
              <p className="modal-summary">
                {childMetaLabel(detailTarget)}
                {detailTarget.part ? ` | ${detailTarget.part}` : ""}
              </p>
            )}
            {detailTarget.type !== "teacher" && (
              <button
                type="button"
                className="member-relation-link"
                onClick={() => {
                  setDetailModalTargetId(null);
                  setRelationModalTargetId(detailTarget.id);
                }}
              >
                {relationTitle(detailTarget)}: {relatedCount(detailTarget)}
              </button>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
