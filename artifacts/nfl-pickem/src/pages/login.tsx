import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLoginUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function Login() {
  const [name, setName] = useState("");
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  
  const loginUser = useLoginUser({
    mutation: {
      onSuccess: (user) => {
        setUser(user);
        toast.success("Welcome to the league!");
        setLocation("/picks");
      },
      onError: () => {
        toast.error("Failed to login");
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    loginUser.mutate({ data: { name: name.trim() } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/50 p-4">
      <Card className="w-full max-w-md shadow-xl border-border/50 bg-background/80 backdrop-blur-xl">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 mx-auto bg-primary rounded-2xl flex items-center justify-center text-primary-foreground font-bold text-3xl mb-4 shadow-lg shadow-primary/20">
            N
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">NFL Pick'em</CardTitle>
          <CardDescription>Season-Long League</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Input
                placeholder="Enter your name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 text-lg px-4 bg-background"
                disabled={loginUser.isPending}
                data-testid="input-name"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 text-lg font-medium"
              disabled={!name.trim() || loginUser.isPending}
              data-testid="button-submit"
            >
              {loginUser.isPending ? "Entering..." : "Enter League"}
            </Button>
            <p className="text-center text-sm text-muted-foreground pt-4">
              No account? Just enter your name to join.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
