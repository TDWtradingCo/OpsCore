import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CircleDot } from 'lucide-react'
import { toast } from 'sonner'

export function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, user } = useAuth()
  const navigate = useNavigate()

  // Redirect once auth state updates (driven by onAuthStateChange)
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      if (isLogin) {
        await signIn(email, password)
      } else {
        await signUp(email, password, fullName)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-primary shadow-glow">
              <CircleDot className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-5xl font-black tracking-tight">OpsCore</h1>
          </div>
        </div>
        <Card className="shadow-elevated border-0">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">
              {isLogin ? 'Welcome back' : 'Create Account'}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? 'Enter your credentials to continue'
                : 'Sign up for a new account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    required={!isLogin}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    {isLogin ? 'Signing in...' : 'Creating account...'}
                  </span>
                ) : (
                  isLogin ? 'Sign In' : 'Create Account'
                )}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
