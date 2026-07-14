import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { Button, Input, Label, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiErrorMessage } from '@/services/api';

// Official TAG brand colors (from the brand card)
//   STEEL GREY #727071 · MAG RED #cb3127
const MARK_SRC = '/tag-logo-mark.png';

const schema = z.object({
  identifier: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

function BrandName({ size = 'md' }: { size?: 'md' | 'sm' }) {
  return (
    <div className={`border-l-4 border-[#cb3127] ${size === 'md' ? 'pl-4' : 'pl-3'}`}>
      <div className={`font-extrabold tracking-wide text-[#4a4a4b] ${size === 'md' ? 'text-2xl' : 'text-lg'}`}>
        TAG CORPORATION
      </div>
      <div className={`font-semibold uppercase tracking-[0.28em] text-[#727071] ${size === 'md' ? 'text-[11px]' : 'text-[9px]'}`}>
        <span className="text-[#cb3127]">Power</span> to People
      </div>
    </div>
  );
}

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
    <div className="flex min-h-screen bg-white">
      {/* Brand panel — steel grey + mag red on light, so the logo sits directly on the surface */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-white via-[#f7f7f7] to-[#ebebec] p-12 lg:flex">
        {/* dot grid in steel grey */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: 'radial-gradient(circle, #727071 1.2px, transparent 1.2px)', backgroundSize: '26px 26px' }}
        />
        {/* soft brand-color glows */}
        <div className="absolute -right-32 -top-32 h-[26rem] w-[26rem] rounded-full bg-[#cb3127]/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-[26rem] w-[26rem] rounded-full bg-[#727071]/15 blur-3xl" />
        {/* red edge accent */}
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#cb3127] via-[#cb3127]/60 to-transparent" />

        {/* Logo + company name, no white chip */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 flex items-center gap-5">
          <img src={MARK_SRC} alt="TAG" className="h-14 w-auto drop-shadow-sm" />
          <BrandName />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative z-10"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e2e2e3] bg-white px-3.5 py-1.5 text-xs font-medium text-[#727071] shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-[#cb3127]" />
            Secure workforce platform
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-[#4a4a4b]">
            Manpower <span className="text-[#cb3127]">Tracking</span> System
          </h1>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[['18', 'Vendors'], ['4', 'Units'], ['24', 'Cost Centers']].map(([num, label], i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="rounded-2xl border border-[#e6e6e7] bg-white/80 p-4 shadow-sm backdrop-blur"
              >
                <div className="text-2xl font-bold text-[#cb3127]">{num}+</div>
                <div className="text-xs font-medium text-[#727071]">{label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <p className="relative z-10 text-xs text-[#a5a5a6]">© {new Date().getFullYear()} TAG Corporation. All rights reserved.</p>
      </div>

      {/* Form panel */}
      <div className="relative flex w-full items-center justify-center bg-[#f4f4f5] p-6 lg:w-1/2">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: 'radial-gradient(circle, #727071 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[#e6e6e7] bg-white shadow-xl"
        >
          {/* red brand accent */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#cb3127] to-[#e05a4e]" />
          <div className="p-8 lg:p-10">
            <div className="mb-8 flex items-center gap-4 lg:hidden">
              <img src={MARK_SRC} alt="TAG" className="h-9 w-auto" />
              <BrandName size="sm" />
            </div>
            <h2 className="text-2xl font-bold text-[#3f3f40]">Sign in to your account</h2>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
              <div>
                <Label htmlFor="identifier" className="text-[#4a4a4b]">Username</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  className="focus-visible:ring-[#cb3127]/50"
                  {...register('identifier')}
                />
                {errors.identifier && <p className="mt-1 text-xs text-[#cb3127]">{errors.identifier.message}</p>}
              </div>
              <div>
                <Label htmlFor="password" className="text-[#4a4a4b]">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="focus-visible:ring-[#cb3127]/50"
                    {...register('password')}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#727071]" onClick={() => setShowPw((s) => !s)}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-[#cb3127]">{errors.password.message}</p>}
              </div>
              <Button
                type="submit"
                className="w-full bg-[#cb3127] shadow-md shadow-[#cb3127]/20 hover:bg-[#b02a22] focus-visible:ring-[#cb3127]/50"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Spinner /> : <><LogIn className="h-4 w-4" /> Sign in</>}
              </Button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
