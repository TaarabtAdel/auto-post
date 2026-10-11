import { ui } from "@/lib/dashboard-ui";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={`${ui.pageHeader} flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4`}
    >
      <div className="min-w-0">
        <h2 className={ui.pageTitle}>{title}</h2>
        {description ? <p className={ui.pageDesc}>{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}
