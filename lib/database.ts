/**
 * 데이터베이스 추상화 레이어
 * 
 * Mock 모드와 실제 모드(Google Sheets)를 통합하여 관리합니다.
 * 환경 변수에 따라 자동으로 적절한 구현체를 선택합니다.
 */

import type { RentalRequest, BlockedSlot, ClassSchedule, RequestStatus, PaymentPatch } from "./types";
import { isMockMode } from "./env";

/**
 * 간단한 인메모리 TTL 캐시
 * Serverless 환경에서 동일 인스턴스 내 반복 호출을 줄여줍니다.
 */
class TtlCache<T> {
  private data: T | null = null;
  private expiresAt = 0;
  constructor(private ttlMs: number) {}

  get(): T | null {
    if (this.data !== null && Date.now() < this.expiresAt) return this.data;
    return null;
  }
  set(value: T) {
    this.data = value;
    this.expiresAt = Date.now() + this.ttlMs;
  }
  invalidate() {
    this.data = null;
    this.expiresAt = 0;
  }
}

/**
 * 데이터베이스 인터페이스
 */
export interface Database {
  // 대관 신청 관련
  getAllRequests(): Promise<RentalRequest[]>;
  /** 캐시를 거치지 않은 최신 목록 — 겹침 검증·삭제 판정 전용 (audit-fix-1 [2]) */
  getAllRequestsFresh(): Promise<RentalRequest[]>;
  getRequestById(id: string): Promise<RentalRequest | null>;
  getRequestsByBatchId(batchId: string): Promise<RentalRequest[]>;
  appendRequest(input: Omit<RentalRequest, "requestId" | "createdAt" | "status" | "adminMemo" | "rejectReason" | "decidedAt" | "decidedBy" | "roomName">): Promise<RentalRequest>;
  /** 여러 회차를 한 번에 저장(시트 append를 1회로) */
  appendRequestsBatch(inputs: Array<Parameters<Database["appendRequest"]>[0]>): Promise<RentalRequest[]>;
  updateRequestStatus(args: {
    requestId: string;
    status: RequestStatus;
    adminMemo?: string;
    rejectReason?: string;
    decidedBy: string;
    discountRatePct?: number;
    discountAmountKRW?: number;
    discountReason?: string;
  }): Promise<RentalRequest>;
  /**
   * 여러 행 상태 일괄 변경 (audit-fix-1 [9]) — 시트 읽기 1·쓰기 1, 실패 시 throw(부분 반영 없음)
   * adminMemo·rejectReason을 생략하면 기존 값 유지
   */
  updateRequestsStatusBatch(
    updates: Array<{ requestId: string; status: RequestStatus; adminMemo?: string; rejectReason?: string; decidedBy: string }>,
    discount?: { batchId: string; discountRatePct: number; discountAmountKRW: number; discountReason: string },
    /** 같은 쓰기 요청에 결제 기록 필드도 합침(묶음 전 행 동일 값) */
    payment?: { requestId: string; patch: PaymentPatch }
  ): Promise<RentalRequest[]>;
  /** 결제 기록 필드 갱신 — 묶음이면 전 행 동기화. 갱신된 행 전부 반환 (2026-10-26) */
  updateRequestPayment(args: { requestId: string; patch: PaymentPatch }): Promise<RentalRequest[]>;
  /** 반려/취소된 신청건 삭제 */
  deleteRequests(requestIds: string[]): Promise<void>;

  // 정규 수업 일정 관련
  getClassSchedules(): Promise<ClassSchedule[]>;
  addClassSchedule(schedule: Omit<ClassSchedule, "id">): Promise<ClassSchedule>;
  updateClassSchedule(id: string, updates: Partial<Omit<ClassSchedule, "id">>): Promise<ClassSchedule>;
  deleteClassSchedule(id: string): Promise<void>;
  /** 출처(source)별 일괄 교체 — 외부 시스템 동기화용 */
  replaceClassSchedulesBySource(source: string, items: Omit<ClassSchedule, "id">[]): Promise<{ deleted: number; added: number }>;

  // 차단 시간대 관련
  getBlocks(): Promise<BlockedSlot[]>;
  addBlock(block: Omit<BlockedSlot, "id">): Promise<BlockedSlot>;
  deleteBlock(id: string): Promise<void>;

  // 이메일 템플릿 관련
  getEmailTemplates(): Promise<{ category: string; status: string; subject: string; body: string }[]>;
  saveEmailTemplate(category: string, status: string, subject: string, body: string): Promise<void>;
}

/**
 * Mock 데이터베이스 구현체 (로컬 테스트용)
 */
class MockDatabase implements Database {
  private mockdb = import("./mockdb");

  async getAllRequests() {
    const { mock_getAllRequests } = await this.mockdb;
    return mock_getAllRequests();
  }

  async getAllRequestsFresh() {
    const { mock_getAllRequests } = await this.mockdb;
    return mock_getAllRequests();
  }

  async updateRequestsStatusBatch(
    updates: Parameters<Database["updateRequestsStatusBatch"]>[0],
    discount?: Parameters<Database["updateRequestsStatusBatch"]>[1],
    payment?: Parameters<Database["updateRequestsStatusBatch"]>[2]
  ) {
    const { mock_updateRequestsStatusBatch } = await this.mockdb;
    return mock_updateRequestsStatusBatch(updates, discount, payment);
  }

  async getRequestById(id: string) {
    const { mock_getRequestById } = await this.mockdb;
    return mock_getRequestById(id);
  }

  async getRequestsByBatchId(batchId: string) {
    const all = await this.getAllRequests();
    return all.filter((r) => r.batchId === batchId);
  }

  async appendRequest(input: Parameters<Database["appendRequest"]>[0]) {
    const { mock_appendRequest } = await this.mockdb;
    return mock_appendRequest(input);
  }

  async appendRequestsBatch(inputs: Array<Parameters<Database["appendRequest"]>[0]>) {
    const { mock_appendRequestsBatch } = await this.mockdb;
    return mock_appendRequestsBatch(inputs);
  }

  async updateRequestStatus(args: Parameters<Database["updateRequestStatus"]>[0]) {
    const { mock_updateRequestStatus } = await this.mockdb;
    return mock_updateRequestStatus(args);
  }

  async updateRequestPayment(args: { requestId: string; patch: PaymentPatch }) {
    const { mock_updateRequestPayment } = await this.mockdb;
    return mock_updateRequestPayment(args);
  }

  async deleteRequests(requestIds: string[]) {
    const { mock_deleteRequests } = await this.mockdb;
    return mock_deleteRequests(requestIds);
  }

  async getClassSchedules() {
    const { mock_getClassSchedules } = await this.mockdb;
    return mock_getClassSchedules();
  }

  async addClassSchedule(schedule: Omit<ClassSchedule, "id">) {
    const { mock_addClassSchedule } = await this.mockdb;
    return mock_addClassSchedule(schedule);
  }

  async updateClassSchedule(id: string, updates: Partial<Omit<ClassSchedule, "id">>) {
    const { mock_updateClassSchedule } = await this.mockdb;
    return mock_updateClassSchedule(id, updates);
  }

  async deleteClassSchedule(id: string) {
    const { mock_deleteClassSchedule } = await this.mockdb;
    return mock_deleteClassSchedule(id);
  }

  async replaceClassSchedulesBySource(source: string, items: Omit<ClassSchedule, "id">[]) {
    const { mock_replaceClassSchedulesBySource } = await this.mockdb;
    return mock_replaceClassSchedulesBySource(source, items);
  }

  async getBlocks() {
    const { mock_getBlocks } = await this.mockdb;
    return mock_getBlocks();
  }

  async addBlock(block: Omit<BlockedSlot, "id">) {
    const { mock_addBlock } = await this.mockdb;
    return mock_addBlock(block);
  }

  async deleteBlock(id: string) {
    const { mock_deleteBlock } = await this.mockdb;
    return mock_deleteBlock(id);
  }

  async getEmailTemplates() {
    const { mock_getEmailTemplates } = await this.mockdb;
    return mock_getEmailTemplates();
  }

  async saveEmailTemplate(category: string, status: string, subject: string, body: string) {
    const { mock_saveEmailTemplate } = await this.mockdb;
    return mock_saveEmailTemplate(category, status, subject, body);
  }
}

/**
 * Google Sheets 데이터베이스 구현체 (실제 운영용)
 */
class SheetsDatabase implements Database {
  private sheets = import("./sheets");
  private requestsCache = new TtlCache<RentalRequest[]>(30_000); // 30초 TTL (관리자 뷰 안정성)
  private schedulesCache = new TtlCache<ClassSchedule[]>(90_000); // 90초 TTL (변경 빈도 낮음)
  private blocksCache = new TtlCache<BlockedSlot[]>(60_000); // 60초 TTL

  async getAllRequests() {
    const cached = this.requestsCache.get();
    if (cached) return cached;
    const { getAllRequests } = await this.sheets;
    const result = await getAllRequests();
    this.requestsCache.set(result);
    return result;
  }

  /** 캐시 우회 읽기 — 읽은 결과로 캐시도 갱신 */
  async getAllRequestsFresh() {
    const { getAllRequests } = await this.sheets;
    const result = await getAllRequests();
    this.requestsCache.set(result);
    return result;
  }

  async getRequestById(id: string) {
    const { getRequestById } = await this.sheets;
    return getRequestById(id);
  }

  async updateRequestsStatusBatch(
    updates: Parameters<Database["updateRequestsStatusBatch"]>[0],
    discount?: Parameters<Database["updateRequestsStatusBatch"]>[1],
    payment?: Parameters<Database["updateRequestsStatusBatch"]>[2]
  ) {
    this.requestsCache.invalidate();
    const { updateRequestsStatusBatch } = await this.sheets;
    try {
      return await updateRequestsStatusBatch(updates, discount, payment);
    } finally {
      this.requestsCache.invalidate();
    }
  }

  async getRequestsByBatchId(batchId: string) {
    const all = await this.getAllRequests();
    return all.filter((r) => r.batchId === batchId);
  }

  // ★ 쓰기 메서드는 쓰기 전·후 모두 캐시 무효화 (audit-fix-1 [2] — 쓰기 도중 다른 요청이 옛 값을 캐시에 넣는 경우 방지)
  async appendRequest(input: Parameters<Database["appendRequest"]>[0]) {
    this.requestsCache.invalidate();
    const { appendRequest } = await this.sheets;
    try { return await appendRequest(input); } finally { this.requestsCache.invalidate(); }
  }

  async appendRequestsBatch(inputs: Array<Parameters<Database["appendRequest"]>[0]>) {
    this.requestsCache.invalidate();
    const { appendRequestsBatch } = await this.sheets;
    try { return await appendRequestsBatch(inputs); } finally { this.requestsCache.invalidate(); }
  }

  async updateRequestStatus(args: Parameters<Database["updateRequestStatus"]>[0]) {
    this.requestsCache.invalidate();
    const { updateRequestStatus } = await this.sheets;
    try { return await updateRequestStatus(args); } finally { this.requestsCache.invalidate(); }
  }

  async updateRequestPayment(args: { requestId: string; patch: PaymentPatch }) {
    this.requestsCache.invalidate();
    const { updateRequestPayment } = await this.sheets;
    const result = await updateRequestPayment(args);
    this.requestsCache.invalidate();
    return result;
  }

  async deleteRequests(requestIds: string[]) {
    this.requestsCache.invalidate();
    const { deleteRequests } = await this.sheets;
    try { return await deleteRequests(requestIds); } finally { this.requestsCache.invalidate(); }
  }

  async getClassSchedules() {
    const cached = this.schedulesCache.get();
    if (cached) return cached;
    const { getClassSchedules } = await this.sheets;
    const result = await getClassSchedules();
    this.schedulesCache.set(result);
    return result;
  }

  async addClassSchedule(schedule: Omit<ClassSchedule, "id">) {
    this.schedulesCache.invalidate();
    const { addClassSchedule } = await this.sheets;
    try { return await addClassSchedule(schedule); } finally { this.schedulesCache.invalidate(); }
  }

  async updateClassSchedule(id: string, updates: Partial<Omit<ClassSchedule, "id">>) {
    this.schedulesCache.invalidate();
    const { updateClassSchedule } = await this.sheets;
    try { return await updateClassSchedule(id, updates); } finally { this.schedulesCache.invalidate(); }
  }

  async deleteClassSchedule(id: string) {
    this.schedulesCache.invalidate();
    const { deleteClassSchedule } = await this.sheets;
    try { return await deleteClassSchedule(id); } finally { this.schedulesCache.invalidate(); }
  }

  async replaceClassSchedulesBySource(source: string, items: Omit<ClassSchedule, "id">[]) {
    this.schedulesCache.invalidate();
    const { replaceClassSchedulesBySource } = await this.sheets;
    try { return await replaceClassSchedulesBySource(source, items); } finally { this.schedulesCache.invalidate(); }
  }

  async getBlocks() {
    const cached = this.blocksCache.get();
    if (cached) return cached;
    const { getBlocks } = await this.sheets;
    const result = await getBlocks();
    this.blocksCache.set(result);
    return result;
  }

  async addBlock(block: Omit<BlockedSlot, "id">) {
    this.blocksCache.invalidate();
    const { addBlock } = await this.sheets;
    try { return await addBlock(block); } finally { this.blocksCache.invalidate(); }
  }

  async deleteBlock(id: string) {
    this.blocksCache.invalidate();
    const { deleteBlock } = await this.sheets;
    try { return await deleteBlock(id); } finally { this.blocksCache.invalidate(); }
  }

  async getEmailTemplates() {
    const { getEmailTemplates } = await this.sheets;
    return getEmailTemplates();
  }

  async saveEmailTemplate(category: string, status: string, subject: string, body: string) {
    const { saveEmailTemplate } = await this.sheets;
    return saveEmailTemplate(category, status, subject, body);
  }
}

/**
 * 데이터베이스 인스턴스 (싱글톤)
 */
let dbInstance: Database | null = null;

/**
 * 데이터베이스 인스턴스 가져오기
 * 
 * 환경 변수에 따라 자동으로 Mock 또는 Sheets 구현체를 반환합니다.
 * 
 * @example
 * const db = getDatabase();
 * const requests = await db.getAllRequests();
 */
export function getDatabase(): Database {
  if (dbInstance) {
    return dbInstance;
  }

  // ✅ 로컬 개발(MOCK_MODE=true)에서는 Google/SMTP 환경변수 없이도 동작해야 하므로
  //    "env 전체 검증"을 여기서 강제하지 않습니다.
  dbInstance = isMockMode() ? new MockDatabase() : new SheetsDatabase();
  return dbInstance;
}

/**
 * 레거시 호환성을 위한 export
 * 
 * @deprecated 새로운 코드에서는 getDatabase()를 사용하세요.
 */
export const getAllRequests = () => getDatabase().getAllRequests();
export const getRequestById = (id: string) => getDatabase().getRequestById(id);
export const getBlocks = () => getDatabase().getBlocks();
export const getClassSchedules = () => getDatabase().getClassSchedules();
