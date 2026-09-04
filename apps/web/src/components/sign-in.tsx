"use client"

import { LoaderCircle, LogIn, UserRoundPlus } from "lucide-react"
import { type FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

// Keep the public registration affordance aligned with the API policy: local and
// other non-production environments default to enabled, while production must
// opt in explicitly through the public build configuration.
const defaultAllowRegistration =
  process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_ENABLE_REGISTRATION === "true"
    : process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "false"

type SignInMode = "sign-in" | "register"

export function SignIn({
  allowRegistration = defaultAllowRegistration,
  notice,
}: {
  allowRegistration?: boolean
  notice?: string
}) {
  const [mode, setMode] = useState<SignInMode>("sign-in")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const switchMode = (next: SignInMode) => {
    if (mode === next) return
    setMode(next)
    setError("")
    setPassword("")
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    if (mode === "register" && password.length < 8) {
      setError("密码至少需要 8 位字符")
      return
    }
    setSubmitting(true)
    const result =
      mode === "register"
        ? await authClient.signUp.email({ email, password, name: name || email })
        : await authClient.signIn.email({ email, password })
    setSubmitting(false)
    if (result.error) {
      setError(
        mode === "register"
          ? (result.error.message ?? "注册失败，请稍后重试")
          : "邮箱或密码不正确",
      )
      return
    }
    window.location.reload()
  }

  return (
    <main className="grid min-h-svh bg-workspace lg:grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.2fr)]">
      <section className="flex min-h-48 flex-col justify-between border-b border-border bg-sidebar p-6 lg:min-h-svh lg:border-r lg:border-b-0 lg:p-10">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center bg-primary text-xs font-black text-primary-foreground">
            SP
          </div>
          <span className="text-sm font-semibold">ShadowProducer</span>
        </div>
        <div>
          <h1 className="text-2xl font-semibold">影视制片协作工作台</h1>
          <div className="mt-4 h-px w-16 bg-primary" />
        </div>
      </section>

      <section className="flex items-center bg-background px-5 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          {notice ? (
            <div
              role="status"
              className="mb-6 border-l-2 border-primary bg-primary/6 px-3 py-2 text-sm"
            >
              {notice}
            </div>
          ) : null}
          <form className="w-full" onSubmit={submit}>
            <h2 className="mb-8 text-xl font-semibold">
              {mode === "register" ? "注册新账号" : "登录"}
            </h2>
            <div className="space-y-5">
              {mode === "register" ? (
                <label
                  htmlFor="sign-in-name"
                  className="block space-y-2 text-sm font-medium"
                >
                  <span>姓名</span>
                  <Input
                    id="sign-in-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    required
                    autoFocus
                  />
                </label>
              ) : null}
              <label
                htmlFor="sign-in-email"
                className="block space-y-2 text-sm font-medium"
              >
                <span>邮箱</span>
                <Input
                  id="sign-in-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoFocus={mode === "sign-in"}
                />
              </label>
              <label
                htmlFor="sign-in-password"
                className="block space-y-2 text-sm font-medium"
              >
                <span>密码</span>
                <Input
                  id="sign-in-password"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={mode === "register" ? 8 : undefined}
                  required
                />
                {mode === "register" ? (
                  <span className="block text-xs leading-5 text-muted-foreground">
                    密码至少 8 位。注册后需由团队邀请或开通后才能进入工作区。
                  </span>
                ) : null}
              </label>
            </div>
            {error ? (
              <div
                role="alert"
                className="mt-4 border-l-2 border-destructive px-3 text-sm"
              >
                {error}
              </div>
            ) : null}
            <Button type="submit" className="mt-7 w-full" disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : mode === "register" ? (
                <UserRoundPlus aria-hidden="true" />
              ) : (
                <LogIn aria-hidden="true" />
              )}
              {submitting
                ? mode === "register"
                  ? "正在注册"
                  : "正在登录"
                : mode === "register"
                  ? "注册"
                  : "登录"}
            </Button>
            {allowRegistration ? (
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => switchMode(mode === "register" ? "sign-in" : "register")}
                >
                  {mode === "register" ? "已有账号？返回登录" : "还没有账号？注册新账号"}
                </Button>
              </div>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  )
}
