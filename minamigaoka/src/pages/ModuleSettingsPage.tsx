import { Fragment, useEffect, useMemo, useState } from "react";
import { adminRoleOptions, memberTypeOptions, staffPermissionOptions } from "../members/permissions";
import {
  defaultModuleVisibilitySettings,
  menuModuleDefinitions,
  type ModuleMenuId,
  type ModuleVisibilitySettings,
} from "../modules/menuVisibility";
import {
  saveModuleVisibilitySettings,
  subscribeModuleVisibilitySettings,
} from "../modules/moduleVisibilityService";

const cloneSettings = (settings: ModuleVisibilitySettings): ModuleVisibilitySettings =>
  JSON.parse(JSON.stringify(settings)) as ModuleVisibilitySettings;

const TEXT = {
  pageTitle: "\u30e2\u30b8\u30e5\u30fc\u30eb\u7ba1\u7406",
  sectionTitle: "\u30e1\u30cb\u30e5\u30fc\u8868\u793a\u8a2d\u5b9a",
  description:
    "\u30e2\u30b8\u30e5\u30fc\u30eb\u3054\u3068\u306e\u30e1\u30cb\u30e5\u30fc\u8868\u793a\u53ef\u5426\u3092\u3001\u5229\u7528\u8005\u533a\u5206\u30fb\u7ba1\u7406\u6a29\u9650\u30fb\u62c5\u5f53\u696d\u52d9\u3054\u3068\u306b\u8a2d\u5b9a\u3057\u307e\u3059\u3002",
  loading: "\u8aad\u307f\u8fbc\u307f\u4e2d...",
  save: "\u4fdd\u5b58",
  saving: "\u4fdd\u5b58\u4e2d...",
  saveSuccess: "\u30e2\u30b8\u30e5\u30fc\u30eb\u8868\u793a\u8a2d\u5b9a\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002",
  saveError: "\u30e2\u30b8\u30e5\u30fc\u30eb\u8868\u793a\u8a2d\u5b9a\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002",
  moduleColumn: "\u30e2\u30b8\u30e5\u30fc\u30eb",
  publicColumn: "\u4e00\u822c\u516c\u958b",
  memberTypes: "\u5229\u7528\u8005\u533a\u5206",
  adminRoles: "\u7ba1\u7406\u6a29\u9650",
  staffPermissions: "\u62c5\u5f53\u696d\u52d9",
  lockedLabel: "\u7ba1\u7406\u8005\u3078\u56fa\u5b9a\u8868\u793a",
  lockedHelp:
    "\u7ba1\u7406\u8005\u304c\u518d\u5165\u5834\u3067\u304d\u308b\u3088\u3046\u56fa\u5b9a\u3055\u308c\u3066\u3044\u307e\u3059",
  sections: {
    activity: "\u6d3b\u52d5",
    accounting: "\u4f1a\u8a08",
    assets: "\u8cc7\u7523",
    settings: "\u8a2d\u5b9a",
  } as Record<string, string>,
};

const adminRoleColumns = adminRoleOptions.filter((option) => option.value !== "none");
const totalColumns = 2 + memberTypeOptions.length + adminRoleColumns.length + staffPermissionOptions.length;

export function ModuleSettingsPage() {
  const [settings, setSettings] = useState<ModuleVisibilitySettings>(defaultModuleVisibilitySettings);
  const [savedSettings, setSavedSettings] = useState<ModuleVisibilitySettings>(defaultModuleVisibilitySettings);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeModuleVisibilitySettings(
      (nextSettings) => {
        setSettings(nextSettings);
        setSavedSettings(nextSettings);
        setIsLoading(false);
      },
      (message) => {
        setPageError(message);
        setIsLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const groupedDefinitions = useMemo(
    () =>
      Object.entries(
        menuModuleDefinitions.reduce<Record<string, typeof menuModuleDefinitions>>((result, definition) => {
          const bucket = result[definition.sectionId] ?? [];
          bucket.push(definition);
          result[definition.sectionId] = bucket;
          return result;
        }, {}),
      ),
    [],
  );

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const toggleSelection = (
    moduleId: ModuleMenuId,
    field: "memberTypes" | "adminRoles" | "staffPermissions",
    value: string,
    checked: boolean,
  ) => {
    setSettings((current) => {
      const next = cloneSettings(current);
      const bucket = new Set(next[moduleId][field] as string[]);
      if (checked) {
        bucket.add(value);
      } else {
        bucket.delete(value);
      }
      next[moduleId] = {
        ...next[moduleId],
        [field]: Array.from(bucket),
      } as ModuleVisibilitySettings[ModuleMenuId];
      return next;
    });
  };

  const togglePublic = (moduleId: ModuleMenuId, checked: boolean) => {
    setSettings((current) => {
      const next = cloneSettings(current);
      next[moduleId] = {
        ...next[moduleId],
        isPublic: checked,
      };
      return next;
    });
  };

  const submit = async () => {
    setIsSaving(true);
    setPageError("");
    setSuccessMessage("");
    try {
      await saveModuleVisibilitySettings(settings);
      setSavedSettings(settings);
      setSuccessMessage(TEXT.saveSuccess);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : TEXT.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="card settings-page">
      <div className="settings-page-header">
        <h1>{TEXT.pageTitle}</h1>
      </div>

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>{TEXT.sectionTitle}</h2>
        </div>
        <p className="muted">{TEXT.description}</p>
        {pageError && <p className="field-error">{pageError}</p>}
        {successMessage && <div className="inline-toast">{successMessage}</div>}
        {isLoading ? (
          <p className="muted">{TEXT.loading}</p>
        ) : (
          <div className="module-settings-table-wrap">
            <table className="module-settings-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="module-settings-module-col">
                    {TEXT.moduleColumn}
                  </th>
                  <th rowSpan={2} className="module-settings-public-col">
                    <span className="module-settings-head-text">{TEXT.publicColumn}</span>
                  </th>
                  <th colSpan={memberTypeOptions.length}>{TEXT.memberTypes}</th>
                  <th colSpan={adminRoleColumns.length}>{TEXT.adminRoles}</th>
                  <th colSpan={staffPermissionOptions.length}>{TEXT.staffPermissions}</th>
                </tr>
                <tr>
                  {memberTypeOptions.map((option) => (
                    <th key={`member-type-${option.value}`} className="module-settings-check-col">
                      <span className="module-settings-head-text">{option.label}</span>
                    </th>
                  ))}
                  {adminRoleColumns.map((option) => (
                    <th key={`admin-role-${option.value}`} className="module-settings-check-col">
                      <span className="module-settings-head-text">{option.label}</span>
                    </th>
                  ))}
                  {staffPermissionOptions.map((option) => (
                    <th key={`staff-permission-${option.value}`} className="module-settings-check-col">
                      <span className="module-settings-head-text">{option.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedDefinitions.map(([sectionId, definitions]) => (
                  <Fragment key={sectionId}>
                    <tr className="module-settings-section-row">
                      <th colSpan={totalColumns}>{TEXT.sections[sectionId] || sectionId}</th>
                    </tr>
                    {definitions.map((definition) => {
                      const rule = settings[definition.id];
                      const locked = definition.lockedToAdmin === true;

                      return (
                        <tr
                          key={definition.id}
                          className={!rule.isPublic ? "module-settings-row-private" : undefined}
                        >
                          <th scope="row" className="module-settings-module-cell">
                            <div className="module-settings-meta">
                              <span className="module-settings-icon" aria-hidden="true">
                                {definition.icon}
                              </span>
                              <span>{definition.label}</span>
                              {locked && <span className="module-settings-lock">{TEXT.lockedLabel}</span>}
                            </div>
                          </th>
                          <td className="module-settings-check-cell module-settings-public-cell">
                            <input
                              type="checkbox"
                              checked={rule.isPublic}
                              disabled={locked}
                              title={
                                locked
                                  ? TEXT.lockedHelp
                                  : `${definition.label} の一般公開を切り替え`
                              }
                              aria-label={`${definition.label} の一般公開を切り替え`}
                              onChange={(event) => togglePublic(definition.id, event.target.checked)}
                            />
                          </td>
                          {memberTypeOptions.map((option) => (
                            <td key={`${definition.id}-${option.value}`} className="module-settings-check-cell">
                              <input
                                type="checkbox"
                                checked={rule.memberTypes.includes(option.value)}
                                disabled={locked}
                                title={
                                  locked
                                    ? TEXT.lockedHelp
                                    : `${definition.label} の ${option.label} 表示を切り替え`
                                }
                                aria-label={`${definition.label} の ${option.label} 表示を切り替え`}
                                onChange={(event) =>
                                  toggleSelection(definition.id, "memberTypes", option.value, event.target.checked)
                                }
                              />
                            </td>
                          ))}
                          {adminRoleColumns.map((option) => (
                            <td key={`${definition.id}-${option.value}`} className="module-settings-check-cell">
                              <input
                                type="checkbox"
                                checked={rule.adminRoles.includes(option.value)}
                                disabled={locked}
                                title={
                                  locked
                                    ? TEXT.lockedHelp
                                    : `${definition.label} の ${option.label} 表示を切り替え`
                                }
                                aria-label={`${definition.label} の ${option.label} 表示を切り替え`}
                                onChange={(event) =>
                                  toggleSelection(definition.id, "adminRoles", option.value, event.target.checked)
                                }
                              />
                            </td>
                          ))}
                          {staffPermissionOptions.map((option) => (
                            <td key={`${definition.id}-${option.value}`} className="module-settings-check-cell">
                              <input
                                type="checkbox"
                                checked={rule.staffPermissions.includes(option.value)}
                                disabled={locked}
                                title={
                                  locked
                                    ? TEXT.lockedHelp
                                    : `${definition.label} の ${option.label} 表示を切り替え`
                                }
                                aria-label={`${definition.label} の ${option.label} 表示を切り替え`}
                                onChange={(event) =>
                                  toggleSelection(
                                    definition.id,
                                    "staffPermissions",
                                    option.value,
                                    event.target.checked,
                                  )
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="settings-actions">
          <button type="button" className="button" onClick={() => void submit()} disabled={isSaving || !isDirty}>
            {isSaving ? TEXT.saving : TEXT.save}
          </button>
        </div>
      </section>
    </section>
  );
}
