import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button, Input, Label, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiErrorMessage } from '@/services/api';

const schema = z.object({
  identifier: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  if (user) {
    navigate('/dashboard', { replace: true });
  }

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.identifier, data.password);
      toast.success('Welcome back!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-800 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" />
        <Logo size={48} variant="light" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h1 className="text-4xl font-extrabold leading-tight">
            Manpower Plan <span className="text-accent">vs</span> Actual
          </h1>
          <p className="mt-4 max-w-md text-white/70">
            Centralized manpower monitoring for TAG Corporation. Track plans, daily attendance, vendor supply and shortages in near real time.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[['18', 'Vendors'], ['5', 'Units'], ['25', 'Cost Centers']].map(([n, l]) => (
              <div key={l} className="rounded-xl bg-white/10 p-4 backdrop-blur">
                <div className="text-2xl font-bold">{n}+</div>
                <div className="text-xs text-white/60">{l}</div>
              </div>
            ))}
          </div>
        </motion.div>
        <p className="text-xs text-white/40">© {new Date().getFullYear()} TAG Corporation. All rights reserved.</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo size={44} />
          </div>
          <h2 className="text-2xl font-bold">Sign in to your account</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enter your credentials to access the dashboard.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="identifier">Username or Email</Label>
              <Input id="identifier" placeholder="superadmin" autoComplete="username" {...register('identifier')} />
              {errors.identifier && <p className="mt-1 text-xs text-red-600">{errors.identifier.message}</p>}
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPw ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" {...register('password')} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPw((s) => !s)}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : <><LogIn className="h-4 w-4" /> Sign in</>}
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Default Super Admin (development)</p>
            <p>Username: <code className="font-mono">superadmin</code> · Password from <code className="font-mono">SUPER_ADMIN_PASSWORD</code></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
