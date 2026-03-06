"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Text,
  Button,
  Group,
  Badge,
  Modal,
  Select,
  TextInput,
  SegmentedControl,
  Switch,
  Stack,
  Divider,
  Title,
  Loader,
} from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import { Device, Schedule, ScheduleType, ScheduleAction } from "../types";
import { SOCKET_NAMES } from "../constants";

interface Props {
  device: Device;
}

const SOCKET_OPTIONS = SOCKET_NAMES.map((s, i) => ({
  value: String(i + 1),
  label: s.toUpperCase(),
}));

export default function ScheduleManager({ device }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Schedule | null>(null);

  // Form state
  const [socketNumber, setSocketNumber] = useState("1");
  const [type, setType]                 = useState<ScheduleType>("repeating_daily");
  const [triggerAt, setTriggerAt]       = useState("08:00");
  const [triggerDate, setTriggerDate]   = useState("");
  const [action, setAction]             = useState<ScheduleAction>("on");
  const [enabled, setEnabled]           = useState(true);

  // ----------------------------------------------------------
  // Fetch schedules for this device
  // ----------------------------------------------------------
  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/schedules?deviceId=${device.id}`);
      const data = await res.json();
      setSchedules(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch schedules:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [device.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----------------------------------------------------------
  // Open modal helpers
  // ----------------------------------------------------------
  const openCreate = () => {
    setEditTarget(null);
    setSocketNumber("1");
    setType("repeating_daily");
    setTriggerAt("08:00");
    setTriggerDate(new Date().toISOString().slice(0, 10));
    setAction("on");
    setEnabled(true);
    setModalOpen(true);
  };

  const openEdit = (s: Schedule) => {
    setEditTarget(s);
    setSocketNumber(String(s.socketNumber));
    setType(s.type);
    setAction(s.action);
    setEnabled(s.enabled);

    if (s.type === "repeating_daily") {
      setTriggerAt(s.triggerAt);
      setTriggerDate(new Date().toISOString().slice(0, 10));
    } else {
      const dt = new Date(s.triggerAt);
      setTriggerDate(dt.toISOString().slice(0, 10));
      setTriggerAt(
        `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`
      );
    }
    setModalOpen(true);
  };

  // ----------------------------------------------------------
  // Build the triggerAt value from form state
  // ----------------------------------------------------------
  const buildTriggerAt = () => {
    if (type === "repeating_daily") return triggerAt; // "HH:MM"
    return `${triggerDate}T${triggerAt}:00.000Z`;     // ISO 8601
  };

  // ----------------------------------------------------------
  // Save (create or update)
  // ----------------------------------------------------------
  const saveSchedule = async () => {
    setSaving(true);
    const body = {
      deviceId:     device.id,
      socketNumber: Number(socketNumber),
      type,
      triggerAt:    buildTriggerAt(),
      action,
      enabled,
    };

    try {
      if (editTarget) {
        await fetch(`/api/schedules/${editTarget.id}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
      } else {
        await fetch("/api/schedules", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
      }
      setModalOpen(false);
      fetchSchedules();
    } catch (e) {
      console.error("Failed to save schedule:", e);
    } finally {
      setSaving(false);
    }
  };

  // ----------------------------------------------------------
  // Delete
  // ----------------------------------------------------------
  const deleteSchedule = async (id: string) => {
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    fetchSchedules();
  };

  // ----------------------------------------------------------
  // Quick toggle enabled/disabled
  // ----------------------------------------------------------
  const toggleEnabled = async (s: Schedule) => {
    await fetch(`/api/schedules/${s.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ enabled: !s.enabled }),
    });
    fetchSchedules();
  };

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <Card withBorder padding="lg" shadow="sm" mt="xl">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Schedules — {device.name}</Title>
        <Button size="xs" onClick={openCreate}>
          + Add schedule
        </Button>
      </Group>

      {loading && <Loader size="sm" />}

      {!loading && schedules.length === 0 && (
        <Text c="dimmed" size="sm">
          No schedules yet. Add one to automate your sockets.
        </Text>
      )}

      <Stack gap="xs">
        {schedules.map((s) => (
          <Card key={s.id} withBorder padding="sm" radius="sm">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs" wrap="wrap">
                  <Badge size="sm" color="blue">
                    SOCKET {s.socketNumber}
                  </Badge>
                  <Badge size="sm" color={s.action === "on" ? "green" : "red"}>
                    {s.action.toUpperCase()}
                  </Badge>
                  <Badge size="sm" variant="outline">
                    {s.type === "repeating_daily" ? "Daily" : "One-time"}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.type === "repeating_daily"
                    ? `Every day at ${s.triggerAt}`
                    : `Once at ${new Date(s.triggerAt).toLocaleString()}`}
                </Text>
              </Stack>

              <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                <Switch
                  size="xs"
                  checked={s.enabled}
                  onChange={() => toggleEnabled(s)}
                  label={s.enabled ? "On" : "Off"}
                />
                <Button size="xs" variant="subtle" onClick={() => openEdit(s)}>
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => deleteSchedule(s.id)}
                >
                  Delete
                </Button>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>

      {/* Create / Edit modal */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? "Edit schedule" : "New schedule"}
        centered
      >
        <Stack gap="md">
          <Select
            label="Socket"
            data={SOCKET_OPTIONS}
            value={socketNumber}
            onChange={(v) => setSocketNumber(v ?? "1")}
          />

          <div>
            <Text size="sm" fw={500} mb={4}>
              Schedule type
            </Text>
            <SegmentedControl
              fullWidth
              data={[
                { value: "repeating_daily", label: "Daily (repeating)" },
                { value: "one_time",        label: "One-time"           },
              ]}
              value={type}
              onChange={(v) => setType(v as ScheduleType)}
            />
          </div>

          {type === "one_time" && (
            <TextInput
              label="Date"
              type="date"
              value={triggerDate}
              onChange={(e) => setTriggerDate(e.currentTarget.value)}
            />
          )}

          <TimeInput
            label={type === "repeating_daily" ? "Time (daily)" : "Time"}
            value={triggerAt}
            onChange={(e) => setTriggerAt(e.currentTarget.value)}
          />

          <div>
            <Text size="sm" fw={500} mb={4}>
              Action
            </Text>
            <SegmentedControl
              fullWidth
              data={[
                { value: "on",  label: "Turn ON"  },
                { value: "off", label: "Turn OFF" },
              ]}
              value={action}
              onChange={(v) => setAction(v as ScheduleAction)}
            />
          </div>

          <Switch
            label="Enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.currentTarget.checked)}
          />

          <Divider />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSchedule} loading={saving}>
              {editTarget ? "Save changes" : "Create"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
