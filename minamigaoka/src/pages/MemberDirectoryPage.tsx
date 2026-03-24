import { useEffect, useMemo, useState } from "react";
import { subscribeMemberRelations, subscribeMembers } from "../members/service";
import { relationTypeLabel } from "../members/relation";
import type { MemberRecord, MemberRelationRecord } from "../members/types";

type MemberTab = "all" | "child" | "parent" | "teacher";

const tabItems: Array<{ id: MemberTab; label: string }> = [
  { id: "all", label: "すべて" },
  { id: "child", label: "部員" },
  { id: "parent", label: "保護者" },
  { id: "teacher", label: "先生" },
];

const memberTabOf = (member: MemberRecord): MemberTab =>
  member.role === "child" ? "child" : member.role === "teacher" ? "teacher" : "parent";

const memberTypeLabel = (member: MemberRecord): string =>
  member.role === "child" ? "部員" : member.role === "teacher" ? "先生" : "保護者";

const memberTypeIcon = (member: MemberRecord): string =>
  member.role === "child" ? "🎵" : member.role === "teacher" ? "🧑‍🏫" : "👪";

export function MemberDirectoryPage() {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [relations, setRelations] = useState<MemberRelationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MemberTab>("all");
  const [relationTargetId, setRelationTargetId] = useState<string | null>(null);
  const [pageError, setPageError] = useState("");

  const memberNameById = useMemo(
    () =>
      members.reduce<Record<string, string>>((result, member) => {
        result[member.id] = member.name;
        return result;
      }, {}),
    [members],
  );

  const childRelationsByChildId = useMemo(
    () =>
      relations.reduce<Record<string, MemberRelationRecord[]>>((result, relation) => {
        const bucket = result[relation.childMemberId] ?? [];
        bucket.push(relation);
        result[relation.childMemberId] = bucket;
        return result;
      }, {}),
    [relations],
  );

  const visibleMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.status === "active" &&
          (activeTab === "all" || memberTabOf(member) === activeTab),
      ),
    [activeTab, members],
  );

  const relationTarget = relationTargetId
    ? members.find((member) => member.id === relationTargetId) ?? null
    : null;
  const relationTargetItems = relationTarget ? childRelationsByChildId[relationTarget.id] ?? [] : [];

  useEffect(() => {
    let loadedCount = 0;
    const markLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= 2) {
        setIsLoading(false);
      }
    };

    try {
      const unsubscribeMembers = subscribeMembers((rows) => {
        setMembers(rows);
        markLoaded();
      });
      const unsubscribeRelations = subscribeMemberRelations((rows) => {
        setRelations(rows.filter((relation) => relation.status === "active"));
        markLoaded();
      });

      return () => {
        unsubscribeMembers();
        unsubscribeRelations();
      };
    } catch (error) {
      setIsLoading(false);
      setPageError(error instanceof Error ? error.message : "メンバー一覧の読み込みに失敗しました。");
    }

    return undefined;
  }, []);

  return (
    <section className="card members-page">
      <h1>メンバー</h1>
      <p className="muted">クラブ内の人を見るための画面です。管理用の設定変更は含みません。</p>
      {pageError && <p className="field-error">{pageError}</p>}
      {isLoading && <p className="muted">読み込み中...</p>}

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
        {visibleMembers.map((member) => {
          const childRelations = member.role === "child" ? childRelationsByChildId[member.id] ?? [] : [];

          return (
            <article key={member.id} className="member-card">
              <div className="member-main">
                <span className="member-icon" aria-hidden="true">
                  {memberTypeIcon(member)}
                </span>
                <div className="member-meta">
                  <strong className="member-name">{member.name}</strong>
                  {member.nameKana && <span className="member-kana">{member.nameKana}</span>}
                  <span className="member-type">{memberTypeLabel(member)}</span>
                </div>
                <span className="member-card-spacer" />
              </div>
              {member.role === "child" && (
                <button
                  type="button"
                  className="member-relation-link"
                  onClick={() => setRelationTargetId(member.id)}
                >
                  保護者: {childRelations.length}
                </button>
              )}
            </article>
          );
        })}
        {!isLoading && visibleMembers.length === 0 && <p className="muted">表示できるメンバーはまだありません。</p>}
      </div>

      {relationTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => setRelationTargetId(null)}
            >
              ×
            </button>
            <h3>{relationTarget.name} の保護者</h3>
            <div className="members-list">
              {relationTargetItems.map((relation) => (
                <article key={relation.id} className="member-card">
                  <div className="member-main">
                    <span className="member-icon" aria-hidden="true">
                      👪
                    </span>
                    <div className="member-meta">
                      <strong className="member-name">
                        {memberNameById[relation.guardianMemberId] || relation.guardianMemberId}
                      </strong>
                      <span className="member-type">{relationTypeLabel[relation.relationType]}</span>
                    </div>
                  </div>
                </article>
              ))}
              {relationTargetItems.length === 0 && <p className="muted">保護者情報は未設定です。</p>}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
