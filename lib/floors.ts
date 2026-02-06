/**
 * 층별 공간 데이터 (레거시 호환성 유지)
 * 
 * ⚠️ 이 파일은 기존 코드 호환성을 위해 유지됩니다.
 * 실제 데이터는 lib/space.ts에서 import하여 사용합니다.
 * 
 * 새로운 코드에서는 lib/space.ts를 직접 import하는 것을 권장합니다.
 */

import { ROOMS, FLOORS as FLOOR_LIST, type FloorId, getFloorIdByRoomId } from "./space";

/**
 * 층별 공간 정보 (간소화된 형태)
 */
export type FloorRoom = { 
  id: string; 
  name: string; 
};

/**
 * 층 정의
 */
export type FloorDef = {
  id: FloorId;
  name: string;
  rooms: FloorRoom[];
};

/**
 * 층 목록 (공간 정보 포함)
 * lib/space.ts의 데이터를 기반으로 자동 생성
 */
export const FLOORS: FloorDef[] = FLOOR_LIST.map(floor => ({
  id: floor.id,
  name: floor.label,
  rooms: ROOMS
    .filter(room => room.floor === floor.id)
    .map(room => ({ id: room.id, name: room.name }))
}));

/**
 * 레거시 호환성을 위한 export
 */
export { FloorId };

/**
 * 공간 ID로 층 ID 조회 (레거시 함수명)
 */
export function floorByRoomId(roomId: string): FloorId | null {
  return getFloorIdByRoomId(roomId);
}
