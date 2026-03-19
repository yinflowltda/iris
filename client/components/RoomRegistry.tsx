import type { User } from '../../shared/types/User'
import './RoomRegistry.css'

interface SharedRoom {
  owner_sub: string
  owner_email: string
  owner_name: string | null
  room_slug: string | null
  permission: string
}

export function RoomRegistry({
  user,
  sharedRooms,
  onEnterRoom,
}: {
  user: User
  sharedRooms: SharedRoom[]
  onEnterRoom: (slug: string) => void
}) {
  return (
    <div className="rr-container">
      <div className="rr-panel">
        <h1 className="rr-title">Your Rooms</h1>

        <div className="rr-section">
          <div
            className="rr-card rr-card--own"
            onClick={() => user.room_slug && onEnterRoom(user.room_slug)}
          >
            <div className="rr-card-info">
              <div className="rr-card-name">My Room</div>
              {user.room_slug && (
                <div className="rr-card-slug">iris.yinflow.life/r/{user.room_slug}</div>
              )}
            </div>
            <span className="rr-badge rr-badge--owner">Owner</span>
          </div>
        </div>

        {sharedRooms.length > 0 && (
          <div className="rr-section">
            <h2 className="rr-section-title">Shared with you</h2>
            {sharedRooms.map((room) => (
              <div
                key={room.owner_sub}
                className="rr-card"
                onClick={() => room.room_slug && onEnterRoom(room.room_slug)}
              >
                <div className="rr-card-info">
                  <div className="rr-card-name">
                    {room.owner_name ?? room.owner_email}'s Room
                  </div>
                  <div className="rr-card-slug">{room.owner_email}</div>
                </div>
                <span className={`rr-badge rr-badge--${room.permission}`}>
                  {room.permission === 'edit' ? 'Can edit' : 'View only'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
