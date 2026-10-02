import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { getToken, apiUrl } from './api'

window.Pusher = Pusher

export function createRealtimeConnection() {
  const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http'
  const port = Number(import.meta.env.VITE_REVERB_PORT || 8080)
  return new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: apiUrl('/api/broadcasting/auth'),
    auth: { headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' } },
  })
}
