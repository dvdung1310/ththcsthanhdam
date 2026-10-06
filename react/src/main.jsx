import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import './theme.css'
import App from './App.jsx'
import { ConfirmProvider } from './ConfirmDialog.jsx'

const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    ),
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
