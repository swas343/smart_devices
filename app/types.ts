export type SocketName = "socket1" | "socket2" | "socket3" | "socket4";

export type SocketStatus = "on" | "off";

export interface SocketState {
  socket1: SocketStatus;
  socket2: SocketStatus;
  socket3: SocketStatus;
  socket4: SocketStatus;
}

// -------------------------------------------------------
// Device & Schedule types (mirrors Prisma models)
// -------------------------------------------------------

export interface Device {
  id:       string;   // Prisma cuid
  deviceId: string;   // Hardware ID flashed on ESP32, e.g. "device_001"
  name:     string;
}

export type ScheduleType = "repeating_daily" | "one_time";
export type ScheduleAction = "on" | "off";

export interface Schedule {
  id:           string;
  deviceId:     string;   // Prisma Device.id
  socketNumber: number;   // 1–4
  type:         ScheduleType;
  triggerAt:    string;   // "HH:MM" for repeating_daily, ISO 8601 for one_time
  action:       ScheduleAction;
  enabled:      boolean;
  createdAt:    string;
}