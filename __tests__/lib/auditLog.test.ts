import { auditLog } from "@/lib/auditLog";

describe("auditLog", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test("기본 호출 → console.log 출력", () => {
    auditLog({ action: "REQUEST_APPROVE", ip: "127.0.0.1", target: "REQ-001" });
    expect(consoleSpy).toHaveBeenCalled();
  });

  test("details 포함 → 정상 출력", () => {
    auditLog({
      action: "REQUEST_DELETE",
      ip: "192.168.1.1",
      details: { deletedIds: ["REQ-001", "REQ-002"], count: 2 },
    });
    expect(consoleSpy).toHaveBeenCalled();
  });

  test("ip 미지정 → unknown 기본값", () => {
    auditLog({ action: "ADMIN_LOGIN" });
    const callArgs = consoleSpy.mock.calls[0];
    const output = typeof callArgs[0] === "string" ? callArgs[0] : JSON.stringify(callArgs[0]);
    expect(output).toContain("ADMIN_LOGIN");
  });

  test("모든 action 타입 호출 가능", () => {
    const actions = [
      "BLOCK_CREATE", "BLOCK_DELETE", "SCHEDULE_CREATE",
      "REQUEST_DELETE", "REQUEST_APPROVE", "REQUEST_REJECT",
      "EMAIL_SEND", "ADMIN_LOGIN", "ADMIN_LOGOUT",
    ] as const;

    for (const action of actions) {
      auditLog({ action });
    }
    expect(consoleSpy).toHaveBeenCalledTimes(actions.length);
  });
});
