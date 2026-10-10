import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import './theme.css'
import App from './App.jsx'
import { ConfirmProvider } from './ConfirmDialog.jsx'
import { RouterErrorPage } from './AppError.jsx'
import PwaUpdater from './PwaUpdater.jsx'

const router = createBrowserRouter([
  {
    path: '*',
    errorElement: <RouterErrorPage />,
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
    <PwaUpdater />
  </StrictMode>,
)
