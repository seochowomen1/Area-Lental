"use client";

import type { RoomCategory } from "@/lib/space";

type Props = { category: RoomCategory };

const HEADER: Record<RoomCategory, string> = {
  lecture: "강의실 대관 신청서",
  studio: "E-스튜디오 대관 신청서",
  gallery: "우리동네 갤러리 대관 신청서",
};

function BlankRow({ label, colSpan }: { label: string; colSpan?: number }) {
  return (
    <tr>
      <th className="th-label">{label}</th>
      <td className="td-blank" colSpan={colSpan}>&nbsp;</td>
    </tr>
  );
}

function LectureForm() {
  return (
    <>
      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={4}>대관 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="th-label">공간명</th>
            <td className="td-blank">&nbsp;</td>
            <th className="th-label">층</th>
            <td className="td-blank">&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">대관 일자</th>
            <td className="td-blank" colSpan={3}>
              <span className="placeholder-text">년 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 월 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 일</span>
            </td>
          </tr>
          <tr>
            <th className="th-label">대관 시간</th>
            <td className="td-blank" colSpan={3}>
              <span className="placeholder-text">시 &nbsp;&nbsp;&nbsp;&nbsp; 분 &nbsp; ~ &nbsp;&nbsp;&nbsp;&nbsp; 시 &nbsp;&nbsp;&nbsp;&nbsp; 분</span>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={4}>신청자 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="th-label">성명</th>
            <td className="td-blank">&nbsp;</td>
            <th className="th-label">생년월일</th>
            <td className="td-blank">&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">주소</th>
            <td className="td-blank" colSpan={3}>&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">연락처</th>
            <td className="td-blank">&nbsp;</td>
            <th className="th-label">이메일</th>
            <td className="td-blank">&nbsp;</td>
          </tr>
        </tbody>
      </table>

      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "75%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={2}>단체 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="th-label">단체명</th>
            <td className="td-blank">&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">인원</th>
            <td className="td-blank">
              <span className="placeholder-text">명</span>
            </td>
          </tr>
          <tr>
            <th className="th-label">사용 목적</th>
            <td className="td-blank td-tall">&nbsp;</td>
          </tr>
        </tbody>
      </table>

      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "75%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={2}>장비 대여 (선택)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="td-blank" colSpan={2}>
              <div className="checkbox-row">
                <label className="checkbox-item">☐ 노트북 (10,000원)</label>
                <label className="checkbox-item">☐ 빔프로젝터 (10,000원)</label>
                <label className="checkbox-item">☐ 음향 (10,000원)</label>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function StudioForm() {
  return (
    <>
      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={4}>대관 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="th-label">대관 일자</th>
            <td className="td-blank" colSpan={3}>
              <span className="placeholder-text">년 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 월 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 일</span>
            </td>
          </tr>
          <tr>
            <th className="th-label">대관 시간</th>
            <td className="td-blank" colSpan={3}>
              <span className="placeholder-text">시 &nbsp;&nbsp;&nbsp;&nbsp; 분 &nbsp; ~ &nbsp;&nbsp;&nbsp;&nbsp; 시 &nbsp;&nbsp;&nbsp;&nbsp; 분</span>
            </td>
          </tr>
          <tr>
            <th className="th-label">이용 인원</th>
            <td className="td-blank" colSpan={3}>
              <span className="placeholder-text">명 (기본 2인, 추가 1인당 시간당 5,000원)</span>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={4}>신청자 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="th-label">성명</th>
            <td className="td-blank">&nbsp;</td>
            <th className="th-label">생년월일</th>
            <td className="td-blank">&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">주소</th>
            <td className="td-blank" colSpan={3}>&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">연락처</th>
            <td className="td-blank">&nbsp;</td>
            <th className="th-label">이메일</th>
            <td className="td-blank">&nbsp;</td>
          </tr>
        </tbody>
      </table>

      <table className="form-table">
        <colgroup>
          <col style={{ width: "100%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header">촬영 장비 대여 (선택)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="td-blank">
              <div className="checkbox-grid">
                <label className="checkbox-item">☐ 미러리스 소니 A6400 (10,000원)</label>
                <label className="checkbox-item">☐ 캠코더 Sony FDR-AX700 (10,000원)</label>
                <label className="checkbox-item">☐ 무선 마이크 5개 (10,000원)</label>
                <label className="checkbox-item">☐ 핀 마이크 1개 (5,000원)</label>
                <label className="checkbox-item">☐ 로데 비디오 마이크 + 스탠드 (10,000원)</label>
                <label className="checkbox-item">☐ 전자칠판 65&quot; + 모니터 43&quot; + 노트북 (20,000원)</label>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function GalleryForm() {
  return (
    <>
      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={4}>전시 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="th-label">전시 기간</th>
            <td className="td-blank" colSpan={3}>
              <span className="placeholder-text">년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일 &nbsp; ~ &nbsp;&nbsp; 년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</span>
            </td>
          </tr>
          <tr>
            <th className="th-label">준비일</th>
            <td className="td-blank">
              <span className="placeholder-text">년 &nbsp; 월 &nbsp; 일</span>
            </td>
            <th className="th-label">철수 시간</th>
            <td className="td-blank">
              <span className="placeholder-text">시 &nbsp;&nbsp;&nbsp;&nbsp; 분 (17시 이전)</span>
            </td>
          </tr>
          <tr>
            <th className="th-label">전시명</th>
            <td className="td-blank" colSpan={3}>&nbsp;</td>
          </tr>
        </tbody>
      </table>

      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={4}>신청자 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="th-label">성명</th>
            <td className="td-blank">&nbsp;</td>
            <th className="th-label">생년월일</th>
            <td className="td-blank">&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">주소</th>
            <td className="td-blank" colSpan={3}>&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">연락처</th>
            <td className="td-blank">&nbsp;</td>
            <th className="th-label">이메일</th>
            <td className="td-blank">&nbsp;</td>
          </tr>
          <tr>
            <th className="th-label">단체명</th>
            <td className="td-blank" colSpan={3}>&nbsp;</td>
          </tr>
        </tbody>
      </table>

      <table className="form-table">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "75%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header" colSpan={2}>전시 상세</th>
          </tr>
        </thead>
        <tbody>
          <BlankRow label="전시 목적" />
          <BlankRow label="장르·내용" />
          <tr>
            <th className="th-label">인지 경로</th>
            <td className="td-blank">
              <div className="checkbox-row">
                <label className="checkbox-item">☐ 홈페이지</label>
                <label className="checkbox-item">☐ 전단지</label>
                <label className="checkbox-item">☐ 구청</label>
                <label className="checkbox-item">☐ 지인 소개</label>
                <label className="checkbox-item">☐ 기타</label>
              </div>
            </td>
          </tr>
          <BlankRow label="특이사항" />
        </tbody>
      </table>

      <table className="form-table">
        <colgroup>
          <col style={{ width: "100%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="section-header">대관 요금 안내</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="td-blank" style={{ fontSize: "12px", lineHeight: "1.8" }}>
              평일 20,000원/일 &nbsp;|&nbsp; 토요일 10,000원/일 &nbsp;|&nbsp; 일·공휴일 휴관<br/>
              준비(세팅)일 1일 무료 지원 (전시 시작일 이전, 휴관일 제외)
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function PledgeSection() {
  return (
    <table className="form-table">
      <colgroup>
        <col style={{ width: "100%" }} />
      </colgroup>
      <thead>
        <tr>
          <th className="section-header">서약 및 동의</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ padding: "10px 14px", fontSize: "12px", lineHeight: "1.8", borderBottom: "1px solid #333" }}>
            <p style={{ marginBottom: "6px" }}>
              본인은 대관 사용 규정을 숙지하였으며, 규정에 따라 시설을 이용할 것을 서약합니다.
            </p>
            <div style={{ display: "flex", gap: "24px", marginBottom: "8px" }}>
              <label className="checkbox-item">☐ 대관 규정 서약에 동의합니다</label>
              <label className="checkbox-item">☐ 개인정보 수집·이용에 동의합니다</label>
            </div>
          </td>
        </tr>
        <tr>
          <td style={{ padding: "14px", borderBottom: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "16px", fontSize: "13px" }}>
              <span>서약 일자: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 년 &nbsp;&nbsp;&nbsp;&nbsp; 월 &nbsp;&nbsp;&nbsp;&nbsp; 일</span>
              <span style={{ marginLeft: "24px" }}>
                서약자 성명: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (서명/인)
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const FORMS: Record<RoomCategory, () => JSX.Element> = {
  lecture: LectureForm,
  studio: StudioForm,
  gallery: GalleryForm,
};

export default function PrintForm({ category }: Props) {
  const FormBody = FORMS[category];

  return (
    <>
      <style jsx global>{`
        @media print {
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-page { padding: 0; margin: 0; box-shadow: none; }
        }
        .print-page {
          max-width: 800px;
          margin: 0 auto;
          padding: 32px 24px;
          font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
          color: #111;
          font-size: 13px;
        }
        .print-header {
          text-align: center;
          margin-bottom: 24px;
          padding-bottom: 12px;
          border-bottom: 3px double #333;
        }
        .print-header h1 {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 4px;
          letter-spacing: 2px;
        }
        .print-header p {
          font-size: 13px;
          color: #666;
          margin: 0;
        }
        .form-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }
        .section-header {
          background: #f1f5f9;
          font-size: 13px;
          font-weight: 700;
          padding: 8px 14px;
          text-align: left;
          border: 1px solid #333;
        }
        .th-label {
          background: #f8fafc;
          font-weight: 600;
          font-size: 12px;
          padding: 10px 14px;
          text-align: left;
          border: 1px solid #333;
          white-space: nowrap;
          vertical-align: middle;
        }
        .td-blank {
          padding: 10px 14px;
          border: 1px solid #333;
          min-height: 36px;
          vertical-align: middle;
        }
        .td-tall {
          height: 60px;
          vertical-align: top;
        }
        .placeholder-text {
          color: #999;
          font-size: 12px;
        }
        .checkbox-row {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }
        .checkbox-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 20px;
        }
        .checkbox-item {
          font-size: 12px;
          white-space: nowrap;
        }
        .print-footer {
          margin-top: 20px;
          text-align: center;
          font-size: 12px;
          color: #999;
          border-top: 1px solid #ddd;
          padding-top: 12px;
        }
      `}</style>

      <div className="no-print" style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "white",
        borderBottom: "1px solid #e2e8f0",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}>
        <a
          href="/"
          style={{
            fontSize: "14px",
            color: "#64748b",
            textDecoration: "none",
          }}
        >
          ← 홈으로
        </a>
        <button
          onClick={() => window.print()}
          style={{
            padding: "8px 24px",
            fontSize: "14px",
            fontWeight: 600,
            color: "white",
            background: "rgb(var(--brand-primary))",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          인쇄하기
        </button>
      </div>

      <div className="print-page">
        <div className="print-header">
          <h1>{HEADER[category]}</h1>
          <p>서초여성가족플라자</p>
        </div>

        <FormBody />
        <PledgeSection />

        <div className="print-footer">
          서초여성가족플라자 &nbsp;|&nbsp; 문의: 070-7163-2953
        </div>
      </div>
    </>
  );
}
