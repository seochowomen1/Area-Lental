"use client";

import { useState } from "react";

interface Props {
  defaultStatus: string;
  defaultRejectReason: string;
}

export default function SingleStatusFields({ defaultStatus, defaultRejectReason }: Props) {
  const [status, setStatus] = useState(defaultStatus);
  const isReject = status === "반려";

  return (
    <>
      <div>
        <label className="block text-sm font-semibold text-gray-700">처리 상태</label>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
        >
          <option value="접수">접수</option>
          <option value="승인">승인</option>
          <option value="반려">반려</option>
          <option value="취소">취소</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700">
          반려 사유 (반려 시 필수)
        </label>
        <textarea
          name="rejectReason"
          defaultValue={defaultRejectReason}
          disabled={!isReject}
          className={`mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300 ${
            isReject
              ? "border-gray-200 bg-white"
              : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
          }`}
          rows={2}
          placeholder={isReject ? "반려 사유를 입력해 주세요" : "반려를 선택하면 입력할 수 있습니다"}
        />
      </div>
    </>
  );
}
