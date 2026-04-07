"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Crown,
  Pencil,
  Eye,
  Copy,
  Trash2,
  Link,
  UserPlus,
  Users,
  Loader2,
  Check,
} from "lucide-react"
import {
  getConnection,
  isConnected,
  getProjectCollaborators,
  getProjectShareLinks,
  setOnCollaboratorsChanged,
  setOnShareLinksChanged,
  type StdbCollaborator,
  type StdbShareLink,
} from "@/lib/stdb/spacetimedb"
import { useAuth } from "@/lib/auth/use-auth"
import { fetchWithAuth } from "@/lib/auth/fetch-with-auth"

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

const ROLE_OPTIONS = [
  { value: "editor", label: "Editor", icon: Pencil },
  { value: "viewer", label: "Viewer", icon: Eye },
] as const

function RoleIcon({ role }: { role: string }) {
  if (role === "owner") return <Crown className="h-3.5 w-3.5 text-amber-400" />
  if (role === "editor") return <Pencil className="h-3.5 w-3.5 text-blue-400" />
  return <Eye className="h-3.5 w-3.5 text-muted-foreground" />
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    editor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    viewer: "bg-muted text-muted-foreground border-border",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        styles[role] ?? styles.viewer
      }`}
    >
      <RoleIcon role={role} />
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  )
}

export function ShareDialog({ open, onOpenChange, projectId }: ShareDialogProps) {
  const { user } = useAuth()
  const [collaborators, setCollaborators] = useState<StdbCollaborator[]>([])
  const [shareLinks, setShareLinks] = useState<StdbShareLink[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor")
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [linkRole, setLinkRole] = useState<"editor" | "viewer">("editor")
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  const refreshData = useCallback(() => {
    setCollaborators(getProjectCollaborators(projectId))
    setShareLinks(getProjectShareLinks(projectId))
  }, [projectId])

  useEffect(() => {
    if (!open) return
    refreshData()
    setOnCollaboratorsChanged((collabs) => setCollaborators(collabs))
    setOnShareLinksChanged((links) => setShareLinks(links))
    return () => {
      setOnCollaboratorsChanged(null)
      setOnShareLinksChanged(null)
    }
  }, [open, refreshData])

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !isConnected() || !user) return
    setIsInviting(true)
    setInviteError(null)
    setInviteSuccess(false)

    try {
      const response = await fetchWithAuth(
        `/api/lookup-user?email=${encodeURIComponent(inviteEmail.trim())}`
      )
      if (!response.ok) {
        const data = await response.json()
        setInviteError(data.error || "User not found")
        setIsInviting(false)
        return
      }
      const userData = await response.json()

      // Check if already a collaborator
      const existing = collaborators.find(
        (c) => c.firebaseUid === userData.uid
      )
      if (existing) {
        setInviteError("User is already a collaborator")
        setIsInviting(false)
        return
      }

      getConnection().reducers.addCollaborator({
        projectId,
        firebaseUid: userData.uid,
        role: inviteRole,
        displayName: userData.displayName || userData.email,
        email: userData.email,
      })

      setInviteEmail("")
      setInviteSuccess(true)
      setTimeout(() => setInviteSuccess(false), 2000)
    } catch {
      setInviteError("Failed to invite user")
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemoveCollaborator = (firebaseUid: string) => {
    if (!isConnected()) return
    getConnection().reducers.removeCollaborator({ projectId, firebaseUid })
  }

  const handleCreateLink = () => {
    if (!isConnected()) return
    const expiresAt = BigInt(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    getConnection().reducers.createShareLink({
      projectId,
      role: linkRole,
      expiresAt,
      maxUses: 0, // unlimited
    })
  }

  const handleDeleteLink = (linkId: string) => {
    if (!isConnected()) return
    getConnection().reducers.deleteShareLink({ linkId })
  }

  const handleCopyLink = (token: string, linkId: string) => {
    const url = `${window.location.origin}/join?token=${token}`
    navigator.clipboard.writeText(url)
    setCopiedLinkId(linkId)
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  // Build collaborator list with owner first
  const ownerRow: StdbCollaborator | null = (() => {
    const ownerCollab = collaborators.find((c) => c.role === "owner")
    if (ownerCollab) return ownerCollab
    // Synthesize owner row from current user if they're the owner
    if (user) {
      return {
        id: "owner-synthetic",
        projectId,
        firebaseUid: user.uid,
        role: "owner",
        displayName: user.displayName || user.email || "Owner",
        email: user.email || "",
        addedBy: "",
        addedAt: 0,
      }
    }
    return null
  })()

  const nonOwnerCollabs = collaborators.filter((c) => c.role !== "owner")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share Project
          </DialogTitle>
          <DialogDescription>
            Invite collaborators or create a shareable link.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="people" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="people" className="flex-1 gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              People
            </TabsTrigger>
            <TabsTrigger value="links" className="flex-1 gap-1.5">
              <Link className="h-3.5 w-3.5" />
              Links
            </TabsTrigger>
          </TabsList>

          {/* People Tab */}
          <TabsContent value="people" className="space-y-4 pt-2">
            {/* Invite form */}
            <div className="flex gap-2">
              <Input
                placeholder="Email address"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInvite()
                }}
                className="flex-1 h-9 text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "editor" | "viewer")
                }
                className="h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="h-9 gap-1.5"
                onClick={handleInvite}
                disabled={isInviting || !inviteEmail.trim()}
              >
                {isInviting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : inviteSuccess ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Invite
              </Button>
            </div>

            {inviteError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {inviteError}
              </div>
            )}

            {/* Collaborator list */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Members ({(ownerRow ? 1 : 0) + nonOwnerCollabs.length})
              </div>

              {/* Owner row */}
              {ownerRow && (
                <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-400"
                    >
                      {ownerRow.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {ownerRow.displayName}
                        {ownerRow.firebaseUid === user?.uid && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ownerRow.email}
                      </div>
                    </div>
                  </div>
                  <RoleBadge role="owner" />
                </div>
              )}

              {/* Other collaborators */}
              {nonOwnerCollabs.map((collab) => (
                <div
                  key={collab.id}
                  className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-secondary/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                      {collab.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {collab.displayName}
                        {collab.firebaseUid === user?.uid && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {collab.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={collab.role} />
                    <button
                      onClick={() =>
                        handleRemoveCollaborator(collab.firebaseUid)
                      }
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      title="Remove collaborator"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {nonOwnerCollabs.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No collaborators yet. Invite someone above.
                </div>
              )}
            </div>
          </TabsContent>

          {/* Links Tab */}
          <TabsContent value="links" className="space-y-4 pt-2">
            {/* Create link form */}
            <div className="flex gap-2">
              <select
                value={linkRole}
                onChange={(e) =>
                  setLinkRole(e.target.value as "editor" | "viewer")
                }
                className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Anyone with link can {opt.value === "editor" ? "edit" : "view"}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="h-9 gap-1.5"
                onClick={handleCreateLink}
              >
                <Link className="h-3.5 w-3.5" />
                Create Link
              </Button>
            </div>

            {/* Share links list */}
            <div className="space-y-2">
              {shareLinks.map((link) => {
                const isExpired = link.expiresAt > 0 && link.expiresAt < Date.now()
                const expiryDate = link.expiresAt > 0
                  ? new Date(link.expiresAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "Never"

                return (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Link className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={link.role} />
                          {isExpired && (
                            <span className="text-[10px] text-destructive font-medium">
                              Expired
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {link.useCount} use{link.useCount !== 1 ? "s" : ""} · expires {expiryDate}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyLink(link.token, link.id)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                        title="Copy link"
                      >
                        {copiedLinkId === link.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteLink(link.id)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                        title="Delete link"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}

              {shareLinks.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No share links yet. Create one above.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
