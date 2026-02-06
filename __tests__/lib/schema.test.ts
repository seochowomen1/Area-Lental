/**
 * Schema 검증 테스트 예시
 * 
 * 실제 테스트를 실행하려면:
 * 1. Jest 설치: npm install --save-dev jest @types/jest ts-jest
 * 2. jest.config.js 설정
 * 3. npm test 실행
 */

import { RequestInputSchema } from '@/lib/schema';

describe('RequestInputSchema', () => {
  describe('유효한 입력', () => {
    it('올바른 데이터는 검증을 통과해야 함', () => {
      const validInput = {
        roomId: '401',
        date: '2024-12-25',
        startTime: '10:00',
        endTime: '12:00',
        applicantName: '홍길동',
        birth: '1990-01-01',
        address: '서울시 서초구',
        phone: '010-1234-5678',
        email: 'test@example.com',
        orgName: '테스트 단체',
        headcount: 10,
        laptop: false,
        projector: true,
        audio: false,
        purpose: '세미나 진행을 위한 공간 대관입니다.',
        privacyAgree: true,
        pledgeAgree: true,
        pledgeDate: '2024-12-01',
        pledgeName: '홍길동',
      };

      const result = RequestInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });

  describe('시간 검증', () => {
    it('1시간 미만은 거부되어야 함', () => {
      const invalidInput = {
        roomId: '401',
        date: '2024-12-25',
        startTime: '10:00',
        endTime: '10:30', // 30분만
        applicantName: '홍길동',
        birth: '1990-01-01',
        address: '서울시 서초구',
        phone: '010-1234-5678',
        email: 'test@example.com',
        orgName: '테스트 단체',
        headcount: 10,
        laptop: false,
        projector: false,
        audio: false,
        purpose: '테스트 목적',
        privacyAgree: true,
        pledgeAgree: true,
        pledgeDate: '2024-12-01',
        pledgeName: '홍길동',
      };

      const result = RequestInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('최소 1시간'))).toBe(true);
      }
    });

    it('6시간 초과는 거부되어야 함', () => {
      const invalidInput = {
        roomId: '401',
        date: '2024-12-25',
        startTime: '10:00',
        endTime: '17:00', // 7시간
        applicantName: '홍길동',
        birth: '1990-01-01',
        address: '서울시 서초구',
        phone: '010-1234-5678',
        email: 'test@example.com',
        orgName: '테스트 단체',
        headcount: 10,
        laptop: false,
        projector: false,
        audio: false,
        purpose: '테스트 목적',
        privacyAgree: true,
        pledgeAgree: true,
        pledgeDate: '2024-12-01',
        pledgeName: '홍길동',
      };

      const result = RequestInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('최대 6시간'))).toBe(true);
      }
    });

    it('30분 단위가 아니면 거부되어야 함', () => {
      const invalidInput = {
        roomId: '401',
        date: '2024-12-25',
        startTime: '10:15', // 15분 단위
        endTime: '12:00',
        applicantName: '홍길동',
        birth: '1990-01-01',
        address: '서울시 서초구',
        phone: '010-1234-5678',
        email: 'test@example.com',
        orgName: '테스트 단체',
        headcount: 10,
        laptop: false,
        projector: false,
        audio: false,
        purpose: '테스트 목적',
        privacyAgree: true,
        pledgeAgree: true,
        pledgeDate: '2024-12-01',
        pledgeName: '홍길동',
      };

      const result = RequestInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('30분 단위'))).toBe(true);
      }
    });
  });

  describe('필수 동의 검증', () => {
    it('개인정보 동의가 없으면 거부되어야 함', () => {
      const invalidInput = {
        roomId: '401',
        date: '2024-12-25',
        startTime: '10:00',
        endTime: '12:00',
        applicantName: '홍길동',
        birth: '1990-01-01',
        address: '서울시 서초구',
        phone: '010-1234-5678',
        email: 'test@example.com',
        orgName: '테스트 단체',
        headcount: 10,
        laptop: false,
        projector: false,
        audio: false,
        purpose: '테스트 목적',
        privacyAgree: false, // 동의하지 않음
        pledgeAgree: true,
        pledgeDate: '2024-12-01',
        pledgeName: '홍길동',
      };

      const result = RequestInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('개인정보'))).toBe(true);
      }
    });

    it('서약 동의가 없으면 거부되어야 함', () => {
      const invalidInput = {
        roomId: '401',
        date: '2024-12-25',
        startTime: '10:00',
        endTime: '12:00',
        applicantName: '홍길동',
        birth: '1990-01-01',
        address: '서울시 서초구',
        phone: '010-1234-5678',
        email: 'test@example.com',
        orgName: '테스트 단체',
        headcount: 10,
        laptop: false,
        projector: false,
        audio: false,
        purpose: '테스트 목적',
        privacyAgree: true,
        pledgeAgree: false, // 동의하지 않음
        pledgeDate: '2024-12-01',
        pledgeName: '홍길동',
      };

      const result = RequestInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('서약'))).toBe(true);
      }
    });
  });

  describe('입력 형식 검증', () => {
    it('잘못된 이메일 형식은 거부되어야 함', () => {
      const invalidInput = {
        roomId: '401',
        date: '2024-12-25',
        startTime: '10:00',
        endTime: '12:00',
        applicantName: '홍길동',
        birth: '1990-01-01',
        address: '서울시 서초구',
        phone: '010-1234-5678',
        email: 'invalid-email', // 잘못된 형식
        orgName: '테스트 단체',
        headcount: 10,
        laptop: false,
        projector: false,
        audio: false,
        purpose: '테스트 목적',
        privacyAgree: true,
        pledgeAgree: true,
        pledgeDate: '2024-12-01',
        pledgeName: '홍길동',
      };

      const result = RequestInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('잘못된 날짜 형식은 거부되어야 함', () => {
      const invalidInput = {
        roomId: '401',
        date: '2024/12/25', // 잘못된 형식 (YYYY-MM-DD가 아님)
        startTime: '10:00',
        endTime: '12:00',
        applicantName: '홍길동',
        birth: '1990-01-01',
        address: '서울시 서초구',
        phone: '010-1234-5678',
        email: 'test@example.com',
        orgName: '테스트 단체',
        headcount: 10,
        laptop: false,
        projector: false,
        audio: false,
        purpose: '테스트 목적',
        privacyAgree: true,
        pledgeAgree: true,
        pledgeDate: '2024-12-01',
        pledgeName: '홍길동',
      };

      const result = RequestInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});
