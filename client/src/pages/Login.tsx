import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Wrench } from "lucide-react";

export default function Login() {
  const { login, register, isLoggingIn, isRegistering, loginError, registerError } = useAuth();
  const [, navigate] = useLocation();

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({
    companyName: "", email: "", password: "", firstName: "", lastName: "", phone: "",
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(loginForm);
      navigate("/");
    } catch {}
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    try {
      await register(regForm);
      navigate("/");
    } catch {}
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Wrench className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Contractor OS</h1>
          <p className="text-muted-foreground text-sm mt-1">Field operations, powered by AI</p>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1">Sign In</TabsTrigger>
            <TabsTrigger value="register" className="flex-1">Get Started</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Welcome back</CardTitle>
                <CardDescription>Sign in to your account</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" required placeholder="you@company.com"
                      value={loginForm.email}
                      onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" required placeholder="••••••••"
                      value={loginForm.password}
                      onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  {loginError && (
                    <p className="text-sm text-destructive">{(loginError as Error).message}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={isLoggingIn}>
                    {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Sign In
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Create your account</CardTitle>
                <CardDescription>Start your free trial — no credit card required</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input required placeholder="Acme Plumbing Co."
                      value={regForm.companyName}
                      onChange={e => setRegForm(f => ({ ...f, companyName: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>First Name</Label>
                      <Input placeholder="John"
                        value={regForm.firstName}
                        onChange={e => setRegForm(f => ({ ...f, firstName: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input placeholder="Smith"
                        value={regForm.lastName}
                        onChange={e => setRegForm(f => ({ ...f, lastName: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" required placeholder="you@company.com"
                      value={regForm.email}
                      onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" required placeholder="Min 8 characters"
                      value={regForm.password}
                      onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  {registerError && (
                    <p className="text-sm text-destructive">{(registerError as Error).message}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={isRegistering}>
                    {isRegistering ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Create Account
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
