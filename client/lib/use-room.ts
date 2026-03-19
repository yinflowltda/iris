import { useCallback, useEffect, useState } from 'react'

export interface RoomInfo {
  ownerSub: string
  isOwner: boolean
  permission: 'view' | 'edit' | null
  slug: string | null
}

interface SharedRoom {
  owner_sub: string
  owner_email: string
  owner_name: string | null
  room_slug: string | null
  permission: string
}

export type { SharedRoom }

export function useRoom(userSub: string) {
  const [route, setRoute] = useState<'registry' | 'room' | 'loading'>('loading')
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null)
  const [sharedRooms, setSharedRooms] = useState<SharedRoom[]>([])
  const [routeVersion, setRouteVersion] = useState(0)

  useEffect(() => {
    if (!userSub) return
    fetch('/rooms/shared-with-me', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json() as { rooms: SharedRoom[] }
          setSharedRooms(data.rooms)
        }
      })
      .catch(() => {})
  }, [userSub])

  useEffect(() => {
    if (!userSub) return

    const path = window.location.pathname

    if (path === '/' || path === '') {
      window.history.replaceState(null, '', '/rooms')
      setRoute('registry')
      return
    }

    if (path === '/rooms') {
      setRoute('registry')
      return
    }

    const slugMatch = path.match(/^\/r\/([a-z0-9]+)$/)
    if (slugMatch) {
      const slug = slugMatch[1]
      fetch(`/rooms/resolve/${slug}`, { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) {
            window.history.replaceState(null, '', '/rooms')
            setRoute('registry')
            return
          }
          const data = await res.json() as { owner_sub: string; owner_name: string | null }
          const isOwner = data.owner_sub === userSub
          const sharedRoom = sharedRooms.find((r) => r.owner_sub === data.owner_sub)
          setRoomInfo({
            ownerSub: data.owner_sub,
            isOwner,
            permission: isOwner ? null : (sharedRoom?.permission as 'view' | 'edit') ?? 'view',
            slug,
          })
          setRoute('room')
        })
        .catch(() => {
          window.history.replaceState(null, '', '/rooms')
          setRoute('registry')
        })
      return
    }

    setRoomInfo({ ownerSub: userSub, isOwner: true, permission: null, slug: null })
    setRoute('room')
  }, [userSub, routeVersion, sharedRooms])

  const navigateTo = useCallback((path: string) => {
    window.history.pushState(null, '', path)
    setRouteVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    const handler = () => setRouteVersion((v) => v + 1)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  return { route, roomInfo, sharedRooms, navigateTo }
}
