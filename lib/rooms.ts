/**
 * 레거시 호환용 강의실 목록
 *
 * 과거 코드에서 `@/lib/rooms` 를 참조하는 경우가 있어 유지합니다.
 * 단일 소스는 `lib/space.ts`의 ROOMS 이며, 여기서는 화면에서 필요한 최소 형태(id/name)만 제공합니다.
 */

import { ROOMS } from "./space";
import type { Room } from "./types";

export const rooms: Room[] = ROOMS.map((r) => ({ id: r.id, name: r.name }));
