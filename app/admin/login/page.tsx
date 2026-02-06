import { Suspense } from "react";
import AdminLoginForm from "./AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md p-8 text-center text-sm text-gray-500">로딩 중...</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
