export const SOCKET_NAMES = ["socket1", "socket2", "socket3", "socket4"] as const;

/**
 * Returns all MQTT topic strings scoped to a specific ESP32 device.
 * Topics follow the pattern: {deviceId}/...
 */
export function getTopics(deviceId: string) {
  return {
    /** Publish ON/OFF commands to the device */
    controlBase:     `${deviceId}/control/`,
    /** Receive state updates from the device */
    statusBase:      `${deviceId}/status/`,
    /** Request the device to publish current socket state */
    statusGetBase:   `${deviceId}/status/get/`,
    /** Publish/receive online|offline device presence */
    deviceStatus:    `device/${deviceId}/status`,
    /** Ask the device to re-publish its presence */
    deviceStatusGet: `device/${deviceId}/status/get`,
    /** Push full schedule JSON to the device */
    scheduleSet:     `${deviceId}/schedule/set`,
    /** Wildcard: subscribe to all status updates from the device */
    statusAll:       `${deviceId}/status/#`,
  };
}

// -------------------------------------------------------
// Legacy constants kept for backwards-compat during migration
// -------------------------------------------------------
export const CONTROL_BASE  = "esp32/extension/control/";
export const STATUS_BASE   = "esp32/extension/status/";
export const DEVICE_STATUS = "device/status/";