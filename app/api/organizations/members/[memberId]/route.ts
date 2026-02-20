import { prisma } from "@/lib/db"
import { isSuperAdmin } from "@/lib/permissions"
import { type NextRequest, NextResponse } from "next/server"

// Delete a member from an organization
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> | { memberId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const memberId = resolvedParams.memberId

    if (!memberId) {
      return NextResponse.json({ error: "Member ID is required" }, { status: 400 })
    }

    // Get the member being deleted
    const member = await prisma.organizationMember.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // Prevent deleting superadmin (they can't be removed)
    if (member.role === "superadmin") {
      return NextResponse.json(
        { error: "Cannot remove superadmin from organization" },
        { status: 403 }
      )
    }

    // Get requester info from query params (optional, for permission checks)
    const requesterUserId = request.nextUrl.searchParams.get("requesterUserId")

    // Check if requester is superadmin (optional check)
    if (requesterUserId) {
      const requesterMember = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: member.organizationId,
            userId: requesterUserId,
          },
        },
      })

      if (!requesterMember) {
        return NextResponse.json(
          { error: "You must be a member of this organization to remove members" },
          { status: 403 }
        )
      }

      // Only superadmin and admin can remove members
      if (!isSuperAdmin(requesterMember.role) && requesterMember.role !== "admin") {
        return NextResponse.json(
          { error: "Only superadmin and admin can remove members" },
          { status: 403 }
        )
      }
    }

    // Delete the member (this removes them from the organization)
    await prisma.organizationMember.delete({
      where: { id: memberId },
    })

    return NextResponse.json(
      {
        success: true,
        message: "Member removed successfully",
        member: {
          id: member.id,
          email: member.user.email,
          name: member.user.firstName && member.user.lastName
            ? `${member.user.firstName} ${member.user.lastName}`
            : member.user.email,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Error removing member:", error)
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 })
  }
}

