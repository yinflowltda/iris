import { useCallback, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import './ShareDialog.css'

interface ShareEntry {
  shared_with_email: string
  permission: string
  created_at: string
}

export function ShareDialog({
  open,
  onClose,
  roomId,
  roomSlug,
}: {
  open: boolean
  onClose: () => void
  roomId: string
  roomSlug: string | null
}) {
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<'view' | 'edit'>('edit')
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchShares = useCallback(async () => {
    const res = await fetch(`/rooms/${roomId}/shares`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json() as { shares: ShareEntry[] }
      setShares(data.shares)
    }
  }, [roomId])

  useEffect(() => {
    if (open) fetchShares()
  }, [open, fetchShares])

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

  const handleInvite = async () => {
    if (!email.trim() || !isValidEmail(email.trim())) return
    setSending(true)
    await fetch(`/rooms/${roomId}/shares`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), permission }),
    })
    setEmail('')
    setSending(false)
    fetchShares()
  }

  const handleRemove = async (shareEmail: string) => {
    await fetch(`/rooms/${roomId}/shares`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: shareEmail }),
    })
    fetchShares()
  }

  const handlePermissionChange = async (shareEmail: string, newPerm: string) => {
    await fetch(`/rooms/${roomId}/shares`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: shareEmail, permission: newPerm }),
    })
    fetchShares()
  }

  const handleCopyLink = () => {
    if (!roomSlug) return
    navigator.clipboard.writeText(`https://iris.yinflow.life/r/${roomSlug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="sd-overlay" />
        <Dialog.Content className="sd-content">
          <div className="sd-header">
            <Dialog.Title className="sd-title">Share</Dialog.Title>
            <Dialog.Close className="sd-close">&times;</Dialog.Close>
          </div>

          <div className="sd-invite-row">
            <input
              className="sd-email-input"
              type="email"
              placeholder="Add people by email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
            <Select.Root value={permission} onValueChange={(v) => setPermission(v as 'view' | 'edit')}>
              <Select.Trigger className="sd-select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="sd-select-content">
                  <Select.Viewport>
                    <Select.Item value="edit" className="sd-select-item">
                      <Select.ItemText>Edit</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="view" className="sd-select-item">
                      <Select.ItemText>View</Select.ItemText>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            <button className="sd-invite-btn" onClick={handleInvite} disabled={sending || !email.trim() || !isValidEmail(email.trim())}>
              Invite
            </button>
          </div>

          <div className="sd-shares-section">
            <div className="sd-shares-label">People with access</div>
            {shares.map((s) => (
              <div key={s.shared_with_email} className="sd-share-row">
                <span className="sd-share-email">{s.shared_with_email}</span>
                <Select.Root
                  value={s.permission}
                  onValueChange={(v) => handlePermissionChange(s.shared_with_email, v)}
                >
                  <Select.Trigger className="sd-select-trigger sd-select-trigger--small">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="sd-select-content">
                      <Select.Viewport>
                        <Select.Item value="edit" className="sd-select-item">
                          <Select.ItemText>Edit</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="view" className="sd-select-item">
                          <Select.ItemText>View</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
                <button className="sd-remove-btn" onClick={() => handleRemove(s.shared_with_email)}>
                  &times;
                </button>
              </div>
            ))}
          </div>

          {roomSlug && (
            <div className="sd-link-row">
              <span className="sd-link-text">iris.yinflow.life/r/{roomSlug}</span>
              <button className="sd-copy-btn" onClick={handleCopyLink}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
