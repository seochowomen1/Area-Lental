/**
 * 데이터베이스 추상화 레이어
 * 
 * Mock 모드와 실제 모드(Google Sheets)를 통합하여 관리합니다.
 * 환경 변수에 따라 자동으로 적절한 구현체를 선택합니다.
 */

import type { RentalRequest, BlockedSlot, ClassSchedule, RequestStatus } from "./types";
import { isMockMode } from "./env";

/**
 * 데이터베이스 인터페이스
 */
export interface Database {
  // 대관 신청 관련
  getAllRequests(): Promise<RentalRequest[]>;
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
  /** 반려/취소된 신청건 삭제 */
  deleteRequests(requestIds: string[]): Promise<void>;

  // 정규 수업 일정 관련
  getClassSchedules(): Promise<ClassSchedule[]>;
  addClassSchedule(schedule: Omit<ClassSchedule, "id">): Promise<ClassSchedule>;
  deleteClassSchedule(id: string): Promise<void>;

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

  async deleteClassSchedule(id: string) {
    const { mock_deleteClassSchedule } = await this.mockdb;
    return mock_deleteClassSchedule(id);
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

  async getAllRequests() {
    const { getAllRequests } = await this.sheets;
    return getAllRequests();
  }

  async getRequestById(id: string) {
    const { getRequestById } = await this.sheets;
    return getRequestById(id);
  }

  async getRequestsByBatchId(batchId: string) {
    const all = await this.getAllRequests();
    return all.filter((r) => r.batchId === batchId);
  }

  async appendRequest(input: Parameters<Database["appendRequest"]>[0]) {
    const { appendRequest } = await this.sheets;
    return appendRequest(input);
  }

  async appendRequestsBatch(inputs: Array<Parameters<Database["appendRequest"]>[0]>) {
    const { appendRequestsBatch } = await this.sheets;
    return appendRequestsBatch(inputs);
  }

  async updateRequestStatus(args: Parameters<Database["updateRequestStatus"]>[0]) {
    const { updateRequestStatus } = await this.sheets;
    return updateRequestStatus(args);
  }

  async deleteRequests(requestIds: string[]) {
    const { deleteRequests } = await this.sheets;
    return deleteRequests(requestIds);
  }

  async getClassSchedules() {
    const { getClassSchedules } = await this.sheets;
    return getClassSchedules();
  }

  async addClassSchedule(schedule: Omit<ClassSchedule, "id">) {
    const { addClassSchedule } = await this.sheets;
    return addClassSchedule(schedule);
  }

  async deleteClassSchedule(id: string) {
    const { deleteClassSchedule } = await this.sheets;
    return deleteClassSchedule(id);
  }

  async getBlocks() {
    const { getBlocks } = await this.sheets;
    return getBlocks();
  }

  async addBlock(block: Omit<BlockedSlot, "id">) {
    const { addBlock } = await this.sheets;
    return addBlock(block);
  }

  async deleteBlock(id: string) {
    const { deleteBlock } = await this.sheets;
    return deleteBlock(id);
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
