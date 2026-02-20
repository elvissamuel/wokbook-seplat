"use client"

import type React from "react"

import { DashboardLayout } from "@/components/layouts/dashboard-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Mail, Trash2, Loader2, UserPlus, Upload, FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ReactSelect from "react-select"
import type { StylesConfig, MultiValue } from "react-select"
import { inviteMember, getOrganizationMembers, getCourses, enrollStudent, deleteMember, type OrganizationMember, type CourseWithRelations } from "@/lib/api-calls"
import { getPrimaryOrganization, getCurrentUser } from "@/lib/session"
import { isSuperAdmin } from "@/lib/permissions"
import { toast } from "sonner"
import { AppBreadcrumbs } from "@/components/breadcrumbs"
import { getUserFullName } from "@/lib/utils/user"

export default function EmployeePage() {
  const queryClient = useQueryClient()
  const [openInvite, setOpenInvite] = useState(false)
  const [openEnroll, setOpenEnroll] = useState(false)
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null)
  const [selectedCourses, setSelectedCourses] = useState<string[]>([])
  const [inviteData, setInviteData] = useState({ emails: "", role: "member" as "admin" | "member" | "instructor" })
  const [error, setError] = useState<string | null>(null)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [inviteResults, setInviteResults] = useState<Array<{ email: string; status: "success" | "error"; message: string }>>([])
  const [isParsingCsv, setIsParsingCsv] = useState(false)
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [memberToDelete, setMemberToDelete] = useState<OrganizationMember | null>(null)
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)

  const primaryOrganization = getPrimaryOrganization()
  const organizationId = primaryOrganization?.id || ""
  const userRole = primaryOrganization?.role || "member"
  const canAssignAdmin = isSuperAdmin(userRole)

  // Fetch organization members
  const { data: membersResponse, isLoading: membersLoading } = useQuery({
    queryKey: ["organization-members", organizationId],
    queryFn: () => getOrganizationMembers(organizationId),
    enabled: !!organizationId,
  })

  // Fetch courses for enrollment
  const { data: coursesResponse, isLoading: coursesLoading } = useQuery({
    queryKey: ["courses", organizationId],
    queryFn: () => getCourses(organizationId),
    enabled: !!organizationId && openEnroll,
  })

  const employees = membersResponse?.data || []
  const courses = coursesResponse?.data || []

  // Prepare options for react-select
  const courseOptions = useMemo(() => {
    return courses.map((course: CourseWithRelations) => ({
      value: course.id,
      label: `${course.title} (${course.status})`,
      course: course,
    }))
  }, [courses])

  // Get selected options from selectedCourses array
  const selectedCourseOptions = useMemo(() => {
    return courseOptions.filter((option) => selectedCourses.includes(option.value))
  }, [courseOptions, selectedCourses])

  // Custom styles for react-select to match app theme
  type OptionType = { value: string; label: string; course: CourseWithRelations }
  const selectStyles: StylesConfig<OptionType, true> = useMemo(() => ({
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: "#ffffff",
      borderColor: state.isFocused ? "#65B32E" : "rgba(101, 179, 46, 0.2)",
      borderRadius: "calc(var(--radius) - 2px)",
      minHeight: "2.5rem",
      boxShadow: state.isFocused ? "0 0 0 2px rgba(101, 179, 46, 0.2)" : "none",
      "&:hover": {
        borderColor: "#65B32E",
      },
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: "#ffffff",
      border: "1px solid rgba(101, 179, 46, 0.2)",
      borderRadius: "calc(var(--radius) - 2px)",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#65B32E"
        : state.isFocused
        ? "rgba(101, 179, 46, 0.1)"
        : "#ffffff",
      color: state.isSelected ? "#ffffff" : "#000000",
      "&:active": {
        backgroundColor: "rgba(101, 179, 46, 0.1)",
      },
    }),
    multiValue: (base: any) => ({
      ...base,
      backgroundColor: "rgba(101, 179, 46, 0.1)",
    }),
    multiValueLabel: (base: any) => ({
      ...base,
      color: "#65B32E",
    }),
    multiValueRemove: (base: any) => ({
      ...base,
      color: "#65B32E",
      "&:hover": {
        backgroundColor: "#DE1915",
        color: "#ffffff",
      },
    }),
    placeholder: (base: any) => ({
      ...base,
      color: "#6b7280",
    }),
    input: (base: any) => ({
      ...base,
      color: "#000000",
    }),
    singleValue: (base: any) => ({
      ...base,
      color: "#000000",
    }),
  }), [])

  // Parse emails from text input (supports comma, semicolon, or newline separated)
  const parseEmails = (text: string): string[] => {
    return text
      .split(/[,;\n]/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0)
  }

  // Validate email format
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Parse CSV file and extract emails
  const parseCsvFile = async (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const text = e.target?.result as string
          if (!text) {
            reject(new Error("File is empty"))
            return
          }

          // Split by newlines
          const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)

          if (lines.length === 0) {
            reject(new Error("CSV file is empty"))
            return
          }

          const emails: string[] = []

          // Check if first line is a header (contains "email" or "Email")
          const firstLine = lines[0].toLowerCase()
          const hasHeader = firstLine.includes("email")

          // Start from line 1 if header exists, otherwise from line 0
          const startIndex = hasHeader ? 1 : 0

          for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue

            // Parse CSV line (handle quoted values and commas)
            const values = line.split(",").map((val) => val.trim().replace(/^"|"$/g, ""))

            // Try to find email in the line
            // First, check if any value is an email
            for (const value of values) {
              if (isValidEmail(value)) {
                emails.push(value)
                break // Only take first email per line
              }
            }

            // If no email found in values, try the whole line as email
            if (values.length === 1 && isValidEmail(values[0])) {
              emails.push(values[0])
            }
          }

          if (emails.length === 0) {
            reject(new Error("No valid email addresses found in CSV file"))
            return
          }

          resolve(emails)
        } catch (error: any) {
          reject(new Error(`Failed to parse CSV: ${error?.message || "Unknown error"}`))
        }
      }

      reader.onerror = () => {
        reject(new Error("Failed to read file"))
      }

      reader.readAsText(file)
    })
  }

  // Handle CSV file upload
  const handleCsvUpload = async (file: File) => {
    // Validate file type
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "text/plain",
      "application/csv",
    ]
    const isValidType =
      validTypes.includes(file.type) ||
      file.name.endsWith(".csv") ||
      file.name.endsWith(".txt")

    if (!isValidType) {
      toast.error("Invalid file type", {
        description: "Please upload a CSV or TXT file.",
      })
      return
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error("File too large", {
        description: "File size exceeds maximum limit of 5MB",
      })
      return
    }

    setIsParsingCsv(true)
    setCsvFileName(file.name)

    try {
      const emails = await parseCsvFile(file)

      if (emails.length === 0) {
        throw new Error("No valid email addresses found in CSV file")
      }

      // Remove duplicates
      const uniqueEmails = [...new Set(emails)]

      // Add emails to the textarea (append if there are existing emails)
      const existingEmails = parseEmails(inviteData.emails)
      const allEmails = [...new Set([...existingEmails, ...uniqueEmails])]

      setInviteData((prev) => ({
        ...prev,
        emails: allEmails.join(", "),
      }))

      toast.success("CSV file processed successfully", {
        description: `Found ${uniqueEmails.length} unique email${uniqueEmails.length !== 1 ? "s" : ""} in the file.`,
      })
    } catch (error: any) {
      console.error("Error parsing CSV:", error)
      const errorMessage =
        typeof error?.message === "string"
          ? error.message
          : "Failed to parse CSV file. Please try again."
      setError(errorMessage)
      toast.error("Failed to parse CSV file", {
        description: errorMessage,
      })
      setCsvFileName(null)
    } finally {
      setIsParsingCsv(false)
    }
  }

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleCsvUpload(file)
    }
    // Reset input so same file can be selected again
    e.target.value = ""
  }

  // Invite multiple members
  const inviteMembersMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      const currentUser = getCurrentUser()
      const results = await Promise.allSettled(
        emails.map((email) =>
          inviteMember({
            organizationId,
            email,
            role: inviteData.role.toLowerCase() as "admin" | "member" | "instructor",
            requesterUserId: currentUser?.id,
          })
        )
      )

      return results.map((result, index) => {
        if (result.status === "fulfilled") {
          const response = result.value
          if (response.data) {
            return { email: emails[index], status: "success" as const, message: "Invitation sent successfully" }
          } else if (response.error) {
            const errorMsg =
              typeof response.error === "string"
                ? response.error
                : response.error?.message || "Failed to invite member"
            return { email: emails[index], status: "error" as const, message: errorMsg }
          } else if (response.validationErrors) {
            const firstError = response.validationErrors[0]
            return {
              email: emails[index],
              status: "error" as const,
              message: firstError?.message || "Validation error",
            }
          }
          return { email: emails[index], status: "error" as const, message: "Unknown error" }
        } else {
          return {
            email: emails[index],
            status: "error" as const,
            message: result.reason?.message || "Failed to invite member",
          }
        }
      })
    },
    onSuccess: (results) => {
      setInviteResults(results)
      const successCount = results.filter((r) => r.status === "success").length
      const errorCount = results.filter((r) => r.status === "error").length

      // Invalidate queries to refetch members list if any succeeded
      if (successCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["organization-members", organizationId] })
      }

      if (successCount === results.length) {
        // All succeeded
        toast.success("All invitations sent successfully", {
          description: `Successfully sent ${successCount} invitation${successCount !== 1 ? "s" : ""}.`,
        })
        // Reset form and close dialog after a short delay
        setTimeout(() => {
          setInviteData({ emails: "", role: "member" })
          setOpenInvite(false)
          setError(null)
          setInviteResults([])
          setCsvFileName(null)
        }, 2000)
      } else if (successCount > 0) {
        // Partial success
        toast.success("Some invitations sent", {
          description: `Successfully sent ${successCount} invitation${successCount !== 1 ? "s" : ""}. ${errorCount} failed.`,
        })
      } else {
        // All failed
        toast.error("Failed to send invitations", {
          description: `Failed to send ${errorCount} invitation${errorCount !== 1 ? "s" : ""}.`,
        })
      }
    },
    onError: (error: any) => {
      console.error("Error inviting members:", error)
      const errorMessage =
        typeof error?.message === "string"
          ? error.message
          : typeof error?.error === "string"
          ? error.error
          : "Failed to invite members. Please try again."
      setError(errorMessage)
      toast.error("Failed to invite members", {
        description: errorMessage,
      })
    },
  })

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInviteResults([])

    if (!organizationId) {
      setError("Organization ID is required")
      return
    }

    // Parse emails from input
    const emails = parseEmails(inviteData.emails)

    if (emails.length === 0) {
      setError("Please enter at least one email address")
      return
    }

    // Validate all emails
    const invalidEmails = emails.filter((email) => !isValidEmail(email))
    if (invalidEmails.length > 0) {
      setError(`Invalid email address${invalidEmails.length !== 1 ? "es" : ""}: ${invalidEmails.join(", ")}`)
      return
    }

    // Remove duplicates
    const uniqueEmails = [...new Set(emails)]

    // Send invitations
    inviteMembersMutation.mutate(uniqueEmails)
  }

  // Enroll student mutation
  const enrollStudentMutation = useMutation({
    mutationFn: ({ userId, courseId }: { userId: string; courseId: string }) => enrollStudent(userId, courseId),
    onError: (error) => {
      console.error("Error enrolling student:", error)
    },
  })

  // Delete member mutation
  const deleteMemberMutation = useMutation({
    mutationFn: (memberId: string) => {
      const currentUser = getCurrentUser()
      return deleteMember(memberId, currentUser?.id)
    },
    onSuccess: (response) => {
      if (response.data?.success) {
        const memberName = memberToDelete
          ? getUserFullName(memberToDelete.firstName, memberToDelete.lastName, memberToDelete.name) || memberToDelete.email
          : "Member"
        toast.success("Member removed successfully", {
          description: `${memberName} has been removed from the organization.`,
        })
        queryClient.invalidateQueries({ queryKey: ["organization-members", organizationId] })
        setOpenDeleteDialog(false)
        setMemberToDelete(null)
      } else if (response.error) {
        const errorMsg = typeof response.error === "string" ? response.error : response.error?.message || "Failed to remove member"
        toast.error("Failed to remove member", { description: errorMsg })
      }
    },
    onError: (error: any) => {
      console.error("Error removing member:", error)
      const errorMessage = typeof error?.message === "string" ? error.message : "Failed to remove member. Please try again."
      toast.error("Failed to remove member", { description: errorMessage })
    },
  })

  const handleDeleteClick = (member: OrganizationMember) => {
    setMemberToDelete(member)
    setOpenDeleteDialog(true)
  }

  const handleConfirmDelete = () => {
    if (memberToDelete) {
      deleteMemberMutation.mutate(memberToDelete.id)
    }
  }

  const handleOpenEnroll = (member: OrganizationMember) => {
    setSelectedMember(member)
    setSelectedCourses([])
    setEnrollError(null)
    setOpenEnroll(true)
  }

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnrollError(null)

    if (!selectedMember) {
      const errorMsg = "No member selected"
      setEnrollError(errorMsg)
      toast.error("Validation error", {
        description: errorMsg,
      })
      return
    }

    if (selectedCourses.length === 0) {
      const errorMsg = "Please select at least one course"
      setEnrollError(errorMsg)
      toast.error("Validation error", {
        description: errorMsg,
      })
      return
    }

    try {
      // Enroll in all selected courses
      const enrollments = await Promise.allSettled(
        selectedCourses.map((courseId) =>
          enrollStudentMutation.mutateAsync({
            userId: selectedMember.userId,
            courseId,
          })
        )
      )

      // Check for any failures
      const failures = enrollments.filter(
        (result) =>
          result.status === "rejected" ||
          (result.status === "fulfilled" && (result.value.error || result.value.validationErrors || !result.value.data))
      )
      const successful = enrollments.filter(
        (result) =>
          result.status === "fulfilled" && result.value.data && !result.value.error && !result.value.validationErrors
      )

      if (failures.length > 0 && successful.length === 0) {
        const errorMessages = failures
          .map((f) => {
            if (f.status === "rejected") return f.reason?.message || "Unknown error"
            return f.value.error?.message || f.value.validationErrors?.[0]?.message || "Failed to enroll"
          })
          .join(", ")
        setEnrollError(`Failed to enroll: ${errorMessages}`)
        toast.error("Enrollment failed", {
          description: errorMessages,
        })
      } else if (failures.length > 0) {
        const message = `Successfully enrolled in ${successful.length} course(s). ${failures.length} enrollment(s) failed.`
        setEnrollError(message)
        toast.success("Partially enrolled", {
          description: message,
        })
        // Close dialog after a short delay if some succeeded
        setTimeout(() => {
          setOpenEnroll(false)
          setSelectedMember(null)
          setSelectedCourses([])
        }, 2000)
      } else {
        // All successful
        toast.success("Enrollment successful", {
          description: `Successfully enrolled ${getUserFullName(selectedMember?.firstName, selectedMember?.lastName, selectedMember?.name) || selectedMember?.email || "student"} in ${successful.length} course(s).`,
        })
        setOpenEnroll(false)
        setSelectedMember(null)
        setSelectedCourses([])
      }
    } catch (error: any) {
      console.error("Error enrolling student:", error)
      const errorMessage = typeof error?.message === 'string' 
        ? error.message 
        : "Failed to enroll student. Please try again."
      setEnrollError(errorMessage)
      toast.error("Failed to enroll student", {
        description: errorMessage,
      })
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 bg-white">
        <AppBreadcrumbs />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#65B32E]">Team Members</h1>
            <p className="text-muted-foreground">Manage your team and assign roles</p>
          </div>
          <Dialog
            open={openInvite}
            onOpenChange={(open) => {
              setOpenInvite(open)
              if (!open) {
                // Reset form when dialog closes
                setInviteData({ emails: "", role: "member" })
                setError(null)
                setInviteResults([])
                setCsvFileName(null)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-[#65B32E] hover:bg-[#65B32E]/90 text-white">
                <Mail size={16} className="mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#65B32E]/20">
              <DialogHeader>
                <DialogTitle className="text-[#65B32E]">Invite Team Member</DialogTitle>
                <DialogDescription>Add a new member to your organization</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="emails" className="text-[#65B32E]">
                      Email Addresses
                    </Label>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="csv-upload"
                        className="cursor-pointer text-sm text-[#65B32E] hover:text-[#65B32E]/80 flex items-center gap-1"
                      >
                        <Upload size={14} />
                        Upload CSV
                      </Label>
                      <Input
                        id="csv-upload"
                        type="file"
                        accept=".csv,.txt,text/csv,text/plain"
                        onChange={handleCsvFileChange}
                        disabled={isParsingCsv || inviteMembersMutation.isPending}
                        className="hidden"
                      />
                    </div>
                  </div>
                  <Textarea
                    id="emails"
                    placeholder="colleague1@example.com, colleague2@example.com&#10;colleague3@example.com"
                    value={inviteData.emails}
                    onChange={(e) => setInviteData((prev) => ({ ...prev, emails: e.target.value }))}
                    required
                    rows={5}
                    className="border-[#65B32E]/30 focus:border-[#65B32E] font-mono text-sm"
                    disabled={isParsingCsv || inviteMembersMutation.isPending}
                  />
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Enter multiple email addresses separated by commas, semicolons, or new lines. Duplicate emails will be automatically removed.
                      </p>
                      {csvFileName && (
                        <div className="flex items-center gap-1 text-xs text-[#65B32E] bg-[#65B32E]/10 px-2 py-1 rounded">
                          <FileText size={12} />
                          <span className="max-w-[120px] truncate">{csvFileName}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-[#65B32E]/5 border border-[#65B32E]/20 rounded-md">
                      <p className="text-xs font-medium text-[#65B32E] mb-1">CSV File Format:</p>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                        <li>CSV file should contain email addresses in a column (with or without header)</li>
                        <li>If header exists, it should contain "email" or "Email"</li>
                        <li>One email per row, or comma-separated values</li>
                        <li>Maximum file size: 5MB</li>
                        <li>Supported formats: .csv, .txt</li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        Example: <code className="bg-white/50 px-1 rounded">email@example.com</code> or <code className="bg-white/50 px-1 rounded">Email,Name</code> (with header)
                      </p>
                    </div>
                  </div>
                  {isParsingCsv && (
                    <div className="flex items-center gap-2 text-sm text-[#65B32E]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Parsing CSV file...</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-[#65B32E]">Role</Label>
                  <Select
                    value={inviteData.role}
                    onValueChange={(value) => setInviteData((prev) => ({ ...prev, role: value as "admin" | "member" | "instructor" }))}
                  >
                    <SelectTrigger className="border-[#65B32E]/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#65B32E]/20">
                      {canAssignAdmin && <SelectItem value="admin">Admin</SelectItem>}
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="instructor">Instructor</SelectItem>
                    </SelectContent>
                  </Select>
                  {!canAssignAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Only superadmin can assign admin role
                    </p>
                  )}
                </div>
                {error && (
                  <div className="p-3 bg-[#DE1915]/10 border border-[#DE1915]/20 rounded-md">
                    <p className="text-sm text-[#DE1915]">{error}</p>
                  </div>
                )}

                {/* Show invitation results */}
                {inviteResults.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    <Label className="text-[#65B32E]">Invitation Results</Label>
                    <div className="space-y-1">
                      {inviteResults.map((result, index) => (
                        <div
                          key={index}
                          className={`p-2 rounded-md text-sm ${
                            result.status === "success"
                              ? "bg-[#65B32E]/10 border border-[#65B32E]/20 text-[#65B32E]"
                              : "bg-[#DE1915]/10 border border-[#DE1915]/20 text-[#DE1915]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{result.email}</span>
                            <span className="text-xs">{result.status === "success" ? "✓" : "✗"}</span>
                          </div>
                          <p className="text-xs mt-1 opacity-80">{result.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full bg-[#65B32E] hover:bg-[#65B32E]/90 text-white"
                  disabled={inviteMembersMutation.isPending || !organizationId || !inviteData.emails.trim()}
                >
                  {inviteMembersMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending Invitations...
                    </>
                  ) : (
                    (() => {
                      const emails = parseEmails(inviteData.emails)
                      const uniqueEmails = [...new Set(emails)]
                      const count = uniqueEmails.length
                      return count > 0 ? `Send ${count} Invitation${count !== 1 ? "s" : ""}` : "Send Invitation"
                    })()
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Enroll Student Dialog */}
          <Dialog open={openEnroll} onOpenChange={setOpenEnroll}>
            <DialogContent className="bg-white border-[#65B32E]/20">
              <DialogHeader>
                <DialogTitle className="text-[#65B32E]">Enroll Student in Courses</DialogTitle>
                <DialogDescription>
                  Select courses to enroll {getUserFullName(selectedMember?.firstName, selectedMember?.lastName, selectedMember?.name) || selectedMember?.email || "this member"} into
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleEnroll} className="space-y-4">
                {coursesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#65B32E]" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading courses...</span>
                  </div>
                ) : courses.length === 0 ? (
                  <div className="p-4 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">
                      No courses available. Create a course first to enroll students.
                    </p>
                  </div>
                ) : (
                  <ReactSelect
                    isMulti
                    options={courseOptions}
                    value={selectedCourseOptions}
                    onChange={(newValue: MultiValue<{ value: string; label: string; course: CourseWithRelations }>) => {
                      setSelectedCourses(newValue ? newValue.map((option: { value: string; label: string; course: CourseWithRelations }) => option.value) : [])
                    }}
                    styles={selectStyles}
                    placeholder="Select courses..."
                    isClearable
                    isSearchable
                    className="react-select-container"
                    classNamePrefix="react-select"
                  />
                )}

                {enrollError && (
                  <div className="p-3 bg-[#DE1915]/10 border border-[#DE1915]/20 rounded-md">
                    <p className="text-sm text-[#DE1915]">{enrollError}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="flex-1 bg-[#65B32E] hover:bg-[#65B32E]/90 text-white"
                    disabled={enrollStudentMutation.isPending || selectedCourses.length === 0 || coursesLoading}
                  >
                    {enrollStudentMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enrolling...
                      </>
                    ) : (
                      `Enroll in ${selectedCourses.length} Course${selectedCourses.length !== 1 ? "s" : ""}`
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpenEnroll(false)
                      setSelectedMember(null)
                      setSelectedCourses([])
                      setEnrollError(null)
                    }}
                    disabled={enrollStudentMutation.isPending}
                    className="border-[#65B32E]/30 text-[#65B32E] hover:bg-[#65B32E]/10"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete Member Confirmation Dialog */}
          <AlertDialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
            <AlertDialogContent className="bg-white border-[#DE1915]/20">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#DE1915]">Remove Member</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove{" "}
                  <strong>
                    {memberToDelete
                      ? getUserFullName(memberToDelete.firstName, memberToDelete.lastName, memberToDelete.name) || memberToDelete.email
                      : "this member"}
                  </strong>{" "}
                  from your organization? This action cannot be undone and will remove all their access to this organization.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel 
                  className="border-[#65B32E]/30 text-[#65B32E] hover:bg-[#65B32E]/10"
                  disabled={deleteMemberMutation.isPending}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDelete}
                  className="bg-[#DE1915] text-white hover:bg-[#DE1915]/90"
                  disabled={deleteMemberMutation.isPending}
                >
                  {deleteMemberMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    "Remove Member"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Card className="border-[#65B32E]/20 bg-white">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[#65B32E]/20 hover:bg-transparent">
                  <TableHead className="text-[#65B32E]">Name</TableHead>
                  <TableHead className="text-[#65B32E]">Email</TableHead>
                  <TableHead className="text-[#65B32E]">Job Title</TableHead>
                  <TableHead className="text-[#65B32E]">Department</TableHead>
                  <TableHead className="text-[#65B32E]">Role</TableHead>
                  <TableHead className="text-[#65B32E]">Status</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#65B32E]" />
                      <p className="text-sm text-muted-foreground mt-2">Loading members...</p>
                    </TableCell>
                  </TableRow>
                ) : employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No members yet. Invite your first team member to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((employee: OrganizationMember) => (
                    <TableRow key={employee.id} className="border-[#65B32E]/20 hover:bg-[#65B32E]/5">
                      <TableCell className="font-medium text-[#65B32E]">
                        {getUserFullName(employee.firstName, employee.lastName, employee.name)}
                      </TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>{employee.jobTitle || "N/A"}</TableCell>
                      <TableCell>{employee.department || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase border-[#65B32E]/30">{employee.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-[#65B32E] text-white">Active</Badge>
                      </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="hover:bg-[#65B32E]/10">
                            <MoreHorizontal size={16} className="text-[#65B32E]" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-[#65B32E]/20">
                          <DropdownMenuItem onClick={() => handleOpenEnroll(employee)} className="hover:bg-[#65B32E]/10 text-[#65B32E]">
                            <UserPlus size={16} className="mr-2" />
                            Enroll Student
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteClick(employee)} 
                            className="text-[#DE1915] hover:bg-[#DE1915]/10"
                            disabled={employee.role === "superadmin"}
                          >
                            <Trash2 size={16} className="mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
