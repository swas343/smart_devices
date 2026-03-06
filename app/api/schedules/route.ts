import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/app/lib/prisma";
import { serverPublish } from "@/app/lib/mqtt-server";

// -------------------------------------------------------
// Helper: push the full schedule list for a device to MQTT
// so the ESP32 can update its local copy immediately.
// -------------------------------------------------------
async function pushSchedulesToDevice(
  prisma: PrismaClient,
  prismaDeviceId: string,
  esp32DeviceId: string
) {
  const schedules = await prisma.schedule.findMany({
    where: { deviceId: prismaDeviceId },
    orderBy: { createdAt: "asc" },
  });

  const payload = JSON.stringify(
    schedules.map((s) => ({
      id:           s.id,
      socketNumber: s.socketNumber,
      type:         s.type,
      triggerAt:    s.triggerAt,
      action:       s.action,
      enabled:      s.enabled,
    }))
  );

  const topic = `${esp32DeviceId}/schedule/set`;
  try {
    await serverPublish(topic, payload, true);
  } catch (err) {
    // Publish failure should not block the API response
    console.error("Failed to publish schedule update to MQTT:", err);
  }
}

// Helper: verify the requesting user owns the given device
async function getUserDevice(prisma: PrismaClient, userId: string, prismaDeviceId: string) {
  return prisma.device.findFirst({
    where: { id: prismaDeviceId, userId },
  });
}

// -------------------------------------------------------
// GET /api/schedules?deviceId=<prisma-device-id>
// -------------------------------------------------------
export async function GET(req: NextRequest) {
  const prisma = getPrisma();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId query param required" }, { status: 400 });
  }

  const device = await getUserDevice(prisma, session.user.id, deviceId);
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const schedules = await prisma.schedule.findMany({
    where: { deviceId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(schedules);
}

// -------------------------------------------------------
// POST /api/schedules — create a new schedule
// Body: { deviceId, socketNumber, type, triggerAt, action, enabled }
// -------------------------------------------------------
export async function POST(req: NextRequest) {
  const prisma = getPrisma();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { deviceId, socketNumber, type, triggerAt, action, enabled = true } = body;

  if (!deviceId || !socketNumber || !type || !triggerAt || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const device = await getUserDevice(prisma, session.user.id, deviceId);
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const schedule = await prisma.schedule.create({
    data: { deviceId, socketNumber, type, triggerAt, action, enabled },
  });

  await pushSchedulesToDevice(prisma, deviceId, device.deviceId);

  return NextResponse.json(schedule, { status: 201 });
}
