import { useEffect, useState } from 'react'
import { catalog, clearToken, login, readToken, writeToken } from './api.js'
import { Login } from './Login.jsx'
import { Picker } from './Picker.jsx'
import { Talk } from './Talk.jsx'

export function App() {
  const [token, setToken] = useState(readToken)
  const [catalogData, setCatalogData] = useState(null)
  const [clientId, setClientId] = useState('')
  const [booting, setBooting] = useState(Boolean(readToken()))
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setCatalogData(null)
      setClientId('')
      setBooting(false)
      return undefined
    }
    let cancelled = false
    setBooting(true)
    catalog(token)
      .then((data) => {
        if (!cancelled) {
          setCatalogData(data)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          clearToken()
          setToken('')
          setCatalogData(null)
          setLoginError(error.message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBooting(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleLogin(next) {
    setLoginLoading(true)
    setLoginError('')
    try {
      await login(next)
      writeToken(next)
      setToken(next)
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setLoginLoading(false)
    }
  }

  function signOut() {
    clearToken()
    setToken('')
    setCatalogData(null)
    setClientId('')
  }

  if (!token || !catalogData) {
    return (
      <Login
        error={loginError}
        loading={loginLoading || booting}
        onSubmit={handleLogin}
      />
    )
  }

  const clients = catalogData.clients ?? []
  const client = clients.find((item) => item.id === clientId) ?? null

  if (!client) {
    return (
      <Picker
        clients={clients}
        onOpen={(next) => setClientId(next.id)}
        onSignOut={signOut}
      />
    )
  }

  return (
    <Talk
      key={client.id}
      token={token}
      agent={catalogData.voice}
      client={client}
      onBack={() => setClientId('')}
      onSignOut={signOut}
    />
  )
}
