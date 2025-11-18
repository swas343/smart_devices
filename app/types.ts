export type SocketName = "socket1" | "socket2" | "socket3";

export type SocketStatus = "on" | "off";

export interface SocketState {
  socket1: SocketStatus;
  socket2: SocketStatus;
  socket3: SocketStatus;
}