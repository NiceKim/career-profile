import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm', className)} {...props} />;
}
