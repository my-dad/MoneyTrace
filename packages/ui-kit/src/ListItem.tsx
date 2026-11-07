import type { ReactNode } from "react";

export function List({ children }: { children: ReactNode }) {
  return <ul className="mt-list">{children}</ul>;
}

export interface ListItemProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function ListItem({ title, subtitle, leading, trailing }: ListItemProps) {
  return (
    <li className="mt-list-item">
      {leading}
      <div className="mt-list-item__text">
        <span className="mt-list-item__title">{title}</span>
        {subtitle !== undefined && <span className="mt-list-item__subtitle">{subtitle}</span>}
      </div>
      {trailing !== undefined && <div className="mt-list-item__trailing">{trailing}</div>}
    </li>
  );
}
