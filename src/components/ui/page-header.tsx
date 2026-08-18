import type { ReactNode } from "react";

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
}

export interface PageHeaderProps {
  breadcrumb?: readonly BreadcrumbItem[];
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({
  breadcrumb,
  title,
  description,
  eyebrow,
  context,
  actions,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__content">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Đường dẫn" className="page-header__breadcrumb">
            <ol>
              {breadcrumb.map((item, index) => (
                <li key={index}>
                  {item.href ? <a href={item.href}>{item.label}</a> : item.label}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1>{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {context || actions ? (
        <div className="page-header__aside">
          {context ? <div className="page-header__context">{context}</div> : null}
          {actions ? <div className="page-header__actions">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
