export type Room = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type Furniture = {
  id: string;
  roomId: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};
export type HomeLayout = { rooms: Room[]; furniture: Furniture[] };
export const furnitureTypes = [
  { kind: 'sofa', name: '沙发', width: 2.2, height: 0.9 },
  { kind: 'bed', name: '双人床', width: 1.8, height: 2 },
  { kind: 'desk', name: '书桌', width: 1.4, height: 0.65 },
  { kind: 'table', name: '餐桌', width: 1.5, height: 0.9 },
  { kind: 'chair', name: '单椅', width: 0.7, height: 0.7 },
  { kind: 'wardrobe', name: '衣柜', width: 1.8, height: 0.6 },
  { kind: 'plant', name: '绿植', width: 0.5, height: 0.5 },
  { kind: 'rug', name: '地毯', width: 2, height: 1.4 },
];
export const initialLayout: HomeLayout = {
  rooms: [
    { id: 'living', name: '客厅', x: 1, y: 1, width: 5.2, height: 5.6 },
    { id: 'bedroom', name: '卧室', x: 6.2, y: 1, width: 4.4, height: 3.8 },
    { id: 'study', name: '书房', x: 6.2, y: 4.8, width: 4.4, height: 3.2 },
    { id: 'hall', name: '玄关', x: 1, y: 6.6, width: 5.2, height: 1.4 },
  ],
  furniture: [
    {
      id: 'sofa-1',
      roomId: 'living',
      kind: 'sofa',
      x: 0.5,
      y: 3.9,
      width: 2.2,
      height: 0.9,
      rotation: 0,
    },
    {
      id: 'rug-1',
      roomId: 'living',
      kind: 'rug',
      x: 0.6,
      y: 2.1,
      width: 2,
      height: 1.4,
      rotation: 0,
    },
    {
      id: 'plant-1',
      roomId: 'living',
      kind: 'plant',
      x: 4,
      y: 0.8,
      width: 0.5,
      height: 0.5,
      rotation: 0,
    },
    {
      id: 'bed-1',
      roomId: 'bedroom',
      kind: 'bed',
      x: 1.9,
      y: 1.2,
      width: 1.8,
      height: 2,
      rotation: 0,
    },
    {
      id: 'desk-1',
      roomId: 'study',
      kind: 'desk',
      x: 2.4,
      y: 1.7,
      width: 1.4,
      height: 0.65,
      rotation: 0,
    },
  ],
};
export const cloneLayout = (layout: HomeLayout): HomeLayout => JSON.parse(JSON.stringify(layout));
export const snap = (value: number) => Math.round(value * 10) / 10;
export function layoutError(layout: HomeLayout): string {
  if (!layout.rooms.length) return '至少保留一个房间。';
  for (const room of layout.rooms) {
    if (
      !room.name.trim() ||
      room.width < 1 ||
      room.height < 1 ||
      room.x < 0 ||
      room.y < 0 ||
      room.x + room.width > 20.001 ||
      room.y + room.height > 14.001
    )
      return `${room.name || '房间'}：尺寸至少 1 米，且需位于 20 × 14 米画布内。`;
    for (const other of layout.rooms)
      if (
        room.id !== other.id &&
        room.x < other.x + other.width - 0.01 &&
        room.x + room.width > other.x + 0.01 &&
        room.y < other.y + other.height - 0.01 &&
        room.y + room.height > other.y + 0.01
      )
        return `${room.name}与${other.name}重叠，请移动房间或调整尺寸。`;
  }
  for (const item of layout.furniture) {
    const room = layout.rooms.find((r) => r.id === item.roomId);
    if (
      !room ||
      item.x < 0 ||
      item.y < 0 ||
      item.width <= 0 ||
      item.height <= 0 ||
      item.x + item.width > room.width + 0.001 ||
      item.y + item.height > room.height + 0.001
    )
      return '家具超出所属房间，请移动家具或扩大房间。';
    if (item.kind !== 'rug') {
      for (const other of layout.furniture) {
        if (
          other.id !== item.id &&
          other.roomId === item.roomId &&
          other.kind !== 'rug' &&
          item.x < other.x + other.width - 0.01 &&
          item.x + item.width > other.x + 0.01 &&
          item.y < other.y + other.height - 0.01 &&
          item.y + item.height > other.y + 0.01
        )
          return '家具重叠，请移动到空位；地毯允许叠放。';
      }
    }
  }
  return '';
}
