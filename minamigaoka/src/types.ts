export type SessionType = "normal" | "self" | "event";
export type RsvpStatus = "yes" | "maybe" | "no" | "unknown";
export type DutyRequirement = "duty" | "watch";

export type DemoRsvp = {
  uid: string;
  displayName: string;
  status: RsvpStatus;
  comment?: string;
};

export type DemoMember = {
  uid: string;
  grade: number;
  instrumentOrder: number;
  kana: string;
};

export type HouseholdRole = "guardian" | "child";
export type RelationshipToChild = "father" | "mother" | "grandmother" | "aunt" | "other";

export type HouseholdMembership = {
  uid: string;
  role: HouseholdRole;
  relationshipToChild?: RelationshipToChild;
};

export type Household = {
  householdId: string;
  label: string;
  members: HouseholdMembership[];
};

export type DemoUser = {
  uid: string;
  displayName: string;
  householdId?: string;
};

export type SessionDoc = {
  id?: string;
  order: number;
  startTime: string;
  endTime: string;
  type: SessionType;
  eventName?: string;
  dutyRequirement: DutyRequirement;
  // compatibility: dutyRequirement === "duty" の旧フラグ
  requiresShift?: boolean;
  location?: string;
  assigneeFamilyId?: string;
  assignees: string[];
  assigneeNameSnapshot?: string;
  note?: string;
  mainInstructorPlanned?: boolean | null;
  plannedInstructors?: string[];
  plannedSeniors?: string[];
  // demo-only: 本番想定の subcollection(rsvps/{uid}) の代替として画面表示に使う
  demoRsvps?: DemoRsvp[];
};

export type AttendanceTransportMethod = "car" | "walk";

export type AttendanceTransportRecord = {
  to?: AttendanceTransportMethod;
  from?: AttendanceTransportMethod;
  comment?: string;
};

export type ScheduleDayDoc = {
  defaultLocation?: string;
  notice?: string;
  plannedInstructors?: string[];
  plannedSeniors?: string[];
  attendanceTransport?: Record<string, AttendanceTransportRecord>;
  sessions: SessionDoc[];
};

export type Activity = {
  startTime: string;
  type: string;
  title?: string;
  songIds?: string[];
};

export type DayLog = {
  notes: string;
  weather?: string;
  activities: Activity[];
  actualInstructors: string[];
  actualSeniors: string[];
  mainInstructorAttendance?: Record<string, boolean>;
  dutyStamps?: Record<
    string,
    {
      stampedByUid: string;
      stampedByName: string;
      stampedAt: string;
    }
  >;
};

export type RelatedType = "event" | "session";
export type TodoKind = "shared" | "private";
export type TodoSharedScope = "parent" | "officer" | "child";

export type RelatedRef = {
  type: RelatedType;
  id: string;
};

export type EventKind = "コンクール" | "演奏会" | "合同練習" | "その他";
export type EventState = "active" | "done";

export type EventCarpoolVehicle = {
  familyId: string;
  familyNameSnapshot: string;
  vehicleIndex: number;
  maker: string;
  model: string;
  capacity: number | null;
};

export type EventRecord = {
  id: string;
  title: string;
  kind: EventKind;
  state: EventState;
  eventSortDate: string;
  memo?: string;
  sessionIds?: string[];
  carpoolVehicles?: EventCarpoolVehicle[];
};

export type Todo = {
  id: string;
  kind: TodoKind;
  sharedScope?: TodoSharedScope;
  title: string;
  memo?: string;
  completed: boolean;
  createdAt: string;
  createdByUid?: string | null;
  assigneeUid: string | null;
  dueDate?: string;
  related?: RelatedRef | null;
};

export type PurchaseRequestStatus = "OPEN" | "BOUGHT";
export type PaymentMethod = "reimbursement" | "direct_accounting";
export type AccountingSourceType = "purchaseRequest" | "reimbursement" | "lunch" | "membershipFee";
export type ReceiptFileMeta = {
  name: string;
  size: number;
  type: string;
  downloadUrl?: string;
  storagePath?: string;
};
export type AccountingBridgeFields = {
  accountingRequested?: boolean;
  accountingLinked?: boolean;
  accountingEntryId?: string;
  accountingSourceType?: AccountingSourceType;
  accountingSourceId?: string;
  accountingAccountId?: string;
  accountingCategoryId?: string;
  accountingMemo?: string;
};
export type LunchPaymentSplit =
  | {
      type: "quo";
      cardId: string;
      amount: number;
    }
  | {
      type: "reimbursement";
      amount: number;
    };

export type PurchaseRequest = {
  id: string;
  title: string;
  createdAt?: string;
  category?: string;
  memo?: string;
  quantity?: string | number;
  estimatedAmount?: number;
  createdBy: string;
  purchaseAssignees?: string[];
  status: PurchaseRequestStatus;
  boughtBy?: string;
  boughtAt?: string;
  purchaseResult?: {
    itemName: string;
    quantity?: string | number;
    amount?: number;
    purchasedAt: string;
    receiptFilesMeta?: ReceiptFileMeta[];
    accountingRecordRequested?: boolean;
    reimbursementRecordRequested?: boolean;
    reimbursementLinked?: boolean;
    reimbursementId?: string;
  };
} & AccountingBridgeFields;

export type ReimbursementStatus =
  | "OPEN"
  | "PAID_BY_TREASURER"
  | "RECEIVED_BY_BUYER"
  | "DONE";

export type Reimbursement = {
  id: string;
  title: string;
  amount: number;
  purchasedAt: string;
  buyer: string;
  memo?: string;
  receipt?: string;
  receiptFilesMeta?: ReceiptFileMeta[];
  source?: "purchase" | "lunch";
  relatedPurchaseRequestId?: string;
  paidByTreasurerAt?: string;
  receivedByBuyerAt?: string;
} & AccountingBridgeFields;

export type LunchRecord = {
  id: string;
  title: string;
  amount: number;
  purchasedAt: string;
  createdAt?: string;
  updatedAt?: string;
  date: string;
  buyer: string;
  dutyMemberId?: string;
  dutyHouseholdId?: string;
  memo?: string;
  paymentMethod?: PaymentMethod;
  paymentSplits?: LunchPaymentSplit[];
  reimbursementLinked?: boolean;
  reimbursementId?: string;
  imageUrls?: string[];
  receiptFilesMeta?: ReceiptFileMeta[];
} & AccountingBridgeFields;

export type LunchDutySlotType = "WEEKEND_PM";

export type LunchDuty = {
  date: string;
  slotType: LunchDutySlotType;
  assigneeHouseholdId: string;
};

export type MembershipFeeRecordStatus = "requested" | "received";

export type MembershipFeeRecord = {
  id: string;
  memberId: string;
  memberNameSnapshot: string;
  fiscalYear: number;
  monthKeys: string[];
  title: string;
  monthlyAmount: number;
  amount: number;
  status: MembershipFeeRecordStatus;
  requestedOn: string;
  receivedOn?: string;
  createdByUid: string;
  receivedByUid?: string;
  createdAt: string;
  updatedAt: string;
} & AccountingBridgeFields;

export type QuoCard = {
  id: string;
  purchaseDate: string;
  balance: number;
  active: boolean;
  archived?: boolean;
  memo?: string;
};

export type Score = {
  id: string;
  no: number;
  title: string;
  publisher?: string;
  productCode?: string;
  duration?: string;
  note?: string;
};

export type InstrumentStatus = "良好" | "要調整" | "修理中" | "貸出中";

export type Instrument = {
  id: string;
  managementCode?: string;
  code?: string;
  name: string;
  category: string;
  categorySortOrder?: number | null;
  status: InstrumentStatus;
  storageLocation?: string;
  location?: string;
  assigneeMemberId?: string;
  assigneeName?: string;
  assignees?: string[];
  notes?: string;
  note?: string;
  sortOrder?: number | null;
  isActive?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type DocCategory =
  | "運営"
  | "会計"
  | "シフト"
  | "楽器"
  | "楽譜"
  | "イベント"
  | "その他";

export type DocMemo = {
  id: string;
  title: string;
  body: string;
  category?: DocCategory;
  tags?: string[];
  pinned?: boolean;
  updatedAt: string;
};

export type LinkType = "photo" | "sns" | "admin";

export type LinkRole = "all" | "officer";

export type ExternalLinkItem = {
  id: string;
  title: string;
  url: string;
  type: LinkType;
  role: LinkRole;
  ogTitle?: string;
  ogImageUrl?: string;
  faviconUrl?: string;
  host?: string;
};

export type DemoData = {
  scheduleDays: Record<string, ScheduleDayDoc>;
  dayLogs: Record<string, DayLog>;
  members: Record<string, DemoMember>;
  users: Record<string, DemoUser>;
  households: Record<string, Household>;
  events: EventRecord[];
  todos: Todo[];
  purchaseRequests: PurchaseRequest[];
  reimbursements: Reimbursement[];
  instruments: Instrument[];
  scores: Score[];
  docs: DocMemo[];
  lunchRecords: LunchRecord[];
  lunchDuties: LunchDuty[];
  quoCards: QuoCard[];
  demoDictionaries: {
    instructors: string[];
    seniors: string[];
  };
};
