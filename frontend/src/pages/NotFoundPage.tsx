import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { Logo } from '@/components/Logo';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <Logo size={56} />
      <div>
        <h1 className="text-6xl font-extrabold text-brand-600">404</h1>
        <p className="mt-2 text-lg font-semibold">Page not found</p>
        <p className="mt-1 text-sm text-muted-foreground">The page you’re looking for doesn’t exist or you don’t have access.</p>
      </div>
      <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
    </div>
  );
}
