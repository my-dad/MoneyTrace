import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="mt-empty">
      {icon !== undefined && (
        <div className="mt-empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <div>
        <h2 className="mt-empty__title">{title}</h2>
        <p className="mt-empty__description">{description}</p>
      </div>
      {action}
    </div>
  );
}
