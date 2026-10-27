import { createContext, useContext } from 'react'
export const GameStateContext = createContext(null)
export function useGameState() {
  const context = useContext(GameStateContext)
  if (!context) throw new Error('GameStateProvider가 필요합니다.')
  return context
}
