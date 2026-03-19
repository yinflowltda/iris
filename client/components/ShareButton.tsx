import { useState } from 'react'
import { ShareDialog } from './ShareDialog'

export function ShareButton({ roomId, roomSlug }: { roomId: string; roomSlug: string | null }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="share-btn" onClick={() => setOpen(true)}>
        Share
      </button>
      <ShareDialog
        open={open}
        onClose={() => setOpen(false)}
        roomId={roomId}
        roomSlug={roomSlug}
      />
    </>
  )
}
