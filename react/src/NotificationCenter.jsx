import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellRing, CheckCheck, ClipboardCheck, Smartphone, X } from 'lucide-react'
import { apiFetch } from './api'
import { createRealtimeConnection } from './realtime'
import { dismissInvite, enableNotifications, inviteDismissed, isIos, isStandalone, notificationsSupported, permission, showDeviceNotification } from './deviceNotifications'
import './NotificationCenter.css'

function relativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second')
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  return formatter.format(Math.round(seconds / 86400), 'day')
}

export default function NotificationCenter({ user, onOpenTask, onOpenLink, onUnreadChange }) {
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const latestNotificationId = useRef(null)
  const centerRef = useRef(null)
  const [invite, setInvite] = useState(() => notificationsSupported() && permission() === 'default' && !inviteDismissed())
  const iosHint = isIos() && !isStandalone()

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = (event) => {
      if (!centerRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const loadNotifications = useCallback(async () => {
    const response = await apiFetch('/api/notifications', { headers: { Accept: 'application/json' }, silent: true }).catch(() => null)
    if (!response?.ok) return
    const payload = await response.json().catch(() => null)
    if (!payload) return
    const newest = payload.data?.[0]
    if (latestNotificationId.current && newest?.id !== latestNotificationId.current && !newest?.read_at) {
      setToast({ ...newest.data, title: newest.data?.title, message: newest.data?.message })
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 6000)
    }
    if (newest?.id) latestNotificationId.current = newest.id
    setItems(payload.data || [])
    setUnread(payload.unread_count || 0)
  }, [])

  useEffect(() => { loadNotifications() }, [loadNotifications])
  useEffect(() => {
    const poll = setInterval(async () => { if (document.visibilityState === 'visible') { await loadNotifications(); window.dispatchEvent(new Event('tasks:changed')) } }, 5000)
    return () => clearInterval(poll)
  }, [loadNotifications])
  useEffect(() => {
    onUnreadChange?.(unread)
    return () => onUnreadChange?.(0)
  }, [unread, onUnreadChange])

  useEffect(() => {
    if (!user?.id) return undefined
    const echo = createRealtimeConnection()
    echo.private(`users.${user.id}`).listen('.task.assigned', (event) => {
      showDeviceNotification({ title: `Công việc mới: ${event.code}`, body: event.title, url: `/tasks/${event.code}`, tag: `task-${event.id}` })
      setToast(event)
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 6000)
      loadNotifications()
      window.dispatchEvent(new Event('tasks:changed'))
    })
    echo.private(`users.${user.id}`).listen('.task.workflow', (event) => {
      showDeviceNotification({ title: `${event.code} · ${event.title}`, body: event.message, url: `/tasks/${event.code}`, tag: `task-${event.id}` })
      setToast(event)
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 6000)
      loadNotifications()
      window.dispatchEvent(new Event('tasks:changed'))
    })
    return () => {
      clearTimeout(toastTimer.current)
      echo.leave(`users.${user.id}`)
      echo.disconnect()
    }
  }, [user?.id, loadNotifications])

  const markRead = async (notification) => {
    if (!notification.read_at) await apiFetch(`/api/notifications/${notification.id}/read`, { method: 'POST', headers: { Accept: 'application/json' } }).catch(() => null)
    await loadNotifications()
    if (notification.data?.link) onOpenLink?.(notification.data.link)
    else if (notification.data?.code) onOpenTask?.(notification.data.code)
    setOpen(false)
  }

  const acceptInvite = async () => {
    await enableNotifications()
    setInvite(false)
  }
  const declineInvite = () => {
    dismissInvite()
    setInvite(false)
  }

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST', headers: { Accept: 'application/json' } }).catch(() => null)
    await loadNotifications()
  }

  return <div className="notification-center" ref={centerRef}>
    <button className="notification-button" title="Thông báo" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <Bell size={20} />{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
    </button>
    {open && <div className="notification-dropdown">
      <header><div><strong>Thông báo</strong><small>{unread} thông báo chưa đọc</small></div>{unread > 0 && <button onClick={markAllRead}><CheckCheck size={15} /> Đọc tất cả</button>}</header>
      {invite && <div className="notification-invite">
        <BellRing size={18} />
        <div>
          <b>Nhận thông báo trên thiết bị</b>
          <small>{iosHint ? 'Trên iPhone/iPad: bấm Chia sẻ → “Thêm vào Màn hình chính”, mở ứng dụng từ đó rồi bật thông báo.' : 'Biết ngay khi được giao việc hoặc có kết quả duyệt, kể cả khi không mở trang này.'}</small>
          <span>
            {!iosHint && <button type="button" className="primary-btn" onClick={acceptInvite}>Bật thông báo</button>}
            <button type="button" className="secondary-btn" onClick={declineInvite}>Để sau</button>
          </span>
        </div>
      </div>}
      {!invite && iosHint && permission() !== 'granted' && <div className="notification-invite subtle"><Smartphone size={16} /><small>Muốn nhận thông báo trên iPhone/iPad? Thêm ứng dụng vào Màn hình chính.</small></div>}
      <div className="notification-list">
        {items.length === 0 ? <div className="notification-empty"><Bell size={30} /><span>Bạn chưa có thông báo nào</span></div> : items.map((item) => <button key={item.id} className={`notification-item ${item.read_at ? '' : 'unread'} ${item.data?.action === 'approved' ? 'notification-approved' : item.data?.action === 'revision_required' ? 'notification-revision' : ''}`} onClick={() => markRead(item)}>
          <span className="notification-icon"><ClipboardCheck size={18} /></span>
          <span><strong>{item.data?.title || 'Công việc mới'}</strong><em>{item.data?.message}</em><small>{relativeTime(item.created_at)}</small></span>
          {!item.read_at && <i />}
        </button>)}
      </div>
    </div>}
    {toast && <div className={`realtime-toast ${toast.action === 'approved' ? 'notification-approved' : toast.action === 'revision_required' ? 'notification-revision' : ''}`}><span><ClipboardCheck size={21} /></span><div><b>{toast.action ? 'Cập nhật quy trình công việc' : 'Công việc mới vừa được giao'}</b><strong>{toast.title}</strong><small>{toast.message}</small></div><button onClick={() => setToast(null)}><X size={16} /></button></div>}
  </div>
}
