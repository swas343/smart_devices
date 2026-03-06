import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { serverPublish } from "@/app/lib/mqtt-server";

async function pushSchedulesToDevice(prismaDeviceId: string, esp32DeviceId: string) {
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

  try {
    await serverPublish(`${esp32DeviceId}/schedule/set`, payload, true);
  } catch (err) {
    console.error("Failed to publish schedule update to MQTT:", err);
  }
}

// -------------------------------------------------------
// PATCH /api/schedules/[id]
// Body: partial { socketNumber, type, triggerAt, action, enabled }
// -------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body    = await req.json();

  // Verify ownership through the device → user relation
  const existing = await prisma.schedule.findUnique({
    where: { id },
    include: { device: true },
  });

  if (!existing || existing.device.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.schedule.update({
    where: { id },
    data: {
      ...(body.socketNumber !== undefined && { socketNumber: body.socketNumber }),
      ...(body.type         !== undefined && { type:         body.type         }),
      ...(body.triggerAt    !== undefined && { triggerAt:    body.triggerAt    }),
      ...(body.action       !== undefined && { action:       body.action       }),
      ...(body.enabled      !== undefined && { enabled:      body.enabled      }),
    },
  });

  await pushSchedulesToDevice(existing.deviceId, existing.device.deviceId);

  return NextResponse.json(updated);
}

// -------------------------------------------------------
// DELETE /api/schedules/[id]
// -------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.schedule.findUnique({
    where: { id },
    include: { device: true },
  });

  if (!existing || existing.device.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.schedule.delete({ where: { id } });

  await pushSchedulesToDevice(existing.deviceId, existing.device.deviceId);

  return NextResponse.json({ success: true });
}
