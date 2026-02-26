import { useMemo, useState } from "react";

type MemberType = "child" | "parent" | "teacher";
type MemberRole = "officer" | "member";
type MemberStatus = "active";
type MemberTab = "all" | MemberType;

type DemoMember = {
  id: string;
  name: string;
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
    name: "渋谷 花",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2025,
    part: "トランペット",
    parentIds: ["parent-1", "parent-2"],
  },
  {
    id: "child-2",
    name: "渋谷 陸",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2024,
    part: "クラリネット",
    parentIds: ["parent-1", "parent-2"],
  },
  {
    id: "child-3",
    name: "田中 奏",
    type: "child",
    role: "member",
    status: "active",
    enrollmentYear: 2023,
    part: "パーカッション",
    parentIds: ["parent-3"],
  },
  { id: "parent-1", name: "渋谷 父", type: "parent", role: "member", status: "active", childIds: ["child-1", "child-2"] },
  { id: "parent-2", name: "渋谷 母", type: "parent", role: "member", status: "active", childIds: ["child-1", "child-2"] },
  { id: "parent-3", name: "田中 母", type: "parent", role: "member", status: "active", childIds: ["child-3"] },
  { id: "teacher-1", name: "井野 先生", type: "teacher", role: "member", status: "active" },
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
              aria-label="閉じる"
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
              aria-label="閉じる"
              onClick={() => setDetailModalTargetId(null)}
            >
              ×
            </button>
            <h3>{detailTarget.name}</h3>
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
