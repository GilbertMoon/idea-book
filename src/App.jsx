import { useEffect } from 'react'
import { useGameState } from './state/GameContext'
import { Routes, Route, Navigate } from 'react-router-dom'
import Admin from './admin/Admin'
import Game from './game/Game'

function AdminPage() {
  const { resetRace } = useGameState()
  // Returning to configuration cancels only the current race, including browser Back.
  useEffect(() => { resetRace() }, [resetRace])
  return <Admin />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminPage />} />
      <Route path="/game" element={<Game />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
