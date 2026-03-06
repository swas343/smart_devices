import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/app/lib/prisma";

/** GET /api/devices — return all devices belonging to the signed-in user */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await prisma.device.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id:       true,
      deviceId: true,
      name:     true,
    },
  });

  return NextResponse.json(devices);
}
