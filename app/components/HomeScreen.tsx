"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  Text,
  Switch,
  Group,
  Button,
  Select,
  Title,
  Badge,
  Stack,
} from "@mantine/core";
import { useSession, signOut } from "next-auth/react";
import { SocketName, SocketState, Device } from "../types";
import { getMQTTClient, trackedSubscribe, trackedUnsubscribe, whenConnected } from "../mqtt/client";
import { SOCKET_NAMES, getTopics } from "../constants";
import ScheduleManager from "./ScheduleManager";

const initialSockets: SocketState = {
  socket1: "off",
  socket2: "off",
  socket3: "off",
  socket4: "off",
};

const initialLoading: Record<SocketName, boolean> = {
  socket1: false,
  socket2: false,
  socket3: false,
  socket4: false,
};

const DEVICE_STALE_TIMEOUT_MS = 90_000;
const DEVICE_STALE_CHECK_INTERVAL_MS = 5_000;

export default function HomeScreen() {
  const { data: session } = useSession();

  const [devices, setDevices]               = useState<Device[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus]     = useState("offline");
  const [socketStatus, setSocketStatus]     = useState<SocketState>(initialSockets);
  const [socketLoading, setSocketLoading]   = useState<Record<SocketName, boolean>>(initialLoading);
  const [logs, setLogs]                     = useState<string[]>([]);
  const [mqttConnected, setMqttConnected]   = useState(false);

  // Keep a ref so the MQTT message closure always reads the latest activeDeviceId
  const activeDeviceRef = useRef<string | null>(null);
  const lastSeenAtRef = useRef<number | null>(null);
  useEffect(() => {
    activeDeviceRef.current = activeDeviceId;
  }, [activeDeviceId]);

  // ----------------------------------------------------------
  // Track MQTT connection state (drives re-subscription)
  // ----------------------------------------------------------
  useEffect(() => {
    // Client may already be connected when this effect runs.
    const initialClient = getMQTTClient();
    if (initialClient?.connected) setMqttConnected(true);

    let mqttClientRef: ReturnType<typeof getMQTTClient> | null = null;
    let onConnect: () => void;
    let onOffline: () => void;
    let onClose:   () => void;

    // Await the client; attach persistent connection listeners.
    whenConnected().then((mqttClient) => {
      mqttClientRef = mqttClient;
      setMqttConnected(true);

      onConnect = () => setMqttConnected(true);
      onOffline = () => setMqttConnected(false);
      onClose   = () => setMqttConnected(false);

      mqttClient.on("connect",  onConnect);
      mqttClient.on("offline",  onOffline);
      mqttClient.on("close",    onClose);
    });

    // Proper effect cleanup — runs when component unmounts.
    return () => {
      if (mqttClientRef && onConnect) {
        mqttClientRef.off("connect",  onConnect);
        mqttClientRef.off("offline",  onOffline);
        mqttClientRef.off("close",    onClose);
      }
    };
  }, []); // run once on mount

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-199), `${new Date().toLocaleTimeString()} — ${msg}`]);
  }, []);

  const selectActiveDevice = useCallback((nextDeviceId: string | null) => {
    setActiveDeviceId(nextDeviceId);
    setDeviceStatus("offline");
    setSocketStatus(initialSockets);
    setSocketLoading(initialLoading);
    lastSeenAtRef.current = null;
  }, []);

  // ----------------------------------------------------------
  // Fetch devices for the signed-in user
  // ----------------------------------------------------------
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/devices")
      .then((r) => r.json())
      .then((data: Device[]) => {
        setDevices(data);
        if (data.length > 0) selectActiveDevice(data[0].id);
      })
      .catch((err) => addLog(`Failed to load devices: ${err.message}`));
  }, [session, addLog, selectActiveDevice]);

  // ----------------------------------------------------------
  // Subscribe/unsubscribe and request initial state per device
  // ----------------------------------------------------------
  useEffect(() => {
    if (!mqttConnected || !activeDeviceId) return;

    const mqttClient = getMQTTClient();
    if (!mqttClient) return;

    const device = devices.find((d) => d.id === activeDeviceId);
    if (!device) return;

    const topics = getTopics(device.deviceId);

    trackedSubscribe(topics.statusAll,    { qos: 1 });
    trackedSubscribe(topics.deviceStatus, { qos: 1 });

    // Request fresh state after a tick
    setTimeout(() => {
      mqttClient.publish(topics.deviceStatusGet, "STATUS");
      SOCKET_NAMES.forEach((sock) => {
        mqttClient.publish(`${topics.statusGetBase}${sock}`, "STATUS");
      });
      addLog(`Requesting state for ${device.name}`);
    }, 0);

    return () => {
      trackedUnsubscribe(topics.statusAll);
      trackedUnsubscribe(topics.deviceStatus);
    };
  }, [activeDeviceId, devices, mqttConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----------------------------------------------------------
  // MQTT message handler
  // Register once via whenConnected(); keep the handler body
  // current using a ref so devices/addLog updates are reflected
  // without ever detaching the listener from the client.
  // ----------------------------------------------------------
  const messageHandlerBodyRef = useRef<(topic: string, message: Buffer) => void>(() => {});

  // Update the ref body whenever its captured values change.
  useEffect(() => {
    messageHandlerBodyRef.current = (topic: string, message: Buffer) => {
      const payload = message.toString();

      const device = devices.find((d) => d.id === activeDeviceRef.current);
      if (!device) return;

      const topics = getTopics(device.deviceId);
      const isDeviceStatusGetEcho = topic === topics.deviceStatusGet;
      const isSocketStatusGetEcho = topic.startsWith(topics.statusGetBase);

      if (!isDeviceStatusGetEcho && !isSocketStatusGetEcho) {
        addLog(`Received → ${topic}: ${payload}`);
      }

      if (topic === topics.deviceStatus) {
        const normalized = payload.toLowerCase().trim();
        if (normalized === "online") {
          setDeviceStatus("online");
          lastSeenAtRef.current = Date.now();
        } else if (normalized === "offline") {
          setDeviceStatus("offline");
          lastSeenAtRef.current = null;
        }
        return;
      }

      if (topic.startsWith(topics.statusBase)) {
        if (isSocketStatusGetEcho) return;

        const parts = topic.split("/");
        const sock  = parts[parts.length - 1] as SocketName;
        if (SOCKET_NAMES.includes(sock as (typeof SOCKET_NAMES)[number])) {
          const norm = payload.toLowerCase().trim() as "on" | "off";
          if (norm === "on" || norm === "off") {
            setSocketStatus((prev) => ({ ...prev, [sock]: norm }));
            setSocketLoading((prev) => ({ ...prev, [sock]: false }));
            setDeviceStatus("online");
            lastSeenAtRef.current = Date.now();
          }
        }
      }
    };
  }, [devices, addLog]);

  // Register the stable wrapper once — it survives reconnects because the
  // MqttClient object itself persists; no need to re-register on reconnect.
  useEffect(() => {
    const stableHandler = (topic: string, message: Buffer) =>
      messageHandlerBodyRef.current(topic, message);

    let cleanup: (() => void) | undefined;
    whenConnected().then((mqttClient) => {
      mqttClient.on("message", stableHandler);
      cleanup = () => mqttClient.off("message", stableHandler);
    });

    return () => cleanup?.();
  }, []); // register once — never torn down during reconnects

  useEffect(() => {
    if (!activeDeviceId) return;

    const intervalId = setInterval(() => {
      const lastSeenAt = lastSeenAtRef.current;
      if (!lastSeenAt) return;

      if (Date.now() - lastSeenAt > DEVICE_STALE_TIMEOUT_MS) {
        setDeviceStatus((prev) => (prev === "offline" ? prev : "offline"));
      }
    }, DEVICE_STALE_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [activeDeviceId]);

  // ----------------------------------------------------------
  // Periodic device heartbeat poll
  // The ESP32 only broadcasts "online" on boot/reconnect and is otherwise
  // silent when idle. Without polling, the stale checker above marks it
  // offline after 90 s of no activity even if it is perfectly connected.
  // Pinging deviceStatusGet every 45 s keeps lastSeenAtRef fresh.
  // ----------------------------------------------------------
  useEffect(() => {
    if (!activeDeviceId) return;

    const poll = () => {
      const device = devices.find((d) => d.id === activeDeviceId);
      if (!device) return;
      const topics = getTopics(device.deviceId);
      whenConnected().then((mqttClient) => {
        mqttClient.publish(topics.deviceStatusGet, "STATUS");
      });
    };

    const intervalId = setInterval(poll, 45_000);
    return () => clearInterval(intervalId);
  }, [activeDeviceId, devices]);

  // ----------------------------------------------------------
  // Toggle a socket
  // ----------------------------------------------------------
  const toggleSocket = (socketName: SocketName, turnOn: boolean) => {
    const device = devices.find((d) => d.id === activeDeviceId);
    if (!device) return;

    const topics = getTopics(device.deviceId);
    const topic  = `${topics.controlBase}${socketName}`;
    const cmd    = turnOn ? "ON" : "OFF";

    // Optimistic update: flip the UI immediately so the toggle feels instant.
    // If the echo from the ESP32 contradicts this (e.g. the command was lost),
    // the message handler will correct the state when the echo eventually arrives.
    const optimisticState = turnOn ? "on" : "off";
    setSocketStatus((prev) => ({ ...prev, [socketName]: optimisticState }));
    setSocketLoading((prev) => ({ ...prev, [socketName]: true }));

    addLog(`Sent → ${topic}: ${cmd}`);

    // The switch is disabled when !mqttConnected, so by the time we reach
    // here the client is guaranteed to be connected. Publishing directly
    // avoids the whenConnected() promise chain which can stall for ~20 s
    // when the client is mid-reconnect (connectWaiters are not drained
    // until the next successful connect event fires).
    const mqttClient = getMQTTClient();
    if (mqttClient?.connected) {
      mqttClient.publish(topic, cmd, { qos: 1 });
    } else {
      addLog(`[WARN] MQTT not connected — command dropped`);
      // Revert the optimistic update since we couldn't send the command.
      setSocketStatus((prev) => ({ ...prev, [socketName]: turnOn ? "off" : "on" }));
      return;
    }

    // Fallback: clear loading after 6 s if no echo arrives (e.g. relay inrush
    // causes a brief MQTT disconnect and the first publish is lost; the ESP32
    // will republish on reconnect but the spinner should not show for that long).
    setTimeout(() => {
      setSocketLoading((prev) => ({ ...prev, [socketName]: false }));
    }, 6000);
  };

  const activeDevice = devices.find((d) => d.id === activeDeviceId) ?? null;

  return (
    <div style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
      {/* Header */}
      <Group justify="space-between" align="center" mb="md">
        <Title order={2}>Smart Extension</Title>
        <Group gap="xs">
          <Text size="sm" c="dimmed">{session?.user?.email}</Text>
          <Button variant="subtle" size="xs" onClick={() => signOut()}>
            Sign out
          </Button>
        </Group>
      </Group>

      {/* Device selector */}
      {devices.length > 0 && (
        <Select
          label="Active device"
          placeholder="Select a device"
          data={devices.map((d) => ({ value: d.id, label: d.name }))}
          value={activeDeviceId}
          onChange={selectActiveDevice}
          mb="md"
        />
      )}
      {devices.length === 0 && (
        <Card withBorder padding="md" mb="md">
          <Text c="dimmed">
            No devices assigned to your account. Ask an admin to register one.
          </Text>
        </Card>
      )}

      {/* Device status bar */}
      <Card withBorder padding="lg" shadow="sm" mb="md">
        <Group justify="space-between" align="center">
          <Text size="lg">
            Device status:{" "}
            <Badge color={deviceStatus === "online" ? "green" : "red"}>
              {deviceStatus}
            </Badge>
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              disabled={!activeDevice}
              onClick={() => {
                if (!activeDevice) return;
                const topics = getTopics(activeDevice.deviceId);
                whenConnected().then((mqttClient) => {
                  mqttClient.publish(topics.deviceStatusGet, "STATUS");
                });
                addLog("Requested device status");
              }}
            >
              Refresh
            </Button>
            <Button size="xs" variant="light" color="gray" onClick={() => setLogs([])}>
              Clear logs
            </Button>
          </Group>
        </Group>
      </Card>

      {/* Socket cards */}
      <Stack gap="sm">
        {SOCKET_NAMES.map((socketName) => (
          <Card
            key={socketName}
            withBorder
            padding="md"
            shadow="sm"
            style={{ opacity: deviceStatus === "offline" ? 0.6 : 1 }}
          >
            <Group justify="space-between" align="center">
              <Text size="lg" fw={700}>
                {socketName.toUpperCase()}
              </Text>
              <Group gap="md" align="center">
                <Text
                  size="sm"
                  c={socketStatus[socketName] === "on" ? "green" : "gray"}
                >
                  {socketLoading[socketName]
                    ? "Switching…"
                    : socketStatus[socketName].toUpperCase()}
                </Text>
                <Switch
                  checked={socketStatus[socketName] === "on"}
                  onChange={(e) => toggleSocket(socketName, e.currentTarget.checked)}
                  label={socketStatus[socketName] === "on" ? "ON" : "OFF"}
                  color="blue"
                  size="md"
                  disabled={
                    socketLoading[socketName] ||
                    deviceStatus === "offline"  ||
                    !activeDevice
                  }
                />
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      {/* Schedule manager */}
      {activeDevice && <ScheduleManager device={activeDevice} />}

      {/* Logs viewer */}
      <Text fw={600} mt="xl" mb="xs">
        Logs
      </Text>
      <div
        style={{
          height: 200,
          overflowY: "scroll",
          background: "#f5f5f5",
          padding: 10,
          borderRadius: 8,
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        {logs.length === 0 && (
          <Text c="dimmed" size="xs">
            No activity yet
          </Text>
        )}
        {logs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}

