import { useEffect, useMemo, useState } from "react";
import {
  getPrimaryMemberTypeLabel,
  memberMatchesTypeFilter,
  memberTypeFilterOptions,
  sortMembersForDisplay,
  type MemberTypeFilter,
} from "../members/permissions";
import { relationTypeLabel } from "../members/relation";
import { subscribeMemberRelations, subscribeMembers } from "../members/service";
import type { MemberRecord, MemberRelationRecord } from "../members/types";

const memberTypeIcon = (member: MemberRecord): string => {
  if (member.memberTypes.includes("child") || member.role === "child") {
    return "🎵";
  }
  if (member.memberTypes.includes("teacher") || member.role === "teacher") {
    return "🧑‍🏫";
  }
  return "👪";
};

const formatMemberKanaLabel = (member: MemberRecord): string => {
  const familyNameKana = member.familyNameKana?.trim() ?? "";
  const givenNameKana = member.givenNameKana?.trim() ?? "";
  return `${familyNameKana}${givenNameKana}`.trim() || familyNameKana || givenNameKana;
};

export function MemberDirectoryPage() {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [relations, setRelations] = useState<MemberRelationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MemberTypeFilter>("all");
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
      sortMembersForDisplay(
        members.filter(
          (member) => member.memberStatus === "active" && memberMatchesTypeFilter(member, activeTab),
        ),
        activeTab,
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
      {pageError && <p className="field-error">{pageError}</p>}
      {isLoading && <p className="muted">読み込み中...</p>}

      <div className="members-tabs" role="tablist" aria-label="メンバー種別">
        {memberTypeFilterOptions.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`members-tab ${activeTab === item.value ? "active" : ""}`}
            onClick={() => setActiveTab(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="members-list">
        {visibleMembers.map((member) => {
          const kanaLabel = formatMemberKanaLabel(member);
          const childRelations =
            member.memberTypes.includes("child") || member.role === "child"
              ? childRelationsByChildId[member.id] ?? []
              : [];

          return (
            <article key={member.id} className="member-card">
              <div className="member-main">
                <span className="member-icon" aria-hidden="true">
                  {memberTypeIcon(member)}
                </span>
                <div className="member-meta">
                  <strong className="member-name">{member.name}</strong>
                  {kanaLabel && <span className="member-kana">{kanaLabel}</span>}
                  <span className="member-type">{getPrimaryMemberTypeLabel(member)}</span>
                </div>
                <span className="member-card-spacer" />
              </div>
              {(member.memberTypes.includes("child") || member.role === "child") && (
                <button
                  type="button"
                  className="member-relation-link"
                  onClick={() => setRelationTargetId(member.id)}
                >
                  保護者 {childRelations.length}
                </button>
              )}
            </article>
          );
        })}
        {!isLoading && visibleMembers.length === 0 && (
          <p className="muted">表示できるメンバーはまだありません。</p>
        )}
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
